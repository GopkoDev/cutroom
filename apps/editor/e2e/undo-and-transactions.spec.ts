import { expect, test, type Page } from "@playwright/test"

import type * as EditorStore from "../src/store"

import type * as ProjectStore from "../src/storage/projects"

import {
  ADD_CLIP,
  CREATE_PROJECT,
  IMPORT_SOURCE,
  PROJECT_STORE_MODULE,
  STORE_MODULE,
} from "./editor-fixtures"

// The store, exercised in the app it drives rather than in isolation.
//
// It lives here rather than in Vitest for the same reason `storage/` does: the store owns the
// debounced saver, and the saver writes to IndexedDB, which node does not have. Testing it against
// a mock would test the mock — and the one property that matters most about the saver, that a tab
// going away does not take a debounce interval of edits with it, only means anything against a real
// store and a page that really unloads.
//
// Everything below reaches the store through the module the app imported, so an assertion about
// state is also an assertion about what the screen is showing.

/** What a spec wants to know about the store, read out in one round trip. */
interface Snapshot {
  readonly sourceCount: number
  readonly clipCount: number
  readonly durationFrames: number
  readonly past: readonly string[]
  readonly future: readonly string[]
  readonly openTransaction: string | null
  readonly playheadFrame: number
  readonly sourceStatus: Record<string, string>
  readonly projectIsNull: boolean
  readonly sceneRevision: number
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    const state = store.useEditorStore.getState()
    return {
      sourceCount: state.project?.sources.length ?? 0,
      clipCount: state.project?.timeline.tracks[0]?.clips.length ?? 0,
      durationFrames: state.project?.timeline.durationFrames ?? 0,
      past: state.past.map((entry) => entry.label),
      future: state.future.map((entry) => entry.label),
      openTransaction: state.openTransaction,
      playheadFrame: state.playheadFrame,
      sourceStatus: { ...state.sourceStatus },
      projectIsNull: state.project === null,
      sceneRevision: state.sceneRevision,
    }
  }, STORE_MODULE)
}

/** Opens the shell and puts a Project in it, the way the app will once importing exists. */
async function openWithAProject(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("editor-shell")).toBeVisible()

  await page.evaluate(
    async ({ specifier, create }) => {
      const store = (await import(specifier)) as typeof EditorStore
      store.useEditorStore.getState().run(create)
    },
    { specifier: STORE_MODULE, create: CREATE_PROJECT }
  )
}

test("the first import is one gesture, and undoing it leaves no Project behind", async ({
  page,
}) => {
  // The whole of T041's sequence in one transaction, from an editor with nothing in it: the Project
  // comes into being, takes the Source, and gets its Clip — one thing the user did, one undo step.
  //
  // This is also the case that pins the *order* the inverses are replayed in. `create-project`'s
  // inverse is a root replacement back to `null`, and `import-source`'s is a removal inside the
  // Project. Taken in command order the root replacement lands first and the removal is then asked
  // to delete a Source out of nothing; taken in reverse, as an undo step must be, the removal
  // happens while there is still a Project to remove it from.
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("editor-shell")).toBeVisible()

  await page.evaluate(
    async ({ specifier, create, importSource, addClip }) => {
      const store = (await import(specifier)) as typeof EditorStore
      store.useEditorStore.getState().transact("Import", () => {
        const { run } = store.useEditorStore.getState()
        run(create)
        run(importSource)
        run(addClip)
      })
    },
    {
      specifier: STORE_MODULE,
      create: CREATE_PROJECT,
      importSource: IMPORT_SOURCE,
      addClip: ADD_CLIP,
    }
  )

  const imported = await snapshot(page)
  expect(imported.past).toEqual(["Import"])
  expect(imported.sourceCount).toBe(1)
  expect(imported.clipCount).toBe(1)

  await page.getByTestId("undo").click()

  const undone = await snapshot(page)
  expect(undone.projectIsNull).toBe(true)
  expect(undone.past).toEqual([])
  expect(undone.future).toEqual(["Import"])

  await page.getByTestId("redo").click()
  const redone = await snapshot(page)
  expect(redone.projectIsNull).toBe(false)
  expect(redone.sourceCount).toBe(1)
  expect(redone.clipCount).toBe(1)
})

test("a gesture wrapped in a transaction undoes as one step", async ({ page }) => {
  await openWithAProject(page)

  // The import gesture of T041: two commands, one thing the user did. Undo has to take back both.
  await page.evaluate(
    async ({ specifier, importSource, addClip }) => {
      const store = (await import(specifier)) as typeof EditorStore
      store.useEditorStore.getState().transact("Import", () => {
        const { run } = store.useEditorStore.getState()
        run(importSource)
        run(addClip)
      })
    },
    { specifier: STORE_MODULE, importSource: IMPORT_SOURCE, addClip: ADD_CLIP }
  )

  const imported = await snapshot(page)
  expect(imported.sourceCount).toBe(1)
  expect(imported.clipCount).toBe(1)
  expect(imported.durationFrames).toBe(300)
  // Two commands, one entry, carrying the gesture's own name rather than the last command's. The
  // `create-project` before it is the standalone command `openWithAProject` ran, which is its own
  // step — the contrast this whole spec turns on.
  expect(imported.past).toEqual(["create-project", "Import"])
  expect(imported.openTransaction).toBeNull()

  await page.getByTestId("undo").click()

  const undone = await snapshot(page)
  expect(undone.sourceCount).toBe(0)
  expect(undone.clipCount).toBe(0)
  expect(undone.durationFrames).toBe(0)
  expect(undone.past).toEqual(["create-project"])
  expect(undone.future).toEqual(["Import"])

  await page.getByTestId("redo").click()

  const redone = await snapshot(page)
  expect(redone.sourceCount).toBe(1)
  expect(redone.clipCount).toBe(1)
  expect(redone.durationFrames).toBe(300)
  expect(redone.past).toEqual(["create-project", "Import"])
})

test("the same two commands outside a transaction are two steps", async ({ page }) => {
  await openWithAProject(page)

  await page.evaluate(
    async ({ specifier, importSource, addClip }) => {
      const store = (await import(specifier)) as typeof EditorStore
      const { run } = store.useEditorStore.getState()
      run(importSource)
      run(addClip)
    },
    { specifier: STORE_MODULE, importSource: IMPORT_SOURCE, addClip: ADD_CLIP }
  )

  expect((await snapshot(page)).past).toEqual(["create-project", "import-source", "add-clip"])

  // One undo takes back one command, which is exactly the difference the transaction makes.
  await page.getByTestId("undo").click()
  const once = await snapshot(page)
  expect(once.sourceCount).toBe(1)
  expect(once.clipCount).toBe(0)
})

test("undo moves the document and leaves the Playhead and Source status where they were", async ({
  page,
}) => {
  await openWithAProject(page)

  await page.evaluate(
    async ({ specifier, importSource, addClip }) => {
      const store = (await import(specifier)) as typeof EditorStore
      const state = store.useEditorStore.getState()
      state.transact("Import", () => {
        const { run } = store.useEditorStore.getState()
        run(importSource)
        run(addClip)
      })
      // Runtime state, set after the edit and expected to survive it being taken back.
      state.setPlayhead(217)
      state.markSource("source-1", "linked")
    },
    { specifier: STORE_MODULE, importSource: IMPORT_SOURCE, addClip: ADD_CLIP }
  )

  const before = await snapshot(page)
  expect(before.playheadFrame).toBe(217)
  expect(before.sourceStatus).toEqual({ "source-1": "linked" })
  await expect(page.getByTestId("playhead")).toHaveText("Frame 217")

  await page.getByTestId("undo").click()

  const after = await snapshot(page)
  expect(after.sourceCount).toBe(0)
  // The two things undo must never touch. A Playhead past the end of a now-shorter Timeline stays
  // where the user put it — an empty Preview is correct (FR-008); a Playhead that jumped would not
  // be. And a granted permission is not an edit anyone can take back (Principle IV, T022).
  expect(after.playheadFrame).toBe(217)
  expect(after.sourceStatus).toEqual({ "source-1": "linked" })
  await expect(page.getByTestId("playhead")).toHaveText("Frame 217")
})

test("undoing the first command there ever was gets back to no Project at all", async ({
  page,
}) => {
  await openWithAProject(page)
  expect((await snapshot(page)).projectIsNull).toBe(false)

  await page.getByTestId("undo").click()

  // `create-project` is applied to nothing, so its inverse is a root replacement back to `null` —
  // Immer's own patch, replayed through `applyPatches`, which the type declaration says cannot
  // happen and the implementation does correctly.
  const undone = await snapshot(page)
  expect(undone.projectIsNull).toBe(true)
  expect(undone.past).toEqual([])

  await page.getByTestId("redo").click()
  expect((await snapshot(page)).projectIsNull).toBe(false)
})

test("an aborted gesture leaves the Project exactly as it was, and no step behind", async ({
  page,
}) => {
  await openWithAProject(page)

  const refusal = await page.evaluate(
    async ({ specifier, importSource, addClip }) => {
      const store = (await import(specifier)) as typeof EditorStore
      try {
        store.useEditorStore.getState().transact("Import", () => {
          const { run } = store.useEditorStore.getState()
          run(importSource)
          run(addClip)
          // The same Clip twice: the reducer refuses it, the gesture aborts, and everything the
          // gesture had already done has to go with it.
          run(addClip)
        })
        return "no refusal"
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    { specifier: STORE_MODULE, importSource: IMPORT_SOURCE, addClip: ADD_CLIP }
  )

  expect(refusal).toContain("already on the Timeline")

  const after = await snapshot(page)
  expect(after.sourceCount).toBe(0)
  expect(after.clipCount).toBe(0)
  expect(after.past).toEqual(["create-project"])
  expect(after.openTransaction).toBeNull()
})

test("undo is unavailable while a gesture is still being made", async ({ page }) => {
  await openWithAProject(page)

  const held = await page.evaluate(
    async ({ specifier, importSource }) => {
      const store = (await import(specifier)) as typeof EditorStore
      // A gesture that spans events — a drag — opened and deliberately not closed.
      const transaction = store.useEditorStore.getState().beginTransaction("Drag")
      store.useEditorStore.getState().run(importSource)

      const state = store.useEditorStore.getState()
      let refusal = ""
      try {
        state.undo()
      } catch (error) {
        refusal = error instanceof Error ? error.message : String(error)
      }

      const openNow = {
        canUndo: store.canUndo(store.useEditorStore.getState()),
        openTransaction: store.useEditorStore.getState().openTransaction,
        refusal,
      }

      transaction.commit()
      return { openNow, afterCommit: store.canUndo(store.useEditorStore.getState()) }
    },
    { specifier: STORE_MODULE, importSource: IMPORT_SOURCE }
  )

  expect(held.openNow.openTransaction).toBe("Drag")
  expect(held.openNow.canUndo).toBe(false)
  expect(held.openNow.refusal).toContain("cannot undo while the transaction Drag is open")
  expect(held.afterCommit).toBe(true)

  // The button follows `canUndo`, so a leaked transaction is a visibly stuck control rather than a
  // history that silently swallows every later edit.
  await expect(page.getByTestId("undo")).toBeEnabled()
})

test("a nested transaction joins the gesture instead of making a step of its own", async ({
  page,
}) => {
  await openWithAProject(page)

  await page.evaluate(
    async ({ specifier, importSource, addClip }) => {
      const store = (await import(specifier)) as typeof EditorStore
      store.useEditorStore.getState().transact("Outer", () => {
        const state = store.useEditorStore.getState()
        state.run(importSource)
        // A shared command sequence called from inside a larger gesture, which is how T041's import
        // will be reached from a drag one day. It must not become an undo step of its own.
        state.transact("Inner", () => {
          store.useEditorStore.getState().run(addClip)
        })
      })
    },
    { specifier: STORE_MODULE, importSource: IMPORT_SOURCE, addClip: ADD_CLIP }
  )

  const after = await snapshot(page)
  expect(after.past).toEqual(["create-project", "Outer"])

  await page.getByTestId("undo").click()
  const undone = await snapshot(page)
  expect(undone.sourceCount).toBe(0)
  expect(undone.clipCount).toBe(0)
})

test("an edit the renderer cannot see does not cost the engine a repost", async ({ page }) => {
  await openWithAProject(page)

  const revisions = await page.evaluate(
    async ({ specifier, importSource, addClip }) => {
      const store = (await import(specifier)) as typeof EditorStore
      const read = () => store.useEditorStore.getState().sceneRevision

      const afterCreate = read()
      store.useEditorStore.getState().run(importSource)
      const afterImport = read()
      store.useEditorStore.getState().run(addClip)
      return { afterCreate, afterImport, afterClip: read() }
    },
    { specifier: STORE_MODULE, importSource: IMPORT_SOURCE, addClip: ADD_CLIP }
  )

  // Importing a Source changes the document and not the picture — no Clip shows it yet — so the
  // Scene is the same object and the revision does not move. Adding the Clip does move it. This is
  // the memoisation `projectScene` promises, used the only way it may be: `===` to skip a repost.
  expect(revisions.afterImport).toBe(revisions.afterCreate)
  expect(revisions.afterClip).toBe(revisions.afterCreate + 1)
})

/** How many Sources `project-shell` has in storage, or -1 when it is not there. */
async function storedSources(page: Page): Promise<number> {
  return page.evaluate(async (projectsModule) => {
    const projects = (await import(projectsModule)) as typeof ProjectStore
    return (await projects.loadProject("project-shell"))?.sources.length ?? -1
  }, PROJECT_STORE_MODULE)
}

/**
 * A Project in storage with a gesture open on it that has done one thing nothing has written yet —
 * the state a drag is in when the tab goes away. Returns when the gesture's step was made, so the
 * caller can time what follows against the 500 ms debounce.
 */
async function midGesture(page: Page): Promise<number> {
  await openWithAProject(page)
  // `create-project` is a finished command, written at once; wait for it so that what is at risk
  // below is exactly the step the gesture has not committed.
  await expect.poll(() => storedSources(page)).toBe(0)

  await page.evaluate(
    ({ specifier, importSource }) =>
      import(specifier).then((store: typeof EditorStore) => {
        store.useEditorStore.getState().beginTransaction("Drag")
        store.useEditorStore.getState().run(importSource)
      }),
    { specifier: STORE_MODULE, importSource: IMPORT_SOURCE }
  )
  const steppedAt = Date.now()
  // Debounced, so nothing has been written: this is the whole reason the page needs a flush.
  expect(await storedSources(page)).toBe(0)
  return steppedAt
}

// The two ways a page really goes away, rather than a `pagehide` dispatched at a page that stays
// loaded — that version passed throughout while every real reload lost the write, because the
// write it started was aborted when the document was torn down (see `saveProject`).

test("a reload in the middle of a gesture does not take its edits with it", async ({ page }) => {
  const steppedAt = await midGesture(page)

  await page.reload()
  // Well inside the debounce, so the write landed because the page's leaving asked for it and not
  // because the timer fired first — which is the only way the assertion below means anything.
  expect(Date.now() - steppedAt).toBeLessThan(500)

  await page.waitForTimeout(1000)
  expect(await storedSources(page)).toBe(1)
})

test("a closing tab does not take the last edits with it", async ({ page, context }) => {
  const steppedAt = await midGesture(page)

  await page.close()
  expect(Date.now() - steppedAt).toBeLessThan(500)

  const reopened = await context.newPage()
  await reopened.goto("/")
  await reopened.waitForTimeout(1000)
  expect(await storedSources(reopened)).toBe(1)
})
