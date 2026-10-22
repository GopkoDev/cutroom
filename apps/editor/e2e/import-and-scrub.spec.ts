import { expect, test, type Locator, type Page } from "@playwright/test"

import { installFilePicker } from "./file-picker"

// T053 (SC-003, FR-007, quickstart "A Frame renders correctly"): import a fixture, move the
// Playhead to a Frame, read the Preview canvas back, and read the frame counter burned into the
// picture. The counter is the only witness out here of *which* Source Frame the engine decoded, so
// this reads it as a number rather than checking that "something" was drawn.
//
// The second half is the spec's mixed-rate edge case, reached the way the spec's "One Clip per
// Source" assumption reaches it: a second import is butt-joined after the first, so
// `sync-1080p2997.mp4` lands in a Project that already adopted 30/1 from `sync-1080p30.mp4`.

// ---------------------------------------------------------------- reading the counter back
//
// The counter's geometry and font are those `scripts/make-fixtures.ts` draws (T013), copied rather
// than imported: that file is a script with top-level work, not a module. Six digits, each a 5×7
// grid of `scale`-pixel squares, white on black, at (margin, margin).

const GLYPHS: Record<number, string[]> = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
}

const DIGITS = 6

interface CounterReading {
  /** The digits as read, `?` where a cell matched no glyph. */
  readonly text: string
  /** The weakest lit/unlit decision, 0–127: how far the closest sample sat from the threshold. */
  readonly margin: number
  readonly width: number
  readonly height: number
}

/**
 * Reads the counter out of the Preview canvas. Each of the 35 squares of each digit is sampled as
 * the mean luma of its central half (so H.264 ringing at the glyph edges never decides anything)
 * and called lit above mid-grey. A digit is the glyph whose bitmap matches exactly — no nearest
 * match, so a smeared or misplaced picture reads as `?`, not as a plausible wrong number.
 */
async function readCounter(page: Page): Promise<CounterReading> {
  const { samples, width, height } = await page.evaluate(
    async ({ digits }) => {
      const element = document.querySelector<HTMLCanvasElement>("[data-testid=preview-canvas]")
      if (element === null) throw new Error("the Preview canvas is not on the page")
      // The worker's frames reach the element when the compositor next runs.
      await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))

      const bitmap = await createImageBitmap(element)
      const probe = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = probe.getContext("2d")
      if (context === null) throw new Error("no 2d context to read the Frame back through")
      context.drawImage(bitmap, 0, 0)

      // `writeSprite`'s geometry in make-fixtures.ts, for a picture this tall.
      const h = bitmap.height
      const scale = Math.max(6, Math.round((h / 1080) * 16 * 0.5) * 2)
      const pad = scale / 2
      const cellWidth = 5 * scale + pad * 2
      const margin = Math.round(h / 27)
      const inset = Math.floor(scale / 4)
      const side = scale - inset * 2

      const lumas: number[][] = []
      for (let i = 0; i < digits; i++) {
        const cell: number[] = []
        for (let gy = 0; gy < 7; gy++) {
          for (let gx = 0; gx < 5; gx++) {
            const x = margin + i * cellWidth + pad + gx * scale + inset
            const y = margin + pad + gy * scale + inset
            const { data } = context.getImageData(x, y, side, side)
            let sum = 0
            for (let p = 0; p < data.length; p += 4) {
              sum += 0.2126 * data[p]! + 0.7152 * data[p + 1]! + 0.0722 * data[p + 2]!
            }
            cell.push(sum / (side * side))
          }
        }
        lumas.push(cell)
      }
      return { samples: lumas, width: bitmap.width, height: bitmap.height }
    },
    { digits: DIGITS }
  )

  let weakest = Number.POSITIVE_INFINITY
  let text = ""
  for (const cell of samples) {
    const bits = cell.map((luma) => {
      weakest = Math.min(weakest, Math.abs(luma - 127.5))
      return luma > 127.5 ? "1" : "0"
    })
    const pattern = bits.join("")
    const digit = Object.entries(GLYPHS).find(([, rows]) => rows.join("") === pattern)
    text += digit === undefined ? "?" : digit[0]
  }
  return { text, margin: Math.round(weakest), width, height }
}

const counterText = (frame: number) => String(frame).padStart(DIGITS, "0")

// ---------------------------------------------------------------- driving the editor

async function newProject(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("import-source")).toBeEnabled()
}

async function importFixture(page: Page, rows: number): Promise<void> {
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("source-row")).toHaveCount(rows, { timeout: 20_000 })
  await expect(page.getByTestId("import-refusal")).toHaveCount(0)
  await expect(page.getByTestId("source-status").nth(rows - 1)).toHaveText("Linked")
}

/**
 * Moves the Playhead with the keyboard, the way a user reaches one exact Frame (T048): Home, then
 * Shift+→ for tens and → for ones. Then waits until the engine says it drew that Frame.
 */
async function scrubTo(page: Page, frame: number): Promise<void> {
  const body = page.getByTestId("timeline-body")
  await body.focus()
  await body.press("Home")
  for (let i = 0; i < Math.floor(frame / 10); i++) await body.press("Shift+ArrowRight")
  for (let i = 0; i < frame % 10; i++) await body.press("ArrowRight")
  await expect(page.getByTestId("timeline-playhead")).toHaveAttribute("data-frame", String(frame))
  await expect(page.getByTestId("preview-shown")).toContainText(`showing Frame ${frame} of`)
}

async function expectClip(clip: Locator, start: number, duration: number): Promise<void> {
  await expect(clip).toHaveAttribute("data-start-frame", String(start))
  await expect(clip).toHaveAttribute("data-duration-frames", String(duration))
  await expect(clip).not.toHaveAttribute("data-offline", "true")
}

async function expectCounter(page: Page, expected: number): Promise<void> {
  const reading = await readCounter(page)
  expect({ width: reading.width, height: reading.height }).toEqual({ width: 1920, height: 1080 })
  expect(reading.text, `counter read with a weakest margin of ${reading.margin}`).toBe(
    counterText(expected)
  )
  // White on black survives H.264 nowhere near the threshold; a margin this thin would mean the
  // picture is scaled, offset or blended, and the read is luck.
  expect(reading.margin).toBeGreaterThan(48)
}

// ---------------------------------------------------------------- the tests

test("Frame 210 of a 30 fps Source shows the Source's Frame 210", async ({ page }) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)

  // 30 s at 30/1, adopted by the empty Project: 900 Frames from Frame 0.
  await expectClip(page.getByTestId("timeline-clip"), 0, 900)
  await expect(page.getByTestId("preview-shown")).toContainText("showing Frame 0 of")
  await expectCounter(page, 0) // the reader itself, checked on a Frame where the answer is known

  await scrubTo(page, 210)
  await expectCounter(page, 210)
})

test("a 29.97 Source butt-joined into a 30 fps Project shows the Source Frame each Project Frame falls in", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await picker.queue("sync-1080p2997.mp4")
  await importFixture(page, 2)

  // The first Source set the Project to 30/1 and the second does not change it (T041). The second
  // is 899 Source Frames, 899899/30000 s; at 30 fps that is 899.899 Frames, so 900 by the model's
  // ceiling, placed where the first Clip ends.
  const clips = page.getByTestId("timeline-clip")
  await expect(clips).toHaveCount(2)
  await expectClip(clips.nth(0), 0, 900)
  await expectClip(clips.nth(1), 900, 900)

  // Project Frame 900 + k is Source time k/30 s. The Source Frame on screen at that time is the
  // last one to start at or before it: floor((k/30) × 30000/1001) = floor(30000k / 30030).
  const sourceFrameAt = (k: number) => Math.floor((30_000 * k) / 30_030)

  // k = 0: the join itself, the 29.97 Source's first Frame.
  await scrubTo(page, 900)
  await expectCounter(page, sourceFrameAt(0))

  // k = 210: 7 s exactly. Source Frame 210 starts at 7.007 s, so Frame 209 is the one on screen —
  // a renderer counting Project Frames as Source Frames would show 210 here.
  expect(sourceFrameAt(210)).toBe(209)
  await scrubTo(page, 900 + 210)
  await expectCounter(page, 209)

  // k = 899: the Clip's last Project Frame, 29.967 s, is the Source's last Frame (898 of 0–898),
  // not an empty Frame. End reaches it: the Timeline's last Frame.
  expect(sourceFrameAt(899)).toBe(898)
  await page.getByTestId("timeline-body").press("End")
  await expect(page.getByTestId("preview-shown")).toContainText(`showing Frame ${900 + 899} of`)
  await expectCounter(page, 898)
})
