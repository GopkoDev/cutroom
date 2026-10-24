// One Render at a time, the newest request next, and the transport in order (FR-012).
//
// Every Frame the engine composites — a scrub, a clock Frame of playback — and every change of
// transport passes through the one scheduler below. That is the answer to whether the scrub latch
// T044 wrote should be generalised or joined by a second one: generalised, because the thing it
// serialises is not "scrubs" but **the sinks**. A scrub and a clock Frame draw from the same
// sink of the same Clip, into the same pooled canvas (canvas-sink.ts, R1); two latches
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
// **Transport, in order.** `transport` messages close or open iterators, and those must not happen
// under a Render that is drawing from them. So a transport change is a job like a Render: it waits
// for the one in flight, it runs before any request that arrived after it, and only the newest one
// pending is kept, since an older one is undone by the newer anyway.
//
// **One path for every Frame (ADR 0017).** A scrub, a clock Frame and a clock Frame that arrives
// after `stopped` are all rendered from the Clips' streams under the one walk rule
// (playback/stream.ts): walked forward when the Frame is ahead of the stream within reach, opened
// afresh otherwise. What the transport adds is only where streams start and when they end:
// `playing` keeps each stream that can walk to `fromFrame` — a seek forward within the GOP the
// stream is in, say — and opens one at `fromFrame` for every other visible Clip; `stopped` closes
// them all, so a decoder playback was running ahead does not outlive the run.
//
// **Parked decoders, and for how long.** A stream a scrub opens stays open after it, parked ahead
// of the Frame on screen, for the next step to walk on from. Parked is not free: the decoder
// races ahead of a cold start before Mediabunny's backpressure catches up, and measured on the
// reference machine a parked stream holds about 45 decoded Frames — some 140 MB of a 1080p Source
// and over 500 MB of a 4K one, per visible Clip. So a stopped Preview keeps them for `PARK_MS`
// after the last job and then closes them all (a stopped Preview holding no decoder, as T090
// left it), besides closing a stream whenever its Clip leaves the screen, its Source is detached,
// the transport changes, or a request needs it somewhere it cannot walk. The cost of the timeout
// is only that a step after a long look at one Frame is a cold seek again — what every step was
// before ADR 0017.

import type { Frame, Scene } from "@cutroom/model"

import type { SceneRenderer } from "../compose/renderer"
import { previewSinks } from "../sources/canvas-sink"
import {
  closeStreams,
  openStreams,
  PREPARE_AHEAD_FRAMES,
  renderByStreaming,
  settlePreparations,
} from "./stream"

/**
 * How long a stopped Preview keeps its decoders parked after its last job (header). Long enough to
 * cover the pauses between steps and the stops in a drag; short enough that the Frames a parked
 * decoder holds are not kept for a Preview nobody is touching.
 */
export const PARK_MS = 3_000

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
  /** Closes the parked decoders of a stopped Preview once it has been left alone for `PARK_MS`. */
  let parkTimer: ReturnType<typeof setTimeout> | null = null

  async function run(job: Job): Promise<void> {
    if (job.kind === "transport") {
      const { state, fromFrame, scene } = job.change
      playing = state === "playing"
      // The run begins at `fromFrame`, so a first clock Frame beyond it skipped the ones between.
      lastShown = playing ? fromFrame - 1 : null
      // Starting or seeking: a stream that can walk to `fromFrame` is kept (the walk rule), every
      // other one reopened there. Stopping, or nothing to play yet: none is worth continuing.
      if (playing && scene !== null) await openStreams(previewSinks, scene, fromFrame)
      else await closeStreams(previewSinks)
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
      await renderByStreaming(previewSinks, renderer, scene, frame, PREPARE_AHEAD_FRAMES)
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
    await renderByStreaming(previewSinks, renderer, scene, frame)
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
      if (!playing) park()
    }
  }

  /**
   * Starts the stopped Preview's `PARK_MS` countdown. It closes the streams only from idle — no
   * job running or waiting — so it never pulls a stream from under a Render, and any new job
   * cancels it first (`enqueue`).
   */
  function park(): void {
    if (parkTimer !== null) clearTimeout(parkTimer)
    parkTimer = setTimeout(() => {
      parkTimer = null
      // A preparation started by the last clock Frame may still be landing; it is waited for, and
      // the Preview is checked for idleness again after it, so no job's stream is pulled away.
      void settlePreparations(previewSinks).then(() => {
        if (!running && pending.length === 0 && !playing) previewSinks.abandonStreams()
      })
    }, PARK_MS)
  }

  function enqueue(job: Job): Promise<void> {
    if (parkTimer !== null) {
      clearTimeout(parkTimer)
      parkTimer = null
    }
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
