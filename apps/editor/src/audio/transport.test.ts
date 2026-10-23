import { describe, expect, it, vi } from "vitest"

import type { EngineEvent } from "@cutroom/engine/protocol"
import { frameToSampleIndex, importCommands, type Source } from "@cutroom/model"

import { createEditorStore } from "@/store"

import { FakeAudioContext } from "./fake-audio-context"
import { START_MARGIN_SECONDS } from "./clock"
import {
  createTransport,
  START_WAIT_LIMIT_MS,
  type AnimationFrames,
  type TransportEngine,
} from "./transport"

// The transport's promises are about who asks the engine for which Frame and when, and where the
// Playhead is left. The store is the real one; the engine, the audio context and the display's
// animation frames are stand-ins the test steps by hand.

const SOURCE: Source = {
  id: "source-1",
  name: "sync-1080p30.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 4096, lastModified: 1_750_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028" },
}

function projectStore(source: Source = SOURCE) {
  const store = createEditorStore({
    saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
    loadProject: vi.fn(async () => undefined),
  })
  store.getState().newProject()
  store.getState().transact("Import", () => {
    for (const command of importCommands(null, {
      at: "2026-10-22T10:00:00.000Z",
      source,
      clipId: "clip-1",
      projectId: "project-1",
      trackId: "track-1",
    })) {
      store.getState().run(command)
    }
  })
  return store
}

function fakeEngine() {
  const listeners = new Map<string, Set<(event: EngineEvent) => void>>()
  const engine = {
    renderFrame: vi.fn<TransportEngine["renderFrame"]>(),
    setTransport: vi.fn<TransportEngine["setTransport"]>(),
    on: ((type: string, listener: (event: EngineEvent) => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
      return () => {
        set.delete(listener)
      }
    }) as TransportEngine["on"],
    emit(event: EngineEvent) {
      for (const listener of listeners.get(event.type) ?? []) listener(event)
    },
  }
  return engine
}

/** Animation frames that run only when the test says a display frame has passed. */
function fakeFrames() {
  let next = 1
  const waiting = new Map<number, () => void>()
  const frames: AnimationFrames & { step(): void; waiting(): number } = {
    request(callback) {
      const handle = next++
      waiting.set(handle, callback)
      return handle
    },
    cancel(handle) {
      waiting.delete(handle)
    },
    step() {
      const due = [...waiting.values()]
      waiting.clear()
      for (const callback of due) callback()
    },
    waiting: () => waiting.size,
  }
  return frames
}

function rendered(frame: number): EngineEvent {
  return { type: "frame-rendered", frame, revision: 1, skipped: 0 }
}

/** A second of the Clip's sound from `frame`, as the engine would post it. */
function pcmAt(
  store: ReturnType<typeof projectStore>,
  frame: number,
  seconds = 1
): Extract<EngineEvent, { type: "audio-pcm" }> {
  return {
    type: "audio-pcm",
    sourceId: SOURCE.id,
    clipId: store.getState().scene?.clips[0]?.clipId ?? "",
    sampleRate: 48_000,
    startSample: frameToSampleIndex(SOURCE.timebase, 48_000, frame),
    channels: [new Float32Array(48_000 * seconds)],
  }
}

function setup(source: Source = SOURCE) {
  const store = projectStore(source)
  const engine = fakeEngine()
  const context = new FakeAudioContext()
  const createContext = vi.fn(() => context)
  const frames = fakeFrames()
  const clock = { ms: 0 }
  const transport = createTransport({
    store,
    engine,
    createContext,
    animationFrames: frames,
    now: () => clock.ms,
  })
  /**
   * Plays, and has the engine answer with a second of sound from where playback starts: the start's
   * sound in hand at once, so the clock is anchored the start margin after `currentTime` 0.
   */
  const start = () => {
    transport.play()
    engine.emit(pcmAt(store, store.getState().playheadFrame))
  }
  /** Moves the audio clock to `seconds` after the start margin — i.e. after the sound began. */
  const soundFor = (seconds: number) => {
    context.currentTime = START_MARGIN_SECONDS + seconds
    frames.step()
  }
  return { store, engine, context, createContext, frames, transport, start, soundFor, clock }
}

const clockRequests = (engine: ReturnType<typeof fakeEngine>) =>
  engine.renderFrame.mock.calls.filter(([, reason]) => reason === "clock").map(([frame]) => frame)

describe("play", () => {
  it("does nothing without a Project", () => {
    const store = createEditorStore({
      saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
      loadProject: vi.fn(async () => undefined),
    })
    const engine = fakeEngine()
    const createContext = vi.fn(() => new FakeAudioContext())
    createTransport({ store, engine, createContext, animationFrames: fakeFrames() }).play()

    expect(store.getState().transport).toBe("stopped")
    expect(createContext).not.toHaveBeenCalled()
    expect(engine.setTransport).not.toHaveBeenCalled()
  })

  it("makes the audio context on the first press, not before, and resumes it", () => {
    const { createContext, context, transport, start } = setup()
    expect(createContext).not.toHaveBeenCalled()
    start()
    transport.stop()
    start()
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(context.resumed).toBe(2)
  })

  it("starts from the Playhead, in the store and in the engine", () => {
    const { store, engine, start } = setup()
    store.getState().setPlayhead(45)
    start()

    expect(store.getState().transport).toBe("playing")
    expect(engine.setTransport).toHaveBeenCalledWith("playing", 45)
    expect(clockRequests(engine)).toEqual([45])
  })

  it("asks for the clock's Frame on each display frame, once per Frame, never as a scrub", () => {
    const { engine, soundFor, start } = setup()
    start()

    soundFor(0.5 / 30) // still Frame 0: not asked again
    soundFor(1 / 30)
    soundFor(1.5 / 30) // a 60 Hz display over 30 fps shows Frame 1 twice
    soundFor(4 / 30) // a stalled display skips Frames 2 and 3
    soundFor(8)

    expect(clockRequests(engine)).toEqual([0, 1, 4, 240])
    expect(engine.renderFrame.mock.calls.every(([, reason]) => reason === "clock")).toBe(true)
  })

  it("is a no-op while already playing", () => {
    const { engine, start } = setup()
    start()
    start()
    expect(engine.setTransport).toHaveBeenCalledTimes(1)
  })
})

describe("the Playhead while playing", () => {
  it("follows the Frames the engine drew, not the clock", () => {
    const { store, engine, soundFor, start } = setup()
    start()
    soundFor(5 / 30)
    expect(store.getState().playheadFrame).toBe(0)

    engine.emit(rendered(3))
    expect(store.getState().playheadFrame).toBe(3)
  })

  it("does not move for a Frame from before playback started — a scrub still in flight", () => {
    const { store, engine, soundFor, start } = setup()
    store.getState().setPlayhead(60)
    start()
    soundFor(1)
    engine.emit(rendered(12))
    expect(store.getState().playheadFrame).toBe(60)
  })
})

describe("stop", () => {
  it("leaves the Playhead on the Frame that was showing, not the one the clock reached (FR-014)", () => {
    const { store, engine, transport, soundFor, start } = setup()
    start()
    soundFor(10 / 30)
    engine.emit(rendered(8))
    soundFor(12 / 30)
    transport.stop()

    expect(store.getState().playheadFrame).toBe(8)
    expect(store.getState().transport).toBe("stopped")
    expect(engine.setTransport).toHaveBeenLastCalledWith("stopped", 8)
  })

  it("leaves the Playhead where it started if nothing was drawn", () => {
    const { store, transport, soundFor, start } = setup()
    store.getState().setPlayhead(20)
    start()
    soundFor(1)
    transport.stop()
    expect(store.getState().playheadFrame).toBe(20)
  })

  it("stops asking for Frames and stops the sound", () => {
    const { engine, context, frames, transport, soundFor, start } = setup()
    start()
    expect(context.live()).toHaveLength(1)

    transport.stop()
    expect(frames.waiting()).toBe(0)
    expect(context.live()).toHaveLength(0)
    const asked = engine.renderFrame.mock.calls.length
    soundFor(2)
    expect(engine.renderFrame.mock.calls.length).toBe(asked)
  })

  it("is a no-op while stopped", () => {
    const { engine, transport } = setup()
    transport.stop()
    expect(engine.setTransport).not.toHaveBeenCalled()
  })

  it("toggles between the two", () => {
    const { store, transport } = setup()
    transport.toggle()
    expect(store.getState().transport).toBe("playing")
    transport.toggle()
    expect(store.getState().transport).toBe("stopped")
  })
})

describe("sound", () => {
  it("schedules the engine's PCM on the same anchor the clock reads", () => {
    const { store, engine, context, start } = setup()
    store.getState().setPlayhead(30)
    start()
    const clipId = store.getState().scene?.clips[0]?.clipId ?? ""

    engine.emit({
      type: "audio-pcm",
      sourceId: SOURCE.id,
      clipId,
      sampleRate: 48_000,
      startSample: frameToSampleIndex(SOURCE.timebase, 48_000, 30),
      channels: [new Float32Array(4800), new Float32Array(4800)],
    })

    // Frame 30 is where playback started, so its first sample sounds when the clock's anchor does.
    expect(context.sources[0]?.started?.when).toBe(START_MARGIN_SECONDS)
  })
})

describe("starting when the sound is ready (T070, FR-012)", () => {
  it("holds the starting Frame, unanchored, until the start's sound is in hand", () => {
    const { store, engine, context, frames, transport } = setup()
    store.getState().setPlayhead(30)
    transport.play()
    context.currentTime = 0.4
    frames.step()
    // The picture of the starting Frame is asked for; the clock has not moved off it.
    expect(clockRequests(engine)).toEqual([30])

    // A quarter of a second is not the half second a start waits for…
    const quarter = pcmAt(store, 30, 0.25)
    engine.emit(quarter)
    expect(context.sources).toHaveLength(0)

    // …and with the rest in hand, playback is anchored a margin ahead of the clock as it reads now,
    // with the first sample of the start sounding exactly there.
    context.currentTime = 0.45
    engine.emit({
      ...pcmAt(store, 30, 1),
      startSample: frameToSampleIndex(SOURCE.timebase, 48_000, 30) + 12_000,
    })
    expect(context.sources[0]?.started?.when).toBe(0.45 + START_MARGIN_SECONDS)
    expect(context.sources[0]?.started?.offset).toBe(0)
    expect(context.sources[1]?.started?.when).toBeCloseTo(0.45 + START_MARGIN_SECONDS + 0.25, 9)

    context.currentTime = 0.45 + START_MARGIN_SECONDS + 1 / 30
    frames.step()
    expect(clockRequests(engine)).toEqual([30, 31])
  })

  it("does not wait for a Clip whose Source is Offline", () => {
    const { store, engine, context, frames, transport } = setup()
    store.getState().markSource(SOURCE.id, "offline", { reason: "unreachable" })
    transport.play()
    context.currentTime = START_MARGIN_SECONDS + 1
    frames.step()
    expect(clockRequests(engine)).toEqual([0, 30])
  })

  it("goes ahead without the sound once it has waited START_WAIT_LIMIT_MS", () => {
    const { engine, context, frames, transport, clock } = setup()
    transport.play()
    context.currentTime = 0.2
    clock.ms = START_WAIT_LIMIT_MS - 1
    frames.step()
    expect(clockRequests(engine)).toEqual([0])

    clock.ms = START_WAIT_LIMIT_MS
    frames.step()
    context.currentTime = 0.2 + START_MARGIN_SECONDS + 1
    frames.step()
    expect(clockRequests(engine)).toEqual([0, 30])
  })
})

describe("a seek while playing (T066, US2 scenario 3)", () => {
  it("re-anchors on the new Frame without stopping, and tells the engine it is a seek", () => {
    const { store, engine, soundFor, start } = setup()
    start()
    soundFor(1)
    store.getState().setPlayhead(200)

    // A second `playing`, never a `stopped` in between: that is how the worker tells a seek.
    expect(engine.setTransport.mock.calls).toEqual([
      ["playing", 0],
      ["playing", 200],
    ])
    expect(clockRequests(engine).at(-1)).toBe(200)
    expect(store.getState().transport).toBe("playing")
    expect(store.getState().playheadFrame).toBe(200)
  })

  it("hands the sound over from the old position to the new one at one instant", () => {
    const { store, engine, context, transport, soundFor } = setup()
    transport.play()
    engine.emit(pcmAt(store, 0, 2))
    soundFor(0.5)
    store.getState().setPlayhead(200)

    // The old position plays on while the new one's sound is not in hand…
    const [old] = context.sources
    expect(old?.stopWhen).toBeNull()
    context.currentTime = 0.6

    // …and once it is, the old is cut START_MARGIN_SECONDS ahead and the new one's first sample
    // sounds at that same instant: no gap, no overlap.
    engine.emit(pcmAt(store, 200))
    const handOver = 0.6 + START_MARGIN_SECONDS
    expect(old?.stopWhen).toBe(handOver)
    const next = context.sources[1]
    expect(next?.started?.when).toBe(handOver)
    expect(next?.started?.offset).toBe(0)
  })

  it("then follows the clock from the new Frame", () => {
    const { store, engine, context, frames, start } = setup()
    start()
    context.currentTime = 1
    frames.step()
    store.getState().setPlayhead(200)
    engine.emit(pcmAt(store, 200))
    context.currentTime = 1 + START_MARGIN_SECONDS + 10 / 30 + 0.001
    frames.step()
    expect(clockRequests(engine).at(-1)).toBe(210)
  })

  it("ignores Frames the old run draws after the seek", () => {
    const { store, engine, transport, soundFor, start } = setup()
    store.getState().setPlayhead(100)
    start()
    soundFor(1)
    store.getState().setPlayhead(20)
    engine.emit(rendered(130))
    expect(store.getState().playheadFrame).toBe(20)

    engine.emit(rendered(20))
    transport.stop()
    expect(store.getState().playheadFrame).toBe(20)
  })

  it("ends playback on a seek past the end, leaving the Playhead where it was put", () => {
    const { store, engine, frames, soundFor, start } = setup()
    start()
    soundFor(1)
    store.getState().setPlayhead(320)

    expect(store.getState().transport).toBe("stopped")
    expect(store.getState().playheadFrame).toBe(320)
    expect(engine.setTransport).toHaveBeenLastCalledWith("stopped", 320)
    expect(frames.waiting()).toBe(0)
  })
})

describe("a Source with no audio (T067, US2 scenario 5)", () => {
  const SILENT: Source = {
    ...SOURCE,
    id: "source-silent",
    name: "silent-720p24.mp4",
    hasAudio: false,
  }

  it("plays the picture against a silent clock, scheduling nothing", () => {
    const { store, engine, context, transport, soundFor } = setup(SILENT)
    transport.play()
    soundFor(1)
    soundFor(2)
    engine.emit(rendered(60))

    expect(clockRequests(engine)).toEqual([0, 30, 60])
    expect(context.sources).toHaveLength(0)
    expect(store.getState().transport).toBe("playing")
    expect(store.getState().playheadFrame).toBe(60)

    transport.stop()
    expect(store.getState().playheadFrame).toBe(60)
  })
})

describe("the end of the Timeline (T068, US2 scenario 6)", () => {
  // The Source is 10 s at 30/1: Frames 0–299, so the Timeline ends at 300.

  it("stops when the last Frame has had its whole duration, leaving the Playhead on it", () => {
    const { store, engine, frames, soundFor, start } = setup()
    store.getState().setPlayhead(290)
    start()
    soundFor(9.5 / 30)
    engine.emit(rendered(299))
    expect(store.getState().transport).toBe("playing")

    soundFor(10 / 30 + 0.001)
    expect(store.getState().transport).toBe("stopped")
    expect(store.getState().playheadFrame).toBe(299)
    expect(engine.setTransport).toHaveBeenLastCalledWith("stopped", 299)
    expect(frames.waiting()).toBe(0)
    // Never into empty space.
    expect(Math.max(...clockRequests(engine))).toBe(299)
  })

  it("leaves the Playhead on the last Frame even if the engine never said it drew it", () => {
    const { store, engine, soundFor, start } = setup()
    store.getState().setPlayhead(290)
    start()
    engine.emit(rendered(296))
    soundFor(1)
    expect(store.getState().playheadFrame).toBe(299)
  })

  it("starts again from Frame 0 with the Playhead on or past the last Frame (FR-010)", () => {
    for (const parked of [299, 300, 340]) {
      const { store, engine, context, transport } = setup()
      store.getState().setPlayhead(parked)
      transport.play()
      expect(store.getState().transport).toBe("playing")
      expect(store.getState().playheadFrame).toBe(0)
      expect(engine.setTransport.mock.calls).toEqual([["playing", 0]])
      expect(clockRequests(engine)).toEqual([0])

      // The sound starts from the top too.
      engine.emit(pcmAt(store, 0))
      expect(context.sources[0]?.started).toEqual({
        when: START_MARGIN_SECONDS,
        offset: 0,
        duration: 1,
      })
    }
  })

  it("plays from the Frame before the last as usual", () => {
    const { store, engine, transport } = setup()
    store.getState().setPlayhead(298)
    transport.play()
    expect(engine.setTransport).toHaveBeenCalledWith("playing", 298)
    expect(store.getState().playheadFrame).toBe(298)
  })
})

describe("what else can end or move playback", () => {
  it("halts when something else sets the transport to stopped — the Project being closed", () => {
    const { store, engine, frames, start } = setup()
    start()
    store.getState().setTransport("stopped")
    expect(engine.setTransport).toHaveBeenLastCalledWith("stopped", 0)
    expect(frames.waiting()).toBe(0)
  })

  it("lets go of the audio context on dispose", () => {
    const { context, transport, store, start } = setup()
    start()
    transport.dispose()
    expect(context.closed).toBe(true)
    expect(store.getState().transport).toBe("stopped")
  })
})

describe("the limiter's measured delay (ADR 0022)", () => {
  const DELAY = 288 / 48_000

  function withMeasure(measureDelay: (sampleRate: number) => Promise<number>) {
    const store = projectStore()
    const engine = fakeEngine()
    const context = new FakeAudioContext()
    const frames = fakeFrames()
    const clock = { ms: 0 }
    const transport = createTransport({
      store,
      engine,
      createContext: () => context,
      animationFrames: frames,
      now: () => clock.ms,
      measureDelay,
    })
    return { store, engine, context, frames, clock, transport }
  }

  it("measures once, for the live context's sample rate, however many times it plays", async () => {
    const measure = vi.fn<(rate: number) => Promise<number>>(() => Promise.resolve(DELAY))
    const { store, engine, context, transport } = withMeasure(measure)
    context.sampleRate = 44_100
    transport.play()
    transport.stop()
    transport.play()
    engine.emit(pcmAt(store, 0))
    await Promise.resolve()

    expect(measure).toHaveBeenCalledTimes(1)
    expect(measure).toHaveBeenCalledWith(44_100)
  })

  it("holds the clock until the delay is known, then starts the sound that much earlier", async () => {
    let resolve: (seconds: number) => void = () => {}
    const measure = vi.fn(() => new Promise<number>((r) => (resolve = r)))
    const { store, engine, context, frames, transport } = withMeasure(measure)
    transport.play()
    engine.emit(pcmAt(store, 0))
    frames.step()

    // The sound is in hand but the delay is not: nothing is anchored or started.
    expect(context.sources).toHaveLength(0)
    expect(clockRequests(engine)).toEqual([0])
    context.currentTime = 0.5
    frames.step()
    expect(context.sources).toHaveLength(0)
    expect(clockRequests(engine)).toEqual([0])

    context.currentTime = 0
    resolve(DELAY)
    await new Promise((done) => setTimeout(done, 0))
    frames.step()

    const [source] = context.sources
    expect(source?.started?.when).toBeCloseTo(START_MARGIN_SECONDS - DELAY, 9)
    expect(source?.started?.offset).toBe(0)
  })

  it("goes ahead without the delay once the start wait limit passes", () => {
    const measure = vi.fn(() => new Promise<number>(() => {}))
    const { store, engine, context, frames, clock, transport } = withMeasure(measure)
    transport.play()
    engine.emit(pcmAt(store, 0))
    clock.ms = START_WAIT_LIMIT_MS - 1
    frames.step()
    expect(context.sources).toHaveLength(0)

    clock.ms = START_WAIT_LIMIT_MS
    frames.step()
    expect(context.sources[0]?.started?.when).toBeCloseTo(START_MARGIN_SECONDS, 9)
  })

  it("starts at once when the delay is measured as 0", async () => {
    const { store, engine, context, frames, transport } = withMeasure(async () => 0)
    transport.play()
    await new Promise((done) => setTimeout(done, 0))
    engine.emit(pcmAt(store, 0))
    frames.step()
    expect(context.sources[0]?.started?.when).toBeCloseTo(START_MARGIN_SECONDS, 9)
  })
})
