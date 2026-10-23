import os from "node:os"

import { expect, test } from "@playwright/test"

import { openExport } from "./exported-file"
import { installFilePicker } from "./file-picker"
import { importFixture, newProject } from "./playback"

// SC-005: one minute of 1080p 30 fps material exports in under two minutes on the reference
// machine (quickstart.md: MacBook Air, Apple M4, the Chrome it names) — T089.
//
// The export covers the whole Timeline (there is no range to choose), so the Timeline is built to
// be exactly one minute: `sync-1080p30.mp4` (30 s, 1080p30, with sound) imported twice, as two
// Sources, butted into 1800 Frames. Sound is on, at the dialog's default quality (Standard,
// 8 Mbps), because that is the export a user gets; the mix runs on the main thread beside the
// encode (ADR 0008), so leaving it out would measure less than the product does.
//
// **What is timed**: from the click on Export — the user's own act, which opens the save picker
// first — to the dialog saying Done, which it does only once the engine reported `export-done`
// and the file is committed (T075, T084). Both instants are taken in the page, on its own clock
// (`performance.now()` in a capture listener on the button and in a `MutationObserver` for the
// Done element), so Playwright's polling adds nothing; a Node-side clock around the same span is
// recorded beside it as a cross-check.
//
// **Where the number counts**: only on the reference machine. Elsewhere the run still asserts the
// limit — two minutes is a long way above what the reference machine measures — but the machine
// is recorded with the numbers, and a failure on other hardware is a reason to re-measure there,
// not a verdict (quickstart.md). Run it with nothing else exporting or playing beside it: another
// Playwright run on the same machine shares its hardware encoder.

/** sync-1080p30.mp4 twice: 2 × 900 Frames at 30 fps. */
const FRAMES = 1800
const LIMIT_MS = 120_000
const MEDIA_SECONDS = 60
const EXPORTED = "export-throughput.mp4"

test("one minute of 1080p30 exports in under two minutes (SC-005)", async ({ page, browser }) => {
  test.setTimeout(LIMIT_MS + 120_000)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await picker.queue({ fixture: "sync-1080p30.mp4", as: "sync-1080p30-again.mp4" })
  await importFixture(page, 2)
  const clips = page.getByTestId("timeline-clip")
  await expect(clips).toHaveCount(2)
  await expect(clips.nth(1)).toHaveAttribute("data-start-frame", "900")
  await expect(clips.nth(1)).toHaveAttribute("data-duration-frames", "900")

  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  const standard = dialog.locator('[data-testid="export-quality"][data-quality="standard"]')
  await expect(standard.locator("input")).toBeChecked({ timeout: 10_000 })
  await expect(dialog.getByTestId("export-sound")).toHaveAttribute("data-sound", "available")
  await picker.queueSave(EXPORTED)

  // Arm both page-side marks before the click.
  await page.evaluate(() => {
    const marks = { clicked: 0, done: 0 }
    ;(window as unknown as { __throughput: typeof marks }).__throughput = marks
    document.querySelector("[data-testid=export-start]")!.addEventListener(
      "click",
      () => {
        marks.clicked = performance.now()
      },
      { capture: true, once: true }
    )
    const observer = new MutationObserver(() => {
      if (document.querySelector("[data-testid=export-done]") !== null) {
        marks.done = performance.now()
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })

  const nodeStart = Date.now()
  await dialog.getByTestId("export-start").click()
  const done = dialog.getByTestId("export-done")
  await expect(done).toBeVisible({ timeout: LIMIT_MS + 60_000 })
  const nodeMs = Date.now() - nodeStart

  const marks = await page.evaluate(
    () => (window as unknown as { __throughput: { clicked: number; done: number } }).__throughput
  )
  expect(marks.clicked).toBeGreaterThan(0)
  expect(marks.done).toBeGreaterThan(marks.clicked)
  const wallMs = marks.done - marks.clicked

  // It is the minute it claims to be, and a file.
  const bytes = Number(await done.getAttribute("data-bytes"))
  expect(await picker.fileSize(EXPORTED)).toBe(bytes)
  expect(bytes).toBeGreaterThan(0)
  await dialog.getByTestId("export-dismiss").click()
  const track = await openExport(page, EXPORTED)
  expect(track.timestamps).toHaveLength(FRAMES)
  expect({ width: track.width, height: track.height }).toEqual({ width: 1920, height: 1080 })
  expect(track.hasAudio).toBe(true)

  // The browser's own version, not `navigator.userAgent`: the `Desktop Chrome` device descriptor
  // replaces the user agent with a fixed string, whose Chrome version is not the one running.
  const chrome = browser.version()
  test.info().annotations.push(
    {
      type: "export wall-clock",
      description:
        `${(wallMs / 1000).toFixed(2)} s for ${MEDIA_SECONDS} s of 1080p30 with sound ` +
        `(${FRAMES} Frames, ${(FRAMES / (wallMs / 1000)).toFixed(0)} Frames/s, ` +
        `${(MEDIA_SECONDS / (wallMs / 1000)).toFixed(1)}× real time); limit ` +
        `${LIMIT_MS / 1000} s; Node-side ${(nodeMs / 1000).toFixed(2)} s`,
    },
    { type: "export size", description: `${bytes} bytes, Standard quality` },
    {
      type: "machine",
      description:
        `${os.cpus()[0]?.model ?? "unknown CPU"}, ${os.cpus().length} cores, ` +
        `${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.type()} ${os.release()}, Chrome ${chrome}`,
    }
  )

  expect(wallMs, "SC-005: one minute of 1080p30 in under two minutes").toBeLessThan(LIMIT_MS)
})
