import { describe, expect, it, vi } from "vitest"

import type { SourceAttachedEvent } from "@cutroom/engine/protocol"
import { importSequence, type Source } from "@cutroom/model"

import type { SourceFileHandle, SourceFileResult } from "@/storage/source-links"

import { createEditorStore } from "./index"
import { createSourceStatusTracker } from "./source-status"

// The tracker's promises are about *when* a Source's status moves and what moves with it — the
// engine's attachment — and that none of it reaches the undo history. Storage and the engine are
// replaced by stand-ins; the store is the real one.

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

const ATTACHED: SourceAttachedEvent = {
  type: "source-attached",
  sourceId: SOURCE.id,
  duration: SOURCE.duration,
  timebase: SOURCE.timebase,
  dimensions: SOURCE.dimensions,
  hasAudio: SOURCE.hasAudio,
  codecs: SOURCE.codecs,
}

function fileOf(size = 4096, lastModified = 1_750_000_000_000): File {
  return new File([new Uint8Array(size)], SOURCE.name, { lastModified })
}

const handle = { kind: "file", name: SOURCE.name } as unknown as SourceFileHandle

function linked(file = fileOf()): SourceFileResult {
  return { status: "linked", handle, file }
}

/** A store holding a Project with one Source in it, as an import leaves the document. */
function projectStore() {
  const store = createEditorStore({
    saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
    loadProject: vi.fn(async () => undefined),
  })
  store.getState().newProject()
  store.getState().transact("Import", () => {
    for (const command of importSequence(null, {
      at: "2026-10-22T10:00:00.000Z",
      source: SOURCE,
      clipId: "clip-1",
      projectId: "project-1",
      trackId: "track-1",
    })) {
      store.getState().run(command)
    }
  })
  return store
}

function setup(answers: SourceFileResult[]) {
  const store = projectStore()
  const engine = {
    attachSource: vi.fn<(sourceId: string, file: File) => Promise<SourceAttachedEvent>>(
      async () => ATTACHED
    ),
    detachSource: vi.fn(),
  }
  const queue = [...answers]
  const readSourceFile = vi.fn(async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0]
    if (next === undefined) throw new Error("no answer scripted")
    return next
  })
  const tracker = createSourceStatusTracker({ store, engine, readSourceFile })
  return { store, engine, tracker, readSourceFile }
}

describe("on open", () => {
  it("attaches a readable Source and marks it Linked only after the engine has it", async () => {
    const { store, engine, tracker } = setup([linked()])
    let statusWhenAttaching: unknown = "not called"
    engine.attachSource.mockImplementation(async () => {
      statusWhenAttaching = store.getState().sourceStatus[SOURCE.id]
      return ATTACHED
    })

    await tracker.checkAll()

    expect(engine.attachSource).toHaveBeenCalledTimes(1)
    expect(statusWhenAttaching).toBeUndefined()
    expect(store.getState().sourceStatus).toEqual({ [SOURCE.id]: "linked" })
    expect(store.getState().sourceOffline).toEqual({})
  })

  it("lands Offline with the reason when permission has lapsed, and keeps the handle for a re-grant", async () => {
    const { store, engine, tracker } = setup([
      { status: "offline", reason: "needs-permission", handle, permission: "prompt" },
    ])

    await tracker.checkAll()

    expect(engine.attachSource).not.toHaveBeenCalled()
    expect(store.getState().sourceStatus[SOURCE.id]).toBe("offline")
    expect(store.getState().sourceOffline[SOURCE.id]).toEqual({ reason: "needs-permission" })
    expect(tracker.handleFor(SOURCE.id)).toBe(handle)
  })

  it("lands Offline when this machine was never told where the file is", async () => {
    const { store, tracker } = setup([{ status: "offline", reason: "never-linked-here" }])
    await tracker.checkAll()
    expect(store.getState().sourceOffline[SOURCE.id]).toEqual({ reason: "never-linked-here" })
    expect(tracker.handleFor(SOURCE.id)).toBeUndefined()
  })

  it("refuses a handle that now points at a different-sized file", async () => {
    const { store, engine, tracker } = setup([linked(fileOf(10))])
    await tracker.checkAll()
    expect(engine.attachSource).not.toHaveBeenCalled()
    expect(store.getState().sourceOffline[SOURCE.id]?.reason).toBe("unreachable")
  })

  it("marks a file the engine cannot read Offline, as unreadable", async () => {
    const { store, engine, tracker } = setup([linked()])
    engine.attachSource.mockRejectedValue(new Error("no decodable video track"))
    await tracker.checkAll()
    expect(store.getState().sourceOffline[SOURCE.id]).toEqual({
      reason: "unreadable",
      detail: "no decodable video track",
    })
  })

  it("writes nothing when the engine itself has stopped — that says nothing about the file", async () => {
    const { store, engine, tracker } = setup([linked()])
    const stopped = new Error("The Cutroom engine stopped: boom")
    stopped.name = "EngineFatalError"
    engine.attachSource.mockRejectedValue(stopped)
    await tracker.checkAll()
    expect(store.getState().sourceStatus).toEqual({})
  })
})

describe("mid-session", () => {
  it("detaches a Source whose file vanished, so its Clips render empty", async () => {
    const { store, engine, tracker } = setup([
      linked(),
      { status: "offline", reason: "unreachable", handle, detail: "NotFoundError" },
    ])
    await tracker.checkAll()
    await tracker.verifyLinked()

    expect(engine.detachSource).toHaveBeenCalledWith(SOURCE.id)
    expect(store.getState().sourceOffline[SOURCE.id]).toEqual({
      reason: "unreachable",
      detail: "NotFoundError",
    })
    // The Clip is untouched: Offline is not an edit (FR-022).
    expect(store.getState().project?.timeline.tracks[0]?.clips).toHaveLength(1)
  })

  it("does not attach again, or write the store, while nothing has changed", async () => {
    const { store, engine, tracker } = setup([linked()])
    await tracker.checkAll()
    const before = store.getState().sourceStatus

    await tracker.verifyLinked()
    await tracker.checkAll()

    expect(engine.attachSource).toHaveBeenCalledTimes(1)
    expect(store.getState().sourceStatus).toBe(before)
  })

  it("coalesces Playhead-rate verification into one pass in flight and one more after", async () => {
    const { tracker, readSourceFile } = setup([linked()])
    await tracker.checkAll()
    readSourceFile.mockClear()

    const passes = [tracker.verifyLinked(), tracker.verifyLinked(), tracker.verifyLinked()]
    await Promise.all(passes)

    expect(readSourceFile).toHaveBeenCalledTimes(2)
  })

  it("takes a Source Offline at once when a read fails in the engine", async () => {
    const { store, engine, tracker } = setup([linked()])
    await tracker.checkAll()

    tracker.readFailed(SOURCE.id, "NotReadableError")
    await new Promise((settle) => setTimeout(settle, 0))

    expect(engine.detachSource).toHaveBeenCalledWith(SOURCE.id)
    expect(store.getState().sourceOffline[SOURCE.id]).toEqual({
      reason: "unreachable",
      detail: "NotReadableError",
    })
  })

  it("re-attaches a Source that comes back, with the new File", async () => {
    const back = fileOf(4096, 1_760_000_000_000)
    const { store, engine, tracker } = setup([
      { status: "offline", reason: "needs-permission", handle, permission: "prompt" },
      linked(back),
    ])
    await tracker.checkAll()
    await tracker.check(SOURCE.id)

    expect(engine.attachSource).toHaveBeenCalledWith(SOURCE.id, back)
    expect(store.getState().sourceStatus[SOURCE.id]).toBe("linked")
  })
})

describe("outside the undo history", () => {
  it("is never undone: undoing the import leaves the Source's status where it was", async () => {
    const { store, tracker } = setup([linked()])
    await tracker.checkAll()

    store.getState().undo()

    expect(store.getState().project).toBeNull()
    expect(store.getState().sourceStatus).toEqual({ [SOURCE.id]: "linked" })
    expect(store.getState().past).toHaveLength(0)
  })
})

describe("after dispose", () => {
  it("ignores answers that arrive late", async () => {
    let answer!: (result: SourceFileResult) => void
    const { store, tracker, readSourceFile } = setup([linked()])
    readSourceFile.mockImplementation(
      () =>
        new Promise<SourceFileResult>((settle) => {
          answer = settle
        })
    )
    const checking = tracker.checkAll()
    await Promise.resolve()
    tracker.dispose()
    answer({ status: "offline", reason: "never-linked-here" })
    await checking

    expect(store.getState().sourceStatus).toEqual({})
  })
})

describe("which Source a file belongs to (the export's guard)", () => {
  /** A handle that is the same entry as exactly the handles in `same`. */
  function entry(name: string, same: () => readonly unknown[]) {
    const self: SourceFileHandle = {
      kind: "file",
      name,
      isSameEntry: vi.fn(async (other: unknown) => other === self || same().includes(other)),
    } as unknown as SourceFileHandle
    return self
  }

  it("finds the Source by isSameEntry, whatever the destination is called", async () => {
    let aliases: unknown[] = []
    const held = entry(SOURCE.name, () => aliases)
    const { tracker } = setup([{ status: "linked", handle: held, file: fileOf() }])
    await tracker.checkAll()

    // Another handle to the same file — the save picker's, under another name — is still it.
    const destination = entry("renamed.mp4", () => [held])
    aliases = [destination]
    expect(await tracker.sourceAt(destination)).toBe(SOURCE.id)
    expect(await tracker.sourceAt(entry("other.mp4", () => []))).toBeUndefined()
  })

  it("finds an Offline Source too: its file is still its file", async () => {
    const held = entry(SOURCE.name, () => [])
    const { tracker } = setup([
      { status: "offline", reason: "needs-permission", handle: held, permission: "prompt" },
    ])
    await tracker.checkAll()
    expect(await tracker.sourceAt(held)).toBe(SOURCE.id)
  })

  it("finds nothing for a Source with no handle here, or a comparison that throws", async () => {
    const none = setup([{ status: "offline", reason: "never-linked-here" }])
    await none.tracker.checkAll()
    expect(await none.tracker.sourceAt(entry("x.mp4", () => []))).toBeUndefined()

    const broken = {
      kind: "file",
      name: SOURCE.name,
      isSameEntry: vi.fn(async () => {
        throw new DOMException("gone", "NotFoundError")
      }),
    } as unknown as SourceFileHandle
    const throwing = setup([{ status: "linked", handle: broken, file: fileOf() }])
    await throwing.tracker.checkAll()
    expect(await throwing.tracker.sourceAt(entry("x.mp4", () => []))).toBeUndefined()
  })
})
