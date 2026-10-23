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

import {
  CanvasSink,
  InputDisposedError,
  type InputVideoTrack,
  type WrappedCanvas,
} from "mediabunny"

import type { Frame, PixelSize, SceneClip } from "@cutroom/model"

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

  /**
   * Ends the loan on the last picture pulled. Call once it has been drawn. Idempotent.
   *
   * With a stream open, this is also the moment the stream starts decoding its next picture: not
   * before, because that picture is drawn into the very canvas just released.
   */
  release(): void

  /**
   * Opens a streaming iterator over this Clip (R2), closing any already open: a
   * `canvasesAtTimestamps` walk that yields one picture per Frame, in order, starting at `first`.
   * `timestamps` are those Frames' Source times, one per Frame, as playback/stream.ts maps them;
   * `key` names what they were mapped from, so a stream opened for one placement of the Clip is
   * never continued for another.
   *
   * The first picture starts decoding at once unless a picture is on loan, in which case it starts
   * when that loan ends — the same draw-before-next-pull rule as every other pull.
   */
  openStream(key: string, first: Frame, timestamps: Iterable<number>): void

  /** Where the open stream is — what it was opened for and the Frame it yields next — or `null`. */
  stream(): { readonly key: string; readonly next: Frame } | null

  /**
   * The picture at `frame` from the open stream, decoding forward through any Frames before it
   * and drawing none of them, or `null` when there is none to show (no picture at that time, the
   * stream ran out, or the Source was detached mid-decode — the stream is then closed).
   *
   * `frame` must be at or after `stream().next`: a stream only goes forward, and going back is
   * opening a new one. Subject to the pooling caveat like `pull`.
   */
  pullStreamed(frame: Frame): Promise<SinkPicture | null>

  /**
   * Closes the streaming iterator this Clip is being played through, if there is one.
   *
   * Scrubbing calls this before anything else (R2): a scrub is random access, and an iterator
   * left open would keep decoding forward from a position the user has already left. Stopping
   * playback calls it too (`abandonStreams`), so a stopped Preview holds no decoder running ahead.
   */
  abandonStream(): void
}

/** The streaming iterator held for a Clip during playback, and where it has got to. */
interface Stream {
  readonly iterator: AsyncGenerator<WrappedCanvas | null, void, unknown>
  readonly key: string
  /** The Frame the iterator yields next. */
  next: Frame
  /**
   * The iterator's next result, already asked for: decoding ahead of the request is what makes a
   * stream cheaper than a seek. Only ever asked for while no picture is on loan.
   */
  head: Promise<IteratorResult<WrappedCanvas | null, void>> | null
}

interface Entry extends ClipSink {
  /** The track and frame size this sink was built for; either changing means a new sink. */
  readonly track: InputVideoTrack
  readonly frameSize: PixelSize
  current: Stream | null
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

  // On loan from the moment a pull starts, not from the moment it answers: a pull in progress is
  // about to draw into the pooled canvas, and a stream decoding ahead must not draw there first.
  let onLoan = false

  function refuseSecondPull(): void {
    if (onLoan) {
      throw new Error(
        `CanvasSink for Clip ${clip.clipId}: pulled again before the last picture was drawn; ` +
          "the sink recycles its canvas, so that picture would be overwritten (R1)"
      )
    }
  }

  /** The picture a sink handed over, as a loan — or `null`, which ends the loan at once. */
  function lend(wrapped: WrappedCanvas | null): SinkPicture | null {
    if (wrapped === null) {
      onLoan = false
      return null
    }
    // `document` does not exist in a worker, so Mediabunny always creates an OffscreenCanvas
    // here; the check is what lets the type say so.
    if (!(wrapped.canvas instanceof OffscreenCanvas)) {
      throw new Error("CanvasSink returned an HTMLCanvasElement inside the engine worker")
    }
    return { canvas: wrapped.canvas, placement }
  }

  /** Starts decoding the open stream's next picture, if nothing is on loan and none is started. */
  function decodeAhead(): void {
    const stream = entry.current
    if (onLoan || stream === null || stream.head !== null) return
    const head = stream.iterator.next()
    // Awaited later, by `pullStreamed`, which handles its rejection; until then it must not count
    // as an unhandled one, or a Source detached between Frames would reach `fatal`.
    head.catch(() => undefined)
    stream.head = head
  }

  const entry: Entry = {
    clipId: clip.clipId,
    sourceId: clip.sourceId,
    track,
    frameSize: { width: frameSize.width, height: frameSize.height },
    current: null,

    async pull(seconds: number): Promise<SinkPicture | null> {
      refuseSecondPull()
      onLoan = true
      try {
        return lend(await sink.getCanvas(seconds))
      } catch (error) {
        onLoan = false
        // The Source was detached mid-decode — `releaseSource` disposes the `Input`, which cancels
        // every sink operation on it. An Offline Source renders empty; it is not a fault.
        if (error instanceof InputDisposedError) return null
        throw error
      }
    },

    release(): void {
      onLoan = false
      decodeAhead()
    },

    openStream(key: string, first: Frame, timestamps: Iterable<number>): void {
      entry.abandonStream()
      entry.current = {
        iterator: sink.canvasesAtTimestamps(timestamps),
        key,
        next: first,
        head: null,
      }
      decodeAhead()
    },

    stream() {
      const stream = entry.current
      return stream === null ? null : { key: stream.key, next: stream.next }
    },

    async pullStreamed(frame: Frame): Promise<SinkPicture | null> {
      refuseSecondPull()
      const stream = entry.current
      if (stream === null) {
        throw new Error(`CanvasSink for Clip ${clip.clipId}: pullStreamed with no stream open`)
      }
      if (frame < stream.next) {
        throw new RangeError(
          `CanvasSink for Clip ${clip.clipId}: Frame ${frame} is behind the stream, which is at ` +
            `Frame ${stream.next}; a stream only goes forward`
        )
      }

      onLoan = true
      try {
        for (;;) {
          const pending = stream.head ?? stream.iterator.next()
          stream.head = null
          const result = await pending
          if (result.done === true) {
            if (entry.current === stream) entry.current = null
            return lend(null)
          }
          const at = stream.next
          stream.next = at + 1
          // A Frame playback has already passed: decoded, because the decoder cannot skip it, and
          // never drawn. Its canvas is the pooled one and is about to be overwritten — which is
          // the point, since nobody is going to look at it.
          if (at < frame) continue
          return lend(result.value)
        }
      } catch (error) {
        onLoan = false
        if (entry.current === stream) entry.current = null
        if (error instanceof InputDisposedError) return null
        throw error
      }
    },

    abandonStream(): void {
      const stream = entry.current
      entry.current = null
      // `return()` on a generator suspended inside Mediabunny's decode loop settles once the loop
      // unwinds; nothing waits for it, but a rejection there must not become an unhandled one.
      if (stream !== null) void stream.iterator.return(undefined).catch(() => undefined)
    },
  }

  sinks.set(clip.clipId, entry)
  return entry
}

/** Closes every Clip's streaming iterator, keeping the sinks: playback has stopped, or restarted. */
export function abandonStreams(): void {
  for (const entry of sinks.values()) entry.abandonStream()
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
