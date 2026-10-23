import { expect, test, type Page } from "@playwright/test"

import type * as Db from "../src/storage/db"

import { aStoredProject, DB_MODULE } from "./editor-fixtures"
import { installFaults } from "./faults"
import { installFilePicker } from "./file-picker"
import { importFixture, newProject } from "./playback"

// Every failure a user can hit says what happened in plain words, offers the action that helps,
// and keeps the technical detail folded under "Details" (T093, Principle V, the spec's edge
// cases). Each test causes one failure the way the platform would raise it (`faults.ts`), reads
// the screen the user would read, and then takes the action offered, to prove it is a real way
// back and not decoration. The failures already covered elsewhere — refused files
// (refuses-unusable-files.spec.ts), Offline Sources and Relink (reopen-and-relink.spec.ts,
// source-vanishes-mid-session.spec.ts, import-smoke.spec.ts), saving over a Source
// (export-refuses-a-source.spec.ts) and the unsupported browser (capability-gate.spec.ts) — are
// not repeated here; failures.md lists which spec covers which.

/** Opens a Notice's "Details" and returns what is folded under it. */
async function details(page: Page, testId: string): Promise<string> {
  const folded = page.getByTestId(`${testId}-details`)
  await folded.locator("summary").click()
  return (await folded.locator("pre").textContent()) ?? ""
}

test("a stopped engine says the Project is saved and offers Reload, which brings it back", async ({
  page,
}) => {
  const faults = await installFaults(page)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)

  await faults.stopTheEngine()

  const stopped = page.getByTestId("engine-fatal")
  await expect(stopped).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId("engine-fatal-title")).toHaveText("Cutroom's engine stopped.")
  await expect(page.getByTestId("engine-fatal-saved")).toHaveText(
    "Your Project is saved, so reloading loses nothing."
  )
  // The worker's own words are kept, folded away, not dropped and not leading.
  expect(await details(page, "engine-fatal")).toMatch(/a message the engine does not have/)
  await expect(stopped).not.toContainText("[object")

  // What needs the engine is closed, rather than left to fail and blame something else.
  await expect(page.getByTestId("import-source")).toBeDisabled()
  await expect(page.getByTestId("export-open")).toBeDisabled()
  await expect(page.getByTestId("transport")).toBeDisabled()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine stopped")

  // The action offered is a real way back: the Project is in the list, and opens.
  await page.getByTestId("engine-fatal-reload").click()
  await expect(page.getByTestId("project-row-name")).toHaveText("sync-1080p30")
  await page.getByTestId("project-row").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("source-row")).toHaveCount(1)
  await expect(page.getByTestId("engine-fatal")).toHaveCount(0)
})

test("a save that fails is on screen with Try again, and the way out waits for it", async ({
  page,
}) => {
  const faults = await installFaults(page)
  const picker = await installFilePicker(page)
  await newProject(page)
  await faults.set("save-refused", true)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)

  const failure = page.getByTestId("save-failure")
  await expect(failure).toBeVisible()
  await expect(page.getByTestId("save-failure-title")).toHaveText(
    "Your latest changes could not be saved."
  )
  await expect(failure).toContainText("run out of space")
  expect(await details(page, "save-failure")).toBe(
    "QuotaExceededError: The quota has been exceeded."
  )
  // Leaving for the list would throw the only copy away, so it is closed while this lasts.
  await expect(page.getByRole("button", { name: "Projects" })).toBeDisabled()

  await faults.set("save-refused", false)
  await page.getByTestId("save-retry").click()
  await expect(failure).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Projects" })).toBeEnabled()

  await page.getByRole("button", { name: "Projects" }).click()
  await expect(page.getByTestId("project-row-name")).toHaveText("sync-1080p30")
})

test("storage that cannot be opened says so on the Project list, and Try again lists them", async ({
  page,
}) => {
  const faults = await installFaults(page)
  await page.goto("/")
  await faults.set("storage-unavailable", true)
  await page.reload()

  const failed = page.getByTestId("project-list-failed")
  await expect(failed).toBeVisible()
  await expect(page.getByTestId("project-list-failed-title")).toHaveText(
    "Your Projects could not be read from this browser's storage."
  )
  await expect(failed).toContainText("could not use Cutroom's storage")
  expect(await details(page, "project-list-failed")).toBe(
    "UnknownError: Internal error opening backing store."
  )

  await faults.set("storage-unavailable", false)
  await page.getByTestId("project-list-retry").click()
  await expect(page.getByTestId("project-list-empty")).toBeVisible()
  await expect(failed).toHaveCount(0)
})

test("a Project that cannot be opened is named, left alone, and the reason kept for Details", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(
    async ({ dbModule, stored }) => {
      const db = (await import(dbModule)) as typeof Db
      const database = await db.openCutroomDatabase()
      await database.put("projects", stored as { readonly id: string })
    },
    {
      dbModule: DB_MODULE,
      // Version 1 by its own account, so it is listed as openable — and its Timeline is gone.
      stored: { ...aStoredProject({ id: "damaged", name: "Damaged cut" }), timeline: null },
    }
  )
  await page.reload()
  await page.getByTestId("project-row").click()

  await expect(page.getByTestId("open-failure-title")).toHaveText(
    "Damaged cut could not be opened."
  )
  await expect(page.getByTestId("open-failure")).toContainText("left exactly as it is")
  expect(await details(page, "open-failure")).toMatch(/timeline/i)
  await expect(page.getByTestId("editor-shell")).toHaveCount(0)
  await expect(page.getByTestId("project-row")).toBeVisible()
})

test("an import whose picker fails is not blamed on a file, and Try again imports", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)

  // Nothing queued: the stand-in picker fails loudly, as a picker that could not open would.
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("import-picker-failed-title")).toHaveText(
    "The file picker could not be opened."
  )
  await expect(page.getByTestId("import-refusal")).toHaveCount(0)
  expect(await details(page, "import-picker-failed")).not.toBe("")

  await picker.queue("sync-1080p30.mp4")
  await page.getByTestId("import-retry").click()
  await expect(page.getByTestId("source-row")).toHaveCount(1, { timeout: 20_000 })
  await expect(page.getByTestId("import-picker-failed")).toHaveCount(0)
})

test("an export whose destination fills up says so plainly, leaves no partial file, and another try finishes", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const faults = await installFaults(page)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)

  await faults.set("destination-full", true)
  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })
  await picker.queueSave("full.mp4")
  await dialog.getByTestId("export-start").click()

  const failed = dialog.getByTestId("export-failed")
  await expect(failed).toBeVisible({ timeout: 60_000 })
  await expect(dialog.getByTestId("export-failed-title")).toHaveText(
    "There was not enough space to save the file."
  )
  await expect(failed).toHaveAttribute("data-leftover", "removed")
  await expect(failed).toContainText("No file was left at full.mp4.")
  // The platform's words are under Details, not in what is read first.
  expect(await failed.innerText()).not.toContain("QuotaExceededError")
  expect(await details(page, "export-failed")).toMatch(/QuotaExceededError|not enough space/)
  expect(await picker.exists("full.mp4")).toBe(false)
  await expect(dialog.getByTestId("export-done")).toHaveCount(0)

  // "Choose another name…" goes straight to the save dialog with the same settings.
  await faults.set("destination-full", false)
  await picker.queueSave("roomy.mp4")
  await expect(dialog.getByTestId("export-retry")).toHaveText("Choose another name…")
  await dialog.getByTestId("export-retry").click()
  await expect(dialog.getByTestId("export-done")).toBeVisible({ timeout: 90_000 })
  expect(await picker.fileSize("roomy.mp4")).toBeGreaterThan(0)
})

test("a save dialog that fails to open is said to be the dialog, and Try again exports", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)

  // Nothing queued for the save picker: the stand-in fails loudly.
  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })
  await dialog.getByTestId("export-start").click()

  await expect(dialog.getByTestId("export-failed-title")).toHaveText(
    "The save dialog could not be opened."
  )
  await expect(dialog.getByTestId("export-failed")).toHaveAttribute("data-stage", "choosing")
  await expect(dialog.getByTestId("export-failed")).toContainText("No file was written.")

  await picker.queueSave("second-try.mp4")
  await expect(dialog.getByTestId("export-retry")).toHaveText("Try again")
  await dialog.getByTestId("export-retry").click()
  await expect(dialog.getByTestId("export-done")).toBeVisible({ timeout: 90_000 })
})

test("an export over an Offline Source says, before it starts, that its Clips will be empty", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)

  // The file goes away; the next Frame asked for notices (source-vanishes-mid-session.spec.ts).
  await picker.removeFile("sync-1080p30.mp4")
  await page.getByTestId("timeline-body").focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByTestId("source-status")).toHaveText("Offline")
  await expect(page.getByTestId("relink-source")).toContainText(
    "The file is no longer where it was."
  )
  await expect(page.getByTestId("relink-find")).toBeVisible()

  await page.getByTestId("export-open").click()
  const warning = page.getByTestId("export-offline-warning")
  await expect(warning).toHaveText(
    "sync-1080p30.mp4 is Offline: its Clips will be exported as the Preview shows them, empty."
  )
})
