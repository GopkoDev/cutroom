// Sound for playback: decoded here, scheduled on the main thread (ADR 0008, R3).
//
// `AudioContext` exists only in a Window, so the worker does not play anything. It does the
// expensive half — decoding — and hands the main thread PCM it can schedule as-is: one Clip's
// samples at a time, already placed on the Timeline, a bounded distance ahead of the Playhead.
//
// **One decode per Clip, over the track attach vetted.** Each SceneClip whose Source has sound gets
// its own `AudioSampleSink` over `getAttachedSource(id).audio` — the same per-Source registry the
// picture uses (canvas-sink.ts), so there is no second answer to which Sources are reachable, and
// two Clips of one Source each walk their own part of it. A Source with no sound has no track and
// gets no decode: silence is a valid answer, not a missing one (US2 scenario 5).
//
// **Placed on the Timeline here, so the main thread maps nothing.** A decoded sample carries its
// Source time. Where that lands on the Timeline is one integer offset on one sample grid at the
// stream's own rate: the Clip starts at `frameToSampleIndex(startFrame)` and shows the Source from
// `sourceTimeToTicks(sourceInPoint)`, so Source sample `j` is Timeline sample
// `j − inPoint + clipStart`. Both ends come from the model's Timebase module (R7) and are exact
// rationals rounded once, so no error accumulates however long the Clip; what happens here is
// subtraction of integers on one grid, like `frame − startFrame` in mapping.ts. The PCM is trimmed
// to the Frames the Clip covers and the Frames playback starts from, so a sample of sound is never
// sent for a Frame whose picture is not on the Timeline.
//
// **Ahead of the Playhead, by a bounded amount.** Decoding a ten-minute Clip whole would send the
// main thread a quarter of a gigabyte of PCM before it played a second of it. Each Clip's decode
// runs until it is `LEAD` ahead of the newest Frame the clock has asked for, sends what it has, and
// waits for the clock to move. `LEAD` is a duration, so it is turned into Frames by the model
// (`framesForDuration`) and into samples by `frameToSampleIndex`, never by multiplying a rate here.
// Two seconds is far beyond what any main-thread lookahead needs, and is what keeps sound going
// through a stall of the worker's thread, which is exactly when FR-012 says picture yields and
// sound does not.
//
// **Unbroken.** A Clip with sound gets every sample of its run, from where playback starts to the
// Clip's end: where its track has none — it starts after the Clip's in-point, skips, or ends before
// the Clip does — the gap is sent as silence. So the main thread can tell sound that has not
// arrived yet from sound that does not exist, which is what lets a start wait for it (T070).
//
// **Chunked, transferred, idempotent.** PCM leaves in chunks — a small first one so playback can
// start at once, then larger ones so the main thread is not scheduling a node every 21 ms — as one
// `Float32Array` per channel, transferred, never copied. A chunk's position is its Timeline sample,
// so the same Clip and position always carry the same sound: PCM from a run a seek has replaced
// is still right wherever it lands.

import { AudioSampleSink, InputDisposedError, type AudioSample } from "mediabunny"

import {
  frameToSampleIndex,
  framesForDuration,
  secondsToTicks,
  sourceTimeBefore,
  sourceTimeToTicks,
  type Frame,
  type Scene,
  type SceneClip,
  type Timebase,
} from "@cutroom/model"

import { decoderSeconds, sourceTimeAt } from "../playback/mapping"
import { streamKey } from "../playback/stream"
import type { AudioPcmEvent } from "../protocol"
import { getAttachedSource } from "./attach"

/** How far ahead of the Playhead each Clip's sound is decoded and sent: two seconds, exactly. */
const LEAD = { numerator: 2, denominator: 1 } as const

/**
 * How far before the first sample wanted the decoder starts: a tenth of a second, exactly. A
 * decoder started cold does not reproduce its first packet — AAC's first frame overlaps with
 * silence and comes out faded in, and Opus asks for 80 ms of run-up — so it is started this much
 * earlier and the run-up is trimmed away like anything else before `from`. Measured, not assumed:
 * without it the click on a whole second in the fixtures arrived 192 samples late after a seek.
 */
const PREROLL = { numerator: 1, denominator: 10 } as const

/**
 * Chunk sizes, in samples per channel. Buffer sizes, not durations — no time is computed from
 * them. The first chunk of a Clip is small, so the main thread has sound to start with almost as
 * soon as it asks (~43 ms at 48 kHz); the rest are large (~340 ms), so a minute of playback is a
 * couple of hundred `AudioBufferSourceNode`s rather than three thousand.
 */
const FIRST_CHUNK = 2048
const CHUNK = 16_384

export interface AudioPlayback {
  /** Starts a playback run from `fromFrame`, replacing any run already going (a seek). */
  play(scene: Scene, fromFrame: Frame): void
  /** Ends the run. PCM already sent stays sent; nothing more follows. */
  stop(): void
  /** The clock has asked for `frame`: decoding may run up to `LEAD` past it. */
  playhead(frame: Frame): void
  /** A new Scene arrived. Clips whose placement changed restart from the Playhead. */
  scene(scene: Scene): void
  /**
   * Settles once every decode of the run has sent all it may for now — it is waiting for the
   * Playhead to move, or it has ended — so everything up to `LEAD` past the Playhead has been sent.
   * At once with no run. Playback never needs this: it is how an export, which moves the Playhead
   * itself, knows a stretch of sound is complete (export/run.ts).
   */
  idle(): Promise<void>
}

/** One playback run: what the decodes read the Playhead from, and how they are told to stop. */
interface Run {
  readonly timebase: Timebase
  /** `LEAD`, in the run's Frames. */
  readonly leadFrames: number
  playhead: Frame
  cancelled: boolean
  /** Woken whenever the Playhead moves or the run is cancelled. */
  waiters: (() => void)[]
  /**
   * Decodes of this run that are working rather than parked on `waiters` or ended. Counted up when
   * one is started or woken, down when it parks or ends, so that a wake and the resumption it
   * causes are never seen as idle in between.
   */
  active: number
  /** Woken when `active` reaches zero. */
  idlers: (() => void)[]
  /** One decode per Clip, by `clipId`, each with the key of the placement it was started for. */
  readonly decodes: Map<string, Decode>
}

interface Decode {
  readonly key: string
  cancelled: boolean
  /** Closes the sample iterator, if one is open. */
  close(): void
}

/** PCM gathered for one message: one plane per channel, filled from `start` on the Timeline. */
interface Chunk {
  readonly sampleRate: number
  readonly start: number
  readonly planes: Float32Array[]
  length: number
}

export function createAudioPlayback(
  send: (event: AudioPcmEvent, transfer: Transferable[]) => void,
  fail: (error: unknown) => void
): AudioPlayback {
  let run: Run | null = null

  function wake(target: Run): void {
    const woken = target.waiters.splice(0)
    target.active += woken.length
    for (const waiter of woken) waiter()
  }

  /** One decode of `target` stops working, parked or ended. */
  function rest(target: Run): void {
    target.active -= 1
    if (target.active === 0) for (const idler of target.idlers.splice(0)) idler()
  }

  /** Parks a decode until the Playhead moves or the run is cancelled. */
  function park(target: Run): Promise<void> {
    const parked = new Promise<void>((resume) => target.waiters.push(resume))
    rest(target)
    return parked
  }

  function cancel(decode: Decode): void {
    decode.cancelled = true
    decode.close()
  }

  /** Starts decoding one Clip's sound for `target`, from whichever is later: `from` or its start. */
  function start(target: Run, clip: SceneClip, from: Frame): void {
    const decode: Decode = { key: streamKey(target.timebase, clip), cancelled: false, close() {} }
    target.decodes.set(clip.clipId, decode)
    target.active += 1
    decodeClip(target, decode, clip, from)
      .catch(fail)
      .finally(() => rest(target))
  }

  async function decodeClip(
    target: Run,
    decode: Decode,
    clip: SceneClip,
    from: Frame
  ): Promise<void> {
    const track = getAttachedSource(clip.sourceId)?.audio ?? null
    if (track === null) return

    const end = clip.startFrame + clip.durationFrames
    const first = Math.max(from, clip.startFrame)
    if (first >= end) return

    const stopped = () => decode.cancelled || target.cancelled

    // A Clip further down the Timeline opens no decoder until the Playhead is within `LEAD` of it.
    while (!stopped() && first > target.playhead + target.leadFrames) {
      await park(target)
    }
    if (stopped()) return

    // `sourceTimeBefore` stops at the Source's time 0, but a track can begin before it: an AAC
    // encoder's priming packet, which an MP4 edit list places at −1024 samples. That packet is the
    // run-up for time 0 — the only one there is — so a run-up cut short at 0 starts at the track's
    // first packet instead. Without it, sound from a Source's first sample came out as ~450 zeros
    // and a fade-in. Its samples, before 0, are trimmed like any other run-up.
    let runUp = decoderSeconds(
      sourceTimeBefore(sourceTimeAt(target.timebase, clip, first), PREROLL)
    )
    if (runUp === 0) runUp = Math.min(0, await track.getFirstTimestamp())
    if (stopped()) return

    const samples = new AudioSampleSink(track).samples(runUp)
    decode.close = () => void samples.return(undefined).catch(() => undefined)

    /** The Timeline grid at one sample rate, worked out once per rate the stream decodes at. */
    let grid: {
      readonly sampleRate: number
      readonly clipStart: number
      readonly inPoint: number
      readonly from: number
      readonly to: number
    } | null = null
    const gridAt = (sampleRate: number) => {
      if (grid?.sampleRate !== sampleRate) {
        grid = {
          sampleRate,
          clipStart: frameToSampleIndex(target.timebase, sampleRate, clip.startFrame),
          inPoint: sourceTimeToTicks(sampleRate, clip.sourceInPoint),
          from: frameToSampleIndex(target.timebase, sampleRate, first),
          to: frameToSampleIndex(target.timebase, sampleRate, end),
        }
      }
      return grid
    }

    let chunk: Chunk | null = null
    let sentFirst = false
    /** The rate and channel count of the last decoded sample: what silence is sent in. */
    let layout: { readonly sampleRate: number; readonly channels: number } | null = null
    /** The Timeline sample after the last one taken, at `grid`'s rate. */
    let written: number | null = null

    const flush = () => {
      if (chunk === null || chunk.length === 0 || stopped()) {
        chunk = null
        return
      }
      const length = chunk.length
      const channels = chunk.planes.map((plane) =>
        length === plane.length ? plane : plane.subarray(0, length)
      )
      send(
        {
          type: "audio-pcm",
          sourceId: clip.sourceId,
          clipId: clip.clipId,
          sampleRate: chunk.sampleRate,
          channels,
          startSample: chunk.start,
        },
        channels.map((channel) => channel.buffer)
      )
      sentFirst = true
      chunk = null
    }

    /**
     * Puts `count` frames into chunks, starting at Timeline `at`: `fill(plane, channel, done)`
     * writes the frames from `done` on into `plane`, one channel of the chunk.
     */
    const put = (
      sampleRate: number,
      channels: number,
      at: number,
      count: number,
      fill: (plane: Float32Array, channel: number, done: number) => void
    ) => {
      let done = 0
      while (done < count) {
        if (
          chunk !== null &&
          (chunk.sampleRate !== sampleRate ||
            chunk.planes.length !== channels ||
            chunk.start + chunk.length !== at + done)
        ) {
          flush()
        }
        if (chunk === null) {
          const capacity = sentFirst ? CHUNK : FIRST_CHUNK
          chunk = {
            sampleRate,
            start: at + done,
            planes: Array.from({ length: channels }, () => new Float32Array(capacity)),
            length: 0,
          }
        }
        const room = chunk.planes[0]!.length - chunk.length
        const step = Math.min(room, count - done)
        for (let channel = 0; channel < chunk.planes.length; channel++) {
          fill(chunk.planes[channel]!.subarray(chunk.length, chunk.length + step), channel, done)
        }
        chunk.length += step
        done += step
        if (chunk.length === chunk.planes[0]!.length) flush()
      }
    }

    /** Copies `count` frames of `sample` from `offset` into chunks, starting at Timeline `at`. */
    const take = (sample: AudioSample, offset: number, count: number, at: number) => {
      put(sample.sampleRate, sample.numberOfChannels, at, count, (plane, channel, done) => {
        sample.copyTo(plane, {
          planeIndex: channel,
          format: "f32-planar",
          frameOffset: offset + done,
          frameCount: plane.length,
        })
      })
    }

    /** Silence for `count` frames from Timeline `at`: a fresh plane is already zeros. */
    const silence = (sampleRate: number, channels: number, at: number, count: number) => {
      put(sampleRate, channels, at, count, () => {})
    }

    /** Whether this Clip's sound has been taken `LEAD` past the Playhead, or to its end. */
    const farEnoughAhead = () =>
      grid !== null &&
      written !== null &&
      written >=
        frameToSampleIndex(
          target.timebase,
          grid.sampleRate,
          Math.min(end, target.playhead + target.leadFrames)
        )

    try {
      for (;;) {
        // Ahead of the Playhead far enough: send what there is, and wait for the clock.
        while (!stopped() && farEnoughAhead()) {
          flush()
          await park(target)
        }
        if (stopped()) return

        const result = await samples.next()
        if (stopped()) {
          if (!result.done) result.value.close()
          return
        }
        if (result.done) break

        const sample = result.value
        try {
          const { clipStart, inPoint, from: lowest, to } = gridAt(sample.sampleRate)
          layout = { sampleRate: sample.sampleRate, channels: sample.numberOfChannels }
          // Where this sample's first frame lands on the Timeline, and the part of it that belongs
          // there: after what has been taken already, inside the Clip, from where playback began.
          const at = secondsToTicks(sample.sampleRate, sample.timestamp) - inPoint + clipStart
          let low = Math.max(lowest, written ?? lowest)
          if (at > low && low < to) {
            // The track has no sound here — it starts later than the Clip, or skips — so the Clip
            // has silence, sent as such: a Clip's sound arrives unbroken (worker-protocol).
            const until = Math.min(at, to)
            silence(sample.sampleRate, sample.numberOfChannels, low, until - low)
            written = low = until
          }
          const high = Math.min(to, at + sample.numberOfFrames)
          if (at >= to) break
          const offset = Math.max(0, low - at)
          const count = high - (at + offset)
          if (count > 0) {
            take(sample, offset, count, at + offset)
            written = at + offset + count
          }
          if (high >= to) break
        } finally {
          sample.close()
        }
      }
      // A track that ends before its Clip does leaves the rest of the Clip silent: sent as silence,
      // paced like sound, so a receiver can tell "the sound is here" from "not arrived yet". In the
      // rate and layout of the sound before it, or the track's own if none was decoded.
      const tail = layout ?? { sampleRate: track.sampleRate, channels: track.numberOfChannels }
      const { from: lowest, to } = gridAt(tail.sampleRate)
      while (!stopped() && (written ?? lowest) < to) {
        while (!stopped() && farEnoughAhead()) {
          flush()
          await park(target)
        }
        if (stopped()) return
        const from = written ?? lowest
        const count = Math.min(CHUNK, to - from)
        silence(tail.sampleRate, tail.channels, from, count)
        written = from + count
      }
      flush()
    } catch (error) {
      // The Source was detached mid-decode: its Clips fall silent, which is what an Offline Source
      // sounds like. Not a fault.
      if (error instanceof InputDisposedError) return
      throw error
    } finally {
      decode.close()
    }
  }

  function end(): void {
    if (run === null) return
    run.cancelled = true
    for (const decode of run.decodes.values()) cancel(decode)
    wake(run)
    run = null
  }

  function play(scene: Scene, fromFrame: Frame): void {
    end()
    const started: Run = {
      timebase: scene.timebase,
      leadFrames: framesForDuration(scene.timebase, LEAD),
      playhead: fromFrame,
      cancelled: false,
      waiters: [],
      active: 0,
      idlers: [],
      decodes: new Map(),
    }
    run = started
    for (const clip of scene.clips) {
      if (clip.startFrame + clip.durationFrames > fromFrame) start(started, clip, fromFrame)
    }
  }

  function playhead(frame: Frame): void {
    if (run === null || frame === run.playhead) return
    run.playhead = frame
    wake(run)
  }

  function replaceScene(scene: Scene): void {
    const current = run
    if (current === null) return
    if (
      scene.timebase.numerator !== current.timebase.numerator ||
      scene.timebase.denominator !== current.timebase.denominator
    ) {
      // Every position the run computed is in the old Timebase: start again from the Playhead.
      play(scene, current.playhead)
      return
    }
    const kept = new Set<string>()
    for (const clip of scene.clips) {
      const decode = current.decodes.get(clip.clipId)
      if (decode !== undefined && decode.key === streamKey(current.timebase, clip)) {
        kept.add(clip.clipId)
        continue
      }
      if (decode !== undefined) cancel(decode)
      if (clip.startFrame + clip.durationFrames > current.playhead) {
        start(current, clip, current.playhead)
        kept.add(clip.clipId)
      }
    }
    for (const [clipId, decode] of current.decodes) {
      if (!kept.has(clipId)) {
        cancel(decode)
        current.decodes.delete(clipId)
      }
    }
  }

  function idle(): Promise<void> {
    const current = run
    if (current === null || current.active === 0) return Promise.resolve()
    return new Promise<void>((settle) => current.idlers.push(settle))
  }

  return { play, stop: end, playhead, scene: replaceScene, idle }
}
