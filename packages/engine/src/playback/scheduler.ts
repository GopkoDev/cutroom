// One Render at a time, the newest request next, and the transport in order (FR-012).
//
// Every Frame the engine composites — a scrub, a clock Frame of playback — and every change of
// transport passes through the one scheduler below. That is the answer to whether the scrub latch
// T044 wrote should be generalised or joined by a second one: generalised, because the thing it
// serialises is not "scrubs" but **the sinks**. A scrub and a clock Frame draw from the same
// `CanvasSink` of the same Clip, into the same pooled canvas (canvas-sink.ts, R1); two latches
// would let one of each be in flight at once, and the second pull would either throw or overwrite
// the first one's picture before it was drawn. A seek and a live iterator on one decoder do not
// mix either (R2). One latch makes both impossible by construction rather than by care.
//
// **Newest request wins.** A Render spans `await`s, and requests keep arriving while one is in
// flight — a Playhead dragged across the Timeline, a clock ticking on a machine that cannot keep
// up. They are not queued. At most one request waits behind the Render in flight; a newer one
// displaces it, whatever either one's `reason`, and each one displaced is reported as
// `frames-dropped: 1` — its answer, since every request gets exactly one. A queue would replay the
// past: the Preview would show Frames the user had scrubbed past, or the clock had, long after.
//
// **Frames playback skipped.** On a loaded machine the clock moves on several Frames between two
// Renders, and the client's own latest-wins guard means the worker is never asked for most of
// them. They are dropped all the same, and FR-012's design working is something to measure rather
// than infer. So each clock Frame rendered says how many Frames of the Timeline playback passed
// over to reach it (`frame-rendered.skipped`), counted from the previous Frame of the same
// playback run. Only this side can count them honestly: it knows where a run begins, so a seek
// (`transport: playing` again) is never mistaken for a stall.
//
// **Transport, in order.** `transport` messages change which path a clock Frame takes and close
// or open iterators, and those must not happen under a Render that is drawing from them. So a
// transport change is a job like a Render: it waits for the one in flight, it runs before any
// request that arrived after it, and only the newest one pending is kept, since an older one is
// undone by the newer anyway.
//
// While stopped, a `clock` request is answered by random access like a scrub. Streams are opened
// by playback, and a late clock Frame arriving after `stopped` must not open a decoder that would
// then sit running ahead of a Preview nobody is playing.

import type { Frame, Scene } from "@cutroom/model"

import type { SceneRenderer } from "../compose/renderer"
import { previewSinks } from "../sources/canvas-sink"
import { renderByRandomAccess } from "./scrub"
import { openStreams, renderByStreaming } from "./stream"

/** One `render-frame`, with the Scene it is to be rendered from. */
export interface FrameRequest {
  readonly scene: Scene
  readonly revision: number
  readonly frame: Frame
  readonly reason: "scrub" | "clock"
}

/** One `transport`, with the Scene current when it arrived, if there was one yet. */
export interface TransportChange {
  readonly state: "playing" | "stopped"
  readonly fromFrame: Frame
  readonly scene: Scene | null
}

/** What the scheduler reports, in the protocol's own terms. */
export interface RenderReport {
  rendered(frame: Frame, revision: number, skipped: number): void
  dropped(count: number): void
}

export interface Scheduler {
  /**
   * Asks for a Frame. Resolves when this request has been rendered, displaced by a newer one, or
   * handed to the Render in flight to pick up; never blocks on requests that come after it.
   * Rejects only if a job it is responsible for running throws.
   */
  request(request: FrameRequest): Promise<void>

  /** Changes the transport, after the Render in flight and before any later request. */
  transport(change: TransportChange): Promise<void>
}

type Job =
  | { readonly kind: "render"; readonly request: FrameRequest }
  | { readonly kind: "transport"; readonly change: TransportChange }

export function createScheduler(renderer: SceneRenderer, report: RenderReport): Scheduler {
  let running = false
  // At most one job of each kind, in arrival order.
  let pending: Job[] = []

  let playing = false
  /**
   * The clock Frame on screen in the current playback run — what the next clock Frame's skipped
   * Frames are counted from, and what a repeated request already has — or `null` out of a run or
   * after a scrub.
   */
  let lastShown: Frame | null = null
  /** The Scene revision the last clock Frame was rendered from. */
  let shownRevision: number | null = null

  async function run(job: Job): Promise<void> {
    if (job.kind === "transport") {
      const { state, fromFrame, scene } = job.change
      // Whether starting, restarting from a seek, or stopping: no iterator positioned for the old
      // run is worth continuing.
      previewSinks.abandonStreams()
      playing = state === "playing"
      // The run begins at `fromFrame`, so a first clock Frame beyond it skipped the ones between.
      lastShown = playing ? fromFrame - 1 : null
      if (playing && scene !== null) await openStreams(previewSinks, scene, fromFrame)
      return
    }

    const { scene, revision, frame, reason } = job.request
    if (reason === "clock" && playing) {
      // The clock is read every animation frame and a display refreshes faster than most footage
      // changes, so the same Frame is asked for again and again. It is on screen already; drawing
      // it again would mean reopening a stream that has moved past it.
      if (frame === lastShown && revision === shownRevision) {
        report.rendered(frame, revision, 0)
        return
      }
      await renderByStreaming(previewSinks, renderer, scene, frame)
      shownRevision = revision
      const skipped = lastShown !== null && frame > lastShown ? frame - lastShown - 1 : 0
      // Backwards too: a clock that went back is showing an earlier Frame now, and the next one
      // is counted from there.
      lastShown = frame
      report.rendered(frame, revision, skipped)
      return
    }

    // A scrub during playback is the user taking the Playhead somewhere by hand: the run's count
    // of skipped Frames starts again from the next clock Frame rather than counting the jump.
    if (reason === "scrub" && playing) lastShown = null
    await renderByRandomAccess(renderer, scene, frame)
    report.rendered(frame, revision, 0)
  }

  async function drain(): Promise<void> {
    running = true
    try {
      for (let job = pending.shift(); job !== undefined; job = pending.shift()) {
        await run(job)
      }
    } finally {
      running = false
      // A job threw: whatever was waiting behind it is not run. A waiting request says so, rather
      // than sitting here until some later request happens to flush it.
      for (const job of pending) if (job.kind === "render") report.dropped(1)
      pending = []
    }
  }

  function enqueue(job: Job): Promise<void> {
    const displaced = pending.findIndex((waiting) => waiting.kind === job.kind)
    if (displaced !== -1) {
      pending.splice(displaced, 1)
      if (job.kind === "render") report.dropped(1)
    }
    pending.push(job)
    return running ? Promise.resolve() : drain()
  }

  return {
    request: (request) => enqueue({ kind: "render", request }),
    transport: (change) => enqueue({ kind: "transport", change }),
  }
}
