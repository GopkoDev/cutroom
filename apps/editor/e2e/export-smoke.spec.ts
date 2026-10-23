import { expect, test } from "@playwright/test"

import { installFilePicker } from "./file-picker"
import { importFixture, newProject } from "./playback"

// The export path end to end, through the dialog's own buttons: the dialog asks the machine, the
// save picker is the first act of the click, the engine writes the file through the transferred
// stream, and the dialog says it is done only once it is. The fidelity, duration, cancel,
// later-edits and throughput assertions are T085–T089's; this proves the path they are written
// against, and the save-picker stand-in (`file-picker.ts`) it uses.

const FIXTURE = "sync-1080p30.mp4"
/** 30 s at 30 fps. */
const FRAMES = 900
/** Not the suggested name: that is the Source's own, and both live in the one stand-in disk. */
const EXPORTED = "export-smoke.mp4"

test("a one-Clip Project exports to an MP4 the dialog reports as done", async ({ page }) => {
  test.setTimeout(180_000)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE)
  await importFixture(page, 1)

  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog).toBeVisible()

  // Asked of this machine, at this Project's frame size: Standard preselected, every quality
  // listed, and the Timeline's sound offered as AAC.
  const standard = dialog.locator('[data-testid="export-quality"][data-quality="standard"]')
  await expect(standard).toHaveAttribute("data-available", "true", { timeout: 10_000 })
  await expect(standard.locator("input")).toBeChecked()
  await expect(dialog.getByTestId("export-quality")).toHaveCount(3)
  await expect(dialog.getByTestId("export-sound")).toHaveAttribute("data-sound", "available")

  await picker.queueSave(EXPORTED)
  await dialog.getByTestId("export-start").click()
  expect(await picker.lastSuggestedName()).toBe("sync-1080p30.mp4")

  // Running, with the way back to the Project list closed until it ends.
  await expect(dialog.getByTestId("export-progress")).toBeVisible()
  await expect(page.getByRole("button", { name: "Projects" })).toBeDisabled()

  const done = dialog.getByTestId("export-done")
  await expect(done).toBeVisible({ timeout: 150_000 })
  const bytes = Number(await done.getAttribute("data-bytes"))
  expect(bytes).toBeGreaterThan(0)
  expect(await picker.saves()).toBe(1)
  expect(await picker.fileSize(EXPORTED)).toBe(bytes)

  // An MP4 by its own header: a `ftyp` box first.
  const file = await picker.readFile(EXPORTED)
  expect(file.length).toBe(bytes)
  expect(file.subarray(4, 8).toString("latin1")).toBe("ftyp")

  await dialog.getByTestId("export-dismiss").click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Projects" })).toBeEnabled()
  // The Timeline is still the one exported; nothing about exporting edited it.
  await expect(page.getByTestId("timeline-clip")).toHaveAttribute(
    "data-duration-frames",
    String(FRAMES)
  )
})

test("closing the save picker starts nothing", async ({ page }) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE)
  await importFixture(page, 1)

  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })

  await picker.queueSave("cancel")
  await dialog.getByTestId("export-start").click()
  await expect(dialog.getByTestId("export-start")).toBeEnabled()
  await expect(dialog.getByTestId("export-progress")).toHaveCount(0)
  expect(await picker.saves()).toBe(1)
})
