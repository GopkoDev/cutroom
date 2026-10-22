import { afterEach, describe, expect, it, vi } from "vitest"

import type { EngineCapabilities, EngineEvent, ToEngine } from "@cutroom/engine/protocol"

import { EngineClosedError, EngineFatalError, UNANSWERED_FRAME_MS, startEngine } from "./index"

// The real worker is exercised by the e2e specs. Here it is replaced by one that records what was
// posted and answers only when told to, which is what the client's promises are actually about.
vi.mock("@cutroom/engine/worker?worker", () => ({ default: class {} }))

class FakeWorker extends EventTarget {
  readonly posted: { message: ToEngine; transfer: Transferable[] }[] = []
  terminated = false

  postMessage(message: ToEngine, transfer: Transferable[] = []) {
    this.posted.push({ message, transfer })
  }

  terminate() {
    this.terminated = true
  }

  answer(event: EngineEvent) {
    this.dispatchEvent(new MessageEvent("message", { data: event }))
  }

  crash(message: string) {
    const event = new Event("error") as Event & { message: string }
    event.message = message
    this.dispatchEvent(event)
  }

  types() {
    return this.posted.map((post) => post.message.type)
  }
}

const capabilities = { renderer: "webgl" } as unknown as EngineCapabilities
const canvas = {} as OffscreenCanvas
const file = {} as File

function setup() {
  const worker = new FakeWorker()
  const client = startEngine({
    canvas,
    timebase: { numerator: 30, denominator: 1 },
    frameSize: { width: 1920, height: 1080 },
    createWorker: () => worker as unknown as Worker,
  })
  return { worker, client }
}

const attached = (sourceId: string) =>
  ({ type: "source-attached", sourceId }) as unknown as EngineEvent

describe("startup", () => {
  it("posts init once, with the canvas transferred", () => {
    const { worker } = setup()
    expect(worker.types()).toEqual(["init"])
    expect(worker.posted[0]!.transfer).toEqual([canvas])
  })

  it("resolves ready with what the engine reported", async () => {
    const { worker, client } = setup()
    worker.answer({ type: "ready", capabilities } as EngineEvent)
    await expect(client.ready).resolves.toBe(capabilities)
    expect(client.capabilities()).toBe(capabilities)
  })
})

describe("streams", () => {
  it("renderFrame returns nothing and never waits for an answer", () => {
    const { worker, client } = setup()
    expect(client.renderFrame(12, "scrub")).toBeUndefined()
    expect(worker.posted.at(-1)!.message).toEqual({
      type: "render-frame",
      frame: 12,
      reason: "scrub",
    })
  })

  it("delivers announcements to listeners and stops after unsubscribe", () => {
    const { worker, client } = setup()
    const seen: number[] = []
    const stop = client.on("frame-rendered", (event) => seen.push(event.frame))
    const rendered = (frame: number) =>
      ({ type: "frame-rendered", frame, revision: 1 }) as unknown as EngineEvent
    worker.answer(rendered(1))
    stop()
    worker.answer(rendered(2))
    expect(seen).toEqual([1])
  })
})

describe("the latest-wins guard over render-frame", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const rendered = (frame: number) =>
    ({ type: "frame-rendered", frame, revision: 1 }) as unknown as EngineEvent
  const dropped = { type: "frames-dropped", count: 1 } as EngineEvent
  const framesPosted = (worker: FakeWorker) =>
    worker.posted
      .map((post) => post.message)
      .filter((message) => message.type === "render-frame")
      .map((message) => message.frame)

  it("posts one request and holds the rest until it is answered, then posts only the newest", () => {
    const { worker, client } = setup()
    for (let frame = 1; frame <= 20; frame += 1) client.renderFrame(frame, "scrub")
    expect(framesPosted(worker)).toEqual([1])

    worker.answer(rendered(1))
    expect(framesPosted(worker)).toEqual([1, 20])

    worker.answer(rendered(20))
    expect(framesPosted(worker)).toEqual([1, 20])
  })

  it("counts frames-dropped as an answer, since a request the worker cannot serve gets that", () => {
    const { worker, client } = setup()
    client.renderFrame(0, "scrub")
    client.renderFrame(5, "scrub")
    worker.answer(dropped)
    expect(framesPosted(worker)).toEqual([0, 5])
  })

  it("posts again at once when nothing is in flight", () => {
    const { worker, client } = setup()
    client.renderFrame(3, "scrub")
    worker.answer(rendered(3))
    client.renderFrame(4, "scrub")
    expect(framesPosted(worker)).toEqual([3, 4])
  })

  it("keeps a repeat of the Frame in flight, because a repeat means the picture changed", () => {
    const { worker, client } = setup()
    client.renderFrame(7, "scrub")
    client.renderFrame(7, "scrub")
    worker.answer(rendered(7))
    expect(framesPosted(worker)).toEqual([7, 7])
  })

  it("lets a listener woken by the answer ask for the next Frame without being held", () => {
    const { worker, client } = setup()
    client.on("frame-rendered", (event) => {
      if (event.frame === 1) client.renderFrame(2, "scrub")
    })
    client.renderFrame(1, "scrub")
    worker.answer(rendered(1))
    expect(framesPosted(worker)).toEqual([1, 2])
  })

  it("stops waiting for an answer that never comes, and a late one changes nothing", () => {
    vi.useFakeTimers()
    const { worker, client } = setup()
    client.renderFrame(1, "scrub")
    client.renderFrame(2, "scrub")
    vi.advanceTimersByTime(UNANSWERED_FRAME_MS - 1)
    expect(framesPosted(worker)).toEqual([1])

    vi.advanceTimersByTime(1)
    expect(framesPosted(worker)).toEqual([1, 2])

    // Frame 1's answer, late: Frame 2 is still in flight and owes its own.
    client.renderFrame(3, "scrub")
    worker.answer(rendered(1))
    expect(framesPosted(worker)).toEqual([1, 2, 3])
  })

  it("forgets what was waiting on a fatal or a terminate", () => {
    vi.useFakeTimers()
    const { worker, client } = setup()
    client.renderFrame(1, "scrub")
    client.renderFrame(2, "scrub")
    worker.answer({ type: "fatal", reason: "GPU lost" })
    worker.answer(rendered(1))
    vi.runAllTimers()
    expect(framesPosted(worker)).toEqual([1])

    const other = setup()
    other.client.renderFrame(1, "scrub")
    other.client.renderFrame(2, "scrub")
    other.client.terminate()
    vi.runAllTimers()
    expect(framesPosted(other.worker)).toEqual([1])
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("attachSource", () => {
  it("resolves on source-attached and rejects on source-failed with the engine's words", async () => {
    const { worker, client } = setup()
    const good = client.attachSource("a", file)
    const bad = client.attachSource("b", file)
    worker.answer(attached("a"))
    worker.answer({ type: "source-failed", sourceId: "b", reason: "not a video" } as EngineEvent)
    await expect(good).resolves.toMatchObject({ sourceId: "a" })
    await expect(bad).rejects.toThrow("not a video")
  })

  it("refuses a second attach of the same Source while the first is in flight", async () => {
    const { client } = setup()
    void client.attachSource("a", file)
    await expect(client.attachSource("a", file)).rejects.toThrow(/already being attached/)
  })
})

describe("a fatal", () => {
  it("rejects everything waiting, then refuses new requests and drops stream posts", async () => {
    const { worker, client } = setup()
    const waiting = client.attachSource("a", file)
    worker.answer({ type: "fatal", reason: "GPU lost" })

    await expect(client.ready).rejects.toBeInstanceOf(EngineFatalError)
    await expect(waiting).rejects.toThrow(/GPU lost/)
    await expect(client.attachSource("b", file)).rejects.toBeInstanceOf(EngineFatalError)
    expect(client.fatal()?.reason).toBe("GPU lost")

    const before = worker.posted.length
    client.renderFrame(1, "clock")
    expect(worker.posted).toHaveLength(before)
  })

  it("is made from a worker that dies without saying so", async () => {
    const { worker, client } = setup()
    const heard = vi.fn()
    client.on("fatal", heard)
    worker.crash("module failed to load")
    await expect(client.ready).rejects.toThrow(/module failed to load/)
    expect(heard).toHaveBeenCalledOnce()
  })
})

describe("terminate", () => {
  it("stops the worker, rejects what was waiting, and is idempotent", async () => {
    const { worker, client } = setup()
    const waiting = client.attachSource("a", file)
    client.terminate("bye")
    client.terminate("again")
    expect(worker.terminated).toBe(true)
    await expect(waiting).rejects.toBeInstanceOf(EngineClosedError)
    await expect(client.attachSource("b", file)).rejects.toThrow(/bye/)
  })
})

describe("exports", () => {
  it("allows one at a time and resolves cancelled as an outcome, not a failure", async () => {
    const { worker, client } = setup()
    const writable = {} as FileSystemWritableFileStream
    const request = {} as Parameters<typeof client.startExport>[0]

    const running = client.startExport(request, writable)
    expect(worker.posted.at(-1)!.transfer).toEqual([writable])
    await expect(client.startExport(request, writable)).rejects.toThrow(/already running/)

    worker.answer({ type: "export-cancelled" } as EngineEvent)
    await expect(running).resolves.toEqual({ status: "cancelled" })
  })
})
