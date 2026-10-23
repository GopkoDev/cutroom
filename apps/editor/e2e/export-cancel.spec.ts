import { expect, test, type Locator, type Page } from "@playwright/test"

import { installFilePicker, type FilePicker } from "./file-picker"
import { importFixture, newProject } from "./playback"

// SC-009: a running export, cancelled through the dialog, says so within two seconds and leaves no
// complete file behind (T087, FR-018).
//
// The two seconds are measured **in the page**, from the Cancel button's own `click` event to the
// moment `export-cancelled` is in the document (a MutationObserver), so Playwright's round trips
// are not in the number. Cancelled at three points: the instant the export starts, part-way
// through the picture, and part-way through an export over an existing file.
//
// What "no complete file" means depends on what was there (store/export.ts, "How it ends"): a new
// name — which the save picker creates empty — is gone or empty afterwards; an existing file the
// user chose to replace is byte for byte what it was, because an export that never finishes never
// commits.

/** 30 s at 30 fps, then 30 s of the 29.97 fixture: 1800 Frames, several seconds to export. */
const TOTAL = 1800
const LIMIT_MS = 2000

async function twoClipProject(page: Page): Promise<FilePicker> {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await picker.queue("sync-1080p2997.mp4")
  await importFixture(page, 2)
  return picker
}

async function openDialog(page: Page): Promise<Locator> {
  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })
  return dialog
}

/** Starts timing in the page: the next Cancel click, and when `export-cancelled` appears. */
async function armCancelClock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const clock: { clicked: number | null; cancelled: number | null } = {
      clicked: null,
      cancelled: null,
    }
    ;(window as unknown as { __cancelClock: typeof clock }).__cancelClock = clock
    window.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element | null
        if (clock.clicked === null && target?.closest("[data-testid=export-cancel]")) {
          clock.clicked = performance.now()
        }
      },
      { capture: true }
    )
    const observer = new MutationObserver(() => {
      if (clock.cancelled === null && document.querySelector("[data-testid=export-cancelled]")) {
        clock.cancelled = performance.now()
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

async function cancelMs(page: Page): Promise<number> {
  const clock = await page.evaluate(
    () =>
      (window as unknown as { __cancelClock: { clicked: number | null; cancelled: number | null } })
        .__cancelClock
  )
  if (clock.clicked === null || clock.cancelled === null) {
    throw new Error(`the cancel clock did not see both ends: ${JSON.stringify(clock)}`)
  }
  return clock.cancelled - clock.clicked
}

/** Frames done, as the dialog reads it. */
async function framesDone(dialog: Locator): Promise<number> {
  const text = (await dialog.getByTestId("export-frames").textContent()) ?? ""
  const match = /^(\d+) of (\d+) Frames/.exec(text)
  if (match === null) throw new Error(`unexpected progress text: ${text}`)
  expect(Number(match[2])).toBe(TOTAL)
  return Number(match[1])
}

/** Cancels through the button and returns the in-page time to `export-cancelled`. */
async function cancelAndTime(page: Page, dialog: Locator): Promise<number> {
  await dialog.getByTestId("export-cancel").click()
  await expect(dialog.getByTestId("export-cancelled")).toBeVisible({ timeout: 10_000 })
  const ms = await cancelMs(page)
  expect(ms).toBeLessThanOrEqual(LIMIT_MS)
  return ms
}

function record(name: string, ms: number, frames: number): void {
  test.info().annotations.push({
    type: "cancel",
    description: `${name}: ${ms.toFixed(1)} ms from click to export-cancelled, at ${frames} of ${TOTAL} Frames`,
  })
  console.log(`[export-cancel] ${name}: ${ms.toFixed(1)} ms at ${frames}/${TOTAL}`)
}

test("cancelled the moment it starts: answered within 2 s, no file left, and the next export runs", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const picker = await twoClipProject(page)
  const dialog = await openDialog(page)
  await armCancelClock(page)

  await picker.queueSave("cancel-at-once.mp4")
  await dialog.getByTestId("export-start").click()
  // The first moment there is a Cancel button to press.
  await expect(dialog.getByTestId("export-cancel")).toBeEnabled()
  const at = await framesDone(dialog)
  const ms = await cancelAndTime(page, dialog)
  record("at once", ms, at)

  await expect(dialog.getByTestId("export-cancelled")).toHaveAttribute("data-leftover", "removed")
  expect(await picker.fileSize("cancel-at-once.mp4")).toBeFalsy() // absent (null) or empty (0)

  // The slot is free again: the same destination exports to the end.
  await dialog.getByTestId("export-dismiss").click()
  await expect(page.getByRole("button", { name: "Projects" })).toBeEnabled()
  await page.getByTestId("export-open").click()
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })
  await picker.queueSave("cancel-at-once.mp4")
  await dialog.getByTestId("export-start").click()
  const done = dialog.getByTestId("export-done")
  await expect(done).toBeVisible({ timeout: 150_000 })
  expect(await picker.fileSize("cancel-at-once.mp4")).toBe(
    Number(await done.getAttribute("data-bytes"))
  )
})

test("cancelled part-way through: answered within 2 s, and the part written is not left behind", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const picker = await twoClipProject(page)
  const dialog = await openDialog(page)
  await armCancelClock(page)

  await picker.queueSave("cancel-mid-run.mp4")
  await dialog.getByTestId("export-start").click()
  // A third of the way: the encoder, the muxer and the mix are all busy, and bytes have gone
  // down the stream to the destination (into its uncommitted swap file, until a close).
  await expect.poll(() => framesDone(dialog), { timeout: 60_000 }).toBeGreaterThanOrEqual(600)
  const at = await framesDone(dialog)
  expect(at).toBeLessThan(TOTAL)
  const ms = await cancelAndTime(page, dialog)
  record("mid-run", ms, at)

  await expect(dialog.getByTestId("export-cancelled")).toHaveAttribute("data-leftover", "removed")
  expect(await picker.fileSize("cancel-mid-run.mp4")).toBeFalsy()
})

test("cancelled over an existing file: answered within 2 s, and the file is exactly as it was", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const picker = await twoClipProject(page)
  // The user's own file, chosen as the destination to replace: a real MP4, not the Sources'.
  await picker.writeFile("silent-720p24.mp4", "keep-me.mp4")
  const before = await picker.readFile("keep-me.mp4")
  expect(before.length).toBeGreaterThan(0)

  const dialog = await openDialog(page)
  await armCancelClock(page)
  await picker.queueSave("keep-me.mp4")
  await dialog.getByTestId("export-start").click()
  await expect.poll(() => framesDone(dialog), { timeout: 60_000 }).toBeGreaterThanOrEqual(300)
  const at = await framesDone(dialog)
  expect(at).toBeLessThan(TOTAL)
  const ms = await cancelAndTime(page, dialog)
  record("over an existing file", ms, at)

  await expect(dialog.getByTestId("export-cancelled")).toHaveAttribute("data-leftover", "untouched")
  const after = await picker.readFile("keep-me.mp4")
  expect(after.length).toBe(before.length)
  expect(after.equals(before)).toBe(true)
})
