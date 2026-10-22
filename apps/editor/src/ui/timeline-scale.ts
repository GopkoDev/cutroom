// How Frames are laid out across the Timeline's pixels, and how a pixel becomes a Frame (T048).
//
// Pure, so that the one rule the Timeline owes the spec can be tested without a browser: **a pixel
// position becomes a whole Frame, and nothing between two Frames can be expressed** (FR-006). The
// pointer reports fractional pixels; what reaches the store is always an integer, chosen here.
//
// No time is involved anywhere in this file. Pixels map to Frames and Frames to pixels; seconds
// never appear, so there is no rate arithmetic to get wrong (Principle II). The ruler is labelled
// in Frames for the same reason.

import type { Frame } from "@cutroom/model"

/**
 * How many Frames the Timeline shows across its width.
 *
 * Longer than the Timeline itself on purpose: the Playhead has to be able to go past the end of the
 * last Clip, because the empty Preview there is one of US1's acceptance scenarios (FR-008). An
 * eighth of the length, and never less than `minimumTail` Frames, so that even a one-Frame Timeline
 * leaves room to step off it. An empty Timeline still shows `minimumTail` Frames rather than none,
 * so the ruler has something to measure.
 */
export function visibleFrames(durationFrames: Frame, minimumTail = 30): Frame {
  return durationFrames + Math.max(minimumTail, Math.ceil(durationFrames / 8))
}

/**
 * The Frame under a horizontal offset, in pixels from the Timeline's start.
 *
 * **Snapping rule: nearest Frame, an exact half going up** — Frame n owns the pixels from n − ½ to
 * n + ½ Frame-widths. That is the tie rule the Timebase module documents for `secondsToFrame`, so
 * the two ways a position becomes a Frame cannot disagree about a boundary. Clamped to the
 * Frames the Timeline shows, `0 … visible − 1`, since there is no Frame before the first one and
 * none the user can see past the last.
 */
export function frameAtOffset(offsetPx: number, pxPerFrame: number, visible: Frame): Frame {
  if (!(pxPerFrame > 0) || visible <= 0 || !Number.isFinite(offsetPx)) return 0
  const nearest = Math.floor(offsetPx / pxPerFrame + 0.5)
  return Math.min(Math.max(nearest, 0), visible - 1)
}

/**
 * The left edge of a Frame, in pixels. A Frame is drawn as the span `[x(n), x(n + 1))`, so a Clip
 * of `d` Frames starting at `s` covers `x(s)` to `x(s + d)` and two butt-joined Clips meet on one
 * pixel boundary with no gap and no overlap.
 */
export function offsetOfFrame(frame: Frame, pxPerFrame: number): number {
  return frame * pxPerFrame
}

/** Steps the ruler may use between labelled ticks — whole Frames, in a 1-2-5 progression. */
function* niceSteps(): Generator<number> {
  for (let magnitude = 1; ; magnitude *= 10) {
    yield magnitude
    yield 2 * magnitude
    yield 5 * magnitude
  }
}

/**
 * The spacing, in Frames, between labelled ruler ticks: the smallest 1-2-5 step whose ticks are at
 * least `minimumGapPx` apart. Always a whole number of Frames, so every label names a real Frame.
 */
export function rulerStep(pxPerFrame: number, minimumGapPx = 64): Frame {
  if (!(pxPerFrame > 0)) return 1
  for (const step of niceSteps()) {
    if (step * pxPerFrame >= minimumGapPx) return step
  }
  return 1 // unreachable: the generator is infinite
}

/** The labelled ticks for a Timeline showing `visible` Frames: `0, step, 2·step, …` below `visible`. */
export function rulerTicks(visible: Frame, step: Frame): Frame[] {
  const ticks: Frame[] = []
  for (let frame = 0; frame < visible; frame += step) ticks.push(frame)
  return ticks
}
