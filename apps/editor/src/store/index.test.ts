import { describe, expect, it } from "vitest"

import { CommandError, type Clip, type Command, type Source } from "@cutroom/model"

import { createEditorStore } from "./index"

// The store's promises are about history, so every test here is a sequence of edits followed by
// undo/redo, compared to the Project at an earlier point with `toStrictEqual` — "the same
// document", not "looks right".

const source: Source = {
  id: "source-1",
  name: "sync-1080p30.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 12_345_678, lastModified: 1_754_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
}

const clip = (id: string, startFrame: number): Clip => ({
  id,
  sourceId: "source-1",
  startFrame,
  durationFrames: 100,
  sourceInPoint: { numerator: 0, denominator: 1 },
})

const create: Command = {
  type: "create-project",
  at: "2026-07-31T10:00:00.000Z",
  projectId: "project-1",
  name: "Untitled",
  timebase: { numerator: 30, denominator: 1 },
  frameSize: { width: 1920, height: 1080 },
  track: { id: "track-1", name: "Video 1" },
}
const importSource: Command = { type: "import-source", at: "2026-07-31T10:01:00.000Z", source }
const addClip = (id: string, startFrame: number): Command => ({
  type: "add-clip",
  at: "2026-07-31T10:02:00.000Z",
  trackId: "track-1",
  clip: clip(id, startFrame),
})

function started() {
  const store = createEditorStore()
  store.getState().dispatch(create)
  return store
}

describe("undo and redo", () => {
  it("undoes one command at a time and redoes it to the same document", () => {
    const store = started()
    const { dispatch, undo, redo } = store.getState()
    dispatch(importSource)
    const afterImport = store.getState().project
    dispatch(addClip("clip-1", 0))
    const afterClip = store.getState().project

    undo()
    expect(store.getState().project).toStrictEqual(afterImport)
    redo()
    expect(store.getState().project).toStrictEqual(afterClip)
  })

  it("does nothing when there is nothing to undo or redo", () => {
    const store = started()
    const before = store.getState().project
    store.getState().undo()
    store.getState().redo()
    expect(store.getState().project).toBe(before)
  })

  it("drops the redo stack when a new edit is made after an undo", () => {
    const store = started()
    store.getState().dispatch(importSource)
    store.getState().undo()
    expect(store.getState().future).toHaveLength(1)
    store.getState().dispatch(importSource)
    expect(store.getState().future).toHaveLength(0)
  })

  it("does not record create-project, so undo cannot return to no Project", () => {
    const store = started()
    expect(store.getState().past).toHaveLength(0)
    store.getState().undo()
    expect(store.getState().project).not.toBeNull()
  })

  it("refuses a command the reducer refuses and leaves Project and history alone", () => {
    const store = started()
    store.getState().dispatch(importSource)
    const before = store.getState()
    expect(() => store.getState().dispatch(importSource)).toThrow(CommandError)
    expect(store.getState().project).toBe(before.project)
    expect(store.getState().past).toHaveLength(1)
  })
})

describe("transactions", () => {
  it("groups a gesture into one undo step, undone in reverse and redone in order", () => {
    const store = started()
    store.getState().dispatch(importSource)
    const before = store.getState().project

    store.getState().transaction(() => {
      store.getState().dispatch(addClip("clip-1", 0))
      store.getState().dispatch(addClip("clip-2", 100))
    })
    const after = store.getState().project
    expect(store.getState().past).toHaveLength(2)

    store.getState().undo()
    expect(store.getState().project).toStrictEqual(before)
    store.getState().redo()
    expect(store.getState().project).toStrictEqual(after)
  })

  it("makes only the outermost transaction an undo step", () => {
    const store = started()
    store.getState().transaction(() => {
      store.getState().dispatch(importSource)
      store.getState().transaction(() => store.getState().dispatch(addClip("clip-1", 0)))
    })
    expect(store.getState().past).toHaveLength(1)
  })

  it("rolls back everything a failed transaction applied and records nothing", () => {
    const store = started()
    store.getState().dispatch(importSource)
    const before = store.getState().project

    expect(() =>
      store.getState().transaction(() => {
        store.getState().dispatch(addClip("clip-1", 0))
        store.getState().dispatch(addClip("clip-2", 50)) // overlaps clip-1
      })
    ).toThrow(CommandError)

    expect(store.getState().project).toStrictEqual(before)
    expect(store.getState().past).toHaveLength(1)
    // And the store is usable afterwards: the failed transaction left nothing open.
    store.getState().dispatch(addClip("clip-1", 0))
    expect(store.getState().past).toHaveLength(2)
  })

  it("records nothing for a transaction that changed nothing", () => {
    const store = started()
    store.getState().transaction(() => undefined)
    expect(store.getState().past).toHaveLength(0)
  })
})

describe("runtime state", () => {
  it("is untouched by undo and absent from history", () => {
    const store = started()
    store.getState().dispatch(importSource)
    store.getState().setPlayhead(42)
    store.getState().setSourceStatus("source-1", "offline")
    const past = store.getState().past

    store.getState().undo()
    expect(store.getState().playheadFrame).toBe(42)
    expect(store.getState().sourceStatus).toEqual({ "source-1": "offline" })

    store.getState().setPlayhead(7)
    // Moving the playhead after the undo added nothing to either stack.
    expect(past).toHaveLength(1)
    expect(store.getState().past).toHaveLength(0)
    expect(store.getState().future).toHaveLength(1)
  })
})

describe("openProject", () => {
  it("starts a fresh history and resets runtime state", () => {
    const store = started()
    store.getState().dispatch(importSource)
    store.getState().setPlayhead(9)
    const project = store.getState().project

    store.getState().openProject(project)
    expect(store.getState().past).toHaveLength(0)
    expect(store.getState().playheadFrame).toBe(0)
    expect(store.getState().loaded).toBe(project)
  })
})
