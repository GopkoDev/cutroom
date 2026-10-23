// One export: a frozen Scene, rendered Frame by Frame through the Preview's own compositor, encoded
// and written to the file the user chose (R4, FR-015–FR-019).
//
// **The same compositing code, not the same canvas.** Principle III asks that Preview and Export be
// produced by one pipeline from one Scene, and they are: every Frame here goes through
// `renderByStreaming` and `renderScene` — the very functions playback calls — over the Scene that
// arrived in `export-start`. What the export does *not* share with the Preview is state. It stands
// up a renderer of its own over an `OffscreenCanvas` of its own, and a `SinkSet` of its own, because
// an export runs while the user keeps editing (FR-019) and the Preview has to keep working through
// it: borrowing the Preview's canvas would put every exported Frame on screen and every scrub into
// the file, and borrowing its sinks would let a scrub seek the decoder the export is streaming
// through. Two renderers, two sets of decoders, one function deciding what a Frame looks like.
//
// **Exported Frames are streamed, not sought.** An export asks for every Frame in order — playback
// without a clock — so each Clip is walked by one `canvasesAtTimestamps` iterator (R2), exactly as
// playback walks it, and nothing is ever dropped: the loop waits for each picture, then for the
// encoder (Principle III: "Export steps Frame by Frame and waits").
//
// **Time is the model's.** A Frame's timestamp and duration are `frameToSeconds` of its index in
// the export and of one Frame; a chunk of sound's timestamp is its sample index as ticks of the
// sample rate (`ticksToSeconds`); the track's `frameRate` metadata is `timebaseAsNumber`. Nothing
// here divides by a rate (R7, Principle II).
//
// **Backpressure everywhere** (R4, invariant 4). Every `add()` is awaited, and a chunk of sound is
// acknowledged (`export-audio-ack`) only once the encoder has taken it, so neither the Frame loop
// nor the main thread's mixer can run ahead of the encoder and the disk.
//
// **No ending but one leaves a file** (FR-018). The file is committed in exactly one place — the
// close that `output.finalize()` performs after the last sample — and every other way out
// (cancelled, an encoder error, a destination that stopped accepting writes, a Source that went
// away mid-export) *aborts* the writable stream, which discards everything written to it. That
// needs a wrapper around the stream: Mediabunny's `output.cancel()` *closes* its target, and
// closing a `FileSystemWritableFileStream` is what commits it, so cancelling through Mediabunny
// alone would leave a truncated MP4 at the user's chosen path looking like a finished one. (The
// stream is a transferred one forwarding to the file stream on the main thread, export/writable.ts,
// and the commit itself happens there; its outcome is the main thread's to observe.)
//
// **Sound is mixed on the main thread, decoded here** (ADR 0008). The mixer asks for the Clips'
// sound with `export-audio-request`, and the frozen Scene's Clips are decoded exactly as playback
// decodes them (sources/audio.ts), by a decoder of the export's own; the mix comes back as
// `export-audio-chunk`s and is encoded beside the picture.

import {
  AudioSample,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  type AudioSampleSource,
  type StreamTargetChunk,
} from "mediabunny"

import {
  frameToSampleIndex,
  frameToSeconds,
  sourceTimeToTicks,
  ticksToSeconds,
  timebaseAsNumber,
  type Scene,
} from "@cutroom/model"

import { createSceneRenderer, type SceneRenderer } from "../compose/renderer"
import { covers, decoderSeconds } from "../playback/mapping"
import { renderByStreaming } from "../playback/stream"
import type { AudioPcmEvent, ExportAudioChunkMessage, ExportStartMessage } from "../protocol"
import { getAttachedSource } from "../sources/attach"
import { createAudioPlayback, type AudioPlayback } from "../sources/audio"
import { createSinkSet } from "../sources/canvas-sink"
import { withSoundEdit } from "./edit-list"
import { measureEncoderDelay, soundSource } from "./encoder-delay"

/** What an export says while it runs and how it ends, in the protocol's own terms. */
export interface ExportReport {
  progress(framesDone: number, framesTotal: number): void
  audioAck(startSample: number): void
  /** The answer to `export-audio-request`; `transfer` is every channel's buffer. */
  sourceSound(
    toFrame: number,
    chunks: readonly Omit<AudioPcmEvent, "type">[],
    transfer: Transferable[]
  ): void
  /** Exactly one of the three below is called, once, and nothing after it. */
  done(bytes: number): void
  cancelled(): void
  failed(reason: string): void
}

/** A running export, as the worker's message switch sees it. */
export interface ExportRun {
  /** One chunk of the main thread's mix. Encoded in arrival order, then acknowledged. */
  audioChunk(chunk: ExportAudioChunkMessage): void
  /** The Clips' decoded sound up to `toFrame`, for the mix. Answered in arrival order. */
  audioRequest(toFrame: number): void
  /** Stops the export and discards the file. Ignored once the export has ended. */
  cancel(): void
  /** Settles (never rejects) when the export has ended and reported how. */
  readonly ended: Promise<void>
}

/**
 * How often `export-progress` is sent, at most, in milliseconds of wall time. A message per Frame
 * would be several hundred a second on a fast machine, every one of them a store update on the
 * main thread, for a bar that moves a pixel; ten a second is smooth. The first and the last are
 * always sent.
 */
const PROGRESS_INTERVAL_MS = 100

/**
 * The size of the writes handed to the file, in bytes. Mediabunny's chunked mode gathers the file
 * into blocks this big before writing, so a long export is a few hundred writes rather than one per
 * encoded packet — each of which crosses a thread to reach the file. At most two blocks are held
 * at once, so this is also the memory an export costs for its output, whatever its length.
 */
const WRITE_CHUNK_BYTES = 8 * 1024 * 1024

/** The reason an export stopped because it was asked to; never reported as a failure. */
class Cancelled extends Error {
  constructor() {
    super("cancelled")
    this.name = "Cancelled"
  }
}

/** Renders a thrown value for a person, without throwing on its own account. */
function describe(value: unknown): string {
  if (value instanceof Error) return value.message ? value.message : value.name
  try {
    return typeof value === "string" ? value : (JSON.stringify(value) ?? String(value))
  } catch {
    return Object.prototype.toString.call(value)
  }
}

// ---------------------------------------------------------------------------------------------
// The destination
// ---------------------------------------------------------------------------------------------

/** Bytes to write at `position` once Mediabunny has written everything it will. */
interface FinalWrite {
  readonly data: Uint8Array
  readonly position: number
}

/**
 * The user's file, as a stream Mediabunny can write to and only `commit()` can finish.
 *
 * Mediabunny writes `{ type: "write", data, position }` chunks — the shape a
 * `FileSystemWritableFileStream` takes as-is — and closes the stream both when it finalizes and
 * when it is cancelled. Here a close commits the file only after `commit()`; any other close, and
 * any abort, discards it. Writes are counted so `export-done` can say how big the file is.
 */
interface Destination {
  readonly stream: WritableStream<StreamTargetChunk>
  /** The size of the file written so far: the furthest byte any write reached. */
  readonly bytes: () => number
  /**
   * From now on a close commits the file. Called just before `output.finalize()`. `last`, if
   * given, is asked at that close — after every write Mediabunny made, with the size they reached
   * — for one more write to make before committing (the sound's edit list, edit-list.ts). If it
   * throws, the file is discarded instead.
   */
  commit(last?: (bytes: number) => FinalWrite | null): void
  /** Discards the file now, whatever is in flight. Idempotent; never rejects. */
  discard(): Promise<void>
}

function createDestination(file: WritableStream): Destination {
  const writer = file.getWriter()
  let bytes = 0
  let committing = false
  let last: ((bytes: number) => FinalWrite | null) | undefined
  let discarded: Promise<void> | null = null

  function discard(): Promise<void> {
    // `abort` throws away every write since `createWritable()`; the user's file is left as it was
    // before the export began. Its rejection (a stream already errored) changes nothing about that.
    discarded ??= writer.abort(new Error("export did not finish")).catch(() => undefined)
    return discarded
  }

  const stream = new WritableStream<StreamTargetChunk>({
    async write(chunk) {
      if (discarded !== null) return
      await writer.write(chunk)
      bytes = Math.max(bytes, chunk.position + chunk.data.byteLength)
    },
    async close() {
      if (discarded !== null) return
      // Mediabunny closes its target when it is cancelled, too. Only the close after `commit()`
      // is a finished file; any other is an export that stopped short (FR-018).
      if (!committing) return discard()
      let final: FinalWrite | null
      try {
        final = last?.(bytes) ?? null
      } catch (error) {
        await discard()
        throw error
      }
      if (final !== null) {
        await writer.write({ type: "write", data: final.data, position: final.position })
        bytes = Math.max(bytes, final.position + final.data.byteLength)
      }
      await writer.close()
    },
    abort() {
      return discard()
    },
  })

  return {
    stream,
    bytes: () => bytes,
    commit(then) {
      committing = true
      last = then
    },
    discard,
  }
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/** What the Frame loop builds before the first Frame, and the audio side waits for. */
interface Pipeline {
  readonly renderer: SceneRenderer
  readonly output: Output
  readonly video: CanvasSource
  readonly audio: AudioSampleSource | null
}

/**
 * Starts an export and returns at once; it ends by calling exactly one of `report.done`,
 * `report.cancelled` and `report.failed`.
 *
 * `message.range` is half-open — `fromFrame` is the first Frame exported, `toFrame` the first one
 * not — like a Clip's `startFrame + durationFrames`. The exported file starts at its own zero: the
 * Frame `fromFrame` is at 0 s, and sample 0 of the sound is the first sample of that Frame.
 */
export function startExport(message: ExportStartMessage, report: ExportReport): ExportRun {
  // Nothing in the message is read again after this point except through these, so a caller that
  // reused the object could not reach into a running export either (FR-019).
  const scene: Scene = message.scene
  const { fromFrame, toFrame } = message.range
  const framesTotal = toFrame - fromFrame
  const audioSettings = message.audio
  const destination = createDestination(message.writable)

  // -- Ending, once ------------------------------------------------------------------------------

  /** Why the export is stopping, if it is: the first reason wins. */
  let halted: unknown = null
  let finished = false
  /**
   * The waits in progress, each cut short the moment the export is halted.
   *
   * Not `Promise.race([work, haltSignal])` over one long-lived signal: every race leaves a reaction
   * on the signal, and the signal stays pending for the whole export, so a race per wait — two per
   * Frame — kept every one of them alive until the export ended (measured: ~25 000 `Promise`s and
   * their closures per 12 800 Frames, ~5 MB of worker heap over a ten-minute export, all freed only
   * at its end). Each wait here takes itself out of the set once it settles (T090).
   */
  const waits = new Set<(reason: unknown) => void>()

  function halt(reason: unknown): void {
    if (halted !== null || finished) return
    halted = reason
    // First, before anything else can happen: the file is gone, so no later step — a close from a
    // cancelled Output, a slow encoder flushing — can commit it.
    void destination.discard()
    for (const cut of waits) cut(reason)
    waits.clear()
  }

  /** Awaits `work`, unless the export is halted first. */
  function unlessHalted<T>(work: Promise<T>): Promise<T> {
    if (halted !== null) {
      // Still observed, so a rejection of `work` is never an unhandled one.
      work.catch(() => undefined)
      return Promise.reject(halted)
    }
    return new Promise<T>((resolve, reject) => {
      waits.add(reject)
      work.then(resolve, reject).finally(() => waits.delete(reject))
    })
  }

  // -- The pipeline, built once ------------------------------------------------------------------

  let resolvePipeline: (pipeline: Pipeline) => void = () => undefined
  const pipeline = new Promise<Pipeline>((resolve) => {
    resolvePipeline = resolve
  })

  // -- Sound -------------------------------------------------------------------------------------

  /** The sample of the exported stream the next chunk must start at. */
  let nextSample = 0
  let audioFinal = false
  /** How many samples of sound the export holds: exactly those of its Frames. Set by `build`. */
  let samplesTotal = 0
  let resolveAudioDone: () => void = () => undefined
  const audioDone = new Promise<void>((resolve) => {
    resolveAudioDone = resolve
  })
  if (audioSettings === null) resolveAudioDone()

  /** Chunks are encoded one at a time, in the order they arrived. */
  let audioChain: Promise<void> = Promise.resolve()

  async function encodeAudio(chunk: ExportAudioChunkMessage): Promise<void> {
    if (audioSettings === null) {
      throw new Error("export-audio-chunk: this export has no sound, but sound was sent for it")
    }
    if (audioFinal) {
      throw new Error("export-audio-chunk: a chunk arrived after the one marked final")
    }
    const { channels, startSample, final } = chunk
    if (channels.length !== audioSettings.channels) {
      throw new Error(
        `export-audio-chunk: ${channels.length} channels sent for an export of ` +
          `${audioSettings.channels}`
      )
    }
    const length = channels[0]?.length ?? 0
    if (channels.some((channel) => channel.length !== length)) {
      throw new Error("export-audio-chunk: the channels of one chunk differ in length")
    }
    // Contiguous, on the exported stream's own grid. A gap or an overlap is a mixer that has lost
    // its place, and encoding it anyway would put sound against the wrong Frames.
    if (startSample !== nextSample) {
      throw new Error(
        `export-audio-chunk: expected the chunk starting at sample ${nextSample}, got one ` +
          `starting at ${startSample}`
      )
    }

    const { audio } = await unlessHalted(pipeline)
    // Sound past the last Frame is not part of the export; it would make the file longer than the
    // Timeline (SC-006).
    const kept = Math.max(0, Math.min(length, samplesTotal - startSample))
    if (kept > 0 && audio !== null) {
      const planar = new Float32Array(kept * channels.length)
      channels.forEach((channel, index) => planar.set(channel.subarray(0, kept), index * kept))
      const sample = new AudioSample({
        data: planar,
        format: "f32-planar",
        numberOfChannels: channels.length,
        sampleRate: audioSettings.sampleRate,
        timestamp: decoderSeconds(ticksToSeconds(audioSettings.sampleRate, startSample)),
      })
      // Closed when the encoder is done with it, not when the wait for it is cut short: a halt
      // stops the waiting, and Mediabunny may still be reading the sample.
      const adding = audio.add(sample).finally(() => sample.close())
      encoding.add(adding)
      void adding.catch(() => undefined).finally(() => encoding.delete(adding))
      await unlessHalted(adding)
    }
    nextSample = startSample + length

    if (final) {
      audioFinal = true
      if (nextSample < samplesTotal) {
        throw new Error(
          `export-audio-chunk: the sound ended at sample ${nextSample}, but the export's ` +
            `Frames need ${samplesTotal}`
        )
      }
      resolveAudioDone()
    }
    report.audioAck(startSample)
  }

  // -- The Clips' own sound, for the main thread to mix ------------------------------------------

  /**
   * The frozen Scene's Clips, decoded exactly as playback decodes them (sources/audio.ts) — a
   * decoder of their own, so a Preview playing beside the export is not disturbed — with the
   * export moving the Playhead instead of a clock. Each `export-audio-request` moves it to the
   * Frame asked for and is answered once every Clip has sent all it may, which is everything up to
   * that Frame (and up to two seconds more). Decoding starts a Frame before `fromFrame`: the mixer
   * interpolates the first samples from the sound just before them.
   */
  const pending: Omit<AudioPcmEvent, "type">[] = []
  const sourceSound: AudioPlayback | null =
    audioSettings === null
      ? null
      : createAudioPlayback((event) => {
          const { sourceId, clipId, sampleRate, channels, startSample } = event
          pending.push({ sourceId, clipId, sampleRate, channels, startSample })
        }, halt)
  sourceSound?.play(scene, Math.max(0, fromFrame - 1))

  /** Requests are answered one at a time, in the order they arrived. */
  let soundChain: Promise<void> = Promise.resolve()

  async function answerSound(toFrame: number): Promise<void> {
    if (sourceSound !== null) {
      sourceSound.playhead(toFrame)
      await unlessHalted(sourceSound.idle())
    }
    const chunks = pending.splice(0)
    report.sourceSound(
      toFrame,
      chunks,
      // De-duplicated: transferring one buffer twice throws.
      [...new Set(chunks.flatMap((chunk) => chunk.channels.map((channel) => channel.buffer)))]
    )
  }

  // -- Sources -----------------------------------------------------------------------------------

  /**
   * The video track each Clip's Source had when the export began. A Source that goes Offline or is
   * relinked mid-export would change what the rest of the file shows — Frames gone black, or cut
   * to a different file — and the export would no longer be the Timeline as it stood when it
   * started (FR-019). That is a failed export, said plainly, not a quietly different one. A Source
   * already Offline at the start renders empty, as it does in the Preview the user is looking at.
   */
  const tracks = new Map(
    scene.clips.map((clip) => [clip.sourceId, getAttachedSource(clip.sourceId)?.video ?? null])
  )

  function checkSources(frame: number): void {
    for (const clip of scene.clips) {
      if (!covers(clip, frame)) continue
      if ((getAttachedSource(clip.sourceId)?.video ?? null) !== tracks.get(clip.sourceId)) {
        throw new Error(
          `the Source of Clip ${clip.clipId} went Offline or was relinked during the export, ` +
            "so the file would not match the Timeline as it was when the export started"
        )
      }
    }
  }

  // -- The Frame loop ----------------------------------------------------------------------------

  const sinks = createSinkSet()
  /** What has been built so far, for the tidying up after the export has ended however it did. */
  const held: { renderer: Promise<SceneRenderer> | null; output: Output | null } = {
    renderer: null,
    output: null,
  }

  /**
   * The Frame being rendered, if one is. A halt stops *waiting* for it, not the Render itself, so
   * the tidying up below waits for it to settle first: dropping the sinks and destroying the
   * renderer under a Render still in flight would let it build a sink, open a stream and start a
   * decoder after the last `retainSinks` — a `VideoDecoder` and its queued frames nobody closes.
   */
  let rendering: Promise<void> = Promise.resolve()

  /**
   * Every `add()` handed to an encoder and not yet settled. The tidy-up waits for these before
   * cancelling the Output, because of a race in Mediabunny 1.52: a source's encoder is created
   * lazily inside its first `add()`, and `Output.cancel()` does not wait for that — cancelled while
   * the first `add()` is still configuring, it closes nothing, and the `VideoEncoder` created a
   * moment later is never closed. An open encoder is a GC root, so it held the whole export —
   * `Output`, muxer, renderer and canvas — alive after every export cancelled at once (measured:
   * one more `VideoEncoder`, `Output` and `WebGLRenderer` for about every second such cancel).
   */
  const encoding = new Set<Promise<unknown>>()

  /** Samples the encoder puts before the first one it is given (encoder-delay.ts). */
  let encoderDelay = 0
  /** The `moov` Mediabunny wrote, and where: the box the sound's edit list goes into. */
  let movieBox: FinalWrite | null = null

  /**
   * The file's `moov` again, with an edit list that starts the sound `encoderDelay` samples into
   * the encoded track and ends it after `samplesTotal` — so a player puts the export's sample 0 at
   * 0 s and stops the sound with the last Frame (SC-006). Written over the `moov` Mediabunny wrote,
   * which is safe only while that box is the last thing in the file; if it is not, the export
   * fails rather than leaving a file whose sound is out of sync.
   */
  function soundEdit(bytes: number): FinalWrite | null {
    if (audioSettings === null || encoderDelay === 0) return null
    if (movieBox === null) throw new Error("the muxer finished without writing the file's moov")
    if (movieBox.position + movieBox.data.byteLength !== bytes) {
      throw new Error(
        "the file's moov is not at its end, so its sound cannot be given its edit list"
      )
    }
    const { sampleRate, codec } = audioSettings
    const data = withSoundEdit(movieBox.data, {
      mediaTime: (timescale) =>
        sourceTimeToTicks(timescale, ticksToSeconds(sampleRate, encoderDelay)),
      segmentDuration: (timescale) =>
        sourceTimeToTicks(timescale, ticksToSeconds(sampleRate, samplesTotal)),
      // AAC decodes a packet only after the one before it (ISO/IEC 14496-3 pre-roll); without the
      // group saying so, AVFoundation also ignores the edit's priming (edit-list.ts).
      rollDistance: codec === "aac" ? -1 : null,
    })
    return { data, position: movieBox.position }
  }

  async function build(): Promise<Pipeline> {
    if (!Number.isSafeInteger(fromFrame) || !Number.isSafeInteger(toFrame) || fromFrame < 0) {
      throw new RangeError(`export-start: range ${fromFrame}…${toFrame} is not a range of Frames`)
    }
    if (framesTotal <= 0) {
      throw new RangeError(`export-start: range ${fromFrame}…${toFrame} contains no Frames`)
    }
    if (audioSettings !== null) {
      // On the Timeline's own grid, each end rounded once from its absolute Frame — the same
      // count the mixer produces (`frameToSampleIndex(toFrame) − frameToSampleIndex(fromFrame)`).
      const at = (frame: number) =>
        frameToSampleIndex(scene.timebase, audioSettings.sampleRate, frame)
      samplesTotal = at(toFrame) - at(fromFrame)
    }

    const canvas = new OffscreenCanvas(scene.frameSize.width, scene.frameSize.height)
    // Held as the promise, so a halt while the renderer is still being created destroys it once it
    // exists rather than leaving its WebGL context behind.
    held.renderer = createSceneRenderer(canvas, scene.frameSize)
    const renderer = await unlessHalted(held.renderer)

    if (audioSettings !== null) {
      encoderDelay = await unlessHalted(measureEncoderDelay(audioSettings))
    }

    const output = new Output({
      // `fastStart: false` puts the `moov` after the media, last in the file — which is what lets
      // the sound's edit list be written by replacing it (soundEdit, below).
      format: new Mp4OutputFormat({
        fastStart: false,
        onMoov: (data, position) => {
          movieBox = { data: data.slice(), position }
        },
      }),
      target: new StreamTarget(destination.stream, { chunked: true, chunkSize: WRITE_CHUNK_BYTES }),
    })
    const video = new CanvasSource(canvas, {
      codec: message.video.codec,
      quality: new Quality({ bitrate: message.video.bitrate }),
    })
    output.addVideoTrack(video, { frameRate: timebaseAsNumber(scene.timebase) })

    let audio: AudioSampleSource | null = null
    if (audioSettings !== null) {
      audio = soundSource(audioSettings)
      output.addAudioTrack(audio)
    }
    held.output = output

    await unlessHalted(output.start())
    return { renderer, output, video, audio }
  }

  async function run(): Promise<number> {
    const built = await build()
    resolvePipeline(built)
    report.progress(0, framesTotal)

    let reportedAt = performance.now()
    for (let frame = fromFrame; frame < toFrame; frame++) {
      checkSources(frame)
      rendering = renderByStreaming(sinks, built.renderer, scene, frame)
      await unlessHalted(rendering)
      // Checked again after the Render: a detach during it renders the Clip empty, and that
      // picture must not reach the file.
      checkSources(frame)
      if (halted !== null) throw halted
      // Captured from the canvas synchronously, inside the same task as the Render — before the
      // canvas can be presented and its drawing buffer cleared. The promise is the backpressure.
      const index = frame - fromFrame
      const adding = built.video.add(
        frameToSeconds(scene.timebase, index),
        frameToSeconds(scene.timebase, 1)
      )
      encoding.add(adding)
      void adding.catch(() => undefined).finally(() => encoding.delete(adding))
      await unlessHalted(adding)

      const now = performance.now()
      if (index + 1 === framesTotal || now - reportedAt >= PROGRESS_INTERVAL_MS) {
        report.progress(index + 1, framesTotal)
        reportedAt = now
      }
    }

    built.video.close()
    // The file holds every Frame; it is finished only once it holds their sound too.
    await unlessHalted(audioDone)
    built.audio?.close()

    destination.commit(soundEdit)
    await unlessHalted(built.output.finalize())
    return destination.bytes()
  }

  function finish(end: () => void): void {
    if (finished) return
    finished = true
    end()
  }

  const ended = (async () => {
    try {
      const bytes = await run()
      finish(() => report.done(bytes))
    } catch (error) {
      halt(error)
      // Discarded before the answer goes out, so a main thread told "cancelled" or "failed" never
      // finds a committed file behind it.
      await destination.discard()
      const reason = halted
      finish(() =>
        reason instanceof Cancelled ? report.cancelled() : report.failed(describe(reason))
      )
    } finally {
      // After the answer, not before: cancelling within two seconds (SC-009) is about the user's
      // file and the user's machine, and this is only about our memory.
      sourceSound?.stop()
      const { output } = held
      if (output !== null && output.state !== "finalized") {
        await Promise.allSettled(encoding)
        await output.cancel().catch(() => undefined)
      }
      await rendering.catch(() => undefined)
      sinks.retainSinks(new Set())
      const renderer = await held.renderer?.catch(() => null)
      renderer?.destroy()
    }
  })()

  return {
    audioChunk(chunk: ExportAudioChunkMessage): void {
      if (finished || halted !== null) return
      audioChain = audioChain.then(() => encodeAudio(chunk)).catch((error: unknown) => halt(error))
    },
    audioRequest(toFrame: number): void {
      if (finished || halted !== null) return
      soundChain = soundChain
        .then(() => answerSound(toFrame))
        .catch((error: unknown) => halt(error))
    },
    cancel(): void {
      halt(new Cancelled())
    },
    ended,
  }
}
