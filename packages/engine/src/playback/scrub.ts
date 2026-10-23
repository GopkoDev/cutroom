// The scrub render path: one Frame, by random access (R2).
//
// Scrubbing and stepping ask for Frames in no particular order, so every request is answered by
// seeking: whatever streaming iterator a Clip was being played through is closed first, and each
// visible SceneClip's picture is fetched with `CanvasSink.getCanvas(t)` at the Source time its
// Frame maps to (playback/mapping.ts — the model does the arithmetic, R7). The pictures go to the
// compositor in the Scene's back-to-front order, and the canvas is announced as showing that Frame.
//
// Which request is rendered next, and when, is not this module's business: every Render — this
// one and the clock path's (playback/stream.ts) — runs under the one scheduler
// (playback/scheduler.ts), which lets the newest request displace a waiting one (FR-012) and
// serialises Renders. That serialisation is also what keeps the pooling caveat (canvas-sink.ts)
// satisfied: with one Render at a time, every sink's picture is drawn and released before that
// sink is pulled again.

import type { Frame, Scene } from "@cutroom/model"

import type { ClipPicture } from "../compose/scene-clip"
import type { SceneRenderer } from "../compose/renderer"
import { retainSinks, sinkForClip, type ClipSink } from "../sources/canvas-sink"
import { covers, sourceSecondsAt } from "./mapping"

/**
 * Composites one Frame of a Scene by random access.
 *
 * Every SceneClip that covers the Frame is fetched; one that does not cover it is not asked for
 * anything and is not drawn (T047). A covering Clip whose Source has no reachable picture, or no
 * picture at that time, is not drawn either. All of them are fetched concurrently — each has its
 * own sink and decoder — and drawn in the Scene's order once all have answered.
 */
export async function renderByRandomAccess(
  renderer: SceneRenderer,
  scene: Scene,
  frame: Frame
): Promise<void> {
  const visible = scene.clips.filter((clip) => covers(clip, frame))
  retainSinks(new Set(visible.map((clip) => clip.clipId)))

  const loans: ClipSink[] = []
  try {
    const fetched = await Promise.all(
      visible.map(async (clip): Promise<ClipPicture | null> => {
        const sink = await sinkForClip(clip, scene.frameSize)
        if (sink === null) return null
        // R2: a seek and a live iterator on one decoder do not mix, and the iterator's position is
        // one the user has left.
        sink.abandonStream()
        const picture = await sink.pull(sourceSecondsAt(scene.timebase, clip, frame))
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
    // Uploaded (or abandoned, if something threw): either way the sinks may be pulled again.
    for (const sink of loans) sink.release()
  }
}
