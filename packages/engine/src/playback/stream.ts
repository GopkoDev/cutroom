// The one render path: a Frame of the Preview (or of an Export) from a live iterator per Clip,
// walked forward when that is cheaper than seeking (R2, ADR 0017).
//
// Every Frame the engine composites — a scrub, a step, a clock Frame of playback, an exported
// Frame — is answered here, in the same way. Each visible SceneClip keeps a `canvasesAtTimestamps`
// iterator open on its sink (sources/canvas-sink.ts), fed the Source time of every Frame of the
// Clip from where it was opened, in order, so the decoder runs straight through the Source and
// decodes each packet once. A request for Frame `n` takes the stream's pictures up to `n`, draws
// `n`, and leaves the rest undrawn — a Frame passed over on the way is decoded, because a decoder
// cannot skip it, and dropped (FR-012). Where the Frame maps into the Source is the model's
// arithmetic, through playback/mapping.ts (R7).
//
// **Why scrubs walk too (ADR 0017).** A seek decodes from the keyframe before the target, so its
// cost is the target's distance from that keyframe — up to a whole GOP, 300 Frames of camera-like
// footage, about 300 ms at 1080p (T092). Until ADR 0017 a scrub always sought, even a one-Frame
// step. Now a scrub leaves its stream open, parked ahead of the Frame it drew (for a while — see
// `PARK_MS`, playback/scheduler.ts), and the next request that lies ahead of it within the same
// GOP — an arrow-key step, a drag forward — is walked to at the cost of the Frames in between,
// usually already decoded. Measured on 1080p H.264 with a keyframe every 300 Frames, a one-Frame
// step went from about 295 ms to 1 ms, and a step across 89 Frames to about 55 ms. Scrubs and
// playback ask the same question, `canWalk`, so the two paths cannot drift apart.
//
// **The walk rule: when a stream is continued and when it is opened afresh.** A stream only goes
// forward, and it is valid only for the placement of the Clip it was mapped from. It is continued
// to Frame `n` when all of these hold, and replaced by one opened at `n` otherwise:
//
//   - the Clip has one — not so when playback or scrubbing has just reached the Clip;
//   - it was mapped for this placement of the Clip and this Timebase (`streamKey`) — otherwise the
//     Source times it was fed are someone else's now;
//   - `n` is not behind it — a backward step or a jump back is a seek;
//   - walking decodes no more than seeking would: `n` is at most `STEP_LIMIT` Frames ahead, or
//     further ahead but **in the same GOP** as the Frame the stream yields next. With no keyframe
//     in between, a seek would decode from that GOP's keyframe, through every Frame the walk
//     decodes and more; across a keyframe, a seek starts at the nearer one and wins. The limit
//     covers the short walks across a keyframe, where the stream has already decoded a few Frames
//     ahead and a seek would throw them away and start a new decoder.
//
// Walking can never show the wrong Frame: the stream is fed every Frame's Source time, and the
// picture drawn for `n` is the one it yields for `n`'s time — the one a seek to `n` returns.
//
// Opening and closing on the transport (`transport: playing` / `stopped`) is the scheduler's
// (playback/scheduler.ts), which owns the order those happen in relative to Renders.

import type { Frame, Scene, SceneClip, Timebase } from "@cutroom/model"

import type { ClipPicture } from "../compose/scene-clip"
import type { SceneRenderer } from "../compose/renderer"
import { settleAll, type ClipSink, type SinkSet } from "../sources/canvas-sink"
import { covers, sourceSecondsAt } from "./mapping"

/**
 * How far ahead of its stream a Frame may be and be walked to whatever GOP it is in. A count of
 * Frames, not a duration: it bounds decoder work per Frame drawn, which is counted in Frames.
 *
 * Thirty is about one second at the rates this slice plays and well under the two-second GOPs of
 * ordinary footage, so a lagging clock or a ten-Frame step is walked through even across a
 * keyframe. Beyond it a Frame is walked to only within the stream's GOP (`canWalk`).
 */
export const STEP_LIMIT = 30

/**
 * What a stream was mapped from: the Clip's placement and the Timebase that turned its Frames
 * into Source times. A stream whose key differs from the Clip's now would show the wrong pictures.
 */
export function streamKey(timebase: Timebase, clip: SceneClip): string {
  const { numerator, denominator } = clip.sourceInPoint
  return (
    `${timebase.numerator}/${timebase.denominator}|${clip.sourceId}|${clip.startFrame}+` +
    `${clip.durationFrames}|${numerator}/${denominator}`
  )
}

/**
 * The Source time of every Frame of `clip` from `first` to its end, in order — what a stream is
 * fed. Lazy, so a ten-minute Clip costs nothing until the decoder asks for the next timestamp.
 */
function* timestampsFrom(timebase: Timebase, clip: SceneClip, first: Frame): Generator<number> {
  for (let frame = first; covers(clip, frame); frame++) {
    yield sourceSecondsAt(timebase, clip, frame)
  }
}

/**
 * The walk rule (header): whether the Clip's open stream can be walked forward to `frame` for no
 * more decoding than a seek to it would cost.
 */
export async function canWalk(
  sink: ClipSink,
  timebase: Timebase,
  clip: SceneClip,
  frame: Frame
): Promise<boolean> {
  const stream = sink.stream()
  if (stream === null || stream.key !== streamKey(timebase, clip) || frame < stream.next) {
    return false
  }
  if (frame - stream.next <= STEP_LIMIT) return true
  // `stream.next` is covered: it is at least the Frame the stream was opened at, and at most
  // `frame`, which the caller only asks about because the Clip covers it.
  const [here, there] = await Promise.all([
    sink.keyframeAt(sourceSecondsAt(timebase, clip, stream.next)),
    sink.keyframeAt(sourceSecondsAt(timebase, clip, frame)),
  ])
  return here !== null && here === there
}

/** Opens the Clip's stream at `frame` unless the walk rule says the open one can get there. */
async function streamTo(
  sink: ClipSink,
  timebase: Timebase,
  clip: SceneClip,
  frame: Frame
): Promise<void> {
  if (await canWalk(sink, timebase, clip, frame)) return
  sink.openStream(streamKey(timebase, clip), frame, timestampsFrom(timebase, clip, frame))
}

/**
 * Makes sure every SceneClip that covers `frame` has a stream that reaches it — continuing the
 * one it has where the walk rule allows, opening one at `frame` otherwise — so the first pictures
 * are already decoding when the clock asks for them. Called when playback starts, or restarts
 * from a seek.
 */
export async function openStreams(sinks: SinkSet, scene: Scene, frame: Frame): Promise<void> {
  const visible = scene.clips.filter((clip) => covers(clip, frame))
  sinks.retainSinks(new Set(visible.map((clip) => clip.clipId)))
  await Promise.all(
    visible.map(async (clip) => {
      const sink = await sinks.sinkForClip(clip, scene.frameSize)
      if (sink !== null) await streamTo(sink, scene.timebase, clip, frame)
    })
  )
}

/**
 * Composites one Frame of a Scene from each visible Clip's stream, walking or reopening each as
 * the walk rule says.
 *
 * Every SceneClip that covers the Frame is asked; one that does not is not drawn, and its sink —
 * stream and all — is let go (T047). The Clips are fetched concurrently, each from its own sink
 * and decoder, and drawn in the Scene's order once all have answered; every loan is released in
 * a `finally`, which is also what starts each stream decoding its next picture.
 */
export async function renderByStreaming(
  sinks: SinkSet,
  renderer: SceneRenderer,
  scene: Scene,
  frame: Frame
): Promise<void> {
  const visible = scene.clips.filter((clip) => covers(clip, frame))
  sinks.retainSinks(new Set(visible.map((clip) => clip.clipId)))

  const loans: ClipSink[] = []
  try {
    const fetched = await settleAll(
      visible.map(async (clip): Promise<ClipPicture | null> => {
        const sink = await sinks.sinkForClip(clip, scene.frameSize)
        if (sink === null) return null
        await streamTo(sink, scene.timebase, clip, frame)
        const picture = await sink.pullStreamed(frame)
        if (picture === null) return null
        loans.push(sink)
        return { clipId: clip.clipId, canvas: picture.canvas, placement: picture.placement }
      })
    )
    renderer.renderScene(
      scene,
      fetched.filter((picture): picture is ClipPicture => picture !== null)
    )
  } finally {
    for (const sink of loans) sink.release()
  }
}
