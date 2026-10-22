// The timecode a person reads off a Frame, as text (T050).
//
// What the timecode *is* — wall-clock `HH:MM:SS` of the second a Frame begins in, and `FF` Frames
// into that second, not SMPTE — and every piece of arithmetic behind it belong to the Timebase
// module, which is the only place in Cutroom entitled to turn a Frame into time (Principle II,
// R7). `frameToTimecode` documents the choice and computes the parts in exact integers. This file
// only lays them out: zero-padding, and how wide `FF` must be at this Timebase.

import {
  framesForDuration,
  frameToTimecode,
  type Frame,
  type Timebase,
  type Timecode,
} from "@cutroom/model"

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0")
}

/** How many digits `FF` needs: enough for the largest Frame index inside one second, at least two. */
function frameDigits(timebase: Timebase): number {
  const perSecond = framesForDuration(timebase, { numerator: 1, denominator: 1 })
  return Math.max(2, String(perSecond - 1).length)
}

/** The parts of a timecode, for a caller that lays them out itself. */
export type TimecodeParts = Timecode

/** The wall-clock second a Frame begins in, and how far into that second it is, in Frames. */
export function timecodeParts(timebase: Timebase, frame: Frame): TimecodeParts {
  return frameToTimecode(timebase, frame)
}

/** `HH:MM:SS:FF` for a Frame in a Timebase. Throws, as the Timebase module does, on a bad Frame. */
export function formatTimecode(timebase: Timebase, frame: Frame): string {
  const { hours, minutes, seconds, frames } = frameToTimecode(timebase, frame)
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}:${pad(frames, frameDigits(timebase))}`
}
