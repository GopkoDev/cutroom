import { expect, test } from "@playwright/test"

import type { Timebase } from "@cutroom/model"

import { counterText } from "./burned-in-counter"
import { exportedFrame, frameStart, openExport } from "./exported-file"
import { installFilePicker } from "./file-picker"
import { importFixture, newProject, parkAt } from "./playback"

// SC-007: the exported file shows what the Preview shows, Frame for Frame (T085).
//
// The Project is the awkward one on purpose: the 30 fps fixture, then the 29.97 fixture butted
// after it, in the 30 fps Project the first one made — so the second Clip's Frames go through the
// Project-to-Source mapping, where a Source Frame is shown twice (Project Frames 900 and 901 are
// both its Frame 0) and Project Frame 900 + 210 is Source Frame 209, not 210. The export is opened
// again with Mediabunny in the page (`exported-file.ts`) and sampled Frames — the first and last,
// both sides of the join, the doubled Frame, the middle of each Clip — are checked two ways:
//
//   1. **Which Frame**: the burned-in counter, read off the decoded export by the same sampler as
//      off the Preview, must equal the Preview's counter at the same Timeline Frame and the Source
//      Frame the model's mapping names. Exact.
//   2. **What it looks like**: the decoded export and the Preview canvas, compared pixel by pixel
//      over the whole picture and inside the counter. A counter-only check would pass a picture
//      scaled, shifted or recoloured as long as six digits stayed legible.
//
// ## The thresholds, and why the bitrate allows them
//
// Standard at 1080p is 8 Mbps — about 0.13 bits per pixel per Frame at 30 fps — spent on a picture
// that is flat black except for six white digits that change one at a time. That is far more than
// the picture needs, so the encoder is all but lossless here. Measured on the reference machine
// (annotated on every run), the worst sampled Frame is the first, a keyframe: mean difference
// 0.010 levels in 255, PSNR 65 dB, 0.29 levels inside the counter, no pixel flipped; the others are
// at 83–99 dB. For scale, the same comparison against the *neighbouring* Frame — one digit
// different, the smallest wrong picture this content can show — measured mean 0.50, PSNR 27 dB,
// 14 levels inside the counter, 5.6 % of its pixels flipped. A range or matrix error (full vs
// limited, BT.601 vs BT.709) lifts or tints the whole black field by about 16 levels — mean ≈ 16,
// PSNR ≈ 24 dB; a picture scaled or shifted by a few pixels moves every digit edge in the
// counter, far more than one digit changing does.
//
// So each limit sits roughly ten times above the worst measured and at least five times below the
// one-digit miss: whole-picture mean difference ≤ 0.1 and PSNR ≥ 45 dB; inside the counter, mean
// difference ≤ 2 and at most 0.5 % of pixels differing in luma by more than a quarter of the range.
//
// Sound is exported too (the fixtures have it) but not examined: its timing is T086's.

const TIMEBASE: Timebase = { numerator: 30, denominator: 1 }
const FIRST = 900 // sync-1080p30.mp4: 30 s at 30 fps
const SECOND = 900 // sync-1080p2997.mp4: 899 Source Frames, covering 900 Project Frames
const TOTAL = FIRST + SECOND
const EXPORTED = "export-fidelity.mp4"

/** The Source Frame on screen at Project Frame `900 + k` (import-and-scrub.spec.ts). */
const secondClipFrame = (k: number) => Math.floor((30_000 * k) / 30_030)
const expectedCounter = (frame: number) =>
  counterText(frame < FIRST ? frame : secondClipFrame(frame - FIRST))

/** First and last, the middle of each Clip, both sides of the join, and the doubled Frame. */
const SAMPLED = [0, 1, 450, 898, 899, 900, 901, 902, 900 + 210, 1350, 1798, 1799]

const LIMITS = { meanAbs: 0.1, psnr: 45, counterMeanAbs: 2, counterFlipped: 0.005 }

test("the exported file shows the Frames the Preview shows (SC-007)", async ({ page }) => {
  test.setTimeout(240_000)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await picker.queue("sync-1080p2997.mp4")
  await importFixture(page, 2)
  const clips = page.getByTestId("timeline-clip")
  await expect(clips.nth(1)).toHaveAttribute("data-start-frame", String(FIRST))
  await expect(clips.nth(1)).toHaveAttribute("data-duration-frames", String(SECOND))

  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(
    dialog.locator('[data-testid="export-quality"][data-quality="standard"] input')
  ).toBeChecked({ timeout: 10_000 })
  await picker.queueSave(EXPORTED)
  await dialog.getByTestId("export-start").click()
  await expect(dialog.getByTestId("export-done")).toBeVisible({ timeout: 180_000 })
  await dialog.getByTestId("export-dismiss").click()

  // The file as it states itself: the Project's frame size, H.264, and one packet per Frame,
  // each exactly on the 30 fps grid.
  const track = await openExport(page, EXPORTED)
  expect({ width: track.width, height: track.height }).toEqual({ width: 1920, height: 1080 })
  expect(track.codec).toBe("avc")
  expect(track.timestamps).toHaveLength(TOTAL)
  const offGrid = Math.max(...track.timestamps.map((t, k) => Math.abs(t - frameStart(TIMEBASE, k))))
  expect(offGrid).toBeLessThan(1e-6)

  const worst = { meanAbs: 0, psnr: Number.POSITIVE_INFINITY, counterMeanAbs: 0, counterFlipped: 0 }
  for (const frame of SAMPLED) {
    await parkAt(page, frame)
    const read = await exportedFrame(page, frame, TIMEBASE, { comparePreview: true })
    const where = `output Frame ${frame}`

    expect(read.timestamp, where).toBeCloseTo(frameStart(TIMEBASE, frame), 6)
    expect(read.previewCounter?.text, `${where}: the Preview`).toBe(expectedCounter(frame))
    expect(read.counter.text, `${where}: the export`).toBe(expectedCounter(frame))

    const likeness = read.likeness!
    expect(likeness.meanAbs, where).toBeLessThanOrEqual(LIMITS.meanAbs)
    expect(likeness.psnr, where).toBeGreaterThanOrEqual(LIMITS.psnr)
    expect(likeness.counterMeanAbs, where).toBeLessThanOrEqual(LIMITS.counterMeanAbs)
    expect(likeness.counterFlipped, where).toBeLessThanOrEqual(LIMITS.counterFlipped)

    worst.meanAbs = Math.max(worst.meanAbs, likeness.meanAbs)
    worst.psnr = Math.min(worst.psnr, likeness.psnr)
    worst.counterMeanAbs = Math.max(worst.counterMeanAbs, likeness.counterMeanAbs)
    worst.counterFlipped = Math.max(worst.counterFlipped, likeness.counterFlipped)
  }

  test.info().annotations.push({
    type: "likeness (worst sampled Frame)",
    description:
      `mean |Δ| ${worst.meanAbs.toFixed(3)}, PSNR ${worst.psnr.toFixed(1)} dB, ` +
      `counter mean |Δ| ${worst.counterMeanAbs.toFixed(3)}, ` +
      `counter flipped ${(worst.counterFlipped * 100).toFixed(3)} %`,
  })
  console.log(`[export-fidelity] worst: ${JSON.stringify(worst)}`)
})
