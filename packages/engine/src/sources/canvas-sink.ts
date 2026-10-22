// The decoded pictures of each Source, as canvases the compositor can draw (R1).
//
// Two things are managed here, at two grains.
//
// **Per Source: the video track.** Attaching a Source (`sources/attach.ts`) is what opens the
// file and vets its tracks; this module never sees a `File` or a permission. It reads the track
// attach vetted through `getAttachedSource`, at the moment a sink is needed, rather than keeping a
// registry of its own — a second record of which Sources are reachable is a second answer to the
// question, and the two would disagree the first time a detach raced a Frame. A Source attach does
// not hold is a Source with no reachable picture, and every Clip of it renders empty, which is
// what data-model.md asks of an Offline Source.
//
// **Per Clip: the `CanvasSink`.** One sink per visible SceneClip, keyed by `clipId`, built over
// its Source's track. Not one sink per Source, although that is the grain the track is held at:
// two Clips of the same Source can be on screen in the same Frame, at different points of it, and
// during playback each of them needs its own decoder walking forward from its own position — a
// shared sink would hand both Clips the same pooled canvas, and the second pull would overwrite
// the picture of the first before either was drawn. Mediabunny allows any number of sinks over
// one track, each with its own decoder.
//
// **THE POOLING CAVEAT (R1) — read before touching `poolSize`.** `CanvasSink` recycles its
// canvases. With `poolSize: n` it owns `n` canvases and draws each new picture into the next one,
// round-robin, *at the moment the picture is handed over* — so the canvas a pull returned is
// overwritten by the `n`-th pull after it, with no notice. A canvas from a sink is therefore a
// loan, not a value: it must be drawn into the scene (uploaded to the GPU) **before the next pull
// from the same sink**, and never kept across Frames. This module turns that rule from a comment
// into a check: a sink refuses a second `pull` until the first one's picture has been released by
// the compositor (`ClipSink.release`), so a code path that would composite a recycled canvas
// throws instead of quietly showing a picture from the wrong Frame.
//
// With the rule enforced, one canvas per sink is enough, and one is what is used: the canvas then
// has a stable identity for the life of the sink, so the compositor can wrap it in one GPU texture
// and re-upload into it each Frame instead of allocating a texture per Frame. `poolSize: 0` would
// mean a fresh canvas per pull — no caveat, and a texture allocation for every Frame of playback.
//
// **Sized to the Project's frame size.** Each sink decodes straight to the size the picture will
// occupy in the Frame — the Source's display size fitted inside the Project's frame size — so a
// 4K Source in a 1080p Project is never held, copied or uploaded at 4K. The fit itself is the
// compositor's rule (`fitInside`, compose/scene-clip.ts), asked here rather than restated.

import { CanvasSink, InputDisposedError, type InputVideoTrack } from "mediabunny"

import type { PixelSize, SceneClip } from "@cutroom/model"

import { fitInside, type Placement } from "../compose/scene-clip"
import { getAttachedSource } from "./attach"

/** One decoded picture, on loan from its sink until `ClipSink.release` — see the caveat above. */
export interface SinkPicture {
  readonly canvas: OffscreenCanvas
  /** Where in the Frame the picture goes; the canvas is already exactly this size. */
  readonly placement: Placement
}

/** The sink behind one SceneClip. */
export interface ClipSink {
  readonly clipId: string
  readonly sourceId: string

  /**
   * The picture at `seconds` in the Source's own time, or `null` when there is none to show: the
   * time is before the Source's first picture, or the Source was detached while decoding.
   *
   * Throws if the previous pull's picture has not been released yet (the pooling caveat).
   */
  pull(seconds: number): Promise<SinkPicture | null>

  /** Ends the loan on the last picture pulled. Call once it has been drawn. Idempotent. */
  release(): void

  /**
   * Closes the streaming iterator this Clip is being played through, if there is one.
   *
   * Scrubbing calls this before anything else (R2): a scrub is random access, and an iterator
   * left open would keep decoding forward from a position the user has already left. No path in
   * this build opens one — the clock path that does is later work — so today this always finds
   * nothing to close, and it is here so that the rule has one place to live when it does.
   */
  abandonStream(): void
}

/**
 * A streaming iterator held for a Clip during playback. Typed loosely on purpose: whichever of
 * `canvases()` / `canvasesAtTimestamps()` the clock path settles on, closing it is `return()`.
 */
type Stream = AsyncGenerator<unknown, void, unknown>

interface Entry extends ClipSink {
  /** The track and frame size this sink was built for; either changing means a new sink. */
  readonly track: InputVideoTrack
  readonly frameSize: PixelSize
  stream: Stream | null
}

/** The sink of every SceneClip that was visible in the last Frame rendered, by `clipId`. */
const sinks = new Map<string, Entry>()

// ---------------------------------------------------------------------------------------------
// The compositor's side
// ---------------------------------------------------------------------------------------------

/**
 * The video track attach holds for a Source, or `null` when none is attached.
 *
 * Read afresh on every call. Re-attaching a Source (a Relink to a re-encoded file) gives it a new
 * `Input` and a new track, and a sink cannot be repointed, so a sink is valid exactly as long as
 * the track it was built on is still the one attach holds — `sinkForClip` compares by identity.
 */
function trackOf(sourceId: string): InputVideoTrack | null {
  return getAttachedSource(sourceId)?.video ?? null
}

/**
 * The sink for a SceneClip, built on first use, or `null` when the Clip's Source has no reachable
 * picture.
 *
 * A sink is reused for as long as its Clip stays visible over the same track at the same frame
 * size. Anything else gets a fresh one: the canvas a sink decodes into is fixed at construction,
 * so a frame size change cannot be applied to an existing sink.
 */
export async function sinkForClip(clip: SceneClip, frameSize: PixelSize): Promise<ClipSink | null> {
  const track = trackOf(clip.sourceId)
  if (track === null) {
    // Detached since the last Frame: the old sink is over a disposed `Input` and can only fail.
    sinks.get(clip.clipId)?.abandonStream()
    sinks.delete(clip.clipId)
    return null
  }

  const held = sinks.get(clip.clipId)
  if (
    held !== undefined &&
    held.track === track &&
    held.frameSize.width === frameSize.width &&
    held.frameSize.height === frameSize.height
  ) {
    return held
  }
  held?.abandonStream()

  const display: PixelSize = {
    width: await track.getDisplayWidth(),
    height: await track.getDisplayHeight(),
  }
  const placement = fitInside(display, frameSize)

  // The awaits above are a window in which the Source can be detached or replaced. A sink built
  // over a track that is no longer the Source's would decode a file the user has moved on from.
  if (trackOf(clip.sourceId) !== track) return null

  const sink = new CanvasSink(track, {
    width: placement.width,
    height: placement.height,
    // `placement` already has the Source's aspect, to the nearest pixel, so `fill` stretches by
    // at most half a pixel and never letterboxes. `contain` here would paint opaque bars into the
    // canvas, and those bars would cover whatever is on the Tracks beneath this one.
    fit: "fill",
    poolSize: 1,
  })

  let onLoan = false
  const entry: Entry = {
    clipId: clip.clipId,
    sourceId: clip.sourceId,
    track,
    frameSize: { width: frameSize.width, height: frameSize.height },
    stream: null,

    async pull(seconds: number): Promise<SinkPicture | null> {
      if (onLoan) {
        throw new Error(
          `CanvasSink for Clip ${clip.clipId}: pulled again before the last picture was drawn; ` +
            "the sink recycles its canvas, so that picture would be overwritten (R1)"
        )
      }
      let wrapped
      try {
        wrapped = await sink.getCanvas(seconds)
      } catch (error) {
        // The Source was detached mid-decode — `releaseSource` disposes the `Input`, which cancels
        // every sink operation on it. An Offline Source renders empty; it is not a fault.
        if (error instanceof InputDisposedError) return null
        throw error
      }
      if (wrapped === null) return null
      onLoan = true
      // `document` does not exist in a worker, so Mediabunny always creates an OffscreenCanvas
      // here; the check is what lets the type say so.
      if (!(wrapped.canvas instanceof OffscreenCanvas)) {
        throw new Error("CanvasSink returned an HTMLCanvasElement inside the engine worker")
      }
      return { canvas: wrapped.canvas, placement }
    },

    release(): void {
      onLoan = false
    },

    abandonStream(): void {
      const stream = entry.stream
      entry.stream = null
      // `return()` on a generator suspended inside Mediabunny's decode loop settles once the loop
      // unwinds; nothing waits for it, but a rejection there must not become an unhandled one.
      if (stream !== null) void stream.return(undefined).catch(() => undefined)
    },
  }

  sinks.set(clip.clipId, entry)
  return entry
}

/**
 * Lets go of every sink whose Clip is not in `visible`.
 *
 * Sinks are kept for visible Clips only, not for every Clip in the Scene: each one owns a decoder
 * and a canvas at the Project's frame size, and a Timeline of a hundred Clips should not hold a
 * hundred of each to show one. Scrubbing back onto a Clip rebuilds its sink, which is cheap —
 * construction is lazy, and the decoder it would have kept has to seek anyway.
 */
export function retainSinks(visible: ReadonlySet<string>): void {
  for (const [clipId, entry] of sinks) {
    if (!visible.has(clipId)) {
      entry.abandonStream()
      sinks.delete(clipId)
    }
  }
}
