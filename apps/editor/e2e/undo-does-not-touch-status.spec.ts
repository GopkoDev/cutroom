import { expect, test, type Page } from "@playwright/test"

import type * as EditorStore from "../src/store"

import { STORE_MODULE } from "./editor-fixtures"
import { installFilePicker, type FilePicker } from "./file-picker"

// T058 — undo after a real import restores the document and leaves every Source's Linked/Offline
// status exactly as it is *now* (T034, T051, Principle IV).
//
// The import is made through the Sources panel, so the status was written by the real tracker and
// not by a test calling `markSource`. And the status is changed *after* the import, in both
// directions, before anything is undone: a status that is still what it was at import time would
// pass even against an undo that snapshotted and "restored" it, so only a status that has moved
// since can tell "undo leaves it alone" from "undo puts it back".

const A = "sync-1080p30.mp4"
/** Imported under a name of its own, so the two rows are told apart by name. */
const B = "second.mp4"

/** 30 s at 30/1: the first import sets the Project to 30/1, so every Clip below is 900 Frames. */
const FRAMES = 900

interface Snapshot {
  readonly projectIsNull: boolean
  readonly sourceNames: readonly string[]
  readonly clipCount: number
  readonly past: readonly string[]
  readonly future: readonly string[]
  readonly sourceStatus: Record<string, string>
  readonly sourceOffline: Record<string, string>
  /** Source name → id, from the Project if it is there. */
  readonly ids: Record<string, string>
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    const state = store.useEditorStore.getState()
    const sources = state.project?.sources ?? []
    return {
      projectIsNull: state.project === null,
      sourceNames: sources.map((source) => source.name),
      clipCount: state.project?.timeline.tracks[0]?.clips.length ?? 0,
      past: state.past.map((entry) => entry.label),
      future: state.future.map((entry) => entry.label),
      sourceStatus: { ...state.sourceStatus },
      sourceOffline: Object.fromEntries(
        Object.entries(state.sourceOffline).map(([id, why]) => [id, why.reason])
      ),
      ids: Object.fromEntries(sources.map((source) => [source.name, source.id])),
    }
  }, STORE_MODULE)
}

async function newProject(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("import-source")).toBeEnabled()
}

function row(page: Page, name: string) {
  return page.getByTestId("source-row").filter({
    has: page.getByTestId("source-name").getByText(name, { exact: true }),
  })
}

async function importThroughPanel(
  page: Page,
  picker: FilePicker,
  entry: Parameters<FilePicker["queue"]>[0],
  name: string
) {
  const count = await page.getByTestId("source-row").count()
  await picker.queue(entry)
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("source-row")).toHaveCount(count + 1, { timeout: 20_000 })
  await expect(page.getByTestId("import-refusal")).toHaveCount(0)
  await expect(row(page, name).getByTestId("source-status")).toHaveText("Linked")
}

/** Coming back to the window is one of the three occasions status is derived again (T051). */
async function regainFocus(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
}

test("undoing the first import takes the Project away and leaves its Source's status alone", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await importThroughPanel(page, picker, A, A)

  const imported = await snapshot(page)
  const id = imported.ids[A] as string
  expect(imported.past).toEqual([`Import ${A}`])
  expect(imported.sourceStatus).toEqual({ [id]: "linked" })

  await page.getByTestId("undo").click()

  const undone = await snapshot(page)
  expect(undone.projectIsNull).toBe(true)
  expect(undone.past).toEqual([])
  expect(undone.future).toEqual([`Import ${A}`])
  // The document went; the verdict about the file on disk did not, because it is not an edit.
  expect(undone.sourceStatus).toEqual(imported.sourceStatus)
  await expect(page.getByTestId("source-row")).toHaveCount(0)
  await expect(page.getByTestId("timeline-clip")).toHaveCount(0)

  await page.getByTestId("redo").click()

  const redone = await snapshot(page)
  expect(redone.sourceNames).toEqual([A])
  expect(redone.sourceStatus).toEqual(imported.sourceStatus)
  // Shown Linked at once — not "Checking…", which is what a status lost to the undo would read.
  await expect(row(page, A).getByTestId("source-status")).toHaveText("Linked")
  await expect(page.getByTestId("timeline-clip")).not.toHaveAttribute("data-offline")
})

test("a Source that went Offline after the import stays Offline through undo and redo", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await importThroughPanel(page, picker, A, A)
  await importThroughPanel(page, picker, { fixture: A, as: B }, B)

  const imported = await snapshot(page)
  const idA = imported.ids[A] as string
  const idB = imported.ids[B] as string
  expect(imported.past).toEqual([`Import ${A}`, `Import ${B}`])
  expect(imported.sourceStatus).toEqual({ [idA]: "linked", [idB]: "linked" })

  // After both imports: A's file is renamed under it, and coming back to the window notices.
  await picker.renameFile(A, "moved-away.mp4")
  await regainFocus(page)
  await expect(row(page, A).getByTestId("source-status")).toHaveText("Offline")
  await expect(row(page, B).getByTestId("source-status")).toHaveText("Linked")
  const changed = await snapshot(page)
  expect(changed.sourceStatus).toEqual({ [idA]: "offline", [idB]: "linked" })
  expect(changed.sourceOffline).toEqual({ [idA]: "unreachable" })
  // Status is not an edit: going Offline added no history.
  expect(changed.past).toEqual(imported.past)

  // Undo B's import. A was Linked when B was imported; it must stay what it is now.
  await page.getByTestId("undo").click()
  const once = await snapshot(page)
  expect(once.sourceNames).toEqual([A])
  expect(once.clipCount).toBe(1)
  expect(once.sourceStatus).toEqual(changed.sourceStatus)
  expect(once.sourceOffline).toEqual(changed.sourceOffline)
  await expect(row(page, A).getByTestId("source-status")).toHaveText("Offline")
  await expect(page.getByTestId("timeline-clip")).toHaveAttribute("data-offline", "true")

  // Undo A's import too: no Project, and still no status moved.
  await page.getByTestId("undo").click()
  const twice = await snapshot(page)
  expect(twice.projectIsNull).toBe(true)
  expect(twice.sourceStatus).toEqual(changed.sourceStatus)
  expect(twice.sourceOffline).toEqual(changed.sourceOffline)

  // Redo both. A comes back into the document Offline — the import that once made it Linked is
  // being replayed, and replaying it must not replay a verdict about a file that has since moved.
  await page.getByTestId("redo").click()
  await page.getByTestId("redo").click()
  const redone = await snapshot(page)
  expect(redone.sourceNames).toEqual([A, B])
  expect(redone.sourceStatus).toEqual(changed.sourceStatus)
  await expect(row(page, A).getByTestId("source-status")).toHaveText("Offline")
  await expect(row(page, B).getByTestId("source-status")).toHaveText("Linked")
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2)
})

test("a Source that came back Linked after the import stays Linked through undo", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await importThroughPanel(page, picker, A, A)

  // A goes Offline *before* B is imported, so at the moment of B's import A is Offline.
  await picker.renameFile(A, "moved-away.mp4")
  await regainFocus(page)
  await expect(row(page, A).getByTestId("source-status")).toHaveText("Offline")

  await importThroughPanel(page, picker, { fixture: A, as: B }, B)
  const imported = await snapshot(page)
  const idA = imported.ids[A] as string
  const idB = imported.ids[B] as string
  expect(imported.sourceStatus).toEqual({ [idA]: "offline", [idB]: "linked" })

  // Then the file is put back where it was, and coming back to the window brings A back.
  await picker.renameFile("moved-away.mp4", A)
  await regainFocus(page)
  await expect(row(page, A).getByTestId("source-status")).toHaveText("Linked")
  const changed = await snapshot(page)
  expect(changed.sourceStatus).toEqual({ [idA]: "linked", [idB]: "linked" })
  expect(changed.sourceOffline).toEqual({})
  expect(changed.past).toEqual(imported.past)

  // Undo B's import: A must not fall back to the Offline it was in when B came in.
  await page.getByTestId("undo").click()
  const undone = await snapshot(page)
  expect(undone.sourceNames).toEqual([A])
  expect(undone.sourceStatus).toEqual(changed.sourceStatus)
  expect(undone.sourceOffline).toEqual({})
  await expect(row(page, A).getByTestId("source-status")).toHaveText("Linked")
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1)
  await expect(page.getByTestId("timeline-clip")).not.toHaveAttribute("data-offline")
  await expect(page.getByTestId("timeline-clip")).toHaveAttribute(
    "data-duration-frames",
    String(FRAMES)
  )
})
