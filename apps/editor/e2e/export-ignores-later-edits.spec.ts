import { expect, test } from "@playwright/test"

import type { Timebase } from "@cutroom/model"

import { counterText } from "./burned-in-counter"
import { exportedFrame, frameStart, openExport } from "./exported-file"
import { installFilePicker } from "./file-picker"
import { importFixture, newProject } from "./playback"

// FR-019: an export is of the Timeline as it stood when it started, whatever is done to the
// Timeline while it runs (T088, spec edge case). The one requirement in this phase a
// correct-looking implementation can fail silently — the frozen Scene either travelled with the
// export or it did not — so the edits here are chosen to leave a trace in the file if it did not:
//
//   * at the start, three Clips: the 30 fps fixture, the 29.97 one, and the 30 fps one again under
//     another name — 2700 Frames, 90 s;
//   * while it runs, through the editor's own buttons: a fourth Source imported (a 24 fps, 720p
//     Clip butted on the end — 2700 + 300 Frames), undo, redo, then undo twice — leaving only the
//     first two Clips, 1800 Frames.
//
// An export that followed the live Timeline would be longer or shorter than 90 s, or would show
// the fourth Clip after Frame 2700, or empty black from Frame 1800. The output is checked against
// the Timeline at the start: duration, Frame count, the Frame grid, and the burned-in counter at
// Frames in each of the three Clips, both sides of each join. Sound is not examined (T086).

const TIMEBASE: Timebase = { numerator: 30, denominator: 1 }
const CLIP = 900
const AT_START = 3 * CLIP
const AT_END = 2 * CLIP
const EXPORTED = "export-ignores-later-edits.mp4"

/** The Source Frame on screen at Project Frame `900 + k` of the 29.97 Clip (import-and-scrub). */
const secondClipFrame = (k: number) => Math.floor((30_000 * k) / 30_030)
function expectedCounter(frame: number): string {
  if (frame < CLIP) return counterText(frame)
  if (frame < 2 * CLIP) return counterText(secondClipFrame(frame - CLIP))
  return counterText(frame - 2 * CLIP)
}

const SAMPLED = [0, 450, 899, 900, 901, 1110, 1799, 1800, 1801, 2250, 2698, 2699]

test("an export ignores edits made while it runs (FR-019)", async ({ page }) => {
  test.setTimeout(240_000)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await picker.queue("sync-1080p2997.mp4")
  await importFixture(page, 2)
  await picker.queue({ fixture: "sync-1080p30.mp4", as: "sync-again.mp4" })
  await importFixture(page, 3)
  const clips = page.getByTestId("timeline-clip")
  await expect(clips).toHaveCount(3)
  await expect(clips.nth(2)).toHaveAttribute("data-start-frame", String(2 * CLIP))
  await expect(clips.nth(2)).toHaveAttribute("data-duration-frames", String(CLIP))

  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog.getByTestId("export-start")).toBeEnabled({ timeout: 10_000 })
  await picker.queueSave(EXPORTED)
  await dialog.getByTestId("export-start").click()
  await expect(dialog.getByTestId("export-progress")).toBeVisible()
  await expect(dialog.getByTestId("export-frames")).toContainText(`of ${AT_START} Frames`)

  // The edits, while it runs.
  await picker.queue("silent-720p24.mp4")
  await importFixture(page, 4)
  await expect(clips).toHaveCount(4)
  await page.getByTestId("undo").click()
  await expect(clips).toHaveCount(3)
  await page.getByTestId("redo").click()
  await expect(clips).toHaveCount(4)
  await page.getByTestId("undo").click()
  await page.getByTestId("undo").click()
  await expect(clips).toHaveCount(2)
  await expect(clips.nth(1)).toHaveAttribute("data-start-frame", String(AT_END - CLIP))
  await expect(clips.nth(1)).toHaveAttribute("data-duration-frames", String(CLIP))

  // All of that happened during the export, not after it: still running, not yet at the end.
  await expect(dialog.getByTestId("export-progress")).toHaveAttribute("data-phase", "running")
  const progress = (await dialog.getByTestId("export-frames").textContent()) ?? ""
  const doneSoFar = Number(/^(\d+) of/.exec(progress)?.[1])
  expect(doneSoFar).toBeLessThan(AT_START)
  test.info().annotations.push({
    type: "edits",
    description: `all edits made by output Frame ${doneSoFar} of ${AT_START}`,
  })
  console.log(`[export-ignores-later-edits] edits done by Frame ${doneSoFar} of ${AT_START}`)

  await expect(dialog.getByTestId("export-done")).toBeVisible({ timeout: 180_000 })
  await dialog.getByTestId("export-dismiss").click()

  // The file is of the Timeline at the start: 2700 Frames on the 30 fps grid, 90 s.
  const track = await openExport(page, EXPORTED)
  expect({ width: track.width, height: track.height }).toEqual({ width: 1920, height: 1080 })
  expect(track.timestamps).toHaveLength(AT_START)
  const offGrid = Math.max(...track.timestamps.map((t, k) => Math.abs(t - frameStart(TIMEBASE, k))))
  expect(offGrid).toBeLessThan(1e-6)
  expect(track.videoSeconds).toBeCloseTo(frameStart(TIMEBASE, AT_START), 5)

  for (const frame of SAMPLED) {
    const read = await exportedFrame(page, frame, TIMEBASE)
    expect(read.counter.text, `output Frame ${frame}`).toBe(expectedCounter(frame))
  }

  // And the edits stand: the Timeline is the two-Clip one, untouched by the export finishing.
  await expect(clips).toHaveCount(2)
})
