// The main thread's end of the engine worker (ADR 0003, contracts/worker-protocol.md).
//
// Two shapes of traffic cross this boundary and they are deliberately not the same shape here.
//
// **Request/response** — `init` and `attach-source`. The worker always answers (`ready` / `fatal`,
// `source-attached` / `source-failed`), so each returns a promise that settles on that answer.
//
// **Streams** — `scene`, `render-frame` and `transport` return nothing. `render-frame` above all:
// FR-012 lets the worker drop a superseded request without ever answering it, so a promise per
// Frame would leak one for every Frame dropped, which during playback is most of them. What is on
// screen is observed through `onFrameRendered`, an announcement and not a reply.
//
// `fatal` is the third thing. It is not tied to any request, so it settles every promise still
// waiting and is also pushed to `onFatal` listeners: a worker that has died must be visible, not a
// preview that quietly stops answering (invariant 5).

import type {
  AttachSourceMessage,
  EngineCapabilities,
  EngineEvent,
  FatalEvent,
  FrameRenderedEvent,
  SourceAttachedEvent,
  ToEngine,
} from "@cutroom/engine/protocol"
import EngineWorker from "@cutroom/engine/worker?worker"
import type { Frame, PixelSize, Scene, Timebase } from "@cutroom/model"

/** The worker cannot continue. Carries the worker's own words and, when it sent one, its stack. */
export class EngineFatalError extends Error {
  readonly workerStack: string | undefined

  constructor(event: FatalEvent) {
    super(event.reason)
    this.name = "EngineFatalError"
    this.workerStack = event.stack
  }
}

/** A file the engine would not take (FR-003). `reason` is the worker's, meant for a person. */
export class SourceRefusedError extends Error {
  readonly sourceId: string

  constructor(sourceId: string, reason: string) {
    super(reason)
    this.name = "SourceRefusedError"
    this.sourceId = sourceId
  }
}

export type Unsubscribe = () => void

export interface EngineClient {
  /** Transfers the canvas and resolves with what this machine can do, once the renderer is up. */
  init(
    canvas: OffscreenCanvas,
    timebase: Timebase,
    frameSize: PixelSize
  ): Promise<EngineCapabilities>
  /** Rejects with `SourceRefusedError` when the file is unusable, so the Project stays untouched. */
  attachSource(sourceId: string, file: File): Promise<SourceAttachedEvent>
  detachSource(sourceId: string): void

  /** Replaces the worker's picture of the Timeline. Returns nothing: a stream. */
  postScene(revision: number, scene: Scene): void
  /** Asks for a Frame. Returns nothing and may never be answered: see `onFrameRendered`. */
  renderFrame(frame: Frame, reason: "scrub" | "clock"): void
  setTransport(state: "playing" | "stopped", fromFrame: Frame): void

  onFrameRendered(listener: (event: FrameRenderedEvent) => void): Unsubscribe
  /** Called once if the worker dies. A listener added afterwards is told at once. */
  onFatal(listener: (error: EngineFatalError) => void): Unsubscribe
  /** `null` while the engine is healthy. */
  readonly fatal: EngineFatalError | null

  terminate(): void
}

/** The part of `Worker` the client uses, so a test can stand in for the real thing. */
export type EngineWorkerLike = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((event: MessageEvent<EngineEvent>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
}

interface Settler<T> {
  resolve(value: T): void
  reject(error: unknown): void
}

export function createEngineClient(
  worker: EngineWorkerLike = new EngineWorker() as unknown as EngineWorkerLike
): EngineClient {
  let fatal: EngineFatalError | null = null
  let pendingInit: Settler<EngineCapabilities> | null = null
  const pendingAttach = new Map<string, Settler<SourceAttachedEvent>>()
  const frameListeners = new Set<(event: FrameRenderedEvent) => void>()
  const fatalListeners = new Set<(error: EngineFatalError) => void>()

  function post(message: ToEngine, transfer: Transferable[] = []): void {
    // After `fatal` the worker is not going to act on anything; posting would only look like it did.
    if (fatal !== null) return
    worker.postMessage(message, transfer)
  }

  function die(error: EngineFatalError): void {
    if (fatal !== null) return
    fatal = error
    pendingInit?.reject(error)
    pendingInit = null
    for (const settler of pendingAttach.values()) settler.reject(error)
    pendingAttach.clear()
    for (const listener of [...fatalListeners]) listener(error)
  }

  worker.onmessage = ({ data }) => {
    switch (data.type) {
      case "ready":
        pendingInit?.resolve(data.capabilities)
        pendingInit = null
        break
      case "source-attached":
        pendingAttach.get(data.sourceId)?.resolve(data)
        pendingAttach.delete(data.sourceId)
        break
      case "source-failed":
        pendingAttach.get(data.sourceId)?.reject(new SourceRefusedError(data.sourceId, data.reason))
        pendingAttach.delete(data.sourceId)
        break
      case "frame-rendered":
        for (const listener of [...frameListeners]) listener(data)
        break
      case "fatal":
        die(new EngineFatalError(data))
        break
      // `frames-dropped` is diagnostic by contract; audio and export events belong to the tasks
      // that send the requests they answer.
      default:
        break
    }
  }

  // A worker that fails to load, or throws outside the worker's own catch, never sends `fatal`.
  worker.onerror = (event) => {
    die(
      new EngineFatalError({ type: "fatal", reason: event.message || "The engine worker crashed." })
    )
  }
  worker.onmessageerror = () => {
    die(
      new EngineFatalError({
        type: "fatal",
        reason: "The engine sent a message that could not be read.",
      })
    )
  }

  return {
    init(canvas, timebase, frameSize) {
      if (fatal !== null) return Promise.reject(fatal)
      if (pendingInit !== null) return Promise.reject(new Error("The engine is already starting."))
      return new Promise((resolve, reject) => {
        pendingInit = { resolve, reject }
        post({ type: "init", canvas, timebase, frameSize }, [canvas])
      })
    },

    attachSource(sourceId, file) {
      if (fatal !== null) return Promise.reject(fatal)
      if (pendingAttach.has(sourceId)) {
        return Promise.reject(new Error(`Source ${sourceId} is already being attached.`))
      }
      return new Promise((resolve, reject) => {
        pendingAttach.set(sourceId, { resolve, reject })
        const message: AttachSourceMessage = { type: "attach-source", sourceId, file }
        post(message)
      })
    },

    detachSource(sourceId) {
      post({ type: "detach-source", sourceId })
    },

    postScene(revision, scene) {
      post({ type: "scene", revision, scene })
    },

    renderFrame(frame, reason) {
      post({ type: "render-frame", frame, reason })
    },

    setTransport(state, fromFrame) {
      post({ type: "transport", state, fromFrame })
    },

    onFrameRendered(listener) {
      frameListeners.add(listener)
      return () => frameListeners.delete(listener)
    },

    onFatal(listener) {
      if (fatal !== null) listener(fatal)
      else fatalListeners.add(listener)
      return () => fatalListeners.delete(listener)
    },

    get fatal() {
      return fatal
    },

    terminate() {
      worker.terminate()
      const gone = new Error("The engine was shut down.")
      pendingInit?.reject(gone)
      pendingInit = null
      for (const settler of pendingAttach.values()) settler.reject(gone)
      pendingAttach.clear()
      frameListeners.clear()
      fatalListeners.clear()
    },
  }
}
