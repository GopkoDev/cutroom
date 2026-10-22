// The scrub render path: one Frame, by random access (R2).
//
// Scrubbing and stepping ask for Frames in no particular order, so every request is answered by
// seeking: whatever streaming iterator a Clip was being played through is closed first, and each
// visible SceneClip's picture is fetched with `CanvasSink.getCanvas(t)` at the Source time its
// Frame maps to (playback/mapping.ts — the model does the arithmetic, R7). The pictures go to the
// compositor in the Scene's back-to-front order, and the canvas is announced as showing that Frame.
//
// **Newest request wins (FR-012).** A Render now spans `await`s — decoding — so requests arrive
// while one is in flight, and a pointer dragging across the Timeline makes them arrive far faster
// than a seek can answer. They are not queued. At most one request waits behind the Render in
// flight; a newer one displaces it, and each one displaced is reported as `frames-dropped`. When
// the Render in flight finishes, the waiting request — the newest the user has asked for — is the
// one rendered next. A queue would instead make the Preview replay the whole drag after the
// pointer had stopped, which is the lag FR-012 exists to rule out.
//
// Serialising Renders is also what keeps the pooling caveat (canvas-sink.ts) satisfied: with one
// Render at a time, every sink's picture is drawn and released before that sink is pulled again.

import type { Frame, Scene } from "@cutroom/model"

import type { ClipPicture } from "../compose/scene-clip"
import type { SceneRenderer } from "../compose/renderer"
import { retainSinks, sinkForClip, type ClipSink } from "../sources/canvas-sink"
import { covers, sourceSecondsAt } from "./mapping"

/** One `render-frame`, with the Scene it is to be rendered from. */
export interface FrameRequest {
  readonly scene: Scene
  readonly revision: number
  readonly frame: Frame
}

/** What a Render reports, in the protocol's own terms. */
export interface RenderReport {
  rendered(frame: Frame, revision: number): void
  dropped(count: number): void
}

export interface Scrub {
  /**
   * Asks for a Frame. Resolves when this request has been rendered, displaced by a newer one, or
   * handed to a Render already in flight to pick up; never blocks on Frames that come after it.
   * Rejects only if a Render it is responsible for throws.
   */
  request(request: FrameRequest): Promise<void>
}

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

/** The latch that serialises Renders and lets the newest request displace the waiting one. */
export function createScrub(renderer: SceneRenderer, report: RenderReport): Scrub {
  let inFlight = false
  let waiting: FrameRequest | null = null

  return {
    async request(request: FrameRequest): Promise<void> {
      if (inFlight) {
        if (waiting !== null) report.dropped(1)
        waiting = request
        return
      }

      inFlight = true
      let next: FrameRequest | null = request
      try {
        while (next !== null) {
          const current: FrameRequest = next
          await renderByRandomAccess(renderer, current.scene, current.frame)
          report.rendered(current.frame, current.revision)
          next = waiting
          waiting = null
        }
      } finally {
        inFlight = false
        // A Render threw: whatever was waiting behind it is not rendered, and says so, rather than
        // sitting in the latch until some later request happens to flush it.
        if (waiting !== null) {
          waiting = null
          report.dropped(1)
        }
      }
    },
  }
}
