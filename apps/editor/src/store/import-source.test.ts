import { describe, expect, it, vi } from "vitest"

import type { SourceAttachedEvent } from "@cutroom/engine/protocol"

import type { SourceFileHandle } from "@/storage/source-links"

import { importPickedFile } from "./import-source"
import { createEditorStore } from "./index"

// The import's promises are about order: nothing reaches the Project until the engine has read the
// file and the handle is remembered, a refusal leaves the Project exactly as it was, and the whole
// import is one undo step. The engine and the link table are stand-ins; the store and the model's
// `importSequence` are real.

const ATTACHED: SourceAttachedEvent = {
  type: "source-attached",
  sourceId: "id-1",
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30000, denominator: 1001 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
}

const FILE = new File([new Uint8Array(2048)], "interview.mp4", { lastModified: 1_750_000_000_000 })

function handleOf(file: File | Error): SourceFileHandle {
  return {
    kind: "file",
    name: file instanceof File ? file.name : "gone.mp4",
    getFile: async () => {
      if (file instanceof Error) throw file
      return file
    },
  } as unknown as SourceFileHandle
}

function setup() {
  const store = createEditorStore({
    saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
    loadProject: vi.fn(async () => undefined),
  })
  store.getState().newProject()
  let next = 0
  const order: string[] = []
  const tracker = {
    attach: vi.fn(async (sourceId: string) => {
      order.push("attach")
      return { ...ATTACHED, sourceId }
    }),
    markLinked: vi.fn((sourceId: string) => {
      order.push("linked")
      store.getState().markSource(sourceId, "linked")
    }),
    release: vi.fn(),
  }
  const putSourceLink = vi.fn(async () => {
    order.push(`link (project ${store.getState().project === null ? "absent" : "present"})`)
  })
  const dependencies = {
    store,
    tracker,
    putSourceLink,
    newId: () => `id-${++next}`,
    now: () => "2026-10-22T10:00:00.000Z",
  }
  return { store, tracker, putSourceLink, dependencies, order }
}

describe("importPickedFile", () => {
  it("brings the Project into being from the first Source, as one undo step", async () => {
    const { store, dependencies, order } = setup()

    const outcome = await importPickedFile(handleOf(FILE), dependencies)

    expect(outcome.status).toBe("imported")
    const project = store.getState().project
    expect(project?.name).toBe("interview")
    expect(project?.timebase).toEqual({ numerator: 30000, denominator: 1001 })
    expect(project?.frameSize).toEqual({ width: 1920, height: 1080 })
    expect(project?.sources).toEqual([
      {
        id: "id-1",
        name: "interview.mp4",
        address: { kind: "local-file" },
        fingerprint: { size: 2048, lastModified: 1_750_000_000_000 },
        duration: ATTACHED.duration,
        timebase: ATTACHED.timebase,
        dimensions: ATTACHED.dimensions,
        hasAudio: true,
        codecs: ATTACHED.codecs,
      },
    ])
    // 10 s at 30000/1001 is 299.7 Frame-lengths, so 300 Frames: the last starts inside the file.
    expect(project?.timeline.tracks[0]?.clips).toEqual([
      expect.objectContaining({ sourceId: "id-1", startFrame: 0, durationFrames: 300 }),
    ])
    expect(store.getState().past).toHaveLength(1)
    expect(store.getState().sourceStatus).toEqual({ "id-1": "linked" })
    expect(order).toEqual(["attach", "link (project absent)", "linked"])

    store.getState().undo()
    expect(store.getState().project).toBeNull()
  })

  it("leaves the Project untouched when the engine refuses the file, and says why", async () => {
    const { store, tracker, putSourceLink, dependencies } = setup()
    tracker.attach.mockRejectedValue(new Error("it has no video track"))

    const outcome = await importPickedFile(handleOf(FILE), dependencies)

    expect(outcome).toEqual({
      status: "refused",
      name: "interview.mp4",
      reason: "it has no video track",
    })
    expect(store.getState().project).toBeNull()
    expect(store.getState().past).toHaveLength(0)
    expect(putSourceLink).not.toHaveBeenCalled()
    expect(tracker.release).toHaveBeenCalledWith("id-1")
  })

  it("refuses a file that cannot even be opened, before the engine is asked", async () => {
    const { tracker, dependencies } = setup()
    const outcome = await importPickedFile(handleOf(new Error("NotFoundError")), dependencies)
    expect(outcome.status).toBe("refused")
    expect(tracker.attach).not.toHaveBeenCalled()
  })

  it("refuses, with the Project untouched, when the handle cannot be remembered", async () => {
    const { store, putSourceLink, dependencies } = setup()
    putSourceLink.mockRejectedValue(new Error("QuotaExceededError"))
    const outcome = await importPickedFile(handleOf(FILE), dependencies)
    expect(outcome.status).toBe("refused")
    expect(store.getState().project).toBeNull()
  })

  it("aborts the whole sequence when the model refuses it — a Source too short for one Frame", async () => {
    const { store, tracker, dependencies } = setup()
    tracker.attach.mockResolvedValue({ ...ATTACHED, duration: { numerator: 0, denominator: 1 } })

    const outcome = await importPickedFile(handleOf(FILE), dependencies)

    expect(outcome.status).toBe("refused")
    expect(store.getState().project).toBeNull()
    expect(store.getState().openTransaction).toBeNull()
    expect(tracker.markLinked).not.toHaveBeenCalled()
  })

  it("places a second Source after the first, keeping the Project's Timebase", async () => {
    const { store, tracker, dependencies } = setup()
    await importPickedFile(handleOf(FILE), dependencies)
    tracker.attach.mockResolvedValue({ ...ATTACHED, timebase: { numerator: 24, denominator: 1 } })

    await importPickedFile(handleOf(FILE), dependencies)

    const project = store.getState().project
    expect(project?.timebase).toEqual({ numerator: 30000, denominator: 1001 })
    expect(project?.timeline.tracks[0]?.clips.map((clip) => clip.startFrame)).toEqual([0, 300])
    expect(store.getState().past).toHaveLength(2)
  })
})
