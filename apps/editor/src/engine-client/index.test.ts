import { describe, expect, it, vi } from "vitest"

import type { EngineCapabilities, EngineEvent, ToEngine } from "@cutroom/engine/protocol"

import { EngineClosedError, EngineFatalError, startEngine } from "./index"

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
