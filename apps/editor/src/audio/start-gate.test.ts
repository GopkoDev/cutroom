import { describe, expect, it } from "vitest"

import { frameToSampleIndex, type SceneClip, type Timebase } from "@cutroom/model"

import type { PcmChunk } from "./graph"
import { createStartGate } from "./start-gate"

// The gate's one question: is the sound for the start of playback in hand? At 30/1 and 48 kHz a
// Frame is 1600 samples; the window here is 15 Frames (half a second), from Frame 30.

const VIDEO: Timebase = { numerator: 30, denominator: 1 }
const RATE = 48_000

const clip = (clipId: string, startFrame: number, durationFrames: number): SceneClip => ({
  clipId,
  sourceId: `source-${clipId}`,
  startFrame,
  durationFrames,
  sourceInPoint: { numerator: 0, denominator: 1 },
})

/** PCM for `clipId` over Frames `[from, until)`. */
const pcm = (clipId: string, from: number, until: number): PcmChunk => {
  const start = frameToSampleIndex(VIDEO, RATE, from)
  return {
    clipId,
    sampleRate: RATE,
    startSample: start,
    channels: [new Float32Array(frameToSampleIndex(VIDEO, RATE, until) - start)],
  }
}

const gate = (clips: SceneClip[]) =>
  createStartGate({ timebase: VIDEO, fromFrame: 30, windowFrames: 15, clips })

describe("the start gate", () => {
  it("is ready at once with nothing expected to sound", () => {
    expect(gate([]).ready()).toBe(true)
  })

  it("waits for contiguous sound across the window, in any order of arrival", () => {
    const g = gate([clip("a", 0, 300)])
    g.hold(pcm("a", 37, 60))
    expect(g.ready()).toBe(false)
    g.hold(pcm("a", 30, 36))
    expect(g.ready(), "a Frame's gap").toBe(false)
    g.hold(pcm("a", 36, 37))
    expect(g.ready()).toBe(true)
  })

  it("asks of a Clip only its part of the window", () => {
    // Ends inside the window: up to its end. Starts inside it: from its start.
    const g = gate([clip("ends", 0, 35), clip("starts", 40, 100)])
    g.hold(pcm("ends", 30, 35))
    expect(g.ready()).toBe(false)
    g.hold(pcm("starts", 40, 45))
    expect(g.ready()).toBe(true)
  })

  it("does not wait for a Clip outside the window", () => {
    const g = gate([clip("a", 0, 300), clip("later", 45, 100), clip("over", 0, 30)])
    g.hold(pcm("a", 30, 45))
    expect(g.ready()).toBe(true)
  })

  it("keeps what it held, in arrival order", () => {
    const g = gate([clip("a", 0, 300)])
    const first = pcm("a", 40, 50)
    const second = pcm("a", 30, 40)
    g.hold(first)
    g.hold(second)
    expect(g.held()).toEqual([first, second])
  })
})
