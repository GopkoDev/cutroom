import { expect, test } from "@playwright/test"

import { installFilePicker } from "./file-picker"
import { importFixture, newProject } from "./playback"

// Saving an export over a file a Source reads from is refused before anything is written
// (decisions.md, "Saving over a linked Source is refused"; T075). The save picker's answer is
// compared with every Source's handle through `isSameEntry` — here with real OPFS handles, so the
// browser's own comparison is what decides — and a match ends in a plain refusal: no export
// starts, the Source's file is byte for byte what it was, and the Source stays Linked.

test("the suggested name is the Source's own file: refused, and the Source is untouched", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  const before = await picker.readFile("sync-1080p30.mp4")

  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })
  // The app suggests the Project's name, which an import takes from the Source: accepting the
  // suggestion is the easy way to land on the Source itself.
  await picker.queueSave({ suggested: true })
  await dialog.getByTestId("export-start").click()
  expect(await picker.lastSuggestedName()).toBe("sync-1080p30.mp4")

  const refused = dialog.getByTestId("export-refused")
  await expect(refused).toBeVisible()
  await expect(refused).toContainText("sync-1080p30.mp4")
  await expect(refused).toContainText("would destroy that Source")
  await expect(dialog.getByTestId("export-progress")).toHaveCount(0)
  await expect(dialog.getByTestId("export-done")).toHaveCount(0)

  const after = await picker.readFile("sync-1080p30.mp4")
  expect(after.equals(before)).toBe(true)
  await expect(page.getByTestId("source-status")).toHaveText("Linked")

  // Nothing is stuck: another name exports.
  await dialog.getByTestId("export-dismiss").click()
  await page.getByTestId("export-open").click()
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })
  await picker.queueSave("not-the-source.mp4")
  await dialog.getByTestId("export-start").click()
  await expect(dialog.getByTestId("export-done")).toBeVisible({ timeout: 90_000 })
  expect((await picker.readFile("sync-1080p30.mp4")).equals(before)).toBe(true)
})

test("any Source's file is refused, not only the first's, and named in the refusal", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await picker.queue("sync-1080p2997.mp4")
  await importFixture(page, 2)
  const before = await picker.readFile("sync-1080p2997.mp4")

  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })
  await picker.queueSave("sync-1080p2997.mp4")
  await dialog.getByTestId("export-start").click()

  const refused = dialog.getByTestId("export-refused")
  await expect(refused).toBeVisible()
  await expect(refused).toContainText("the Source sync-1080p2997.mp4 reads from")
  expect((await picker.readFile("sync-1080p2997.mp4")).equals(before)).toBe(true)
  await expect(page.getByTestId("source-status")).toHaveText(["Linked", "Linked"])
})
