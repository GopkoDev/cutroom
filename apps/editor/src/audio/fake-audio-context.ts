// A stand-in for an `AudioContext`, for unit tests: its clock moves only when the test moves it,
// and every node records what it was asked to do. Not imported by the app.

import type { TransportAudioContext } from "./transport"
import type { GraphBuffer, GraphBufferSource, GraphGain, GraphNode } from "./graph"

export interface FakeStart {
  readonly when: number
  readonly offset: number
  readonly duration: number
}

export class FakeNode implements GraphNode {
  readonly connections: GraphNode[] = []
  disconnected = 0

  connect(destination: GraphNode) {
    this.connections.push(destination)
    return destination
  }

  disconnect() {
    this.disconnected += 1
  }
}

export class FakeGain extends FakeNode implements GraphGain {
  readonly gain = { value: 0 }
}

export class FakeCompressor extends FakeNode {
  readonly threshold = { value: 0 }
  readonly knee = { value: 0 }
  readonly ratio = { value: 0 }
  readonly attack = { value: 0 }
  readonly release = { value: 0 }
}

export class FakeBuffer implements GraphBuffer {
  readonly data: Float32Array[]
  readonly length: number
  readonly sampleRate: number

  constructor(channels: number, length: number, sampleRate: number) {
    this.data = Array.from({ length: channels }, () => new Float32Array(length))
    this.length = length
    this.sampleRate = sampleRate
  }

  getChannelData(channel: number) {
    const data = this.data[channel]
    if (data === undefined) throw new RangeError(`no channel ${channel}`)
    return data
  }
}

export class FakeBufferSource extends FakeNode implements GraphBufferSource {
  buffer: GraphBuffer | null = null
  onended: ((event: Event) => void) | null = null
  started: FakeStart | null = null
  stopped = false
  /** The instant the last `stop(when)` asked for, or `null` for "now" (or never stopped). */
  stopWhen: number | null = null

  start(when: number, offset: number, duration: number) {
    if (this.started !== null) throw new Error("an AudioBufferSourceNode can be started once")
    this.started = { when, offset, duration }
  }

  stop(when?: number) {
    this.stopped = true
    this.stopWhen = when ?? null
  }

  /** What the audio thread does when the node has played out. */
  end() {
    this.onended?.(new Event("ended"))
  }
}

export class FakeAudioContext implements TransportAudioContext {
  currentTime = 0
  readonly destination = new FakeNode()
  readonly gains: FakeGain[] = []
  readonly sources: FakeBufferSource[] = []
  readonly compressors: FakeCompressor[] = []
  sampleRate = 48_000
  resumed = 0
  closed = false

  createGain() {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }

  createDynamicsCompressor() {
    const compressor = new FakeCompressor()
    this.compressors.push(compressor)
    return compressor
  }

  createBufferSource() {
    const source = new FakeBufferSource()
    this.sources.push(source)
    return source
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeBuffer(channels, length, sampleRate)
  }

  resume() {
    this.resumed += 1
    return Promise.resolve()
  }

  close() {
    this.closed = true
    return Promise.resolve()
  }

  /** The nodes that were started and not stopped, in the order they were made. */
  live() {
    return this.sources.filter((source) => source.started !== null && !source.stopped)
  }
}
