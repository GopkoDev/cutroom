import { describe, expect, it, vi } from "vitest"

import {
  frameToSampleIndex,
  type Frame,
  type Scene,
  type SceneClip,
  type Timebase,
} from "@cutroom/model"

import { FakeAudioContext, FakeBuffer, FakeCompressor, FakeGain } from "./fake-audio-context"
import type { PcmChunk } from "./graph"
import {
  CHUNK_SAMPLES,
  PREROLL_SECONDS,
  requestedExportPcm,
  streamExportAudio,
  type ExportAudioPcmReply,
  type ExportPcmSource,
  type OfflineMixContext,
  type RenderedMix,
  type StreamExportAudioOptions,
} from "./offline-mix"

// The export mix against a fake offline context that really mixes: it sums every started buffer
// into its output at the sample its start time names, and refuses a start time that is not on a
// sample — so a segment anchored a fraction of a sample off fails here rather than in a file.

const NTSC: Timebase = { numerator: 30000, denominator: 1001 }
const VIDEO: Timebase = { numerator: 30, denominator: 1 }
const RATE = 48_000

class FakeOfflineContext extends FakeAudioContext implements OfflineMixContext {
  readonly length: number
  readonly sampleRate: number

  constructor(length: number, sampleRate: number) {
    super()
    this.length = length
    this.sampleRate = sampleRate
  }

  startRendering(): Promise<RenderedMix> {
    const out = new FakeBuffer(2, this.length, this.sampleRate)
    const onSample = (seconds: number, what: string) => {
      const samples = seconds * this.sampleRate
      const whole = Math.round(samples)
      if (Math.abs(samples - whole) > 1e-6) throw new Error(`${what} ${samples} is off the grid`)
      return whole
    }
    for (const source of this.sources) {
      const started = source.started
      const buffer = source.buffer
      if (started === null || !(buffer instanceof FakeBuffer)) continue
      if (buffer.sampleRate !== this.sampleRate) throw new Error("the fake does not resample")
      const gain = source.connections[0]
      const limiter = gain instanceof FakeGain ? gain.connections[0] : undefined
      if (
        !(gain instanceof FakeGain) ||
        !(limiter instanceof FakeCompressor) ||
        !limiter.connections.includes(this.destination)
      ) {
        throw new Error("a node not routed through its Clip's gain and the limiter")
      }
      const at = onSample(started.when, "start")
      const offset = onSample(started.offset, "offset")
      const count = onSample(started.duration, "duration")
      for (let channel = 0; channel < 2; channel++) {
        const input = buffer.data[Math.min(channel, buffer.data.length - 1)]!
        const output = out.data[channel]!
        for (let i = 0; i < count && at + i < this.length; i++) {
          output[at + i]! += input[offset + i]! * gain.gain.value
        }
      }
    }
    return Promise.resolve({
      copyFromChannel(destination, channel, offset) {
        destination.set(out.data[channel]!.subarray(offset, offset + destination.length))
      },
    })
  }
}

function clip(clipId: string, startFrame: Frame, durationFrames: Frame): SceneClip {
  return {
    clipId,
    sourceId: `s-${clipId}`,
    startFrame,
    durationFrames,
    sourceInPoint: { numerator: 0, denominator: 1 },
  }
}

function sceneOf(timebase: Timebase, ...clips: SceneClip[]): Scene {
  return { timebase, frameSize: { width: 640, height: 360 }, clips }
}

/** A Clip's whole sound on the Timeline: `channels[c][i]` is Timeline sample `i` (0 outside it). */
interface Sound {
  readonly clip: SceneClip
  readonly channels: readonly ((sample: number) => number)[]
}

/**
 * The worker, faked: each pull hands over each Clip's samples from the last pull's end to
 * `toFrame`, inside the Clip, in pieces of `piece` samples, positioned on the Timeline.
 */
function fakePcm(timebase: Timebase, sounds: readonly Sound[], piece = 777) {
  const pulls: Frame[] = []
  let last = 0
  const source: ExportPcmSource & { pulls: Frame[] } = {
    pulls,
    pull(toFrame) {
      pulls.push(toFrame)
      const chunks: PcmChunk[] = []
      for (const { clip: c, channels } of sounds) {
        const from = Math.max(
          frameToSampleIndex(timebase, RATE, last),
          frameToSampleIndex(timebase, RATE, c.startFrame)
        )
        const until = Math.min(
          frameToSampleIndex(timebase, RATE, toFrame),
          frameToSampleIndex(timebase, RATE, c.startFrame + c.durationFrames)
        )
        for (let start = from; start < until; start += piece) {
          const length = Math.min(piece, until - start)
          chunks.push({
            clipId: c.clipId,
            sampleRate: RATE,
            startSample: start,
            channels: channels.map((f) => Float32Array.from({ length }, (_, i) => f(start + i))),
          })
        }
      }
      last = toFrame
      return Promise.resolve(chunks)
    },
  }
  return source
}

interface Sent {
  readonly channels: Float32Array[]
  readonly startSample: number
  readonly final: boolean
}

/** Runs a mix that acknowledges every chunk at once, and returns what was sent, joined. */
async function mixAll(
  options: Partial<StreamExportAudioOptions> &
    Pick<StreamExportAudioOptions, "scene" | "range" | "pcm">
) {
  const sent: Sent[] = []
  let listener: ((startSample: number) => void) | null = null
  const contexts: FakeOfflineContext[] = []
  await streamExportAudio({
    sampleRate: RATE,
    signal: new AbortController().signal,
    createContext: (length, sampleRate) => {
      const context = new FakeOfflineContext(length, sampleRate)
      contexts.push(context)
      return context
    },
    send: (channels, startSample, final) => {
      sent.push({ channels, startSample, final })
      queueMicrotask(() => listener?.(startSample))
    },
    acks: (l) => {
      listener = l
      return () => (listener = null)
    },
    ...options,
  })
  const length = sent.reduce((sum, chunk) => sum + chunk.channels[0]!.length, 0)
  const joined = [new Float32Array(length), new Float32Array(length)]
  let at = 0
  for (const chunk of sent) {
    expect(chunk.startSample).toBe(at)
    expect(chunk.channels).toHaveLength(2)
    joined[0]!.set(chunk.channels[0]!, at)
    joined[1]!.set(chunk.channels[1]!, at)
    at += chunk.channels[0]!.length
  }
  return { sent, joined, contexts, unsubscribed: listener === null }
}

/** A different value on every sample, exactly representable in a Float32. */
const ramp = (sample: number) => ((sample % 4093) - 2046) / 4096

describe("streamExportAudio", () => {
  it("sends exactly the Timeline's samples, contiguous, the last one final", async () => {
    const scene = sceneOf(NTSC, clip("a", 0, 300))
    const { sent, joined, unsubscribed } = await mixAll({
      scene,
      range: { fromFrame: 0, toFrame: 300 },
      pcm: fakePcm(NTSC, []),
      segmentSeconds: 1,
      chunkSamples: 1000,
    })
    // 300 Frames at 30000/1001 is 10.01 s: 480480 samples at 48 kHz.
    expect(joined[0]).toHaveLength(480_480)
    expect(sent.filter((chunk) => chunk.final)).toEqual([sent.at(-1)])
    expect(unsubscribed).toBe(true)
  })

  it("sends exactly the range's samples, counted from the start of the stream", async () => {
    const scene = sceneOf(NTSC, clip("a", 0, 300))
    const { sent, joined } = await mixAll({
      scene,
      range: { fromFrame: 1, toFrame: 6 },
      pcm: fakePcm(NTSC, [{ clip: clip("a", 0, 300), channels: [ramp] }]),
    })
    // Frames 1–5: samples 1602 (1601.6 rounded) to 9610 (9609.6 rounded).
    expect(joined[0]).toHaveLength(9610 - 1602)
    expect(sent[0]!.startSample).toBe(0)
    expect(joined[0]![0]).toBe(ramp(1602))
    expect(joined[1]!.at(-1)).toBe(ramp(9609))
  })

  it("is sample-for-sample the sound across segment boundaries between two Frames", async () => {
    const sound: Sound = {
      clip: clip("a", 0, 240),
      channels: [ramp, (sample) => -ramp(sample)],
    }
    // At 30000/1001 a whole second falls between two Frames (29.97 Frames in), and a range from
    // Frame 45 starts between two seconds and on a sample that is no Frame boundary's exact one.
    for (const fromFrame of [0, 45]) {
      const { joined, contexts } = await mixAll({
        scene: sceneOf(NTSC, sound.clip),
        range: { fromFrame, toFrame: 240 },
        pcm: fakePcm(NTSC, [sound]),
        segmentSeconds: 1,
        chunkSamples: 5000,
      })
      const first = frameToSampleIndex(NTSC, RATE, fromFrame)
      const total = frameToSampleIndex(NTSC, RATE, 240) - first
      // 240 Frames is 8.008 s: segments end on seconds 1…8, then the last 0.008 s.
      expect(contexts.length).toBe(fromFrame === 0 ? 9 : 8)
      expect(joined[0]).toHaveLength(total)
      for (let i = 0; i < total; i++) {
        if (joined[0]![i] !== ramp(first + i) || joined[1]![i] !== -ramp(first + i)) {
          throw new Error(`sample ${i}: ${joined[0]![i]}, ${joined[1]![i]}`)
        }
      }
    }
  })

  it("ends every segment but the last on a whole second", async () => {
    const { contexts } = await mixAll({
      scene: sceneOf(NTSC, clip("a", 0, 240)),
      range: { fromFrame: 45, toFrame: 240 },
      pcm: fakePcm(NTSC, [{ clip: clip("a", 0, 240), channels: [ramp] }]),
      segmentSeconds: 3,
    })
    // From sample 72072 (Frame 45): to second 3, to second 6, to Frame 240's sample 384384, each
    // rendering a pre-roll earlier (a second, all of it Timeline here) that is then dropped.
    expect(contexts.map((context) => context.length)).toEqual([
      144_000 - 72_072 + RATE,
      144_000 + RATE,
      384_384 - 288_000 + RATE,
    ])
  })

  it("plays mono in both channels and sums Clips", async () => {
    const a: Sound = { clip: clip("a", 0, 30), channels: [() => 0.25] }
    const b: Sound = { clip: clip("b", 0, 30), channels: [() => 0.125, () => -0.5] }
    const { joined } = await mixAll({
      scene: sceneOf(VIDEO, a.clip, b.clip),
      range: { fromFrame: 0, toFrame: 30 },
      pcm: fakePcm(VIDEO, [a, b]),
    })
    expect(new Set(joined[0])).toEqual(new Set([0.375]))
    expect(new Set(joined[1])).toEqual(new Set([-0.25]))
  })

  it("is silence where no Clip sounds, and mixes nothing when none does", async () => {
    const sound: Sound = { clip: clip("a", 30, 30), channels: [() => 0.5] }
    const { joined } = await mixAll({
      scene: sceneOf(VIDEO, sound.clip),
      range: { fromFrame: 0, toFrame: 90 },
      pcm: fakePcm(VIDEO, [sound]),
      segmentSeconds: 1,
    })
    expect(joined[0]).toHaveLength(3 * RATE)
    for (let i = 0; i < 3 * RATE; i++) {
      const want = i >= RATE && i < 2 * RATE ? 0.5 : 0
      if (joined[0]![i] !== want || joined[1]![i] !== want) throw new Error(`sample ${i}`)
    }

    const silent = await mixAll({
      scene: sceneOf(VIDEO, clip("quiet", 0, 90)),
      range: { fromFrame: 0, toFrame: 90 },
      pcm: fakePcm(VIDEO, []),
    })
    expect(silent.joined[0]).toHaveLength(3 * RATE)
    expect(silent.joined[0]!.every((value) => value === 0)).toBe(true)
    expect(silent.contexts).toEqual([])
  })

  it("ignores sound of a Clip that is not in the frozen Scene", async () => {
    const stray: Sound = { clip: clip("gone", 0, 30), channels: [() => 1] }
    const { joined } = await mixAll({
      scene: sceneOf(VIDEO, clip("a", 0, 30)),
      range: { fromFrame: 0, toFrame: 30 },
      pcm: fakePcm(VIDEO, [stray]),
    })
    expect(joined[0]!.every((value) => value === 0)).toBe(true)
  })

  it("pulls a segment ahead, in increasing Frames, never past the range", async () => {
    const pcm = fakePcm(VIDEO, [])
    await mixAll({
      scene: sceneOf(VIDEO, clip("a", 0, 100)),
      range: { fromFrame: 0, toFrame: 100 },
      pcm,
      segmentSeconds: 1,
    })
    expect(pcm.pulls).toEqual([61, 91, 100])
  })

  it("defaults to ten-second segments and the chunk size", async () => {
    const { sent, contexts } = await mixAll({
      scene: sceneOf(VIDEO, clip("a", 0, 900)),
      range: { fromFrame: 0, toFrame: 900 },
      pcm: fakePcm(VIDEO, [{ clip: clip("a", 0, 900), channels: [() => 0.5] }], 16_384),
    })
    // The first segment has no Timeline before it; the others render a pre-roll earlier.
    expect(contexts.map((context) => context.length)).toEqual([
      480_000,
      480_000 + RATE,
      480_000 + RATE,
    ])
    expect(Math.max(...sent.map((chunk) => chunk.channels[0]!.length))).toBe(CHUNK_SAMPLES)
  })

  it("never has more than the limit sent and unacknowledged, and ends when the last is acked", async () => {
    let listener: ((startSample: number) => void) | null = null
    const unacked: number[] = []
    let most = 0
    let finished = false
    const run = streamExportAudio({
      scene: sceneOf(VIDEO, clip("a", 0, 30)),
      range: { fromFrame: 0, toFrame: 30 },
      sampleRate: RATE,
      pcm: fakePcm(VIDEO, []),
      chunkSamples: 4000,
      maxUnacked: 3,
      signal: new AbortController().signal,
      createContext: (length, sampleRate) => new FakeOfflineContext(length, sampleRate),
      send: (_channels, startSample) => {
        unacked.push(startSample)
        most = Math.max(most, unacked.length)
      },
      acks: (l) => {
        listener = l
        return () => (listener = null)
      },
    }).then(() => (finished = true))

    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
    await settle()
    expect(unacked).toEqual([0, 4000, 8000]) // the limit, then it waits
    listener!(123) // an ack for nothing sent changes nothing
    await settle()
    expect(unacked).toHaveLength(3)
    let acked = 0
    while (acked < 12) {
      // 48000 samples in 4000-sample chunks: 12 of them.
      const next = unacked.shift()
      if (next === undefined) {
        await settle()
        continue
      }
      listener!(next)
      acked += 1
      await settle()
      expect(finished).toBe(acked === 12)
    }
    await run
    expect(most).toBe(3)
    expect(listener).toBeNull()
  })

  it("stops at once when aborted while waiting for an ack, and sends nothing more", async () => {
    const controller = new AbortController()
    let unsubscribed = false
    const send = vi.fn()
    const run = streamExportAudio({
      scene: sceneOf(VIDEO, clip("a", 0, 300)),
      range: { fromFrame: 0, toFrame: 300 },
      sampleRate: RATE,
      pcm: fakePcm(VIDEO, []),
      signal: controller.signal,
      createContext: (length, sampleRate) => new FakeOfflineContext(length, sampleRate),
      send,
      acks: () => () => (unsubscribed = true),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(send).toHaveBeenCalledTimes(2)
    const reason = new DOMException("cancelled", "AbortError")
    controller.abort(reason)
    await expect(run).rejects.toBe(reason)
    expect(send).toHaveBeenCalledTimes(2)
    expect(unsubscribed).toBe(true)
  })

  it("stops at once when aborted while the worker is decoding, or before it starts", async () => {
    const controller = new AbortController()
    const send = vi.fn()
    const options = {
      scene: sceneOf(VIDEO, clip("a", 0, 30)),
      range: { fromFrame: 0, toFrame: 30 },
      sampleRate: RATE,
      pcm: { pull: () => new Promise<never>(() => {}) },
      createContext: (length: number, sampleRate: number) =>
        new FakeOfflineContext(length, sampleRate),
      send,
      acks: () => () => {},
    }
    const run = streamExportAudio({ ...options, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()
    await expect(run).rejects.toMatchObject({ name: "AbortError" })

    await expect(
      streamExportAudio({ ...options, signal: controller.signal })
    ).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(send).not.toHaveBeenCalled()
  })

  it("stops at once when aborted while a segment renders", async () => {
    const controller = new AbortController()
    const run = streamExportAudio({
      scene: sceneOf(VIDEO, clip("a", 0, 30)),
      range: { fromFrame: 0, toFrame: 30 },
      sampleRate: RATE,
      pcm: fakePcm(VIDEO, [{ clip: clip("a", 0, 30), channels: [() => 1] }]),
      signal: controller.signal,
      createContext: (length, sampleRate) => {
        const context = new FakeOfflineContext(length, sampleRate)
        context.startRendering = () => new Promise<never>(() => {})
        return context
      },
      send: () => {},
      acks: () => () => {},
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()
    await expect(run).rejects.toMatchObject({ name: "AbortError" })
  })

  it("refuses an empty range", async () => {
    await expect(
      mixAll({
        scene: sceneOf(VIDEO),
        range: { fromFrame: 5, toFrame: 5 },
        pcm: fakePcm(VIDEO, []),
      })
    ).rejects.toThrow(RangeError)
  })
})

describe("requestedExportPcm", () => {
  it("posts a request and answers with the reply that names its Frame", async () => {
    const listeners = new Set<(reply: ExportAudioPcmReply) => void>()
    const requests: Frame[] = []
    const pcm = requestedExportPcm(
      (toFrame) => requests.push(toFrame),
      (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    )
    const chunk: PcmChunk = {
      clipId: "a",
      sampleRate: RATE,
      startSample: 0,
      channels: [new Float32Array(4)],
    }
    const pulled = pcm.pull(60, new AbortController().signal)
    expect(requests).toEqual([60])
    for (const listener of listeners) listener({ toFrame: 30, chunks: [] })
    for (const listener of listeners) listener({ toFrame: 60, chunks: [chunk] })
    await expect(pulled).resolves.toEqual([chunk])
    expect(listeners.size).toBe(0)
  })

  it("rejects on abort and stops listening", async () => {
    const listeners = new Set<unknown>()
    const pcm = requestedExportPcm(
      () => {},
      (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    )
    const controller = new AbortController()
    const pulled = pcm.pull(60, controller.signal)
    controller.abort()
    await expect(pulled).rejects.toMatchObject({ name: "AbortError" })
    expect(listeners.size).toBe(0)
  })
})

describe("the pre-roll and the limiter's delay (ADR 0022)", () => {
  const loud: Sound = { clip: clip("a", 0, 300), channels: [() => 0.5] }

  it("is a second, longer than the limiter's 100 ms release", () => {
    expect(PREROLL_SECONDS).toBe(1)
  })

  it("renders each segment a pre-roll longer, only as long as the Timeline allows at the start", async () => {
    const { contexts } = await mixAll({
      scene: sceneOf(VIDEO, loud.clip),
      range: { fromFrame: 0, toFrame: 150 },
      pcm: fakePcm(VIDEO, [loud]),
      segmentSeconds: 2,
    })
    // 5 s in segments [0,2) [2,4) [4,5): nothing before the first, a full second before the others.
    expect(contexts.map((context) => context.length)).toEqual([
      2 * RATE,
      2 * RATE + RATE,
      1 * RATE + RATE,
    ])

    const shortRun = await mixAll({
      scene: sceneOf(VIDEO, loud.clip),
      range: { fromFrame: 15, toFrame: 60 },
      pcm: fakePcm(VIDEO, [loud]),
    })
    // Starting half a second in: only half a second of Timeline lies before it.
    expect(shortRun.contexts.map((context) => context.length)).toEqual([
      60 * (RATE / 30) - 15 * (RATE / 30) + RATE / 2,
    ])
  })

  it("sends the same samples as without a pre-roll: the extra leading samples are dropped", async () => {
    const sound: Sound = { clip: clip("a", 0, 150), channels: [ramp, (sample) => -ramp(sample)] }
    const { joined } = await mixAll({
      scene: sceneOf(VIDEO, sound.clip),
      range: { fromFrame: 0, toFrame: 150 },
      pcm: fakePcm(VIDEO, [sound]),
      segmentSeconds: 2,
      chunkSamples: 5000,
    })
    expect(joined[0]).toHaveLength(5 * RATE)
    for (let i = 0; i < 5 * RATE; i++) {
      if (joined[0]![i] !== ramp(i) || joined[1]![i] !== -ramp(i)) throw new Error(`sample ${i}`)
    }
  })

  it("keeps chunks back to the pre-roll, so a later segment hears the sound before its start", async () => {
    const { contexts } = await mixAll({
      scene: sceneOf(VIDEO, loud.clip),
      range: { fromFrame: 0, toFrame: 300 },
      pcm: fakePcm(VIDEO, [loud]),
      segmentSeconds: 2,
    })
    for (const context of contexts.slice(1)) {
      const starts = context.sources.map((source) => source.started!)
      expect(Math.min(...starts.map((started) => started.when))).toBe(0)
      // Every sample of the context, pre-roll included, is covered by the loud Clip.
      const covered = starts.reduce((sum, started) => sum + Math.round(started.duration * RATE), 0)
      expect(covered).toBe(context.length)
    }
  })

  it("schedules every segment's chunks earlier by limiterDelaySeconds", async () => {
    const delay = 288 / RATE
    const base = await mixAll({
      scene: sceneOf(VIDEO, loud.clip),
      range: { fromFrame: 0, toFrame: 90 },
      pcm: fakePcm(VIDEO, [loud]),
      segmentSeconds: 1,
    })
    const shifted = await mixAll({
      scene: sceneOf(VIDEO, loud.clip),
      range: { fromFrame: 0, toFrame: 90 },
      pcm: fakePcm(VIDEO, [loud]),
      segmentSeconds: 1,
      limiterDelaySeconds: delay,
    })
    expect(shifted.contexts).toHaveLength(base.contexts.length)
    // Chunks that sound later in the segment (the pre-roll's own start is at the context's start)
    // are placed `delay` earlier, at the same offset into their buffers.
    let compared = 0
    shifted.contexts.forEach((context, index) => {
      const plain = base.contexts[index]!.sources
      context.sources.forEach((source, n) => {
        const was = plain[n]!.started!
        const now = source.started!
        if (was.when > delay) {
          expect(now.when).toBeCloseTo(was.when - delay, 9)
          expect(now.offset).toBeCloseTo(was.offset, 9)
          compared += 1
        }
      })
    })
    expect(compared).toBeGreaterThan(0)
  })

  it("makes every segment's one limiter", async () => {
    const { contexts } = await mixAll({
      scene: sceneOf(VIDEO, loud.clip),
      range: { fromFrame: 0, toFrame: 90 },
      pcm: fakePcm(VIDEO, [loud]),
      segmentSeconds: 1,
    })
    for (const context of contexts) expect(context.compressors).toHaveLength(1)
  })
})
