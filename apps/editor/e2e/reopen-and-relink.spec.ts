import { expect, test, type Page } from "@playwright/test"

import type * as EditorStore from "../src/store"

import { STORE_MODULE } from "./editor-fixtures"
import { installFilePicker } from "./file-picker"

// T056: a reload, then the way back — the Project list, the same Timeline, an honest Offline
// Source, and one click that brings the Preview back without the Timeline being touched (SC-008,
// FR-020, FR-021, FR-022). The rough version of this path lives in `import-smoke.spec.ts`, as the
// check that the picker stand-in is fit to write this spec against; this is the task's own.

const FIXTURE = "sync-1080p30.mp4"
const PROJECT_NAME = "sync-1080p30"

interface ClipOnScreen {
  id: string | null
  start: string | null
  duration: string | null
  title: string | null
}

/** Every Clip the Timeline draws, by the attributes it draws them with. */
async function clipsOnScreen(page: Page): Promise<ClipOnScreen[]> {
  return page.getByTestId("timeline-clip").evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute("data-clip-id"),
      start: element.getAttribute("data-start-frame"),
      duration: element.getAttribute("data-duration-frames"),
      title: element.getAttribute("title"),
    }))
  )
}

/** The document's Timeline and Sources, and the undo depth, as the running store holds them. */
async function documentState(page: Page): Promise<{
  timeline: string
  sources: string
  past: number
}> {
  return page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    const state = store.useEditorStore.getState()
    if (state.project === null) throw new Error("no Project is open")
    return {
      timeline: JSON.stringify(state.project.timeline),
      sources: JSON.stringify(state.project.sources),
      past: state.past.length,
    }
  }, STORE_MODULE)
}

/**
 * Reads the Preview back. The fixture is a black field with a white Frame counter burned in, so a
 * decoded Frame has bright pixels and an empty Preview — the opaque black stage — has none.
 */
async function previewRaster(
  page: Page
): Promise<{ bright: number; opaqueBlack: number; total: number }> {
  return page.evaluate(async () => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid=preview-canvas]")
    if (element === null) throw new Error("the Preview canvas is not on the page")
    // The worker's frames reach the element when the compositor next runs.
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
    const bitmap = await createImageBitmap(element)
    const probe = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = probe.getContext("2d")
    if (context === null) throw new Error("no 2d context to read the Frame back through")
    context.drawImage(bitmap, 0, 0)
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
    let bright = 0
    let opaqueBlack = 0
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
      if (r > 128 && g > 128 && b > 128) bright++
      if (r === 0 && g === 0 && b === 0 && a === 255) opaqueBlack++
    }
    return { bright, opaqueBlack, total: data.length / 4 }
  })
}

test("a reloaded Project is listed, reopens with the same Timeline, waits Offline, and one grant brings the Preview back", async ({
  page,
}) => {
  const picker = await installFilePicker(page, { requestAnswer: "granted" })

  // ---------------------------------------------------------------- a Project worth reopening
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await picker.queue(FIXTURE)
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("source-status")).toHaveText("Linked", { timeout: 20_000 })
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1)
  // The Preview is live before the reload, so "works again" below is a comparison, not a guess.
  await expect
    .poll(async () => (await previewRaster(page)).bright, { timeout: 10_000 })
    .toBeGreaterThan(0)

  const clipsBefore = await clipsOnScreen(page)
  const durationBefore = await page.getByTestId("timeline-duration").textContent()
  const documentBefore = await documentState(page)

  // ---------------------------------------------------------------- the reload
  // What a real browser does to a handle restored from IndexedDB in a new session (ADR 0005).
  await picker.setPermission("prompt")
  await page.reload()

  // FR-020: back on the Project list, not in a blank editor, and the Project is in it.
  await expect(page.getByTestId("project-list")).toBeVisible()
  await expect(page.getByTestId("editor-shell")).toHaveCount(0)
  await expect(page.getByTestId("project-row")).toHaveCount(1)
  await expect(page.getByTestId("project-row-name")).toHaveText(PROJECT_NAME)
  await expect(page.getByTestId("project-row-unopenable")).toHaveCount(0)

  await page.getByTestId("project-row").click()
  await expect(page.getByTestId("editor-shell")).toBeVisible()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("project-name")).toHaveText(PROJECT_NAME)

  // SC-008: the same Timeline, Clip for Clip, attribute for attribute — and the same document.
  await expect(page.getByTestId("timeline-clip")).toHaveCount(clipsBefore.length)
  expect(await clipsOnScreen(page)).toEqual(clipsBefore)
  await expect(page.getByTestId("timeline-duration")).toHaveText(durationBefore ?? "")
  const documentReopened = await documentState(page)
  expect(documentReopened.timeline).toBe(documentBefore.timeline)
  expect(documentReopened.sources).toBe(documentBefore.sources)

  // Offline, and saying why — not Linked over a handle that cannot be read, which would be
  // "silently wrong". Its Clip is kept and drawn as Offline (FR-022).
  await expect(page.getByTestId("source-status")).toHaveText("Offline")
  await expect(page.getByTestId("relink-source")).toHaveAttribute("data-reason", "needs-permission")
  await expect(page.getByTestId("timeline-clip")).toHaveAttribute("data-offline", "true")
  // The Preview renders the Offline Source as empty rather than as a stale or wrong picture: a
  // Frame was drawn (an undrawn canvas would read back blank and prove nothing), and it is the
  // opaque black stage, every pixel of it.
  await expect(page.getByTestId("preview-shown")).toHaveText(/^showing Frame 0 of Scene \d+$/, {
    timeout: 10_000,
  })
  const offlineRaster = await previewRaster(page)
  expect(offlineRaster.opaqueBlack).toBe(offlineRaster.total)

  // Opening asked the browser where it stands and did not ask the user anything (ADR 0005).
  const beforeAct = await picker.permissionCalls()
  expect(beforeAct.requested).toBe(0)
  expect(beforeAct.queried).toBeGreaterThan(0)
  expect(await picker.permissionOf(FIXTURE)).toBe("prompt")

  // ---------------------------------------------------------------- the user re-grants
  await page.getByTestId("relink-allow").click()

  await expect(page.getByTestId("source-status")).toHaveText("Linked")
  await expect(page.getByTestId("relink-prompt")).toHaveCount(0)
  await expect(page.getByTestId("relink-failure")).toHaveCount(0)
  await expect(page.getByTestId("timeline-clip")).not.toHaveAttribute("data-offline", "true")
  expect((await picker.permissionCalls()).requested).toBe(1)
  expect(await picker.permissionOf(FIXTURE)).toBe("granted")
  // A grant, not a re-pick: the picker was never opened in this page load.
  expect(await picker.picks()).toBe(0)

  // The Preview works again: the decoded Frame under the Playhead, counter and all.
  await expect
    .poll(async () => (await previewRaster(page)).bright, { timeout: 10_000 })
    .toBeGreaterThan(0)

  // FR-022: without the Timeline being rebuilt — the same Clips, the same document, and no command
  // run against it (a re-grant is runtime state, not an edit).
  expect(await clipsOnScreen(page)).toEqual(clipsBefore)
  const documentAfter = await documentState(page)
  expect(documentAfter.timeline).toBe(documentBefore.timeline)
  expect(documentAfter.sources).toBe(documentBefore.sources)
  expect(documentAfter.past).toBe(documentReopened.past)
})
