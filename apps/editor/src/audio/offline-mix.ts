// The export's sound: mixed here, on the main thread, encoded in the worker (T077, ADR 0008, R4).
//
// `AudioContext` and `OfflineAudioContext` exist only in a Window, so the mix that playback hears is
// built here for export too — the same `createAudioGraph` (graph.ts), on an `OfflineAudioContext`
// instead of the live one, fed the same Timeline-positioned PCM (`PcmChunk`, ADR 0012). There is
// one graph construction, so what is exported cannot drift from what was heard (Principle III):
// a Clip volume, a fade or a pan added to the graph lands in both.
//
// ## The seam
//
//     await streamExportAudio({ scene, range, sampleRate, pcm, send, acks, signal })
//
//   * `scene` — the frozen Scene the export started with (FR-019); `range` — its Frames,
//     `[fromFrame, toFrame)`; `sampleRate` — the export's (`export-start.audio.sampleRate`).
//   * `pcm` — where the Clips' decoded sound comes from: `pull(toFrame, signal)` hands over every
//     chunk of every Clip lying before `toFrame` not handed over by an earlier pull. The engine owns
//     the Sources, so this is a request to the worker (`requestedExportPcm` adapts the protocol
//     messages to it); tests pass a fake.
//   * `send(channels, startSample, final)` — posts one `export-audio-chunk`, transferring the
//     channels. Shaped like `EngineClient.sendExportAudioChunk`, so that method is the argument.
//   * `acks(listener)` — subscribes to `export-audio-ack`'s `startSample` and returns the
//     unsubscribe, so `(l) => engine.on("export-audio-ack", (e) => l(e.startSample))`.
//   * `signal` — aborting it rejects the promise with `signal.reason` at the next await, whatever it
//     is waiting on: a pull, a render or an ack. Nothing is sent after the abort.
//
// The promise resolves once the `final` chunk has been acknowledged — every sample is then in the
// encoder — and rejects on abort or on a fault in the mix.
//
// ## What is sent
//
// Exactly the Timeline's samples at `sampleRate`, stereo: from `frameToSampleIndex(fromFrame)` to
// `frameToSampleIndex(toFrame)`, so the exported sound is as long as the exported picture
// (SC-006), every boundary computed once from an absolute Frame through the model (R7). Each
// chunk's `startSample` counts from the start of the exported stream, not the Timeline. Where no
// Clip sounds the chunks carry zeros: the file has sound for its whole length. Mono sound is heard
// in both channels and more channels are folded to two, by Web Audio's own up- and down-mix rules —
// the same as playback, where the destination is stereo too.
//
// ## Segments, not one render
//
// One `OfflineAudioContext` for the whole Timeline would hold its output — ten minutes of 48 kHz
// stereo is 28.8 M frames × 2 × 4 B = 230 MB — plus an `AudioBuffer` copy of every Clip's input
// (another 230 MB per stereo Clip) before the first sample could go to the encoder, and while it
// rendered the encoder would wait. So the Timeline is mixed in segments of `SEGMENT_SECONDS`
// (10 s): each is its own context, its own graph, and only the chunks that sound in it — at 48 kHz
// about 3.8 MB of output and 3.8 MB of input per stereo Clip, dropped once sent. Sixty contexts for
// ten minutes, each rendering in a few milliseconds (3 s of the click fixture: 5–9 ms in Chrome);
// the first sound reaches the encoder after 10 s of mix rather than ten minutes of it.
//
// **The boundaries are sample-exact.** Segments end on whole Timeline seconds — sample
// `sourceTimeToTicks(sampleRate, 10k)` — and the first starts at `frameToSampleIndex(fromFrame)`,
// the last ends at `frameToSampleIndex(toFrame)`. Each segment's output is the Timeline's samples
// from its start up to the next one's: none in two, none in neither. Each context is anchored by
// `anchorAtTimelineSample`, so its first output sample *is* that Timeline sample, measured from a
// Frame before it — at 30000/1001 a second falls 0.97 of the way through a Frame, which is not
// rounded onto one. A mix is a sum, and with the same chunks placed at the same Timeline instants
// each output sample comes out the same whichever context computes it, so a seam is inaudible —
// no click, no gap, no overlap — and a sample's instant is measured from at most 10 s away rather
// than from the start of a ten-minute render.
//
// **Why whole seconds, not Frames.** Sound at another rate than the export's is resampled, and a
// chunk sounding across a segment's start has to be started part-way in, with `start(0, offset)`.
// Chrome rounds `offset` to a whole input sample (measured: 48 kHz sound into a 44.1 kHz mix with
// segments on 30000/1001 Frame boundaries came out up to 0.022 off the whole render at the seams,
// and identical with segments on whole seconds). On a whole second every integer rate has a sample,
// so the offset is a whole sample at both rates and nothing is rounded. The resampler interpolates
// from the input on both sides of an edge, so each segment is given the chunks from two Frames
// before it to a Frame after it, anchored on the earlier Frame (the graph trims what is before its
// anchor's Frame), and the PCM is pulled a segment ahead of the mix — which also overlaps the
// worker's decoding with this thread's mixing. A range that starts off a whole second (`fromFrame`
// > 0) at another rate can still have its very first chunk placed within half an input sample;
// there is nothing before it to seam with.
//
// **The limiter's state across a seam, and the pre-roll (ADR 0022).** The master bus's limiter has
// state — a gain reduction that releases over ~100 ms — and every segment's graph is fresh, so a
// segment that began cold at its first sample would not have the reduction the previous loud
// stretch left, and a seam through loud sound would differ from one continuous render. So each
// segment's context starts `PREROLL_SECONDS` (a whole second, longer than the release) before its
// first output sample, clamped at Timeline sample 0, mixes the same sound over that stretch, and
// drops the pre-roll samples from what it sends. Being a whole number of seconds, a pre-rolled
// start is still a whole-second sample, so the offsets that must not be rounded still are not. The
// pool keeps chunks back to the pre-roll, and each context is anchored a Frame-pair before its
// pre-roll as before. The limiter's measured delay (`limiterDelaySeconds`) is handed to every
// graph, which starts its chunks that much earlier; the pre-roll absorbs the first `delay` seconds
// that earlier start would otherwise cut.
//
// ## Backpressure (invariant 4)
//
// At most `MAX_UNACKED` chunks are ever sent and not yet acknowledged; the next waits for an
// `export-audio-ack`. Two, so the encoder always has the next chunk queued while it encodes one,
// and the mixer never runs more than ~1.4 s of sound ahead of it. The mix itself runs only as far
// as the chunks it can send: a segment is mixed, sent, and only then is the next one mixed.
//
// No rate arithmetic happens here (Principle II, R7): sample positions come from `@cutroom/model`,
// and the instants inside a context from the graph's own use of it.

import {
  anchorAtTimelineSample,
  frameToSampleIndex,
  framesForDuration,
  sourceTimeToTicks,
  timelineSampleToContextTime,
  type Frame,
  type Scene,
} from "@cutroom/model"

import { createAudioGraph, type GraphContext, type PcmChunk } from "./graph"

/** The export's sound is stereo (spec assumption: 192 kbps stereo). */
export const EXPORT_CHANNELS = 2

/**
 * How much of the Timeline one `OfflineAudioContext` mixes, in whole seconds: segments end on
 * Timeline seconds `10, 20, 30, …`, where every integer sample rate's grid has a sample.
 */
export const SEGMENT_SECONDS = 10

/**
 * Samples per channel in one `export-audio-chunk`. A buffer size, not a duration — no time is
 * computed from it: ~0.7 s at 48 kHz, so ten minutes is under a thousand messages.
 */
export const CHUNK_SAMPLES = 32_768

/**
 * How much Timeline each segment renders before its first output sample, whole seconds: longer than
 * the limiter's 100 ms release, so its state at the seam matches a continuous render (ADR 0022).
 */
export const PREROLL_SECONDS = 1

/** Chunks that may be sent and not yet acknowledged (invariant 4). */
export const MAX_UNACKED = 2

/** Where the export's decoded sound comes from: the worker, which owns the Sources. */
export interface ExportPcmSource {
  /**
   * Every chunk of every Clip's sound that lies before `toFrame`, and that no earlier pull handed
   * over. Called one at a time, with `toFrame` increasing up to the range's end. Chunks are
   * Timeline-positioned and unbroken, as `audio-pcm`'s are (ADR 0012); a Clip with no sound has none.
   */
  pull(toFrame: Frame, signal: AbortSignal): Promise<readonly PcmChunk[]>
}

/** What an `OfflineAudioContext` renders: the slice of `AudioBuffer` read here. */
export interface RenderedMix {
  copyFromChannel(destination: Float32Array<ArrayBuffer>, channel: number, offset: number): void
}

/** The graph's slice of `BaseAudioContext`, plus the render. An `OfflineAudioContext` is one. */
export interface OfflineMixContext extends GraphContext {
  startRendering(): Promise<RenderedMix>
}

export interface StreamExportAudioOptions {
  readonly scene: Scene
  readonly range: { readonly fromFrame: Frame; readonly toFrame: Frame }
  readonly sampleRate: number
  readonly pcm: ExportPcmSource
  /** Posts one `export-audio-chunk`; the channels are the caller's to transfer. */
  readonly send: (channels: Float32Array[], startSample: number, final: boolean) => void
  /** Subscribes to `export-audio-ack` by its `startSample`; returns the unsubscribe. */
  readonly acks: (listener: (startSample: number) => void) => () => void
  readonly signal: AbortSignal
  /** The master limiter's measured delay (`limiter-delay.ts`); every chunk starts that much earlier. */
  readonly limiterDelaySeconds?: number
  /** For tests: seconds per segment, chunk size, unacknowledged limit, and the context. */
  readonly segmentSeconds?: number
  readonly chunkSamples?: number
  readonly maxUnacked?: number
  readonly createContext?: (length: number, sampleRate: number) => OfflineMixContext
}

function offlineContext(length: number, sampleRate: number): OfflineMixContext {
  return new OfflineAudioContext({ numberOfChannels: EXPORT_CHANNELS, length, sampleRate })
}

/** `promise`, or `signal.reason` the moment the signal aborts — and no listener left behind. */
function unlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      }
    )
  })
}

function chunkLength(chunk: PcmChunk): number {
  return chunk.channels[0]?.length ?? 0
}

function checkFrame(value: unknown, name: string): asserts value is Frame {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`streamExportAudio: ${name} must be a non-negative integer Frame`)
  }
}

export async function streamExportAudio(options: StreamExportAudioOptions): Promise<void> {
  const { scene, range, sampleRate, pcm, send, acks, signal } = options
  const { fromFrame, toFrame } = range
  checkFrame(fromFrame, "range.fromFrame")
  checkFrame(toFrame, "range.toFrame")
  if (toFrame <= fromFrame) throw new RangeError("streamExportAudio: the range is empty")
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError("streamExportAudio: sampleRate must be a positive integer")
  }
  const timebase = scene.timebase
  const segmentSeconds = options.segmentSeconds ?? SEGMENT_SECONDS
  const chunkSamples = options.chunkSamples ?? CHUNK_SAMPLES
  const maxUnacked = options.maxUnacked ?? MAX_UNACKED
  const createContext = options.createContext ?? offlineContext
  const limiterDelaySeconds = options.limiterDelaySeconds ?? 0
  if (!Number.isSafeInteger(segmentSeconds) || segmentSeconds < 1) {
    throw new RangeError("streamExportAudio: segmentSeconds must be a positive integer")
  }
  signal.throwIfAborted()

  const at = (frame: Frame, rate = sampleRate) => frameToSampleIndex(timebase, rate, frame)
  const streamStart = at(fromFrame)
  const streamEnd = at(toFrame)
  if (streamEnd === streamStart) throw new RangeError("streamExportAudio: the range has no samples")
  /** The `k`th segment boundary: Timeline second `k × segmentSeconds`, as a sample and a Frame. */
  const boundary = (k: number) => {
    const second = { numerator: k * segmentSeconds, denominator: 1 }
    // The first Frame that begins at or after it: the Frames before it hold all of its sound.
    return {
      sample: sourceTimeToTicks(sampleRate, second),
      frame: framesForDuration(timebase, second),
    }
  }

  // ---- acknowledgements: every chunk sent and not yet acknowledged, by its `startSample`
  const unacked = new Set<number>()
  let wake: (() => void) | null = null
  const unsubscribe = acks((startSample) => {
    if (unacked.delete(startSample)) {
      wake?.()
      wake = null
    }
  })
  /** Until fewer than `limit` chunks are unacknowledged. */
  async function acknowledged(limit: number): Promise<void> {
    while (unacked.size >= limit) {
      signal.throwIfAborted()
      await unlessAborted(new Promise<void>((resume) => (wake = resume)), signal)
    }
  }

  // ---- the decoded sound, pulled a segment ahead of the mix, one pull at a time
  let pool: PcmChunk[] = []
  let pulledTo = fromFrame
  let pulling: Promise<void> = Promise.resolve()
  function pullThrough(frame: Frame): Promise<void> {
    const target = Math.min(frame, toFrame)
    pulling = pulling.then(async () => {
      if (target <= pulledTo) return
      const chunks = await unlessAborted(pcm.pull(target, signal), signal)
      pulledTo = target
      for (const chunk of chunks) if (chunkLength(chunk) > 0) pool.push(chunk)
    })
    // A pull running ahead may fail while nothing awaits it yet; it is awaited before it matters.
    pulling.catch(() => undefined)
    return pulling
  }

  const preroll = sourceTimeToTicks(sampleRate, { numerator: PREROLL_SECONDS, denominator: 1 })
  const prerollFrames = framesForDuration(timebase, { numerator: PREROLL_SECONDS, denominator: 1 })

  /**
   * Mixes Timeline samples `[first, last)`, or `null` for silence: the sound of the Frames from
   * `anchorFrame` (at or before `first`'s) to `endFrame` (the first at or after `last`'s), and a
   * Frame past it — what a resampler interpolates the edge samples from. `first` is the context's
   * first sample, the pre-roll included.
   */
  async function mix(
    first: number,
    last: number,
    anchorFrame: Frame,
    endFrame: Frame
  ): Promise<RenderedMix | null> {
    const sounding = pool.filter((chunk) => {
      const from = at(anchorFrame, chunk.sampleRate)
      const until = at(endFrame + 1, chunk.sampleRate)
      return chunk.startSample < until && chunk.startSample + chunkLength(chunk) > from
    })
    if (sounding.length === 0) return null

    const context = createContext(last - first, sampleRate)
    const anchor = anchorAtTimelineSample(timebase, sampleRate, first, anchorFrame)
    const graph = createAudioGraph({
      context,
      lookaheadSeconds: Number.POSITIVE_INFINITY,
      outputDelaySeconds: limiterDelaySeconds,
      // Nothing is played past the context's last sample (the chunks pulled run on beyond it).
      endSeconds: timelineSampleToContextTime(timebase, anchor, sampleRate, last),
    })
    graph.setScene(scene)
    graph.start(anchor)
    for (const chunk of sounding) graph.receive(chunk)
    return unlessAborted(context.startRendering(), signal)
  }

  try {
    let first = streamStart
    // A Frame early: sound just before the segment is what a resampler interpolates its first
    // samples from, and the graph trims everything before its anchor's Frame.
    // and a pre-roll's worth of Frames earlier still, where the first segment has the Timeline.
    let anchorFrame = Math.max(0, fromFrame - 1 - prerollFrames)
    let k = 1
    while (first < streamEnd) {
      while (boundary(k).sample <= first) k += 1
      const end = boundary(k)
      const last = Math.min(end.sample, streamEnd)
      const endFrame = last === streamEnd ? toFrame : end.frame
      // This segment's sound and the next's in hand; the pull after runs while this segment is
      // mixed and sent.
      await pullThrough(boundary(k + 1).frame + 1)
      signal.throwIfAborted()
      // The context starts a pre-roll early, or at Timeline sample 0; `lead` samples are dropped.
      const contextFirst = Math.max(0, first - preroll)
      const lead = first - contextFirst
      const rendered = await mix(contextFirst, last, anchorFrame, endFrame)
      void pullThrough(boundary(k + 2).frame + 1)

      // The next segment starts on a whole second, between two Frames in general: anchored two
      // Frames back, one at or before the second and one more for the resampler.
      anchorFrame = Math.max(0, end.frame - 2 - prerollFrames)
      const keepFrom = anchorFrame
      pool = pool.filter(
        (chunk) => chunk.startSample + chunkLength(chunk) > at(keepFrom, chunk.sampleRate)
      )

      for (let offset = 0; first + offset < last; offset += chunkSamples) {
        await acknowledged(maxUnacked)
        signal.throwIfAborted()
        const length = Math.min(chunkSamples, last - first - offset)
        const channels = Array.from({ length: EXPORT_CHANNELS }, (_, channel) => {
          const plane = new Float32Array(length)
          rendered?.copyFromChannel(plane, channel, lead + offset)
          return plane
        })
        const startSample = first + offset - streamStart
        unacked.add(startSample)
        send(channels, startSample, first + offset + length === streamEnd)
      }
      first = last
    }
    await acknowledged(1)
  } finally {
    unsubscribe()
    wake = null
  }
}

/** The worker's answer to `export-audio-request`: the PCM of every Clip up to `toFrame`. */
export interface ExportAudioPcmReply {
  readonly toFrame: Frame
  readonly chunks: readonly PcmChunk[]
}

/**
 * The PCM source over the protocol: `request(toFrame)` posts `export-audio-request`, and `replies`
 * subscribes to `export-audio-pcm`. One request is answered by one reply naming its `toFrame`.
 */
export function requestedExportPcm(
  request: (toFrame: Frame) => void,
  replies: (listener: (reply: ExportAudioPcmReply) => void) => () => void
): ExportPcmSource {
  return {
    pull(toFrame, signal) {
      signal.throwIfAborted()
      let unsubscribe = () => {}
      const answered = new Promise<readonly PcmChunk[]>((resolve) => {
        unsubscribe = replies((reply) => {
          if (reply.toFrame === toFrame) resolve(reply.chunks)
        })
      })
      request(toFrame)
      return unlessAborted(answered, signal).finally(() => unsubscribe())
    },
  }
}
