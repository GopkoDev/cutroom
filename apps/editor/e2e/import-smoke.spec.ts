import { expect, test, type Page } from "@playwright/test"

import { installFilePicker } from "./file-picker"

// The import path end to end, through the Sources panel's own button, and the proof that the
// shared picker stand-in (`file-picker.ts`) behaves like the real thing for every call the import,
// status and relink code makes. T053–T058 are written against that helper; these are the checks
// that it is fit to be written against, not those specs' assertions.

const FIXTURE = "sync-1080p30.mp4"

/** 30 s at 30 fps, imported into an empty Project: the Project adopts 30/1, so 900 Frames. */
const FRAMES = 900

async function newProject(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("import-source")).toBeEnabled()
}

async function importThroughPanel(page: Page): Promise<void> {
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("source-row")).toHaveCount(1, { timeout: 20_000 })
}

test("a fixture picked through the Sources panel becomes a Linked Source and one Clip", async ({
  page,
}) => {
  const picker = await installFilePicker(page, { countBytes: true })
  await newProject(page)

  await picker.queue(FIXTURE)
  await importThroughPanel(page)

  await expect(page.getByTestId("import-refusal")).toHaveCount(0)
  const row = page.getByTestId("source-row")
  await expect(row.getByTestId("source-name")).toHaveText(FIXTURE)
  await expect(row.getByTestId("source-duration")).toContainText(`${FRAMES} Frames`)
  await expect(row.getByTestId("source-status")).toHaveText("Linked")

  const clip = page.getByTestId("timeline-clip")
  await expect(clip).toHaveCount(1)
  await expect(clip).toHaveAttribute("data-start-frame", "0")
  await expect(clip).toHaveAttribute("data-duration-frames", String(FRAMES))
  await expect(page.getByTestId("timeline-duration")).toContainText(`${FRAMES} Frames`)
  await expect(page.getByTestId("project-name")).toHaveText("sync-1080p30")

  expect(await picker.picks()).toBe(1)
  // The counter sees the engine's reads in its Worker: some, and not the whole file twice over.
  const read = await picker.bytesRead(FIXTURE)
  expect(read).toBeGreaterThan(0)
  expect(read).toBeLessThanOrEqual(2 * 174_817)
})

test("a file renamed on disk takes its Source Offline, and picking it again brings it back", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE)
  await importThroughPanel(page)
  await expect(page.getByTestId("source-status")).toHaveText("Linked")

  await picker.renameFile(FIXTURE, "renamed.mp4")
  expect(await picker.exists(FIXTURE)).toBe(false)
  // Coming back to the window is one of the occasions status is derived again (T051).
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))

  await expect(page.getByTestId("source-status")).toHaveText("Offline")
  await expect(page.getByTestId("relink-source")).toHaveAttribute("data-reason", "unreachable")
  await expect(page.getByTestId("timeline-clip")).toHaveAttribute("data-offline", "true")

  await picker.queue({ existing: "renamed.mp4" })
  await page.getByTestId("relink-find").click()

  await expect(page.getByTestId("source-status")).toHaveText("Linked")
  await expect(page.getByTestId("source-name")).toHaveText("renamed.mp4")
  await expect(page.getByTestId("relink-prompt")).toHaveCount(0)
})

test("after a reload the Source waits for permission, and one click grants it", async ({
  page,
}) => {
  const picker = await installFilePicker(page, { requestAnswer: "granted" })
  await newProject(page)
  await picker.queue(FIXTURE)
  await importThroughPanel(page)
  await expect(page.getByTestId("source-status")).toHaveText("Linked")

  // What a real browser does to a handle restored from IndexedDB in a new session (ADR 0005).
  await picker.setPermission("prompt")
  await page.reload()
  await page.getByTestId("project-row").click()

  await expect(page.getByTestId("source-status")).toHaveText("Offline")
  await expect(page.getByTestId("relink-source")).toHaveAttribute("data-reason", "needs-permission")
  expect((await picker.permissionCalls()).requested).toBe(0)

  await page.getByTestId("relink-allow").click()

  await expect(page.getByTestId("source-status")).toHaveText("Linked")
  expect(await picker.permissionOf(FIXTURE)).toBe("granted")
  expect((await picker.permissionCalls()).requested).toBe(1)
})

test("a refused grant leaves the Source Offline and says so", async ({ page }) => {
  const picker = await installFilePicker(page, { requestAnswer: "denied" })
  await newProject(page)
  await picker.queue(FIXTURE)
  await importThroughPanel(page)

  await picker.setPermission("prompt")
  await page.reload()
  await page.getByTestId("project-row").click()
  await page.getByTestId("relink-allow").click()

  await expect(page.getByTestId("relink-failure")).toContainText("not granted")
  await expect(page.getByTestId("source-status")).toHaveText("Offline")
  expect(await picker.permissionOf(FIXTURE)).toBe("denied")
})
