import { expect, test, type Page } from "@playwright/test"

import type * as Projects from "../src/storage/projects"

import { PROJECT_STORE_MODULE } from "./editor-fixtures"
import { installFilePicker } from "./file-picker"

// FR-020, against the browser's own unloading rather than a synthetic event: an edit the user has
// seen land is still there after a reload, or after navigating away and coming back — with no
// waiting in between, because the user was never asked to save and has no reason to wait.
//
// Every spec here leaves the page the instant the edit is on screen. None of them waits for the
// saver: that wait is exactly what a user does not do.

const FIXTURE = "sync-1080p30.mp4"

async function newProject(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("import-source")).toBeEnabled()
}

async function importThroughPanel(page: Page, sources: number): Promise<void> {
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("source-row")).toHaveCount(sources, { timeout: 20_000 })
}

/** How many Sources each stored Project holds, read straight from storage on the page now loaded. */
async function storedSourceCounts(page: Page): Promise<number[]> {
  return page.evaluate(async (specifier) => {
    const projects = (await import(specifier)) as typeof Projects
    const summaries = await projects.listProjects()
    return Promise.all(
      summaries.map(
        async (summary) => (await projects.loadProject(summary.id))?.sources.length ?? -1
      )
    )
  }, PROJECT_STORE_MODULE)
}

/** Waits long enough that a write still in flight would have landed, then reads storage. */
async function settledSourceCounts(page: Page): Promise<number[]> {
  await page.waitForTimeout(2000)
  return storedSourceCounts(page)
}

test("a reload right after the first import keeps the Project", async ({ page }) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE)
  await importThroughPanel(page, 1)

  await page.reload()

  expect(await settledSourceCounts(page)).toEqual([1])
  await expect(page.getByTestId("project-row")).toHaveCount(1)
  await page.getByTestId("project-row").click()
  await expect(page.getByTestId("source-row")).toHaveCount(1)
})

test("navigating away right after an import keeps the Project", async ({ page }) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE)
  await importThroughPanel(page, 1)

  // A real navigation: this document is unloaded and a different one takes its place.
  await page.goto("about:blank")
  await page.goto("/")

  expect(await settledSourceCounts(page)).toEqual([1])
})

test("a reload right after a second import keeps both Sources", async ({ page }) => {
  // The Project already exists in storage here; what is at risk is only the latest edit to it.
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE, { fixture: FIXTURE, as: "second.mp4" })
  await importThroughPanel(page, 1)
  await importThroughPanel(page, 2)

  await page.reload()

  expect(await settledSourceCounts(page)).toEqual([2])
})

test("a reload right after an undo keeps the undo", async ({ page }) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE, { fixture: FIXTURE, as: "second.mp4" })
  await importThroughPanel(page, 1)
  await importThroughPanel(page, 2)

  await page.getByTestId("undo").click()
  await expect(page.getByTestId("source-row")).toHaveCount(1)

  await page.reload()

  expect(await settledSourceCounts(page)).toEqual([1])
})
