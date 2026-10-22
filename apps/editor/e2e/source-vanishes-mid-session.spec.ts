import { expect, test, type Page } from "@playwright/test"

import { installFilePicker } from "./file-picker"

// T057: the file goes away while the Project is open. The spec edge case asks for the Preview to
// report the Source unavailable "from the next Frame it is asked to draw, not only after a reload",
// and T051 says what asks: a Playhead move checks the Linked Sources' files. So the trigger here is
// a Playhead move and nothing else — no reload, no window focus event — and the assertion is on
// the pixels: an empty Preview, not the last good Frame left on screen.

const FIXTURE = "sync-1080p30.mp4"

/**
 * Reads the Preview back. The fixture is a black field with a white Frame counter burned in, so a
 * decoded Frame has bright pixels and an empty Preview — the opaque black stage — has none.
 */
async function previewRaster(
  page: Page
): Promise<{ bright: number; opaqueBlack: number; total: number }> {
  return page.evaluate(async () => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid=preview-canvas]")
    if (element === null) throw new Error("the Preview canvas is not on the page")
    // The worker's frames reach the element when the compositor next runs.
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
    const bitmap = await createImageBitmap(element)
    const probe = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = probe.getContext("2d")
    if (context === null) throw new Error("no 2d context to read the Frame back through")
    context.drawImage(bitmap, 0, 0)
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
    let bright = 0
    let opaqueBlack = 0
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
      if (r > 128 && g > 128 && b > 128) bright++
      if (r === 0 && g === 0 && b === 0 && a === 255) opaqueBlack++
    }
    return { bright, opaqueBlack, total: data.length / 4 }
  })
}

test("a Source renamed on disk goes Offline on the next Playhead move, and the Preview goes empty", async ({
  page,
}) => {
  // Counts window focus events, so the spec can show the focus occasion (T051) played no part.
  await page.addInitScript(() => {
    const counted = window as unknown as { __focusEvents: number }
    counted.__focusEvents = 0
    window.addEventListener("focus", () => {
      counted.__focusEvents += 1
    })
  })
  const picker = await installFilePicker(page)

  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await picker.queue(FIXTURE)
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("source-status")).toHaveText("Linked", { timeout: 20_000 })

  // A Frame showing: Frame 0 drawn, counter and all.
  await expect(page.getByTestId("preview-shown")).toHaveText(/^showing Frame 0 of Scene \d+$/, {
    timeout: 10_000,
  })
  await expect
    .poll(async () => (await previewRaster(page)).bright, { timeout: 10_000 })
    .toBeGreaterThan(0)
  const clip = page.getByTestId("timeline-clip")
  const clipBefore = await clip.evaluate((element) => ({
    id: element.getAttribute("data-clip-id"),
    start: element.getAttribute("data-start-frame"),
    duration: element.getAttribute("data-duration-frames"),
  }))

  // ---------------------------------------------------------------- the file goes away
  await picker.renameFile(FIXTURE, "renamed-while-open.mp4")
  expect(await picker.exists(FIXTURE)).toBe(false)
  await page.evaluate(() => {
    ;(window as unknown as { __focusEvents: number }).__focusEvents = 0
  })

  // Nothing has asked yet, so nothing has noticed: status is derived on occasions, not polled.
  // This is what makes the Playhead move below the cause, rather than merely the thing before it.
  await page.waitForTimeout(750)
  await expect(page.getByTestId("source-status")).toHaveText("Linked")

  // ---------------------------------------------------------------- the next Frame asked for
  await page.getByTestId("timeline-body").focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByTestId("timeline-playhead")).toHaveAttribute("data-frame", "1")

  await expect(page.getByTestId("source-status")).toHaveText("Offline")
  await expect(page.getByTestId("relink-source")).toHaveAttribute("data-reason", "unreachable")

  // The Clip stays where it was, drawn Offline (FR-022).
  await expect(clip).toHaveCount(1)
  await expect(clip).toHaveAttribute("data-offline", "true")
  await expect(clip).toHaveAttribute("data-clip-id", clipBefore.id ?? "")
  await expect(clip).toHaveAttribute("data-start-frame", clipBefore.start ?? "")
  await expect(clip).toHaveAttribute("data-duration-frames", clipBefore.duration ?? "")

  // The Preview drew the Frame under the Playhead, and drew it empty: the opaque black stage, every
  // pixel — not Frame 0's picture left behind, and not Frame 1 decoded from what was cached.
  await expect(page.getByTestId("preview-shown")).toHaveText(/^showing Frame 1 of Scene \d+$/)
  await expect.poll(async () => (await previewRaster(page)).bright, { timeout: 10_000 }).toBe(0)
  const empty = await previewRaster(page)
  expect(empty.opaqueBlack).toBe(empty.total)

  // And it stays empty: a later Frame does not resurrect the vanished file.
  await page.keyboard.press("ArrowRight")
  await expect(page.getByTestId("preview-shown")).toHaveText(/^showing Frame 2 of Scene \d+$/)
  const later = await previewRaster(page)
  expect(later.bright).toBe(0)
  expect(later.opaqueBlack).toBe(later.total)

  // The Playhead was the trigger, not the window coming back into focus.
  expect(
    await page.evaluate(() => (window as unknown as { __focusEvents: number }).__focusEvents)
  ).toBe(0)
})
