// The engine's entry point and its whole boundary with the main thread (ADR 0003).
//
// Everything the worker does starts as a message and ends as a message. There is one place a
// message is recognised (`handle`) and one place a message is sent (`send`), and the reason for
// that shape is invariant 5: **errors are messages, not exceptions**.
//
// An unhandled throw inside a worker is invisible. There is no rejected promise for the caller to
// see, no error boundary, and nothing in the UI that changes — the engine simply stops answering,
// and a Preview that has stopped updating looks exactly like a Preview of a Frame that has not
// changed. So every path out of `handle`, synchronous or asynchronous, is funnelled into `fail`,
// and the two global handlers below catch the throws that never reached `handle` at all. The
// top-level handler is not defensive decoration; it is the difference between a diagnosable
// failure and a tab that has quietly died.
//
// What this module does *not* do is decide anything. It holds no editing logic, projects no Scene,
// converts no time and rounds no number — `packages/model` owns every conversion (R7, Principle
// II), and the main thread owns the Project (invariant 1). The worker's state is a renderer, the
// scheduler every Render and transport change goes through, the playback decode of sound, the
// newest Scene, that Scene's revision, and the export running beside them, if one is.

import type { Scene } from "@cutroom/model"

import { probeCapabilities } from "./capabilities"
import { createSceneRenderer, type SceneRenderer } from "./compose/renderer"
import { startExport, type ExportRun } from "./export/run"
import { createScheduler, type Scheduler } from "./playback/scheduler"
import { createAudioPlayback } from "./sources/audio"
import { attachSource, releaseSource } from "./sources/attach"
import type {
  EngineEvent,
  ExportAudioChunkMessage,
  ExportStartMessage,
  InitMessage,
  RenderFrameMessage,
  SceneMessage,
  ToEngine,
  TransportMessage,
} from "./protocol"

/**
 * The worker's own global scope.
 *
 * Named through a cast rather than used implicitly, because `packages/engine` compiles with both
 * the DOM and WebWorker libraries — it has to, since a `File`, an `OffscreenCanvas` and a
 * `FileSystemWritableFileStream` all cross this boundary — and the two libraries declare `self`
 * differently. Saying which one this is, once, is cheaper than a `postMessage` overload resolving
 * to `Window`'s and demanding a target origin.
 */
const scope = globalThis as unknown as DedicatedWorkerGlobalScope

// ---------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------

/** The only way anything leaves this worker. */
function send(event: EngineEvent, transfer: Transferable[] = []): void {
  scope.postMessage(event, transfer)
}

/**
 * Renders any thrown value as something a person can act on, without throwing on its own account.
 *
 * `String(value)` is not safe here — a Symbol makes it throw, and a `fail` that fails is precisely
 * the silence this file exists to prevent.
 */
function describe(value: unknown): string {
  if (value instanceof Error) {
    return value.message ? `${value.name}: ${value.message}` : value.name
  }
  try {
    return typeof value === "string" ? value : (JSON.stringify(value) ?? String(value))
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/**
 * Turns a thrown value into the `fatal` message the main thread is waiting for.
 *
 * The payload is strings only, so it always survives `postMessage`; a `fatal` that could not be
 * cloned would be an exception raised while reporting an exception.
 *
 * The worker is left running. Whether to terminate it is the main thread's decision — it is the
 * side that can tell the user, and the side that would have to spawn the replacement.
 */
function fail(error: unknown): void {
  const reason = describe(error)
  const stack = error instanceof Error ? error.stack : undefined
  send(stack === undefined ? { type: "fatal", reason } : { type: "fatal", reason, stack })
}

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

let renderer: SceneRenderer | null = null

/**
 * Every Render and every transport change, one at a time and newest first (playback/scheduler.ts).
 * Made with the renderer, at `init`.
 */
let scheduler: Scheduler | null = null

/** Sound for playback, decoded ahead of the Playhead and sent as `audio-pcm` (sources/audio.ts). */
const audio = createAudioPlayback((event, transfer) => send(event, transfer), fail)

/**
 * The newest Scene the worker has been given, and its revision.
 *
 * They move together and are `null` together: a Scene without its revision could not be reported
 * in `frame-rendered`, and a revision without its Scene would accept a stale one as new.
 */
let scene: Scene | null = null
let sceneRevision: number | null = null

/**
 * The export running now, if one is (export/run.ts). One at a time (spec assumption). Cleared the
 * moment it reports how it ended, not when it has finished tidying up, so a main thread that starts
 * the next export on hearing `export-cancelled` is not refused for one already over.
 */
let exportRun: ExportRun | null = null

// ---------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------

/**
 * Stands up the renderer against the transferred canvas, then reports what this machine can do.
 *
 * The order matters: the renderer is established first because its backend name is part of what
 * `ready` reports, and because a browser that cannot give the worker a GPU context should say so
 * as a `fatal` at startup rather than as a Preview that never updates.
 *
 * `message.timebase` is deliberately unread. Nothing here converts time — the worker does no rate
 * arithmetic at all (R7) — and every `Scene` carries its own Timebase, which is what an export's
 * frozen Scene has to rely on anyway (FR-019). It is accepted because the contract sends it.
 */
async function initialise(message: InitMessage): Promise<void> {
  if (renderer !== null) {
    throw new Error("init: the engine is already initialised; `init` is sent once")
  }

  const created = await createSceneRenderer(message.canvas, message.frameSize)
  renderer = created
  scheduler = createScheduler(created, {
    rendered: (frame, revision, skipped) =>
      send({ type: "frame-rendered", frame, revision, skipped }),
    dropped: (count) => send({ type: "frames-dropped", count }),
  })

  send({
    type: "ready",
    capabilities: await probeCapabilities({
      renderer: created.name,
      frameSize: message.frameSize,
    }),
  })
}

/**
 * Replaces the worker's picture of the Timeline, unless it is older than the one already held.
 *
 * One comparison, written now while it is one comparison. Scenes are throttled but not
 * synchronised: a continuous gesture posts them faster than they are consumed, and a Scene that
 * overtakes its successor would leave the Preview showing a Timeline the user has already moved
 * past — with no later message to correct it, because the Scene that would have corrected it is
 * the one that arrived early.
 *
 * A revision equal to the one held is ignored too. `revision` identifies a Scene, so an equal
 * revision is the same Scene arriving twice; re-applying it is at best wasted work, and treating
 * it as new would mean the number no longer identifies anything.
 */
function replaceScene(message: SceneMessage): void {
  if (sceneRevision !== null && message.revision <= sceneRevision) return
  scene = message.scene
  sceneRevision = message.revision
  // Sound already decoding for a Clip that has moved is sound for the wrong place.
  audio.scene(message.scene)
}

/**
 * Composites one Frame and says so.
 *
 * A request that cannot be answered is reported as a dropped Frame rather than as an error or as
 * silence. Invariant 3 allows a `render-frame` to go unanswered and the main thread must not block
 * on one, and a request that arrives before `init` or before the first Scene is the ordinary shape
 * of startup, not a fault — `frames-dropped` is the protocol's own channel for saying so, and it
 * is explicitly diagnostic and never surfaced as an error.
 *
 * Everything past that check is playback/scheduler.ts: a `scrub` is rendered by random access, a
 * `clock` Frame during playback from the Clips' streams, and a request that arrives while a
 * Render is in flight waits behind it, displacing — and reporting as dropped — any older request
 * already waiting (FR-012).
 *
 * A `clock` Frame is also the Playhead moving, which is what lets sound be decoded further ahead.
 * It is passed on before the Frame is rendered, not after: sound must never wait for picture.
 */
function renderFrame(message: RenderFrameMessage): Promise<void> {
  if (message.reason === "clock") audio.playhead(message.frame)

  if (scheduler === null || scene === null || sceneRevision === null) {
    send({ type: "frames-dropped", count: 1 })
    return Promise.resolve()
  }
  return scheduler.request({
    scene,
    revision: sceneRevision,
    frame: message.frame,
    reason: message.reason,
  })
}

/**
 * Starts, restarts (a seek) or stops a playback run.
 *
 * Sound first, because it is the clock (ADR 0008): its decode starts the moment `playing` arrives,
 * not after a Render already in flight. The picture's side — closing the old run's iterators and
 * opening the new run's at `fromFrame` — goes through the scheduler, since it must not happen
 * under a Render drawing from those iterators.
 *
 * Before the first Scene there is nothing to decode or open, but the scheduler still records that
 * playback is running, so the clock Frames that follow are rendered as playback. Before `init`
 * there is no scheduler and nothing to record: the main thread has not been told `ready`.
 */
function changeTransport(message: TransportMessage): Promise<void> {
  if (message.state === "playing" && scene !== null) audio.play(scene, message.fromFrame)
  else audio.stop()

  if (scheduler === null) return Promise.resolve()
  return scheduler.transport({ state: message.state, fromFrame: message.fromFrame, scene })
}

/**
 * Starts an export over the Scene it carries — never the worker's own, which keeps moving as the
 * user edits (FR-019). Its own renderer and decoders too, so the Preview keeps working beside it.
 *
 * Every way an export can end is a message (`export-done`, `export-cancelled`, `export-failed`),
 * not a `fatal`: an encoder that refuses or a disk that fills is the export's failure, and the
 * engine carries on. A second `export-start` while one runs is a different thing — the client
 * refuses to send one, so it is a broken caller, and `fatal` says so; its stream is aborted so
 * that refusing it cannot leave a file of its own behind.
 */
function beginExport(message: ExportStartMessage): void {
  if (exportRun !== null) {
    void message.writable.abort().catch(() => undefined)
    throw new Error("export-start: an export is already running; one runs at a time")
  }
  let run: ExportRun | null = null
  const ended = (event: EngineEvent): void => {
    if (exportRun === run) exportRun = null
    send(event)
  }
  run = startExport(message, {
    progress: (framesDone, framesTotal) =>
      send({ type: "export-progress", framesDone, framesTotal }),
    audioAck: (startSample) => send({ type: "export-audio-ack", startSample }),
    sourceSound: (toFrame, chunks, transfer) =>
      send({ type: "export-audio-pcm", toFrame, chunks }, transfer),
    done: (bytes) => ended({ type: "export-done", bytes }),
    cancelled: () => ended({ type: "export-cancelled" }),
    failed: (reason) => ended({ type: "export-failed", reason }),
  })
  exportRun = run
}

/**
 * One chunk of the export's mix. With no export running it is dropped: the main thread's mixer can
 * still be posting chunks for an export that has just been cancelled or has failed, and nobody is
 * waiting for those to be encoded.
 */
function exportAudio(message: ExportAudioChunkMessage): void {
  exportRun?.audioChunk(message)
}

/**
 * Stops the running export; it answers `export-cancelled` when its file has been discarded. With
 * none running there is nothing to cancel and nothing is said — the export has already answered
 * with how it ended, and a second answer would be about nothing.
 */
function cancelExport(): void {
  exportRun?.cancel()
}

/**
 * Every message the main thread can send, in one switch.
 *
 * Anything that is not a message of the protocol throws and becomes a `fatal`: the protocol has
 * no "not understood" reply, a silent no-op would leave the main thread waiting for an answer that
 * is never coming, and a main thread sending a message this worker cannot handle is a version
 * mismatch between the two halves of the protocol, which is not a state to carry on from.
 */
async function handle(message: ToEngine): Promise<void> {
  switch (message.type) {
    case "init":
      await initialise(message)
      return

    case "scene":
      replaceScene(message)
      return

    case "render-frame":
      await renderFrame(message)
      return

    case "attach-source":
      // Always answered: a file that cannot be a Source is `source-failed`, never a throw.
      send(await attachSource(message))
      return

    case "detach-source":
      // No reply: the protocol has none, and a Source that was never attached is already detached.
      // Its Clips render empty from the next Frame, because every sink re-reads the attachment.
      releaseSource(message.sourceId)
      return

    case "transport":
      await changeTransport(message)
      return

    case "export-start":
      beginExport(message)
      return

    case "export-audio-chunk":
      exportAudio(message)
      return

    case "export-audio-request":
      // For the running export's own frozen Scene. With none running, the mixer asking is the tail
      // of an export that has already ended, like a stray `export-audio-chunk`.
      exportRun?.audioRequest(message.toFrame)
      return

    case "export-cancel":
      cancelExport()
      return

    default: {
      // Exhaustiveness, checked by the compiler rather than by review: every member of `ToEngine`
      // has a case above, so `message` narrows to `never` here, and the day the protocol grows a
      // message this line stops compiling. At runtime the same branch catches what the types
      // cannot — anything at all can be `postMessage`d at a worker.
      const unrecognised: never = message
      throw new Error(`unrecognised message: ${describe(unrecognised)}`)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------------------------------------

scope.addEventListener("message", (event: MessageEvent) => {
  // `event.data` is whatever the other side posted, which the types promise and nothing enforces.
  // Reading `.type` off a string, a `null` or a number throws or falls through to the exhaustive
  // default — either way it arrives at `fail` and leaves as `fatal`, which is the point.
  void handle(event.data as ToEngine).catch(fail)
})

// The two ways a throw reaches the outside without ever passing through `handle`: an error raised
// from a callback or a timer the engine scheduled, and a promise this module dropped. Both are
// invisible by default. Forwarding them costs four lines and turns "the worker stopped answering"
// into a reason with a stack attached (ADR 0003).
scope.addEventListener("error", (event: ErrorEvent) => {
  event.preventDefault()
  fail(event.error ?? event.message)
})

scope.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  event.preventDefault()
  fail(event.reason)
})
