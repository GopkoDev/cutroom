// How late the master bus's limiter emits what goes into it, measured (ADR 0022).
//
// A `DynamicsCompressorNode` looks ahead, so its output trails its input by a fixed number of
// samples that depends on the context's sample rate and that the Web Audio specification does not
// give a value for. Assuming one would put the sound out of step with the picture, so it is
// measured: an impulse of 0.5 — below the limiter's threshold, so the limiter does not reshape it —
// is rendered through a compressor with the limiter's own settings (`LIMITER`) in a short
// `OfflineAudioContext`, and the delay is where the loudest sample of the result lands, in
// seconds. The graph then schedules every chunk that much earlier (graph.ts), in Playback and in
// Export alike.
//
// It is measured once per sample rate and the answer kept: a context's rate does not change, and
// the render takes a few milliseconds. The cache holds the promise, so concurrent askers share one
// render. The sample index is divided by the rate here, which is the one place a sample count
// becomes seconds outside the model: it is a reading of the render, not a position on the Timeline.

import { configureLimiter, type GraphBuffer, type GraphCompressor, type GraphNode } from "./graph"

/** Samples rendered: far longer than any limiter's look-ahead at any rate. */
const MEASURE_SECONDS = 0.25

/** The slice of an `OfflineAudioContext` the measurement uses. */
export interface MeasureContext {
  readonly destination: GraphNode
  createBuffer(channels: number, length: number, sampleRate: number): GraphBuffer
  createBufferSource(): GraphNode & {
    buffer: GraphBuffer | null
    start(when: number, offset: number, duration: number): void
  }
  createDynamicsCompressor(): GraphCompressor
  startRendering(): Promise<{ getChannelData(channel: number): Float32Array }>
}

export type CreateMeasureContext = (length: number, sampleRate: number) => MeasureContext

const measured = new Map<number, Promise<number>>()

/** The limiter's delay at `sampleRate`, in seconds. */
export function measureLimiterDelay(
  sampleRate: number,
  createOffline: CreateMeasureContext
): Promise<number> {
  let delay = measured.get(sampleRate)
  if (delay === undefined) {
    delay = render(sampleRate, createOffline)
    measured.set(sampleRate, delay)
    // A failed measurement is not remembered: the next ask tries again.
    delay.catch(() => measured.delete(sampleRate))
  }
  return delay
}

async function render(sampleRate: number, createOffline: CreateMeasureContext): Promise<number> {
  const length = Math.ceil(sampleRate * MEASURE_SECONDS)
  const context = createOffline(length, sampleRate)
  const impulse = context.createBuffer(1, length, sampleRate)
  impulse.getChannelData(0)[0] = 0.5
  const source = context.createBufferSource()
  source.buffer = impulse
  const limiter = context.createDynamicsCompressor()
  configureLimiter(limiter)
  source.connect(limiter)
  limiter.connect(context.destination)
  source.start(0, 0, length / sampleRate)
  const rendered = (await context.startRendering()).getChannelData(0)

  let peak = 0
  for (let index = 1; index < rendered.length; index += 1) {
    if (Math.abs(rendered[index]!) > Math.abs(rendered[peak]!)) peak = index
  }
  return peak / sampleRate
}

/**
 * The delay in the browser: `0` where there is no `OfflineAudioContext` or the measurement fails —
 * sound a few milliseconds out of step is better than none (ADR 0022).
 */
export async function measureBrowserLimiterDelay(sampleRate: number): Promise<number> {
  if (typeof OfflineAudioContext === "undefined") return 0
  try {
    return await measureLimiterDelay(
      sampleRate,
      (length, rate) => new OfflineAudioContext(1, length, rate)
    )
  } catch {
    return 0
  }
}
