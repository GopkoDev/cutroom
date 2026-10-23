// The master clock (ADR 0008, FR-011, FR-013).
//
// During playback the Frame on the clock is read off `AudioContext.currentTime` — the audio
// hardware's own clock, the one the sound is being played against — and never off a timer, a
// `performance.now()` or a count of animation frames. A timer measures how often the main thread
// got round to asking; the audio clock measures how much sound has been played. Only the second
// cannot drift from the sound, because it *is* the sound.
//
// The clock holds one thing, the anchor: which Frame begins to sound at which reading of
// `currentTime`. Every Frame it reports is computed from that anchor and the reading in one step,
// by `@cutroom/model` (`frameAtContextTime`), so the answer ten minutes in carries the same single
// rounding as the answer one Frame in. The graph (`graph.ts`) schedules sound against the same
// anchor, which is what puts picture and sound on one clock rather than two clocks kept in step.
//
// The anchor is set only once the sound for the starting Frame is in hand (transport.ts, "Starting
// when the sound is ready"), and then `START_MARGIN_SECONDS` ahead of `currentTime`, so the first
// node is started ahead of the audio thread rather than behind it. Until then the clock *holds* the
// starting Frame (`hold`): it reports that Frame, which is what is on screen, and has no anchor.
// A suspended context — Chrome starts one suspended until a gesture resumes it — simply holds
// `currentTime` still, and with it the clock: playback begins when the sound can.
//
// A seek (T066) holds and then re-anchors at the new Frame the same way; nothing else about the
// clock changes.

import { frameAtContextTime, type Frame, type PlaybackAnchor, type Timebase } from "@cutroom/model"

/**
 * How far ahead of `currentTime` the starting Frame is anchored once its sound is in hand: the time
 * the main thread needs to turn the PCM it holds into started nodes, plus the audio thread's own
 * render-ahead, with room to spare. It is a margin on the audio clock, not a wait for the engine —
 * by the time it is taken the engine's sound has already arrived — so it is the whole of the
 * start's latency on an idle machine, after the few milliseconds of the first decode.
 */
export const START_MARGIN_SECONDS = 0.05

/** All the clock reads from an audio context. */
export interface ClockContext {
  readonly currentTime: number
}

export interface AudioClock {
  /**
   * Reports `frame` with no anchor: playback is starting there, and its sound is not in hand yet.
   * `anchor()` is `null` until `start`.
   */
  hold(frame: Frame): void
  /** Anchors `fromFrame` the start margin ahead of `currentTime`, and returns the anchor. */
  start(timebase: Timebase, fromFrame: Frame): PlaybackAnchor
  /** Forgets the anchor. `frame()` is `null` until the next `start`. */
  stop(): void
  /** The Frame playing now — the held Frame, while starting — or `null` when stopped. */
  frame(): Frame | null
  /** The anchor in use, or `null` when stopped. */
  anchor(): PlaybackAnchor | null
}

export interface AudioClockOptions {
  readonly context: ClockContext
  readonly startMarginSeconds?: number
}

export function createAudioClock({
  context,
  startMarginSeconds = START_MARGIN_SECONDS,
}: AudioClockOptions): AudioClock {
  let held: Frame | null = null
  let running: { readonly timebase: Timebase; readonly anchor: PlaybackAnchor } | null = null

  return {
    hold(frame) {
      held = frame
      running = null
    },

    start(timebase, fromFrame) {
      // The one place a margin is added to a clock reading, and it is an instant on the audio
      // clock, not a position on the Timeline: it says when, not where.
      const anchor = { frame: fromFrame, contextSeconds: context.currentTime + startMarginSeconds }
      held = null
      running = { timebase, anchor }
      return anchor
    },

    stop() {
      held = null
      running = null
    },

    frame() {
      if (running === null) return held
      return frameAtContextTime(running.timebase, running.anchor, context.currentTime)
    },

    anchor() {
      return running?.anchor ?? null
    },
  }
}
