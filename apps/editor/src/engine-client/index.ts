// The main thread's half of the worker protocol (contracts/worker-protocol.md, ADR 0003).
//
// One module spawns the engine, transfers the Preview's canvas into it, and is the only place in
// `apps/editor` that calls `postMessage` at it. Everything else here follows from the contract.
//
// **Two shapes, not one, and the difference is the whole point of this file.**
//
// `attach-source` and `export-start` are request/response: each carries a reply that always comes,
// so each returns a promise. `render-frame` is a *stream*: it carries no id, gets no matching
// reply, and the worker is explicitly allowed to coalesce it — a newer request displaces an older
// one and the older is never answered (FR-012, invariant 3). So `renderFrame` returns `void`, and
// what is on screen is observed by listening for `frame-rendered`.
//
// A client that returned a promise per `render-frame` would leak one for every Frame the design
// deliberately drops, which during playback on a loaded machine is most of them. The protocol says
// this in as many words; it is repeated here because the mistake is invisible until a long session
// runs out of memory.
//
// **One `render-frame` in flight, and the newest one waiting (FR-012, T049).** A Playhead dragged
// across the Timeline asks for a Frame on every pointer move, far faster than a seek can answer.
// The worker coalesces what reaches it (playback/scheduler.ts), but everything posted still
// crosses the boundary, is structured-cloned and sits in the worker's queue. So the client holds
// back too: it posts one request, and until the worker has answered — `frame-rendered` or
// `frames-dropped`, one of which every request gets — later requests overwrite a single waiting
// slot instead of being posted. The answer posts whatever is waiting, which is the newest Frame asked for. The two
// latches are halves of one rule rather than two copies of it: this one keeps the channel to one
// message, the worker's keeps its decoders to one Render whatever arrives (and it still answers
// anything that gets past this one, a Frame requested before the first Scene included).
//
// The client drops a request it never posts without saying so. `frames-dropped` is the worker's
// word for Frames it was asked for; a request superseded here was never asked of anyone.
//
// Invariant 3 allows a request to go unanswered, so the client must not wait for an answer
// forever: an answer that has not come within `UNANSWERED_FRAME_MS` stops counting, and the
// waiting request is posted anyway. That is a safety valve, not the mechanism — today every
// request is answered — and opening it is harmless, because the worker's own latch absorbs the
// extra request.
//
// **A `fatal` settles everything that was waiting.** The worker forwards every throw as a `fatal`
// and leaves itself running, because whether to replace it is the main thread's decision. What the
// main thread must not do is keep waiting: an `attachSource` promise pending across a `fatal` never
// settles, and a UI awaiting it is frozen with no error anywhere — the exact failure invariant 5
// exists to prevent, reintroduced one layer up. So a `fatal` rejects every outstanding request,
// puts the client into a failed state, and every later request rejects immediately with the same
// reason rather than joining a queue nothing will ever drain.
//
// **Every id and every conversion is somebody else's.** No rate arithmetic happens here (R7): a
// Frame is an integer the caller worked out through `packages/model`, and a `Scene` is projected by
// `projectScene`. This module moves messages and correlates replies, and holds no opinion about
// what is in them.

import EngineWorker from "@cutroom/engine/worker?worker"

import type {
  EngineCapabilities,
  EngineEvent,
  ExportStartMessage,
  FatalEvent,
  SourceAttachedEvent,
  ToEngine,
} from "@cutroom/engine/protocol"
import type { Frame, PixelSize, Scene, Timebase } from "@cutroom/model"

/** One event the worker can send, picked out of the union by its `type`. */
export type EngineEventOf<T extends EngineEvent["type"]> = Extract<EngineEvent, { type: T }>

/** Called with each event of the type it was registered for. */
export type EngineListener<T extends EngineEvent["type"]> = (event: EngineEventOf<T>) => void

/**
 * The engine stopped being able to continue, and something was waiting on it.
 *
 * Distinct from an ordinary `Error` so a caller can tell "this Source could not be decoded" — a
 * fact about the user's file — from "the engine fell over", which is a fact about us. `reason` and
 * `stack` are the worker's own words, forwarded rather than paraphrased.
 */
export class EngineFatalError extends Error {
  /** The worker's stack, when it had one. Not this client's — that would point at the wrong side. */
  readonly engineStack: string | undefined

  constructor(event: FatalEvent) {
    super(`The Cutroom engine stopped: ${event.reason}`)
    this.name = "EngineFatalError"
    this.engineStack = event.stack
  }
}

/** The client was shut down while something was still waiting for the engine to answer. */
export class EngineClosedError extends Error {
  constructor(reason: string) {
    super(`The Cutroom engine was closed: ${reason}`)
    this.name = "EngineClosedError"
  }
}

/** Everything `export-start` needs except the destination, which is transferred separately. */
export type ExportRequest = Omit<ExportStartMessage, "type" | "writable">

/**
 * How an export ended, when it ended in a way the user asked for.
 *
 * Cancelling is an outcome and not a failure — the user asked for it and got it — so it resolves.
 * `export-failed` and `fatal` reject, because nobody asked for either.
 */
export type ExportOutcome =
  { readonly status: "done"; readonly bytes: number } | { readonly status: "cancelled" }

export interface EngineClientOptions {
  /**
   * The Preview's canvas, already detached from its element with `transferControlToOffscreen()`.
   * It is transferred in `init` and belongs to the worker from that moment; the main thread cannot
   * draw on it, size it, or transfer it a second time.
   */
  readonly canvas: OffscreenCanvas
  /** A convenience for the first Render only — every `Scene` carries its own, and wins (invariant 6). */
  readonly timebase: Timebase
  readonly frameSize: PixelSize
  /**
   * How to make the worker. Replaced only in tests; the default is the engine's own entry point,
   * reached through its `exports` map so there is no second spelling of where the engine lives.
   */
  readonly createWorker?: () => Worker
}

export interface EngineClient {
  /**
   * What this machine turned out to be able to do, once `init` has been answered.
   *
   * Rejects if the engine falls over before it can say — a browser that cannot give the worker a
   * GPU context has to be a refusal the UI can show, not a Preview that never updates.
   */
  readonly ready: Promise<EngineCapabilities>

  /** The same capabilities once they have arrived, for a caller that is past the await. */
  capabilities(): EngineCapabilities | null

  /** The `fatal` this engine reported, if it has. Non-null means every request now rejects. */
  fatal(): FatalEvent | null

  /**
   * Hands the engine a Source's bytes and waits for what it reads back.
   *
   * Request/response: `source-attached` resolves it, `source-failed` rejects it with the engine's
   * own reason, and a `fatal` rejects it too. Correlated by `sourceId`, which is all the protocol
   * carries — so two attaches of the *same* Source cannot be told apart and the second is refused
   * rather than left to be settled by the first one's reply.
   */
  attachSource(sourceId: string, file: File): Promise<SourceAttachedEvent>

  /** Closes the engine's decoders for a Source. No reply, so nothing to await. */
  detachSource(sourceId: string): void

  /**
   * Replaces the engine's picture of the Timeline. `revision` must increase: the engine ignores a
   * Scene whose revision is not newer than the one it holds.
   */
  postScene(revision: number, scene: Scene): void

  /**
   * Asks for one Frame, and returns nothing.
   *
   * A stream, not a call. The request may be superseded and never answered (FR-012), so there is
   * nothing here to await and nothing that could time out. Listen for `frame-rendered` to learn
   * what the Preview is actually showing, and for `frames-dropped` to learn what it is not.
   *
   * Latest wins on this side too: while one request is unanswered, later ones are held, each
   * replacing the last, and only the newest is posted when the answer comes.
   */
  renderFrame(frame: Frame, reason: "scrub" | "clock"): void

  /** Lets the engine open or close its streaming iterators at the right moment. */
  setTransport(state: "playing" | "stopped", fromFrame: Frame): void

  /**
   * Starts an export and resolves when it is finished or cancelled.
   *
   * Request/response, and one at a time (spec assumption): a second call while one is running is
   * refused rather than silently replacing it. `writable` is transferred, so the caller must not
   * touch it afterwards.
   *
   * A plain `WritableStream` forwarding to the destination's `FileSystemWritableFileStream`
   * (`forwardingWritable` from `@cutroom/engine`): Chrome cannot transfer the file stream itself.
   */
  startExport(request: ExportRequest, writable: WritableStream): Promise<ExportOutcome>

  /** Mixed PCM for a running export. The channel buffers are transferred, not copied. */
  sendExportAudioChunk(channels: readonly Float32Array[], startSample: number, final: boolean): void

  /**
   * Asks for the running export's decoded sound up to `toFrame`, for the main thread to mix (ADR
   * 0008). Announced, not returned: the answer is an `export-audio-pcm` naming the same `toFrame`,
   * which `audio/offline-mix.ts`'s `requestedExportPcm` pairs with the request.
   */
  requestExportAudio(toFrame: Frame): void

  /** Asks a running export to stop. The promise from `startExport` resolves as `cancelled`. */
  cancelExport(): void

  /** Subscribes to one kind of event. Returns the function that unsubscribes. */
  on<T extends EngineEvent["type"]>(type: T, listener: EngineListener<T>): () => void

  /**
   * Stops the worker and rejects anything still waiting. Idempotent; nothing can be sent
   * afterwards.
   */
  terminate(reason?: string): void
}

/**
 * How long a `render-frame` may go unanswered before the client stops holding later ones behind it.
 *
 * Long enough that a slow seek — a long-GOP Source, a 4K decode — is never mistaken for a lost
 * request, short enough that a request that really was lost costs one stutter and not the Preview.
 */
export const UNANSWERED_FRAME_MS = 2000

/** A Frame asked for but not yet posted, because another is in flight. */
interface FrameWanted {
  readonly frame: Frame
  readonly reason: "scrub" | "clock"
}

/** One request waiting for the reply the protocol promises it. */
interface Pending<T> {
  readonly settle: (value: T) => void
  readonly refuse: (error: Error) => void
}

/**
 * Spawns the engine, transfers the canvas into it, and hands back the only way to talk to it.
 *
 * `init` is posted immediately and exactly once. Everything else may be sent as soon as this
 * returns: messages queue in the worker's own event loop behind `init`, so there is no window in
 * which a caller has a client that is not ready for it.
 */
export function startEngine(options: EngineClientOptions): EngineClient {
  const worker = (options.createWorker ?? (() => new EngineWorker()))()

  const listeners = new Map<EngineEvent["type"], Set<(event: EngineEvent) => void>>()
  const attaching = new Map<string, Pending<SourceAttachedEvent>>()

  let capabilities: EngineCapabilities | null = null
  let fatal: FatalEvent | null = null
  let closed: string | null = null
  let exporting: Pending<ExportOutcome> | null = null
  let announceReady: Pending<EngineCapabilities> | null = null

  // The latest-wins guard over `render-frame`: whether one is posted and unanswered (as the timer
  // that gives up on it), and the newest request held back behind it.
  let frameInFlight: ReturnType<typeof setTimeout> | null = null
  let frameWaiting: FrameWanted | null = null

  const ready = new Promise<EngineCapabilities>((settle, refuse) => {
    announceReady = { settle, refuse }
  })
  // Nobody is obliged to await `ready` — the shell may only care that the Preview updates — and an
  // unawaited rejection would surface as an unhandled promise rejection instead of as the `fatal`
  // the UI is already being told about. One inert handler makes the rejection observable-but-quiet.
  void ready.catch(() => {})

  /** Why the engine cannot be talked to, or `null` while it can. */
  function unavailable(): Error | null {
    if (closed !== null) return new EngineClosedError(closed)
    if (fatal !== null) return new EngineFatalError(fatal)
    return null
  }

  /**
   * Posts a message, unless the engine is past being able to answer.
   *
   * Streams are dropped rather than thrown from: `renderFrame` is called from a pointer move and an
   * animation frame, and a client that threw there would take the UI down for a failure the UI has
   * already been told about through `fatal`.
   */
  function post(message: ToEngine, transfer: Transferable[] = []): void {
    if (unavailable() !== null) return
    worker.postMessage(message, transfer)
  }

  function emit(event: EngineEvent): void {
    const registered = listeners.get(event.type)
    if (registered === undefined) return
    // Copied before iterating: a listener that unsubscribes itself is ordinary, and mutating the
    // set mid-iteration would skip its neighbour.
    for (const listener of [...registered]) listener(event)
  }

  /** Posts a `render-frame` and holds every later one back until it is answered. */
  function postFrame(wanted: FrameWanted): void {
    if (unavailable() !== null) return
    frameInFlight = setTimeout(frameAnswered, UNANSWERED_FRAME_MS)
    post({ type: "render-frame", frame: wanted.frame, reason: wanted.reason })
  }

  /**
   * The request in flight was answered, or has been given up on: post the newest one waiting.
   *
   * An answer arriving when nothing is in flight — one given up on that turned up late — changes
   * nothing; the request in flight now is a different one and still owes its own answer.
   */
  function frameAnswered(): void {
    if (frameInFlight === null) return
    clearTimeout(frameInFlight)
    frameInFlight = null
    const next = frameWaiting
    frameWaiting = null
    if (next !== null) postFrame(next)
  }

  /** Forgets every Frame request. Nothing will be posted again, so nothing may be waiting. */
  function forgetFrames(): void {
    if (frameInFlight !== null) clearTimeout(frameInFlight)
    frameInFlight = null
    frameWaiting = null
  }

  /** Rejects everything outstanding with one reason. Used by `fatal` and by `terminate`. */
  function refuseEverything(error: Error): void {
    forgetFrames()
    announceReady?.refuse(error)
    for (const pending of attaching.values()) pending.refuse(error)
    attaching.clear()
    exporting?.refuse(error)
    exporting = null
  }

  function received(event: EngineEvent): void {
    switch (event.type) {
      case "ready":
        capabilities = event.capabilities
        announceReady?.settle(event.capabilities)
        break

      case "source-attached": {
        const pending = attaching.get(event.sourceId)
        attaching.delete(event.sourceId)
        pending?.settle(event)
        break
      }

      case "source-failed": {
        const pending = attaching.get(event.sourceId)
        attaching.delete(event.sourceId)
        // The engine's own words about the user's file, not ours. A `source-failed` is a fact about
        // the media and not a fault in the product, so it is a plain `Error` (FR-003).
        pending?.refuse(new Error(event.reason))
        break
      }

      case "export-done":
        exporting?.settle({ status: "done", bytes: event.bytes })
        exporting = null
        break

      case "export-cancelled":
        exporting?.settle({ status: "cancelled" })
        exporting = null
        break

      case "export-failed":
        exporting?.refuse(new Error(event.reason))
        exporting = null
        break

      case "frame-rendered":
      case "frames-dropped":
        // Every `render-frame` is answered by exactly one of these, and the guard keeps one in
        // flight, so either is the answer to it. Settled before listeners hear it, so a listener
        // that asks for another Frame is not held behind the one just answered.
        frameAnswered()
        break

      case "fatal":
        // Recorded before anything is rejected, so a listener woken by the rejection already sees
        // the client in its failed state rather than in a state it is about to leave.
        fatal = event
        refuseEverything(new EngineFatalError(event))
        break

      default:
        // `audio-pcm`, `export-audio-ack`, `export-audio-pcm`, `export-progress`:
        // announcements, correlated to nothing, delivered to whoever is listening.
        break
    }

    emit(event)
  }

  worker.addEventListener("message", (event: MessageEvent) => {
    received(event.data as EngineEvent)
  })

  // A worker that dies before it can say `fatal` — a module that fails to load, a scope that is
  // torn down — produces an `error` event here and nothing else. Left unhandled it is exactly the
  // silence the protocol's invariant 5 is about, one layer further out, so it is turned into the
  // `fatal` the worker would have sent if it had been able to.
  worker.addEventListener("error", (event: ErrorEvent) => {
    received({
      type: "fatal",
      reason: event.message || "the engine worker stopped without saying why",
    })
  })

  // `init`, once, with the canvas transferred — after the listeners, so that a worker which fails
  // during startup is heard rather than answering into nothing. The canvas belongs to the engine
  // from this line onwards: the main thread cannot draw on it, size it, or transfer it again.
  post(
    {
      type: "init",
      canvas: options.canvas,
      timebase: options.timebase,
      frameSize: options.frameSize,
    },
    [options.canvas]
  )

  return {
    ready,
    capabilities: () => capabilities,
    fatal: () => fatal,

    attachSource(sourceId, file) {
      const stopped = unavailable()
      if (stopped !== null) return Promise.reject(stopped)
      if (attaching.has(sourceId)) {
        // `attach-source` correlates by `sourceId` and carries nothing else, so two in flight for
        // one Source would be settled by whichever reply arrived first — for whichever file. The
        // protocol cannot express the question, so the client does not pretend it can.
        return Promise.reject(
          new Error(
            `attachSource: the Source ${JSON.stringify(sourceId)} is already being attached; ` +
              "the protocol correlates replies by Source id, so two at once cannot be told apart"
          )
        )
      }

      return new Promise<SourceAttachedEvent>((settle, refuse) => {
        attaching.set(sourceId, { settle, refuse })
        post({ type: "attach-source", sourceId, file })
      })
    },

    detachSource(sourceId) {
      attaching
        .get(sourceId)
        ?.refuse(new Error(`the Source ${JSON.stringify(sourceId)} was detached`))
      attaching.delete(sourceId)
      post({ type: "detach-source", sourceId })
    },

    postScene(revision, scene) {
      post({ type: "scene", revision, scene })
    },

    renderFrame(frame, reason) {
      if (unavailable() !== null) return
      // Not deduplicated against the Frame in flight: asking for the same Frame again is how the
      // shell says the picture changed without the Scene changing (a Source attached or detached).
      if (frameInFlight === null) postFrame({ frame, reason })
      else frameWaiting = { frame, reason }
    },

    setTransport(state, fromFrame) {
      post({ type: "transport", state, fromFrame })
    },

    startExport(request, writable) {
      const stopped = unavailable()
      if (stopped !== null) return Promise.reject(stopped)
      if (exporting !== null) {
        return Promise.reject(
          new Error("startExport: an export is already running; one at a time (spec assumption)")
        )
      }

      return new Promise<ExportOutcome>((settle, refuse) => {
        exporting = { settle, refuse }
        post({ type: "export-start", ...request, writable }, [writable])
      })
    },

    sendExportAudioChunk(channels, startSample, final) {
      // Transferred, not copied — a minute of stereo at 48 kHz is 23 MB, and copying it is the
      // difference between an export that streams and one that grows. Buffers are de-duplicated
      // because two channel views over one buffer would be transferred twice, which throws.
      const buffers = [...new Set(channels.map((channel) => channel.buffer))]
      post({ type: "export-audio-chunk", channels, startSample, final }, buffers as Transferable[])
    },

    requestExportAudio(toFrame) {
      post({ type: "export-audio-request", toFrame })
    },

    cancelExport() {
      post({ type: "export-cancel" })
    },

    on(type, listener) {
      let registered = listeners.get(type)
      if (registered === undefined) {
        registered = new Set()
        listeners.set(type, registered)
      }
      const erased = listener as (event: EngineEvent) => void
      registered.add(erased)
      return () => {
        registered.delete(erased)
      }
    },

    terminate(reason = "the Preview was closed") {
      if (closed !== null) return
      closed = reason
      refuseEverything(new EngineClosedError(reason))
      worker.terminate()
    },
  }
}
