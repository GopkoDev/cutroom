import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

import type { Command } from "@cutroom/model"

import type * as EditorStore from "../src/store"

import { CREATE_PROJECT, FRAME_SIZE, STORE_MODULE } from "./editor-fixtures"

// The app assembled: the screen it lands on, the shell behind "New Project", and the Preview canvas
// actually reaching the worker. None of this can be proved anywhere but a browser — the canvas is
// transferred, so from the main thread a worker compositing on the GPU and a worker that quietly
// failed to look identical (ADR 0003), and the only evidence either way is what the engine reports
// and what comes back off the raster.

const SCREENSHOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "__screenshots__/shell.png"
)

/** Runs a command against the store the running app is using. */
async function runCommand(page: Page, command: Command): Promise<void> {
  await page.evaluate(
    async ({ specifier, sent }) => {
      const store = (await import(specifier)) as typeof EditorStore
      store.useEditorStore.getState().run(sent)
    },
    { specifier: STORE_MODULE, sent: command }
  )
}

test("the app lands on the Project list", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByTestId("project-list")).toBeVisible()
  await expect(page.getByTestId("project-list-empty")).toBeVisible()
  await expect(page.getByTestId("editor-shell")).toHaveCount(0)
})

test("a reload comes back to the Project list, not to a blank page", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("editor-shell")).toBeVisible()

  await page.reload()

  await expect(page.getByTestId("project-list")).toBeVisible()
})

test("creating a Project opens the shell, with all three panels", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("new-project").click()

  await expect(page.getByTestId("editor-shell")).toBeVisible()
  await expect(page.getByTestId("sources-panel")).toBeVisible()
  await expect(page.getByTestId("preview-panel")).toBeVisible()
  await expect(page.getByTestId("timeline-panel")).toBeVisible()

  // Nothing has been imported, so the Project has no Timebase and no frame size of its own yet —
  // the first Source gives it both (spec assumptions, T041).
  await expect(page.getByTestId("project-name")).toHaveText("New Project")
  await expect(page.getByTestId("timeline-duration")).toContainText("Empty")
})

test("the Preview canvas reaches the worker and a Frame renders", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("new-project").click()

  // PixiJS reports the backend it got, from inside the worker, over the canvas it was handed. There
  // is no other way to learn this from out here. It is also the proof that the double-mount was
  // survived: a second `transferControlToOffscreen` on the same element throws, and the shell would
  // be showing the engine's failure instead of its name.
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("engine-fatal")).toHaveCount(0)
  await expect(page.getByTestId("preview-shown")).toHaveText("nothing rendered yet")

  await runCommand(page, CREATE_PROJECT)

  // The Scene the store projected reached the engine, and the engine says which Frame of which
  // revision it drew. Revision 1 because this is the first picture there has ever been.
  await expect(page.getByTestId("preview-shown")).toHaveText("showing Frame 0 of Scene 1")

  const raster = await page.evaluate(async () => {
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
    return {
      width: bitmap.width,
      height: bitmap.height,
      corner: [data[0], data[1], data[2], data[3]],
    }
  })

  // The element was created at 1920×1080, because there was no Project when it mounted. It is the
  // Project's frame size now, which only the worker could have done — invariant 6 working as
  // written: `init` sized the first raster, and the Scene resized it.
  expect({ width: raster.width, height: raster.height }).toEqual(FRAME_SIZE)

  // Rendered empty rather than merely untouched: an unrendered canvas reads back transparent, so
  // the opaque alpha is what says PixiJS cleared it.
  expect(raster.corner).toEqual([0, 0, 0, 255])
})

test("the assembled editor, for the record", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })

  await runCommand(page, CREATE_PROJECT)
  await expect(page.getByTestId("preview-shown")).toHaveText("showing Frame 0 of Scene 1")

  await page.screenshot({ path: SCREENSHOT })
})
