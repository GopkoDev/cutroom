import { describe, expect, it, vi } from "vitest"

import type { Clip, Command, Project, Source } from "@cutroom/model"

import { createEditorStore } from "./index"
import { allClipIds, prune, toggle } from "./selection"

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

const AT = "2026-07-31T10:00:00.000Z"
const create: Command = {
  type: "create-project",
  at: AT,
  projectId: "project-1",
  name: "Untitled",
  timebase: { numerator: 30, denominator: 1 },
  frameSize: { width: 1920, height: 1080 },
  track: { id: "track-1", name: "Video 1" },
}
const importSource: Command = { type: "import-source", at: AT, source }
const addClip = (trackId: string, id: string, startFrame: number): Command => ({
  type: "add-clip",
  at: AT,
  trackId,
  clip: clip(id, startFrame),
})

/** Two Tracks; Track 1 holds clip-b (100) then clip-a (0) added out of order, Track 2 holds clip-c. */
function twoTracks() {
  const saver = { save: vi.fn(), flush: vi.fn(async () => undefined) }
  const store = createEditorStore({ saver, loadProject: vi.fn(async () => undefined) })
  const { run } = store.getState()
  store.getState().newProject()
  run(create)
  run(importSource)
  run({ type: "add-track", at: AT, track: { id: "track-2", name: "Video 2" } })
  run(addClip("track-1", "clip-b", 100))
  run(addClip("track-1", "clip-a", 0))
  run(addClip("track-2", "clip-c", 0))
  saver.save.mockClear()
  saver.flush.mockClear()
  return { store, saver }
}

describe("selection helpers", () => {
  it("toggle adds an absent id at the end and removes a present one", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"])
    expect(toggle(["a", "b", "c"], "b")).toEqual(["a", "c"])
    expect(toggle([], "a")).toEqual(["a"])
  })

  it("allClipIds lists every Clip on every Track, tracks[0] first, then by startFrame", () => {
    const { store } = twoTracks()
    expect(allClipIds(store.getState().project!)).toEqual(["clip-a", "clip-b", "clip-c"])
  })

  it("prune keeps order and drops ids that are not on the Timeline", () => {
    const { store } = twoTracks()
    const project = store.getState().project!
    expect(prune(["clip-c", "ghost", "clip-a"], project)).toEqual(["clip-c", "clip-a"])
  })

  it("prune gives an empty Selection when there is no Project", () => {
    expect(prune(["clip-a"], null)).toEqual([])
  })
})

describe("the Selection in the store (AC-14)", () => {
  it("starts empty", () => {
    const { store } = twoTracks()
    expect(store.getState().selection).toEqual([])
  })

  it("selects one, toggles another in, selects all, then clears", () => {
    const { store } = twoTracks()
    const s = store.getState()

    s.select("clip-a")
    expect(store.getState().selection).toEqual(["clip-a"])
    s.select("clip-c")
    expect(store.getState().selection).toEqual(["clip-c"])

    s.toggleSelected("clip-a")
    expect(store.getState().selection).toEqual(["clip-c", "clip-a"])
    s.toggleSelected("clip-c")
    expect(store.getState().selection).toEqual(["clip-a"])

    s.selectAll()
    expect(store.getState().selection).toEqual(["clip-a", "clip-b", "clip-c"])

    s.setSelection(["clip-b", "clip-a"])
    expect(store.getState().selection).toEqual(["clip-b", "clip-a"])

    s.clearSelection()
    expect(store.getState().selection).toEqual([])
  })

  it("is not an undo step and never reaches the saver", () => {
    const { store, saver } = twoTracks()
    const { past, future, project } = store.getState()
    const s = store.getState()

    s.select("clip-a")
    s.toggleSelected("clip-b")
    s.selectAll()
    s.setSelection(["clip-c"])
    s.clearSelection()

    expect(store.getState().past).toBe(past)
    expect(store.getState().future).toBe(future)
    expect(store.getState().project).toBe(project)
    expect(saver.save).not.toHaveBeenCalled()
    expect(saver.flush).not.toHaveBeenCalled()
  })
})

describe("pruning after undo and redo (AC-15)", () => {
  it("drops the second half of an undone Split and keeps the first", () => {
    const { store } = twoTracks()
    store.getState().transact("Split", () =>
      store.getState().run({
        type: "split-clips",
        at: AT,
        frame: 50,
        cuts: [{ clipId: "clip-a", newClipId: "clip-a2" }],
      })
    )
    store.getState().setSelection(["clip-a", "clip-a2", "clip-c"])

    store.getState().undo()
    expect(store.getState().selection).toEqual(["clip-a", "clip-c"])
  })

  it("drops a selected Clip that a redo deletes", () => {
    const { store } = twoTracks()
    store
      .getState()
      .transact("Delete", () =>
        store.getState().run({ type: "delete-clips", at: AT, clipIds: ["clip-c"], ripple: false })
      )
    store.getState().undo()
    store.getState().setSelection(["clip-a", "clip-c"])

    store.getState().redo()
    expect(store.getState().selection).toEqual(["clip-a"])
  })

  it("leaves a Selection of Clips that still exist as it was", () => {
    const { store } = twoTracks()
    store.getState().run({
      type: "duplicate-clips",
      at: AT,
      delta: 200,
      copies: [{ clipId: "clip-a", newClipId: "clip-a-copy" }],
    })
    store.getState().setSelection(["clip-b", "clip-c"])
    store.getState().undo()
    expect(store.getState().selection).toEqual(["clip-b", "clip-c"])
  })
})

describe("the Selection and the Project's lifetime (AC-28)", () => {
  it("opens with an empty history and an empty Selection", async () => {
    const { store: seed } = twoTracks()
    const stored: Project = seed.getState().project!
    const store = createEditorStore({
      saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
      loadProject: vi.fn(async () => stored),
    })
    store.getState().setSelection(["clip-a"])
    await store.getState().openProject(stored.id)
    expect(store.getState().selection).toEqual([])
    expect(store.getState().past).toHaveLength(0)
    expect(store.getState().future).toHaveLength(0)
  })

  it("is reset by newProject and closeProject", async () => {
    const { store } = twoTracks()
    store.getState().select("clip-a")
    store.getState().newProject()
    expect(store.getState().selection).toEqual([])

    const again = twoTracks().store
    again.getState().select("clip-a")
    await again.getState().closeProject()
    expect(again.getState().screen).toBe("projects")
    expect(again.getState().selection).toEqual([])
  })
})
