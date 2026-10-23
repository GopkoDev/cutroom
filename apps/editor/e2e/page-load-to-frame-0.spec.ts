import { expect, test } from "@playwright/test"

import { counterText, readCounter } from "./burned-in-counter"
import { installFilePicker } from "./file-picker"

// SC-001, the first of T096's three gates: from the page finishing load to Frame 0 on screen in
// under 15 seconds, with the time spent in the file picker left out — that is the user's disk, not
// the product. Everything else counts: worker start-up, creating the Project, reading the file and
// the first Render.
//
// Timed in the page, on `performance.now()`, by an init script installed before the app's first
// line:
//
//   * **start**: the window's `load` event;
//   * **picker time**: the whole of every `showOpenFilePicker` call, measured around the stand-in
//     (`file-picker.ts`) and subtracted. The stand-in answers from OPFS in about 15 ms; a real
//     picker answers when the user does, which is exactly why the criterion leaves it out;
//   * **end**: the first time the Preview says "showing Frame 0", plus two animation frames so the
//     worker's picture has reached the screen — and the counter burned into the fixture is then
//     read off the canvas, so "Frame 0" is the picture and not only the label.
//
// Filling the stand-in disk happens before the clock matters, as a file already on the user's disk
// would. The clicks on New Project and Import are Playwright's, so a human's reaction time is not
// in the number either; the criterion is about the product's share. Measured on the reference
// machine (T096): 483–652 ms, about 25× inside the budget.

const FIXTURE = "sync-1080p30.mp4"
const BUDGET_MS = 15_000

interface Clock {
  load: number | null
  pickerMs: number
  frame0: number | null
  frame0Painted: number | null
}

test("page load to Frame 0 on screen takes under 15 seconds, picker time excluded (SC-001)", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await page.addInitScript(() => {
    const w = window as unknown as {
      __sc001: Clock
      showOpenFilePicker: (...args: unknown[]) => Promise<unknown>
    }
    const clock: Clock = { load: null, pickerMs: 0, frame0: null, frame0Painted: null }
    w.__sc001 = clock
    window.addEventListener("load", () => {
      clock.load = performance.now()
    })
    const pick = w.showOpenFilePicker
    w.showOpenFilePicker = async (...args: unknown[]) => {
      const asked = performance.now()
      try {
        return await pick.apply(window, args)
      } finally {
        clock.pickerMs += performance.now() - asked
      }
    }
    new MutationObserver(() => {
      if (clock.frame0 !== null) return
      const shown = document.querySelector("[data-testid=preview-shown]")
      if (shown !== null && /^showing Frame 0 of/.test(shown.textContent ?? "")) {
        clock.frame0 = performance.now()
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            clock.frame0Painted = performance.now()
          })
        )
      }
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })

  await page.goto("/", { waitUntil: "load" })
  await picker.writeFile(FIXTURE)
  await picker.queue(FIXTURE)

  await page.getByTestId("new-project").click()
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("preview-shown")).toHaveText(/^showing Frame 0 of/, {
    timeout: BUDGET_MS,
  })
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __sc001: Clock }).__sc001.frame0Painted !== null)
    )
    .toBe(true)
  expect((await readCounter(page)).text).toBe(counterText(0))

  const clock = await page.evaluate(() => (window as unknown as { __sc001: Clock }).__sc001)
  if (clock.load === null || clock.frame0Painted === null) throw new Error("the clock never ran")
  const ms = clock.frame0Painted - clock.load - clock.pickerMs
  test.info().annotations.push({
    type: "SC-001",
    description:
      `${ms.toFixed(0)} ms from load to Frame 0 on screen (picker ${clock.pickerMs.toFixed(0)} ms` +
      ` excluded; "showing Frame 0" at ${((clock.frame0 ?? 0) - clock.load).toFixed(0)} ms); budget ${BUDGET_MS} ms`,
  })
  expect(ms).toBeLessThan(BUDGET_MS)
})
