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
// **Per Clip: the sink.** One sink per visible SceneClip, keyed by `clipId`, built over its
// Source's track: a Mediabunny `VideoSampleSink` (its decoder) and one canvas the pictures are
// drawn into. Not one sink per Source, although that is the grain the track is held at: two Clips
// of the same Source can be on screen in the same Frame, at different points of it, and each of
// them needs its own decoder walking forward from its own position — a shared sink would hand
// both Clips the same canvas, and the second pull would overwrite the picture of the first before
// either was drawn. Mediabunny allows any number of sinks over one track, each with its own
// decoder. The map is per consumer, not global (`SinkSet`): the Preview and a running Export draw
// the same Clips at the same time from sinks of their own.
//
// **THE POOLING CAVEAT (R1).** Each sink owns exactly one canvas and draws every picture it hands
// over into it — so the canvas a pull returned is overwritten by the next pull, with no notice. A
// canvas from a sink is therefore a loan, not a value: it must be drawn into the scene (uploaded
// to the GPU) **before the next pull from the same sink**, and never kept across Frames. This
// module turns that rule from a comment into a check: a sink refuses a second pull until the first
// one's picture has been released by the compositor (`ClipSink.release`), so a code path that
// would composite a recycled canvas throws instead of quietly showing a picture from the wrong
// Frame. One canvas has a stable identity for the life of the sink, so the compositor can wrap it
// in one GPU texture and re-upload into it each Frame instead of allocating a texture per Frame.
//
// **Why samples, not Mediabunny's `CanvasSink` (ADR 0017).** `CanvasSink` is this same thing —
// a `VideoSampleSink` drawing into a pooled canvas — with two properties a walking decoder cannot
// afford. It draws *every* picture it yields, so walking forward through Frames nobody will see
// paid for a full-size draw of each; here a Frame walked past is closed undrawn. And its iterator
// is an async generator, whose `return()` waits behind a `next()` in progress, so a stream
// abandoned while decoding ahead into the next GOP kept its decoder busy, beside the new one,
// until that picture came out; Mediabunny's own sample iterator stops at once. The drawing is what
// `CanvasSink` does: `drawWithFit` with `fit: "fill"`, high-quality smoothing, the track's
// rotation, onto an opaque canvas cleared first.
//
// **VideoFrames.** A `VideoSample` holds a decoder `VideoFrame` until it is closed. Every one this
// module receives is closed on every path: drawn and closed, walked past and closed, or — the one
// decoded ahead of a stream that is then abandoned — closed when it arrives. Samples still inside
// Mediabunny's queue are closed by its iterator's `return()`.
//
// **Sized to the Project's frame size.** Each sink decodes straight to the size the picture will
// occupy in the Frame — the Source's display size fitted inside the Project's frame size — so a
// 4K Source in a 1080p Project is never held, copied or uploaded at 4K. The fit itself is the
// compositor's rule (`fitInside`, compose/scene-clip.ts), asked here rather than restated.

import {
  EncodedPacketSink,
  InputDisposedError,
  VideoSampleSink,
  type InputVideoTrack,
  type VideoSample,
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
   * Where the GOP holding `seconds` (Source time) begins: the timestamp of the last keyframe at or
   * before it, read from the container's index without decoding anything — or `null` when there is
   * none (before the first keyframe, or the Source was detached). Two times with the same answer are
   * in the same GOP, which is what playback/stream.ts asks before walking a long way forward.
   *
   * Taken from the container's keyframe flags, unverified. A file that flags a keyframe wrongly can
   * only make the walk rule choose the slower of walking and seeking, never the wrong picture: a
   * walk shows exactly the Frames a seek would.
   */
  keyframeAt(seconds: number): Promise<number | null>

  /**
   * Ends the loan on the last picture pulled. Call once it has been drawn. Idempotent.
   *
   * With a stream open, this is also the moment the stream starts decoding its next picture: not
   * before, because that picture is drawn into the very canvas just released.
   */
  release(): void

  /**
   * Opens a streaming iterator over this Clip (R2, ADR 0017), closing any already open: a
   * `canvasesAtTimestamps` walk that yields one picture per Frame, in order, starting at `first`.
   * `timestamps` are those Frames' Source times, one per Frame, as playback/stream.ts maps them;
   * `key` names what they were mapped from, so a stream opened for one placement of the Clip is
   * never continued for another.
   *
   * The first picture starts decoding at once unless a picture is on loan, in which case it starts
   * when that loan ends — the draw-before-next-pull rule.
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
   * opening a new one. Throws if the previous picture has not been released yet (the pooling
   * caveat).
   */
  pullStreamed(frame: Frame): Promise<SinkPicture | null>

  /**
   * Closes the streaming iterator this Clip is being shown through, if there is one, and the
   * decoder behind it.
   *
   * Called whenever the stream's position is one nobody will walk on from: before a stream is
   * opened somewhere else (a backward step, a far jump), when the transport stops or restarts
   * somewhere the stream cannot reach, when a stopped Preview has been left alone for a while
   * (`abandonStreams`, playback/scheduler.ts), when the Clip leaves the screen (`retainSinks`),
   * and when its Source is detached (`forgetSource`).
   */
  abandonStream(): void
}

/** What a stream yields: one sample per Frame, or `null` where the Source has no picture. */
type Yield = IteratorResult<VideoSample | null, void>

/** The streaming iterator held for a Clip, and where it has got to. */
interface Stream {
  readonly iterator: AsyncGenerator<VideoSample | null, void, unknown>
  readonly key: string
  /** The Frame the iterator yields next. */
  next: Frame
  /**
   * The iterator's next result, already asked for: decoding ahead of the request is what makes a
   * stream cheaper than a seek. Only ever asked for while no picture is on loan.
   */
  head: Promise<Yield> | null
}

interface Entry extends ClipSink {
  /** The track and frame size this sink was built for; either changing means a new sink. */
  readonly track: InputVideoTrack
  readonly frameSize: PixelSize
  current: Stream | null
}

/**
 * The sink of every SceneClip that was visible in the last Frame rendered, by `clipId` — one map
 * per consumer of pictures (`SinkSet`).
 */
type Sinks = Map<string, Entry>

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

/** `SinkSet.sinkForClip`, over one set's map. */
async function sinkForClipIn(
  sinks: Sinks,
  clip: SceneClip,
  frameSize: PixelSize
): Promise<ClipSink | null> {
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

  // Two callers may have built a sink for this Clip across the same awaits (a preparation and the
  // job after it). The first to land is kept; one in its place that no longer fits is closed, not
  // silently overwritten with its decoder still open (review R-13).
  const raced = sinks.get(clip.clipId)
  if (raced !== undefined && raced !== held) {
    if (
      raced.track === track &&
      raced.frameSize.width === frameSize.width &&
      raced.frameSize.height === frameSize.height
    ) {
      return raced
    }
    raced.abandonStream()
  }

  const samples = new VideoSampleSink(track)
  const canvas = new OffscreenCanvas(placement.width, placement.height)
  const drawing = canvas.getContext("2d", { alpha: false })
  if (drawing === null) throw new Error("OffscreenCanvas gave no 2d context to draw pictures into")
  const context: OffscreenCanvasRenderingContext2D = drawing
  context.imageSmoothingQuality = "high"

  // Reads the container's index only; no decoder of its own.
  const packets = new EncodedPacketSink(track)

  // On loan from the moment a pull starts, not from the moment it answers: a pull in progress is
  // about to draw into the pooled canvas, and a stream decoding ahead must not draw there first.
  let onLoan = false

  function refuseSecondPull(): void {
    if (onLoan) {
      throw new Error(
        `Picture sink for Clip ${clip.clipId}: pulled again before the last picture was drawn; ` +
          "the sink recycles its canvas, so that picture would be overwritten (R1)"
      )
    }
  }

  /**
   * A decoded sample drawn into the canvas and closed, and the canvas lent — or `null`, which
   * ends the loan at once.
   */
  function lend(sample: VideoSample | null): SinkPicture | null {
    if (sample === null) {
      onLoan = false
      return null
    }
    try {
      context.clearRect(0, 0, canvas.width, canvas.height)
      // `placement` already has the Source's aspect, to the nearest pixel, so `fill` stretches by
      // at most half a pixel and never letterboxes. `contain` here would paint opaque bars into
      // the canvas, and those bars would cover whatever is on the Tracks beneath this one.
      sample.drawWithFit(context, { fit: "fill" })
    } finally {
      sample.close()
    }
    return { canvas, placement }
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

    async keyframeAt(seconds: number): Promise<number | null> {
      try {
        const key = await packets.getKeyPacket(seconds, { metadataOnly: true })
        return key === null ? null : key.timestamp
      } catch (error) {
        // Detached meanwhile: no GOP to be in, so nothing is walked to.
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
        iterator: samples.samplesAtTimestamps(timestamps),
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
        throw new Error(`Picture sink for Clip ${clip.clipId}: pullStreamed with no stream open`)
      }
      if (frame < stream.next) {
        throw new RangeError(
          `Picture sink for Clip ${clip.clipId}: Frame ${frame} is behind the stream, which is at ` +
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
          // A Frame walked past: decoded, because the decoder cannot skip it, and closed undrawn.
          if (at < frame) {
            result.value?.close()
            continue
          }
          return lend(result.value)
        }
      } catch (error) {
        onLoan = false
        if (entry.current === stream) entry.current = null
        // The Source was detached mid-decode — `releaseSource` disposes the `Input`, which cancels
        // every sink operation on it. An Offline Source renders empty; it is not a fault.
        if (error instanceof InputDisposedError) return null
        throw error
      }
    },

    abandonStream(): void {
      const stream = entry.current
      entry.current = null
      if (stream === null) return
      // Mediabunny's iterator stops its decode loop and closes the samples it queued at once;
      // nothing waits for that, but a rejection there must not become an unhandled one.
      void stream.iterator.return(undefined).catch(() => undefined)
      // The picture decoded ahead, if one was asked for, is nobody's now.
      void stream.head?.then((result) => result.value?.close()).catch(() => undefined)
    },
  }

  sinks.set(clip.clipId, entry)
  return entry
}

/**
 * One consumer's sinks: the Clips it has drawn, each with its own decoder and pooled canvas.
 *
 * **Why there is more than one.** The Preview and a running Export both draw Clips, often the same
 * Clips at the same moment — an export runs while the user keeps editing and scrubbing (FR-019) —
 * and a sink is not shareable between them. Its one pooled canvas is on loan to whoever pulled
 * last, and its stream walks forward from one position: the Preview seeking a sink the Export is
 * streaming through would move the Export's decoder to wherever the user's pointer is, and the
 * draw-before-next-pull check would throw on whichever side came second. So each consumer gets its
 * own set, keyed by `clipId` within it, and the two never meet. Both are built over the one track
 * attach holds, which is Mediabunny's model anyway: any number of sinks over one track.
 */
export interface SinkSet {
  /**
   * The sink for a SceneClip, built on first use, or `null` when the Clip's Source has no
   * reachable picture.
   *
   * A sink is reused for as long as its Clip stays visible over the same track at the same frame
   * size. Anything else gets a fresh one: the canvas a sink decodes into is fixed at construction,
   * so a frame size change cannot be applied to an existing sink.
   */
  sinkForClip(clip: SceneClip, frameSize: PixelSize): Promise<ClipSink | null>

  /**
   * Closes every Clip's streaming iterator, keeping the sinks: playback has stopped, or a stopped
   * Preview has been left alone long enough that its parked decoders are not worth their memory.
   */
  abandonStreams(): void

  /**
   * Lets go of the sinks of every Clip of a Source that has just been detached, closing their
   * streams at once rather than at the next Frame.
   *
   * A stream left by a scrub sits parked ahead of the Frame on screen (ADR 0017), and a parked
   * decoder over a disposed `Input` does not notice the disposal until it is asked for something —
   * it would keep its decoded Frames until the next Render or the park timeout. Safe beside a Render in
   * flight: that Render's pull ends with the disposal (an Offline Source renders empty), and the
   * sink it holds is simply not handed out again.
   */
  forgetSource(sourceId: string): void

  /**
   * Lets go of every sink whose Clip is not in `visible`.
   *
   * Sinks are kept for visible Clips only, not for every Clip in the Scene: each one owns a decoder
   * and a canvas at the Project's frame size, and a Timeline of a hundred Clips should not hold a
   * hundred of each to show one. Scrubbing back onto a Clip rebuilds its sink, which is cheap —
   * construction is lazy, and the decoder it would have kept has to seek anyway. An empty set lets
   * go of everything, which is how an Export cleans up after itself.
   */
  retainSinks(visible: ReadonlySet<string>): void
}

/** A fresh, empty set of sinks for one consumer of pictures. */
export function createSinkSet(): SinkSet {
  const sinks: Sinks = new Map()
  return {
    sinkForClip: (clip, frameSize) => sinkForClipIn(sinks, clip, frameSize),

    abandonStreams(): void {
      for (const entry of sinks.values()) entry.abandonStream()
    },

    forgetSource(sourceId: string): void {
      for (const [clipId, entry] of sinks) {
        if (entry.sourceId === sourceId) {
          entry.abandonStream()
          sinks.delete(clipId)
        }
      }
    },

    retainSinks(visible: ReadonlySet<string>): void {
      for (const [clipId, entry] of sinks) {
        if (!visible.has(clipId)) {
          entry.abandonStream()
          sinks.delete(clipId)
        }
      }
    },
  }
}

/**
 * Every fetch of one Frame's pictures, awaited to the last one — then the first failure, if any.
 *
 * What a Render uses instead of `Promise.all`, because of the loans. Each fetch records its sink as
 * on loan when its pull answers, and the Render releases every recorded loan in a `finally`. With
 * `Promise.all`, one Clip's fetch failing would run that `finally` while the other Clips' pulls
 * were still decoding; their loans would be recorded after the release had already happened, and
 * those sinks would stay on loan for good — every later pull from them refused (T090).
 */
export async function settleAll<T>(fetches: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(fetches)
  const failed = settled.find((outcome) => outcome.status === "rejected")
  if (failed !== undefined) throw failed.reason
  return settled.map((outcome) => (outcome as PromiseFulfilledResult<T>).value)
}

/** The Preview's sinks: what scrubbing and playback draw from (playback/scheduler.ts). */
export const previewSinks: SinkSet = createSinkSet()
