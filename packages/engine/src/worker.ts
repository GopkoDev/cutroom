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
// II), and the main thread owns the Project (invariant 1). The worker's entire state is three
// values: a renderer, the newest Scene, and that Scene's revision.

import type { Scene } from "@cutroom/model"

import { probeCapabilities } from "./capabilities"
import { createSceneRenderer, type SceneRenderer } from "./compose/renderer"
import type {
  EngineEvent,
  InitMessage,
  RenderFrameMessage,
  SceneMessage,
  ToEngine,
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
 * The newest Scene the worker has been given, and its revision.
 *
 * They move together and are `null` together: a Scene without its revision could not be reported
 * in `frame-rendered`, and a revision without its Scene would accept a stale one as new.
 */
let scene: Scene | null = null
let sceneRevision: number | null = null

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
 * There is no coalescing here yet, and its absence is deliberate rather than overlooked. FR-012's
 * rule — newer requests displace older ones instead of queueing them — only has anything to
 * displace once a Render can be in flight across an `await`, which is when decoding arrives
 * (T046). Compositing an empty stage returns within the same task, so a latch added now would be a
 * branch that could never be taken and could never be tested.
 */
function renderFrame(message: RenderFrameMessage): void {
  if (renderer === null || scene === null || sceneRevision === null) {
    send({ type: "frames-dropped", count: 1 })
    return
  }

  renderer.renderScene(scene, message.frame)
  send({ type: "frame-rendered", frame: message.frame, revision: sceneRevision })
}

/**
 * Every message the main thread can send, in one switch.
 *
 * The cases with no implementation yet throw, and that is the honest answer rather than a
 * placeholder. The protocol has no "recognised but not supported" reply, and each of the plausible
 * substitutes says something false: `source-failed` would blame the user's file for a decoder this
 * build has not written, and a silent no-op would leave the main thread waiting for a reply that
 * is never coming. A `fatal` naming the message is the only one that cannot be mistaken for a real
 * answer — and a main thread sending a message this worker cannot handle is a version mismatch
 * between the two halves of the protocol, which is not a state to carry on from.
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
      renderFrame(message)
      return

    case "attach-source":
    case "detach-source":
    case "transport":
    case "export-start":
    case "export-audio-chunk":
    case "export-cancel":
      throw new Error(
        `${message.type}: recognised, but this build of the engine does not implement it yet`
      )

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
