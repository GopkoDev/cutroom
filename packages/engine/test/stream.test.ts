import { describe, expect, it } from "vitest"

import type { Scene, SceneClip } from "@cutroom/model"

import type { SceneRenderer } from "../src/compose/renderer"
import { closeStreams, openStreams, renderByStreaming } from "../src/playback/stream"
import type { ClipSink, SinkSet } from "../src/sources/canvas-sink"

// The prepare-ahead of playback/stream.ts (sad.md §11) against a seek and a stop that arrive while
// a preparation is still building its sink (review R-13). The engine's decoders are not in this
// test: a fake SinkSet records what the stream logic asks of it, and gates `sinkForClip` so a
// preparation can be held in flight while the next job arrives.

interface FakeSink {
  readonly sink: ClipSink
  readonly opened: number[]
  isOpen(): boolean
}

function fakeSink(clip: SceneClip): FakeSink {
  let stream: { key: string; next: number } | null = null
  const opened: number[] = []
  const sink = {
    clipId: clip.clipId,
    sourceId: clip.sourceId,
    keyframeAt: async () => 0,
    release: () => undefined,
    openStream(key: string, first: number) {
      stream = { key, next: first }
      opened.push(first)
    },
    stream: () => stream,
    async pullStreamed(frame: number) {
      if (stream !== null) stream.next = frame + 1
      return { canvas: {}, placement: {} }
    },
    abandonStream() {
      stream = null
    },
  }
  return { sink: sink as unknown as ClipSink, opened, isOpen: () => stream !== null }
}

function fakeSinks() {
  const built = new Map<string, FakeSink>()
  const inFlight = new Map<string, number>()
  let mostInFlight = 0
  const gates = new Map<string, Promise<void>>()
  const set = {
    async sinkForClip(clip: SceneClip) {
      const now = (inFlight.get(clip.clipId) ?? 0) + 1
      inFlight.set(clip.clipId, now)
      mostInFlight = Math.max(mostInFlight, now)
      await gates.get(clip.clipId)
      inFlight.set(clip.clipId, (inFlight.get(clip.clipId) ?? 1) - 1)
      let held = built.get(clip.clipId)
      if (held === undefined) {
        held = fakeSink(clip)
        built.set(clip.clipId, held)
      }
      return held.sink
    },
    abandonStreams() {
      for (const held of built.values()) held.sink.abandonStream()
    },
    forgetSource: () => undefined,
    retainSinks: () => undefined,
  }
  return {
    sinks: set as unknown as SinkSet,
    built,
    mostInFlight: () => mostInFlight,
    /** Holds `sinkForClip(clipId)` until the returned function is called. */
    hold(clipId: string): () => void {
      let open: () => void = () => undefined
      gates.set(
        clipId,
        new Promise<void>((resolve) => {
          open = resolve
        })
      )
      return () => {
        gates.delete(clipId)
        open()
      }
    },
  }
}

const clip = (clipId: string, startFrame: number): SceneClip => ({
  clipId,
  sourceId: "source-1",
  startFrame,
  durationFrames: 100,
  sourceInPoint: { numerator: 0, denominator: 1 },
})

const scene = {
  timebase: { numerator: 30, denominator: 1 },
  frameSize: { width: 1920, height: 1080 },
  clips: [clip("a", 0), clip("b", 100)],
} as unknown as Scene

const renderer = { name: "fake", renderScene: () => undefined } as unknown as SceneRenderer

const ticks = async (n = 10) => {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

describe("a Clip prepared ahead of its start", () => {
  it("is opened once at its first Frame, in the background, while Playing", async () => {
    const fake = fakeSinks()
    await renderByStreaming(fake.sinks, renderer, scene, 90, 15)
    await ticks()
    expect(fake.built.get("b")?.opened).toEqual([100])
  })

  it("a seek onto it while its preparation is in flight waits for it: one sink build at a time, one stream", async () => {
    const fake = fakeSinks()
    const open = fake.hold("b")
    await renderByStreaming(fake.sinks, renderer, scene, 90, 15)

    const seek = openStreams(fake.sinks, scene, 100)
    await ticks()
    expect(fake.mostInFlight(), "two sinks built for b at once").toBe(1)
    open()
    await seek

    expect(fake.mostInFlight()).toBe(1)
    // The preparation opened b at 100; the seek to 100 walks it rather than reopening.
    expect(fake.built.get("b")?.opened).toEqual([100])
  })

  it("a stop while its preparation is in flight leaves no stream open behind it", async () => {
    const fake = fakeSinks()
    const open = fake.hold("b")
    await renderByStreaming(fake.sinks, renderer, scene, 90, 15)

    const stop = closeStreams(fake.sinks)
    await ticks()
    open()
    await stop

    for (const [id, held] of fake.built) expect(held.isOpen(), `${id}'s stream`).toBe(false)
  })
})
