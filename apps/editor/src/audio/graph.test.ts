import { describe, expect, it } from "vitest"

import { frameToSampleIndex, type Scene, type SceneClip, type Timebase } from "@cutroom/model"

import { FakeAudioContext, type FakeBufferSource } from "./fake-audio-context"
import { createAudioGraph, LOOKAHEAD_SECONDS, type PcmChunk } from "./graph"

// What the graph promises is *when* each piece of sound starts on the audio clock, and that no
// sample of a Clip is heard twice or outside its Clip. The context is a fake whose clock moves only
// when a test moves it, so every start time below is an exact expectation, not a tolerance on a
// race.

const RATE = 48_000
const VIDEO: Timebase = { numerator: 30, denominator: 1 }
const NTSC: Timebase = { numerator: 30000, denominator: 1001 }

const CLIP: SceneClip = {
  clipId: "clip-1",
  sourceId: "source-1",
  startFrame: 30,
  durationFrames: 300,
  sourceInPoint: { numerator: 0, denominator: 1 },
}

function sceneOf(clips: readonly SceneClip[], timebase = VIDEO): Scene {
  return { timebase, frameSize: { width: 640, height: 360 }, clips }
}

/** A chunk of `length` samples for `clip`, starting at Timeline sample `startSample`. */
function chunk(startSample: number, length: number, clipId = CLIP.clipId): PcmChunk {
  return {
    clipId,
    sampleRate: RATE,
    startSample,
    channels: [new Float32Array(length).fill(0.5), new Float32Array(length).fill(-0.5)],
  }
}

/** Clip 1 begins at Frame 30, which is 1 s and sample 48 000 on the Timeline. */
const CLIP_START_SAMPLE = frameToSampleIndex(VIDEO, RATE, CLIP.startFrame)

/** A graph playing from the Clip's first Frame, which sounds at 1.0 on the audio clock. */
function playing(clips: readonly SceneClip[] = [CLIP]) {
  const context = new FakeAudioContext()
  context.currentTime = 0.9
  const graph = createAudioGraph({ context })
  graph.setScene(sceneOf(clips))
  graph.start({ frame: 30, contextSeconds: 1 })
  return { context, graph }
}

describe("the graph's nodes", () => {
  it("gives every Clip a unity gain node into the destination, and drops one that leaves", () => {
    const context = new FakeAudioContext()
    const graph = createAudioGraph({ context })
    const other = { ...CLIP, clipId: "clip-2", startFrame: 330 }
    graph.setScene(sceneOf([CLIP, other]))

    expect(context.gains).toHaveLength(2)
    for (const gain of context.gains) {
      expect(gain.gain.value).toBe(1)
      expect(gain.connections).toEqual([context.destination])
    }

    graph.setScene(sceneOf([other]))
    expect(context.gains[0]?.disconnected).toBe(1)
    expect(context.gains[1]?.disconnected).toBe(0)
    expect(context.gains).toHaveLength(2)
  })

  it("routes a chunk's node through its own Clip's gain, with the chunk's samples", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))

    const [node] = context.sources
    expect(node?.connections).toEqual([context.gains[0]])
    const buffer = node?.buffer as unknown as { data: Float32Array[]; sampleRate: number }
    expect(buffer.sampleRate).toBe(RATE)
    expect(buffer.data[0]?.[0]).toBe(0.5)
    expect(buffer.data[1]?.[4799]).toBe(-0.5)
  })
})

describe("scheduling", () => {
  it("starts a chunk at the instant its first sample belongs on the audio clock", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))

    expect(context.sources).toHaveLength(1)
    const start = context.sources[0]?.started
    expect(start?.when).toBe(1)
    expect(start?.offset).toBe(0)
    expect(start?.duration).toBeCloseTo(0.1, 12)
  })

  it("butts consecutive chunks end to start, with no gap and no overlap", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    graph.receive(chunk(CLIP_START_SAMPLE + 4800, 4800))

    const [first, second] = context.sources.map((source) => source.started)
    expect(second?.when).toBeCloseTo((first?.when ?? 0) + (first?.duration ?? 0), 12)
  })

  it("holds a chunk beyond the lookahead until the clock comes within it", () => {
    const { context, graph } = playing()
    // Two seconds into the Clip, which sounds at 3.0.
    graph.receive(chunk(CLIP_START_SAMPLE + 2 * RATE, 4800))
    expect(context.sources).toHaveLength(0)
    expect(graph.pending().queued).toBe(1)

    context.currentTime = 3 - LOOKAHEAD_SECONDS + 0.01
    graph.pump()
    expect(context.sources[0]?.started?.when).toBe(3)
    expect(graph.pending()).toEqual({ scheduled: 1, queued: 0 })
  })

  it("plays the part of a late chunk still ahead, keeping it on the clock", () => {
    const { context, graph } = playing()
    context.currentTime = 1.05
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))

    const start = context.sources[0]?.started
    expect(start?.when).toBe(1.05)
    expect(start?.offset).toBeCloseTo(0.05, 12)
    expect(start?.duration).toBeCloseTo(0.05, 12)
  })

  it("drops a chunk that is entirely in the past", () => {
    const { context, graph } = playing()
    context.currentTime = 1.2
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    expect(context.sources).toHaveLength(0)
    expect(graph.pending()).toEqual({ scheduled: 0, queued: 0 })
  })

  it("trims a chunk to its Clip's last Frame", () => {
    const { context, graph } = playing()
    const clipEnd = frameToSampleIndex(VIDEO, RATE, CLIP.startFrame + CLIP.durationFrames)
    context.currentTime = 10.9
    graph.receive(chunk(clipEnd - 2400, 4800))

    const start = context.sources[0]?.started
    expect(start?.when).toBeCloseTo(10.95, 12)
    expect(start?.duration).toBeCloseTo(0.05, 12)
  })

  it("drops a chunk for a Clip that is not in the Scene", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800, "clip-gone"))
    expect(context.sources).toHaveLength(0)
  })

  it("ignores chunks while stopped", () => {
    const context = new FakeAudioContext()
    const graph = createAudioGraph({ context })
    graph.setScene(sceneOf([CLIP]))
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    expect(context.sources).toHaveLength(0)
    expect(graph.pending().queued).toBe(0)
  })
})

describe("no sample is heard twice", () => {
  it("schedules a chunk that arrives twice once", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    expect(context.sources).toHaveLength(1)
  })

  it("schedules only the new part of a chunk that overlaps one already scheduled", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    graph.receive(chunk(CLIP_START_SAMPLE + 2400, 4800))

    expect(context.sources).toHaveLength(2)
    const second = context.sources[1]?.started
    expect(second?.when).toBeCloseTo(1.1, 12)
    expect(second?.offset).toBeCloseTo(0.05, 12)
    expect(second?.duration).toBeCloseTo(0.05, 12)
  })

  it("fills the gap around a chunk that arrived ahead of its neighbours", () => {
    const { context, graph } = playing()
    // A chunk from a replaced run lands first, further on; the new run's PCM then covers it.
    graph.receive(chunk(CLIP_START_SAMPLE + 4800, 2400))
    graph.receive(chunk(CLIP_START_SAMPLE, 12_000))

    const starts = context.sources.map((source) => source.started)
    expect(starts).toHaveLength(3)
    expect(starts[1]?.when).toBe(1)
    expect(starts[1]?.duration).toBeCloseTo(0.1, 12)
    expect(starts[2]?.when).toBeCloseTo(1.15, 12)
    expect(starts[2]?.offset).toBeCloseTo(0.15, 12)
    expect(starts[2]?.duration).toBeCloseTo(0.1, 12)
  })
})

describe("sessions", () => {
  it("silences what was scheduled and forgets what was queued on stop", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    graph.receive(chunk(CLIP_START_SAMPLE + 2 * RATE, 4800))
    graph.stop()

    expect(context.sources[0]?.stopped).toBe(true)
    expect(graph.pending()).toEqual({ scheduled: 0, queued: 0 })
    context.currentTime = 3
    graph.pump()
    expect(context.sources).toHaveLength(1)
  })

  it("starts a new session clean, so the same sound can be played again", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    context.currentTime = 5
    graph.start({ frame: 30, contextSeconds: 5.1 })
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))

    expect(context.sources[0]?.stopped).toBe(true)
    expect(context.sources[1]?.started?.when).toBe(5.1)
  })

  it("lets go of a node when it has played out", () => {
    const { context, graph } = playing()
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    context.sources[0]?.end()
    expect(graph.pending().scheduled).toBe(0)
    expect(context.sources[0]?.disconnected).toBe(1)
  })
})

describe("a seek while playing (US2 scenario 3)", () => {
  /** Timeline sample of Frame `frame` at the test's rate. */
  const sampleOf = (frame: number) => frameToSampleIndex(VIDEO, RATE, frame)

  function expectStart(node: FakeBufferSource | undefined, when: number, duration: number) {
    expect(node?.started?.when).toBe(when)
    expect(node?.started?.offset).toBe(0)
    expect(node?.started?.duration).toBeCloseTo(duration, 12)
  }

  /** Playing from Frame 30 at 1.0 with a whole second of the Clip scheduled, then seeking. */
  function seeked(toFrame: number, now = 1.2, at = 1.3) {
    const setup = playing()
    setup.graph.receive(chunk(CLIP_START_SAMPLE, RATE))
    setup.context.currentTime = now
    setup.graph.seek({ frame: toFrame, contextSeconds: at })
    return setup
  }

  it("cuts the old position exactly where the new one begins, so there is no gap and no overlap", () => {
    const { context, graph } = seeked(150)
    graph.receive(chunk(sampleOf(150), 4800))

    const [old, next] = context.sources
    // The old sound plays on until the hand-over and not a sample beyond it.
    expect(old?.started?.when).toBe(1)
    expect(old?.stopWhen).toBe(1.3)
    // The new position's first sample sounds at the hand-over.
    expectStart(next, 1.3, 0.1)
    expect(next?.stopped).toBe(false)
  })

  it("trims stale PCM from before the new position, so nothing sounds ahead of it", () => {
    const { context, graph } = seeked(150)
    // A chunk of the replaced run, still in the channel, beginning 10 Frames before the seek.
    graph.receive(chunk(sampleOf(140), 2 * RATE))

    const next = context.sources[1]
    expect(next?.started?.when).toBe(1.3)
    expect(next?.started?.offset).toBeCloseTo(10 / 30, 12)
  })

  it("places decoded sound again against the new anchor, and only once", () => {
    // Back to the Clip's start: the cut chunk is the right sound for it, and is played again.
    const { context, graph } = seeked(30)
    expect(context.sources).toHaveLength(2)
    expectStart(context.sources[1], 1.3, 1)

    // The new run's PCM for the same samples is a repeat.
    graph.receive(chunk(CLIP_START_SAMPLE, RATE))
    expect(context.sources).toHaveLength(2)
  })

  it("keeps a chunk that was still queued, for the new position to use", () => {
    const { context, graph } = playing()
    const later = chunk(sampleOf(90), 4800) // 2 s after the anchor: beyond the lookahead
    graph.receive(later)
    expect(graph.pending().queued).toBe(1)

    context.currentTime = 1.2
    graph.seek({ frame: 90, contextSeconds: 1.3 })
    expectStart(context.sources[0], 1.3, 0.1)
  })

  it("never lets a second seek bring the first one's old sound back", () => {
    const { context, graph } = seeked(150)
    context.currentTime = 1.25
    graph.seek({ frame: 200, contextSeconds: 1.35 })
    expect(context.sources[0]?.stopWhen).toBe(1.3)
  })

  it("is a start when nothing is playing", () => {
    const context = new FakeAudioContext()
    const graph = createAudioGraph({ context })
    context.currentTime = 0.9
    graph.setScene(sceneOf([CLIP]))
    graph.seek({ frame: 30, contextSeconds: 1 })
    graph.receive(chunk(CLIP_START_SAMPLE, 4800))
    expect(context.sources[0]?.started?.when).toBe(1)
  })
})

describe("ten minutes at 30000/1001 (FR-013)", () => {
  it("keeps every chunk butted to the last and the last on the exact clock", () => {
    const context = new FakeAudioContext()
    const graph = createAudioGraph({ context })
    const clip = { ...CLIP, startFrame: 0, durationFrames: 17_983 }
    graph.setScene(sceneOf([clip], NTSC))
    graph.start({ frame: 0, contextSeconds: 0.1 })

    const length = 4800
    const end = frameToSampleIndex(NTSC, RATE, 17_982)
    for (let sample = 0; sample < end; sample += length) {
      context.currentTime = 0.1 + sample / RATE - 0.2
      graph.receive(chunk(sample, length))
    }

    const starts = context.sources.map((source) => source.started)
    expect(starts).toHaveLength(Math.ceil(end / length))
    for (let index = 1; index < starts.length; index += 1) {
      const previous = starts[index - 1]
      expect(starts[index]?.when).toBeCloseTo((previous?.when ?? 0) + (previous?.duration ?? 0), 9)
    }
    const last = starts.at(-1)
    const lastSample = (starts.length - 1) * length
    expect(last?.when).toBeCloseTo(0.1 + lastSample / RATE, 9)
  })
})
