import { describe, expect, it, vi } from "vitest"

import type { EngineEvent, ToEngine } from "@cutroom/engine/protocol"

import { startEngine } from "@/engine-client"
import type { SourceFileHandle } from "@/storage/source-links"

import { importPickedFile } from "./import-source"
import { createEditorStore } from "./index"
import { createSourceStatusTracker } from "./source-status"

// A worker `fatal`, end to end without a browser (T093): the real engine client over a fake
// worker, the real Source status tracker and the real store — wired the way `EditorLayout` wires
// them — so what the user is told when the engine stops is checked from the worker's message to
// the store's state.

vi.mock("@cutroom/engine/worker?worker", () => ({ default: class {} }))

class FakeWorker extends EventTarget {
  readonly posted: ToEngine[] = []
  postMessage(message: ToEngine) {
    this.posted.push(message)
  }
  terminate() {}
  answer(event: EngineEvent) {
    this.dispatchEvent(new MessageEvent("message", { data: event }))
  }
  crash(message: string) {
    const event = new Event("error") as Event & { message: string }
    event.message = message
    this.dispatchEvent(event)
  }
}

const FILE = new File([new Uint8Array(64)], "interview.mp4", { lastModified: 1 })
const HANDLE = {
  kind: "file",
  name: FILE.name,
  getFile: async () => FILE,
} as unknown as SourceFileHandle

function wired() {
  const worker = new FakeWorker()
  const client = startEngine({
    canvas: {} as OffscreenCanvas,
    timebase: { numerator: 30, denominator: 1 },
    frameSize: { width: 640, height: 360 },
    createWorker: () => worker as unknown as Worker,
  })
  const store = createEditorStore({
    saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
    loadProject: vi.fn(async () => undefined),
  })
  store.getState().newProject()
  // As EditorLayout does it.
  client.on("fatal", (event) => store.getState().reportEngineFatal(event.reason, event.stack))
  const tracker = createSourceStatusTracker({ store, engine: client })
  const importing = () =>
    importPickedFile(HANDLE, {
      store,
      tracker,
      putSourceLink: vi.fn(async () => undefined),
      newId: () => crypto.randomUUID(),
      now: () => "2026-10-23T10:00:00.000Z",
    })
  return { worker, client, store, importing }
}

describe("a worker fatal reaches the user as what it is", () => {
  it("is held in the store with the worker's own words and stack, for Details", () => {
    const { worker, store } = wired()
    worker.answer({
      type: "fatal",
      reason: "the GPU context was lost",
      stack: "at render (w.js:1)",
    })
    expect(store.getState().engineFatal).toEqual({
      reason: "the GPU context was lost",
      stack: "at render (w.js:1)",
    })
  })

  it("is held too when the worker dies without a word", () => {
    const { worker, store } = wired()
    worker.crash("")
    expect(store.getState().engineFatal?.reason).toBe(
      "the engine worker stopped without saying why"
    )
  })

  it("turns an import in flight into 'not imported', never 'cannot be used', and changes nothing", async () => {
    const { worker, store, importing } = wired()
    const outcome = importing()
    await vi.waitFor(() => expect(worker.posted.some((m) => m.type === "attach-source")).toBe(true))
    worker.answer({ type: "fatal", reason: "the GPU context was lost" })

    const ended = await outcome
    expect(ended.status).toBe("failed")
    if (ended.status !== "failed") return
    expect(ended.name).toBe("interview.mp4")
    expect(ended.reason).toMatch(/engine has stopped.*Reload the page/)
    expect(ended.detail).toMatch(/the GPU context was lost/)
    expect(store.getState().project).toBeNull()
    expect(store.getState().past).toHaveLength(0)
  })

  it("leaves a Source's status alone: the file did not change because the engine stopped", async () => {
    const { worker, store, importing } = wired()
    const outcome = importing()
    await vi.waitFor(() => expect(worker.posted.some((m) => m.type === "attach-source")).toBe(true))
    worker.answer({ type: "fatal", reason: "boom" })
    await outcome
    expect(store.getState().sourceStatus).toEqual({})
  })
})
