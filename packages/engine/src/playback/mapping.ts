// Where a Frame of the Timeline lands inside a Source (R7, Principle II).
//
// This module is deliberately almost empty. The arithmetic that turns a Project Frame into a
// position in a Source — including a Source whose own Timebase differs from the Project's — lives
// in `frameToSourceTime` in `@cutroom/model`, and the whole job here is to call it and then hand
// the decoder the one kind of number it accepts. Anything cleverer than that would be a second
// conversion module, which is the defect R7 names.
//
// What is allowed here, and why it is not rate arithmetic:
//
//   - **Integer Frame comparisons and subtraction.** `startFrame <= frame < startFrame +
//     durationFrames` and `frame - startFrame` are positions on the Timeline compared with
//     positions on the Timeline, in the one unit the Timeline has. No rate is involved, so nothing
//     can round.
//   - **One division, at the decoder's door.** `frameToSourceTime` returns an exact Rational and
//     Mediabunny takes seconds as a float, so `numerator / denominator` happens exactly once, on
//     the way out, with nothing computed after it. Equal rationals divide to the same double
//     (IEEE division of exactly representable integers is correctly rounded), and Mediabunny
//     snaps a timestamp that lands within a few ULPs of a timescale tick onto that tick
//     (`roundIfAlmostInteger`, isobmff demuxer), so a Frame whose start coincides with a Source
//     Frame's start selects that Source Frame rather than the one before it.

import {
  frameToSourceTime,
  type Frame,
  type Rational,
  type SceneClip,
  type Timebase,
} from "@cutroom/model"

/**
 * Whether a SceneClip is on screen at a Frame: from its first Frame, up to but not including the
 * Frame after its last. `durationFrames` is a count, so `startFrame + durationFrames` is the
 * exclusive end and is never drawn — which is exactly what makes the Preview go empty past the end
 * of a Clip rather than hold its last Frame (FR-008, US1 scenario 3).
 */
export function covers(clip: SceneClip, frame: Frame): boolean {
  return frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames
}

/**
 * The time inside the Clip's Source at which `frame` asks for a picture, in the Source's own
 * seconds, as the exact ratio the model computes.
 *
 * The Frame is first made relative to the Clip — Frame `startFrame` of the Timeline is Frame 0 of
 * the Clip, and shows the Source at `sourceInPoint` — and the model does the rest. Calling this
 * for a Frame the Clip does not cover is a caller's mistake, so it throws rather than returning a
 * time before the Clip's in-point or past its end, either of which would decode a plausible
 * picture that does not belong on screen.
 */
export function sourceTimeAt(timebase: Timebase, clip: SceneClip, frame: Frame): Rational {
  if (!covers(clip, frame)) {
    throw new RangeError(
      `sourceTimeAt: Frame ${frame} is outside Clip ${clip.clipId} ` +
        `(Frames ${clip.startFrame}…${clip.startFrame + clip.durationFrames - 1})`
    )
  }
  return frameToSourceTime(timebase, clip.sourceInPoint, frame - clip.startFrame)
}

/**
 * A Source time as the float Mediabunny's sinks take: the one division at the decoder's door,
 * with nothing computed after it.
 */
export function decoderSeconds(time: Rational): number {
  return time.numerator / time.denominator
}

/** `sourceTimeAt`, handed straight to a decoder. */
export function sourceSecondsAt(timebase: Timebase, clip: SceneClip, frame: Frame): number {
  return decoderSeconds(sourceTimeAt(timebase, clip, frame))
}
