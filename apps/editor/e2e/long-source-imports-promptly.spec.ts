import { statSync } from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { FIXTURES_DIR, installFilePicker, type Fixture } from "./file-picker"

// T055, the spec's "very long Source" edge case: importing over an hour of footage must not
// require reading the whole file, and the Timeline must appear promptly. Both halves are measured:
//
//   * time — the seventy-minute fixture is held to the same budget as the thirty-second one. The
//     clock runs from the click on Import to the Clip on the Timeline (and on to the Preview's
//     Frame 0); copying the fixture into OPFS, which stands in for the user's disk, happens in
//     `queue` before the clock starts and is not the app's time;
//   * bytes — counted in the engine's Worker by the picker stand-in, and pinned at under a quarter
//     of the file. Measured at about 12 %: the `moov` index of 126 000 samples, the opening packets
//     the Timebase is measured from, and the GOP that decodes Frame 0. A quarter leaves room for
//     that to grow and still fails long before "reading an hour" — which is the whole file.

/**
 * One budget for both fixtures, so "promptly" means "as promptly as a short file". Import has
 * measured about 200 ms for either; ten times that keeps a loaded machine from failing it while
 * still catching an import that scales with the file.
 */
const IMPORT_BUDGET_MS = 2_000

/** Under this share of the file may be read during import, Frame 0 included. */
const MAX_FRACTION_READ = 0.25

interface ImportTiming {
  /** Click on Import → the Clip is on the Timeline. */
  readonly clipMs: number
  /** Click on Import → the Preview reports a fresh Frame 0. */
  readonly frameMs: number
}

const TIMING = "__cutroomImportTiming"

async function newProject(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("import-source")).toBeEnabled()
}

/**
 * Clicks Import and times it in the page, on the page's clock: a capture listener stamps the
 * click, and a MutationObserver stamps the first moment the Clip is in the DOM and the first
 * moment the Preview says it drew Frame 0 of a Scene it was not showing before the click. Polling
 * from Node would add its own interval to every number.
 */
async function timedImport(page: Page): Promise<ImportTiming> {
  await page.evaluate((key) => {
    const button = document.querySelector("[data-testid=import-source]")
    const shown = document.querySelector("[data-testid=preview-shown]")
    if (button === null || shown === null) throw new Error("the editor is not on the page")
    const before = shown.textContent
    const timing = new Promise<ImportTiming>((resolve) => {
      let clicked: number | null = null
      let clipAt: number | null = null
      const check = () => {
        if (clicked === null) return
        const now = performance.now()
        if (clipAt === null && document.querySelector("[data-testid=timeline-clip]") !== null) {
          clipAt = now
        }
        const text = shown.textContent ?? ""
        if (clipAt !== null && text !== before && text.startsWith("showing Frame 0 of")) {
          observer.disconnect()
          resolve({ clipMs: clipAt - clicked, frameMs: now - clicked })
        }
      }
      const observer = new MutationObserver(check)
      observer.observe(document.body, { subtree: true, childList: true, characterData: true })
      button.addEventListener(
        "click",
        () => {
          clicked = performance.now()
        },
        { capture: true, once: true }
      )
    })
    Object.defineProperty(window, key, { configurable: true, value: timing })
  }, TIMING)

  await page.getByTestId("import-source").click()

  return page.evaluate(
    (key) => (window as unknown as Record<string, Promise<ImportTiming>>)[key]!,
    TIMING
  )
}

async function importAndMeasure(page: Page, fixture: Fixture, frames: number) {
  const picker = await installFilePicker(page, { countBytes: true })
  await newProject(page)
  await picker.queue(fixture) // the copy into OPFS: before the clock, and not counted
  await picker.resetBytesRead()

  const timing = await timedImport(page)

  await expect(page.getByTestId("import-refusal")).toHaveCount(0)
  await expect(page.getByTestId("source-status")).toHaveText("Linked")
  const clip = page.getByTestId("timeline-clip")
  await expect(clip).toHaveCount(1)
  await expect(clip).toHaveAttribute("data-start-frame", "0")
  await expect(clip).toHaveAttribute("data-duration-frames", String(frames))

  const size = statSync(path.join(FIXTURES_DIR, fixture)).size
  const read = await picker.bytesRead(fixture)
  test.info().annotations.push({
    type: "import",
    description:
      `${fixture}: Clip in ${timing.clipMs.toFixed(0)} ms, Frame 0 in ${timing.frameMs.toFixed(0)} ms; ` +
      `read ${read} of ${size} bytes (${((100 * read) / size).toFixed(1)} %)`,
  })
  return { timing, read, size }
}

test("the thirty-second fixture imports within the budget", async ({ page }) => {
  const { timing, read } = await importAndMeasure(page, "sync-1080p30.mp4", 900)

  expect(timing.clipMs).toBeLessThan(IMPORT_BUDGET_MS)
  expect(timing.frameMs).toBeLessThan(IMPORT_BUDGET_MS)
  expect(read).toBeGreaterThan(0)
})

test("the seventy-minute fixture imports within the same budget, reading a small fraction of it", async ({
  page,
}) => {
  // 70 min at 30/1, adopted by the empty Project: 126 000 Frames.
  const { timing, read, size } = await importAndMeasure(page, "long-1080p30-70min.mp4", 126_000)

  expect(timing.clipMs).toBeLessThan(IMPORT_BUDGET_MS)
  expect(timing.frameMs).toBeLessThan(IMPORT_BUDGET_MS)

  // Some bytes, or the counter is not seeing the engine's Worker and the next line proves nothing.
  expect(read).toBeGreaterThan(0)
  expect(read / size).toBeLessThan(MAX_FRACTION_READ)
})
