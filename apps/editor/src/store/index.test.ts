import { describe, expect, it, vi } from "vitest"

import { CommandError, type Clip, type Command, type Project, type Source } from "@cutroom/model"

import { createProjectSaver, ProjectLoadError } from "@/storage/projects"

import { canRedo, canUndo, createEditorStore, TransactionError, type EditorStore } from "./index"

// The store's promises are about history, so most tests here are a sequence of edits followed by
// undo/redo, compared to the Project at an earlier point with `toStrictEqual` — "the same
// document", not "looks right". The e2e specs cover the same ground in the real browser; these are
// the fast loop.

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

function setup(loaded?: Project) {
  const saver = { save: vi.fn(), flush: vi.fn(async () => undefined) }
  const loadProject = vi.fn(async () => loaded)
  const store = createEditorStore({ saver, loadProject })
  return { store, saver, loadProject }
}

/** A store with a Project in it, as the first import leaves it. */
function started() {
  const context = setup()
  context.store.getState().newProject()
  context.store.getState().run(create)
  return context
}

describe("undo and redo", () => {
  it("undoes one command at a time and redoes it to the same document", () => {
    const { store } = started()
    const { run, undo, redo } = store.getState()
    run(importSource)
    const afterImport = store.getState().project
    run(addClip("clip-1", 0))
    const afterClip = store.getState().project

    undo()
    expect(store.getState().project).toStrictEqual(afterImport)
    redo()
    expect(store.getState().project).toStrictEqual(afterClip)
  })

  it("undoes create-project back to no Project, which is where the first import began", () => {
    const { store } = started()
    store.getState().undo()
    expect(store.getState().project).toBeNull()
    expect(store.getState().scene).toBeNull()
    store.getState().redo()
    expect(store.getState().project?.id).toBe("project-1")
  })

  it("does nothing when there is nothing to undo or redo", () => {
    const { store } = setup()
    store.getState().undo()
    store.getState().redo()
    expect(store.getState().project).toBeNull()
    expect(canUndo(store.getState())).toBe(false)
    expect(canRedo(store.getState())).toBe(false)
  })

  it("drops the redo stack when a new edit is made after an undo", () => {
    const { store } = started()
    store.getState().run(importSource)
    store.getState().undo()
    expect(store.getState().future).toHaveLength(1)
    store.getState().run(importSource)
    expect(store.getState().future).toHaveLength(0)
  })

  it("refuses a command the reducer refuses and leaves Project and history alone", () => {
    const { store } = started()
    store.getState().run(importSource)
    const before = store.getState()
    expect(() => store.getState().run(importSource)).toThrow(CommandError)
    expect(store.getState().project).toBe(before.project)
    expect(store.getState().past).toHaveLength(before.past.length)
    expect(store.getState().openTransaction).toBeNull()
  })
})

describe("transactions", () => {
  it("groups a gesture into one labelled undo step, undone in reverse and redone in order", () => {
    const { store } = started()
    store.getState().run(importSource)
    const before = store.getState().project
    const depth = store.getState().past.length

    store.getState().transact("Add two", () => {
      store.getState().run(addClip("clip-1", 0))
      store.getState().run(addClip("clip-2", 100))
    })
    const after = store.getState().project
    expect(store.getState().past).toHaveLength(depth + 1)
    expect(store.getState().past.at(-1)?.label).toBe("Add two")

    store.getState().undo()
    expect(store.getState().project).toStrictEqual(before)
    store.getState().redo()
    expect(store.getState().project).toStrictEqual(after)
  })

  it("makes create-project, import and add-clip one step that undoes to no Project (T041)", () => {
    const { store } = setup()
    store.getState().newProject()
    store.getState().transact("Import", () => {
      store.getState().run(create)
      store.getState().run(importSource)
      store.getState().run(addClip("clip-1", 0))
    })
    expect(store.getState().past).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().project).toBeNull()
  })

  it("joins rather than nests: only the outermost close commits, under the outer label", () => {
    const { store } = started()
    const depth = store.getState().past.length
    store.getState().transact("Outer", () => {
      store.getState().run(importSource)
      store.getState().transact("Inner", () => store.getState().run(addClip("clip-1", 0)))
      expect(store.getState().past).toHaveLength(depth)
    })
    expect(store.getState().past).toHaveLength(depth + 1)
    expect(store.getState().past.at(-1)?.label).toBe("Outer")
  })

  it("aborts to the exact Project the gesture opened on, and records nothing", () => {
    const { store } = started()
    store.getState().run(importSource)
    const before = store.getState().project
    const depth = store.getState().past.length

    expect(() =>
      store.getState().transact("Overlap", () => {
        store.getState().run(addClip("clip-1", 0))
        store.getState().run(addClip("clip-2", 50)) // overlaps clip-1
      })
    ).toThrow(CommandError)

    expect(store.getState().project).toBe(before)
    expect(store.getState().past).toHaveLength(depth)
    expect(store.getState().openTransaction).toBeNull()
    store.getState().run(addClip("clip-1", 0))
    expect(store.getState().past).toHaveLength(depth + 1)
  })

  it("records nothing, and keeps the redo stack, for a gesture that changed nothing", () => {
    const { store } = started()
    store.getState().run(importSource)
    store.getState().undo()
    const { past, future } = store.getState()
    store.getState().transact("Nothing", () => undefined)
    expect(store.getState().past).toBe(past)
    expect(store.getState().future).toBe(future)
  })

  it("spans events with beginTransaction, and blocks undo while it is open", () => {
    const { store } = started()
    store.getState().run(importSource)
    const drag = store.getState().beginTransaction("Drag")
    store.getState().run(addClip("clip-1", 0))

    expect(store.getState().openTransaction).toBe("Drag")
    expect(canUndo(store.getState())).toBe(false)
    expect(() => store.getState().undo()).toThrow(TransactionError)
    expect(() => store.getState().redo()).toThrow(TransactionError)

    drag.commit()
    expect(store.getState().openTransaction).toBeNull()
    expect(canUndo(store.getState())).toBe(true)
    expect(() => drag.commit()).toThrow(TransactionError)
  })
})

describe("runtime state", () => {
  it("is untouched by undo and absent from history", () => {
    const { store } = started()
    store.getState().run(importSource)
    store.getState().setPlayhead(42)
    store.getState().setTransport("playing")
    store.getState().markSource("source-1", "linked")
    const depth = store.getState().past.length

    store.getState().undo()
    expect(store.getState().playheadFrame).toBe(42)
    expect(store.getState().transport).toBe("playing")
    expect(store.getState().sourceStatus).toEqual({ "source-1": "linked" })

    store.getState().setPlayhead(7)
    expect(store.getState().past).toHaveLength(depth - 1)
    expect(store.getState().future).toHaveLength(1)
  })
})

describe("the Scene", () => {
  it("bumps the revision only when the projected picture changes", () => {
    const { store } = started()
    const first = store.getState()
    expect(first.scene).not.toBeNull()

    // Importing a Source puts nothing on the Timeline, so the picture is the same object.
    store.getState().run(importSource)
    expect(store.getState().scene).toBe(first.scene)
    expect(store.getState().sceneRevision).toBe(first.sceneRevision)

    store.getState().run(addClip("clip-1", 0))
    expect(store.getState().scene).not.toBe(first.scene)
    expect(store.getState().sceneRevision).toBe(first.sceneRevision + 1)
  })
})

describe("saving", () => {
  it("hands every Project change to the saver, and not the lack of one", () => {
    const { store, saver } = setup()
    store.getState().newProject()
    store.getState().run(create)
    store.getState().run(importSource)
    expect(saver.save).toHaveBeenCalledTimes(2)
    expect(saver.save).toHaveBeenLastCalledWith(store.getState().project)

    store.getState().undo()
    store.getState().undo()
    // Back to no Project: nothing to write.
    expect(saver.save).toHaveBeenCalledTimes(3)
  })

  it("writes a finished command at once rather than waiting for the debounce", () => {
    // The first import is what a reload straight afterwards must find: the Project comes into
    // being in one gesture, and the store is idle the moment it ends.
    const { store, saver } = setup()
    store.getState().newProject()
    store.getState().run(create)
    expect(saver.flush).toHaveBeenCalledOnce()
    expect(saver.flush.mock.invocationCallOrder[0]).toBeGreaterThan(
      saver.save.mock.invocationCallOrder[0]!
    )
  })

  it("writes a gesture once, when it closes, and not while it is being made", () => {
    const { store, saver } = started()
    saver.flush.mockClear()

    const drag = store.getState().beginTransaction("Drag")
    store.getState().run(importSource)
    store.getState().run(addClip("clip-1", 0))
    // Every step reaches the saver, which debounces them; none is forced out mid-gesture.
    expect(saver.save).toHaveBeenCalledTimes(3)
    expect(saver.flush).not.toHaveBeenCalled()

    drag.commit()
    expect(saver.flush).toHaveBeenCalledOnce()

    store.getState().transact("Add", () => {
      store.getState().run(addClip("clip-2", 100))
      expect(saver.flush).toHaveBeenCalledOnce()
    })
    expect(saver.flush).toHaveBeenCalledTimes(2)
  })

  it("writes an aborted gesture's restored Project at once", () => {
    const { store, saver } = started()
    const before = store.getState().project
    saver.flush.mockClear()

    const gesture = store.getState().beginTransaction("Drag")
    store.getState().run(importSource)
    gesture.abort()

    expect(saver.save).toHaveBeenLastCalledWith(before)
    expect(saver.flush).toHaveBeenCalledOnce()
  })

  it("writes an undo and a redo at once", () => {
    const { store, saver } = started()
    store.getState().run(importSource)
    saver.flush.mockClear()

    store.getState().undo()
    expect(saver.flush).toHaveBeenCalledOnce()
    store.getState().redo()
    expect(saver.flush).toHaveBeenCalledTimes(2)
  })

  it("flushes before leaving the editor", async () => {
    const { store, saver } = started()
    saver.flush.mockClear()
    await store.getState().closeProject()
    expect(saver.flush).toHaveBeenCalledOnce()
    expect(store.getState().screen).toBe("projects")
    expect(store.getState().project).toBeNull()
  })
})

describe("opening a Project", () => {
  it("opens with an empty history, reset runtime state, and does not write it back", async () => {
    const seed = started()
    seed.store.getState().run(importSource)
    const stored = seed.store.getState().project!

    const { store, saver } = setup(stored)
    store.getState().setPlayhead(9)
    await store.getState().openProject(stored.id)

    expect(store.getState().screen).toBe("editor")
    expect(store.getState().project).toBe(stored)
    expect(store.getState().past).toHaveLength(0)
    expect(store.getState().playheadFrame).toBe(0)
    expect(store.getState().scene).not.toBeNull()
    expect(saver.save).not.toHaveBeenCalled()
  })

  it("stays on the list and says why when the Project is gone", async () => {
    const { store } = setup(undefined)
    await store.getState().openProject("missing")
    expect(store.getState().screen).toBe("projects")
    expect(store.getState().openFailure?.title).toMatch(/no longer/)
  })
})

describe("failures the user is told about (T093)", () => {
  /** A store over a real saver whose writes fail until `heal` is called. */
  function failingSaves() {
    let failing = true
    const written: Project[] = []
    let store: EditorStore | null = null
    const saver = createProjectSaver({
      delayMs: 0,
      write: async (project) => {
        if (failing) throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
        written.push(project)
      },
      onFailure: (error) => store?.getState().reportSaveFailure(error),
      onSaved: () => store?.getState().reportSaved(),
    })
    store = createEditorStore({ saver, loadProject: vi.fn(async () => undefined) })
    return {
      store,
      written,
      heal: () => {
        failing = false
      },
    }
  }

  it("shows a save that failed, in words, with the platform's own words kept for Details", async () => {
    const { store } = failingSaves()
    store.getState().newProject()
    store.getState().run(create)
    await store.getState().flushSaves()

    const failure = store.getState().saveFailure
    expect(failure?.title).toBe("Your latest changes could not be saved.")
    expect(failure?.explanation).toMatch(/run out of space/)
    expect(failure?.detail).toBe("QuotaExceededError: The quota has been exceeded.")
  })

  it("takes the failure back once Try again lands the write", async () => {
    const { store, written, heal } = failingSaves()
    store.getState().newProject()
    store.getState().run(create)
    await store.getState().flushSaves()
    expect(store.getState().saveFailure).not.toBeNull()

    heal()
    await store.getState().retrySave()
    expect(store.getState().saveFailure).toBeNull()
    expect(written.at(-1)).toBe(store.getState().project)
  })

  it("does not leave the editor while the Project cannot be saved, since leaving would lose it", async () => {
    const { store, heal } = failingSaves()
    store.getState().newProject()
    store.getState().run(create)
    await store.getState().closeProject()
    expect(store.getState().screen).toBe("editor")
    expect(store.getState().project).not.toBeNull()

    heal()
    await store.getState().retrySave()
    await store.getState().closeProject()
    expect(store.getState().screen).toBe("projects")
  })

  it("names the Project that could not be opened and keeps the reason for Details", async () => {
    const saver = { save: vi.fn(), flush: vi.fn(async () => undefined) }
    const store = createEditorStore({
      saver,
      loadProject: vi.fn(async () => {
        throw new ProjectLoadError(
          "p-1",
          new TypeError("migrateProject: a Project must be an object")
        )
      }),
    })
    await store.getState().openProject("p-1", "Opening titles")
    const failure = store.getState().openFailure
    expect(failure?.title).toBe("Opening titles could not be opened.")
    expect(failure?.explanation).toMatch(/left exactly as it is/)
    expect(failure?.detail).toMatch(/migrateProject/)
    expect(store.getState().screen).toBe("projects")
  })

  it("says storage, not damage, when opening fails for a reason other than the document", async () => {
    const store = createEditorStore({
      saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
      loadProject: vi.fn(async () => {
        throw new DOMException("Internal error.", "UnknownError")
      }),
    })
    await store.getState().openProject("p-1", "Opening titles")
    expect(store.getState().openFailure).toEqual({
      title: "Opening titles could not be opened.",
      explanation: "The browser could not use Cutroom's storage just now. Try again.",
      detail: "UnknownError: Internal error.",
    })
  })

  it("keeps the first fatal, which is the one that explains what happened", () => {
    const { store } = setup()
    store.getState().reportEngineFatal("the GPU context was lost", "at render")
    store.getState().reportEngineFatal("a later message")
    expect(store.getState().engineFatal).toEqual({
      reason: "the GPU context was lost",
      stack: "at render",
    })
  })
})
