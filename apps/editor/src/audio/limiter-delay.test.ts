import { describe, expect, it, vi } from "vitest"

import { FakeBuffer, FakeBufferSource, FakeCompressor, FakeNode } from "./fake-audio-context"
import { LIMITER } from "./graph"
import { measureLimiterDelay } from "./limiter-delay"

// The delay is measured, not assumed (ADR 0022): an impulse of 0.5 is rendered through a compressor
// with the limiter's settings and the delay is where the loudest sample lands. The offline context
// here is a fake whose rendered peak sits where the test puts it.

class FakeOffline {
  readonly destination = new FakeNode()
  readonly sources: FakeBufferSource[] = []
  readonly compressors: FakeCompressor[] = []
  readonly buffers: FakeBuffer[] = []

  readonly length: number
  readonly sampleRate: number
  private readonly peakAt: number

  constructor(length: number, sampleRate: number, peakAt: number) {
    this.length = length
    this.sampleRate = sampleRate
    this.peakAt = peakAt
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const buffer = new FakeBuffer(channels, length, sampleRate)
    this.buffers.push(buffer)
    return buffer
  }

  createBufferSource() {
    const source = new FakeBufferSource()
    this.sources.push(source)
    return source
  }

  createDynamicsCompressor() {
    const compressor = new FakeCompressor()
    this.compressors.push(compressor)
    return compressor
  }

  startRendering() {
    const out = new Float32Array(this.length)
    out[this.peakAt] = 0.4
    out[this.peakAt + 3] = -0.1
    return Promise.resolve({ getChannelData: () => out })
  }
}

function factory(peakAt = 288) {
  const made: FakeOffline[] = []
  const createOffline = vi.fn((length: number, sampleRate: number) => {
    const context = new FakeOffline(length, sampleRate, peakAt)
    made.push(context)
    return context
  })
  return { made, createOffline }
}

describe("measureLimiterDelay", () => {
  it("is where the rendered impulse peaks, in seconds", async () => {
    const { createOffline } = factory(288)
    await expect(measureLimiterDelay(48_000, createOffline)).resolves.toBe(288 / 48_000)
  })

  it("is 0 when the impulse comes out where it went in", async () => {
    const { createOffline } = factory(0)
    await expect(measureLimiterDelay(44_100, createOffline)).resolves.toBe(0)
  })

  it("renders a 0.5 impulse at sample 0 through a compressor with the limiter's settings", async () => {
    const { made, createOffline } = factory()
    await measureLimiterDelay(32_000, createOffline)

    expect(createOffline).toHaveBeenCalledWith(expect.any(Number), 32_000)
    const [context] = made
    expect(context!.length).toBeGreaterThan(0)
    expect(context!.compressors).toHaveLength(1)
    const compressor = context!.compressors[0]!
    expect(compressor.threshold.value).toBe(LIMITER.threshold)
    expect(compressor.knee.value).toBe(LIMITER.knee)
    expect(compressor.ratio.value).toBe(LIMITER.ratio)
    expect(compressor.attack.value).toBe(LIMITER.attack)
    expect(compressor.release.value).toBe(LIMITER.release)

    const [impulse] = context!.buffers
    expect(impulse!.getChannelData(0)[0]).toBe(0.5)
    expect(impulse!.getChannelData(0)[1]).toBe(0)
    const [source] = context!.sources
    expect(source!.buffer).toBe(impulse)
    expect(source!.started).not.toBeNull()
    expect(source!.connections).toEqual([compressor])
    expect(compressor.connections).toEqual([context!.destination])
  })

  it("measures once per sample rate", async () => {
    const { createOffline } = factory(96)
    const first = await measureLimiterDelay(22_050, createOffline)
    const again = await measureLimiterDelay(22_050, createOffline)
    expect(again).toBe(first)
    expect(createOffline).toHaveBeenCalledTimes(1)

    await measureLimiterDelay(24_000, createOffline)
    expect(createOffline).toHaveBeenCalledTimes(2)
  })
})
