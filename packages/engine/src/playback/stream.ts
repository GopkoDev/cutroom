// The clock render path: one Frame of playback, from a live iterator per Clip (R2).
//
// Playback asks for Frames in order, so it is answered by walking forward rather than seeking.
// Each visible SceneClip keeps a `canvasesAtTimestamps` iterator open on its sink
// (sources/canvas-sink.ts), fed the Source time of every Frame of the Clip from where playback
// entered it, in order, so the decoder runs straight through the Source and decodes each packet
// once. A request for Frame `n` takes the stream's pictures up to `n`, draws `n`, and leaves the
// rest undrawn — a Frame the clock has already passed is decoded, because a decoder cannot skip
// it, and dropped (FR-012). Where the Frame maps into the Source is the model's arithmetic, through
// playback/mapping.ts, exactly as for a scrub (R7): the two paths ask the same question of the
// same function and differ only in whether the answer is fetched by seeking or by walking.
//
// **When a stream is opened afresh rather than continued.** A stream only goes forward, and it is
// valid only for the placement of the Clip it was mapped from. So a new one is opened when:
//
//   - the Clip has none — playback just started, or the Clip just came on screen;
//   - the Frame is behind the stream — the clock went back, which is a seek;
//   - the Clip moved, was trimmed, or the Scene's Timebase changed — the Source times it was fed
//     are someone else's now (`streamKey`);
//   - the Frame is more than `STEP_LIMIT` Frames ahead of the stream. Walking there would decode
//     every Frame in between to show none of them; a seek decodes from the nearest keyframe. Up to
//     the limit, walking wins, because the stream has already decoded a few Frames ahead and a
//     seek throws them away and starts a new decoder.
//
// Opening and closing on the transport (`transport: playing` / `stopped`) is the scheduler's
// (playback/scheduler.ts), which owns the order those happen in relative to Renders.

import type { Frame, Scene, SceneClip, Timebase } from "@cutroom/model"

import type { ClipPicture } from "../compose/scene-clip"
import type { SceneRenderer } from "../compose/renderer"
import type { ClipSink, SinkSet } from "../sources/canvas-sink"
import { covers, sourceSecondsAt } from "./mapping"

/**
 * How far ahead of its stream a Frame may be and still be walked to rather than sought. A count
 * of Frames, not a duration: it bounds decoder work per Frame drawn, which is counted in Frames.
 *
 * Thirty is about one second at the rates this slice plays and well under the two-second GOPs of
 * ordinary footage, so a lagging clock is walked through, and only a jump the decoder could not
 * cover in a Frame or two reopens the stream at the nearest keyframe.
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

/** Whether the Clip's open stream can be walked forward to `frame`. */
function canContinue(sink: ClipSink, key: string, frame: Frame): boolean {
  const stream = sink.stream()
  return (
    stream !== null &&
    stream.key === key &&
    frame >= stream.next &&
    frame - stream.next <= STEP_LIMIT
  )
}

/**
 * Opens a stream for every SceneClip that covers `frame`, positioned at `frame`, so their first
 * pictures are already decoding when the clock asks for them. Called when playback starts.
 */
export async function openStreams(sinks: SinkSet, scene: Scene, frame: Frame): Promise<void> {
  const visible = scene.clips.filter((clip) => covers(clip, frame))
  sinks.retainSinks(new Set(visible.map((clip) => clip.clipId)))
  await Promise.all(
    visible.map(async (clip) => {
      const sink = await sinks.sinkForClip(clip, scene.frameSize)
      if (sink === null) return
      const key = streamKey(scene.timebase, clip)
      const stream = sink.stream()
      if (stream === null || stream.key !== key || stream.next !== frame) {
        sink.openStream(key, frame, timestampsFrom(scene.timebase, clip, frame))
      }
    })
  )
}

/**
 * Composites one Frame of a Scene from each visible Clip's stream, opening or reopening streams
 * as the rules above say.
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
    const fetched = await Promise.all(
      visible.map(async (clip): Promise<ClipPicture | null> => {
        const sink = await sinks.sinkForClip(clip, scene.frameSize)
        if (sink === null) return null
        const key = streamKey(scene.timebase, clip)
        if (!canContinue(sink, key, frame)) {
          sink.openStream(key, frame, timestampsFrom(scene.timebase, clip, frame))
        }
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
