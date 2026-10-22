import { expect, test } from "@playwright/test"

// The unsupported-browser notice (FR-023), proved by taking capabilities away from a browser that
// has them. There is no other way: the supported surface is Chromium (ADR 0006), and the specs run
// on Chrome, so the only unsupported browser available is one we make.
//
// Each capability is deleted outright rather than shadowed with an `undefined` value, because that
// is how a browser without it actually looks: the property is not there at all, and `in` is what
// the gate asks. In Chrome every one of them is an own, configurable property of the global object
// — measured, not assumed — so `delete` really removes it.

test("a supported browser is not gated", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByTestId("project-list")).toBeVisible()
  await expect(page.getByTestId("capability-gate")).toHaveCount(0)
})

test("without a file picker, the editor is not rendered at all", async ({ page }) => {
  await page.addInitScript(() => {
    delete (globalThis as unknown as Record<string, unknown>).showOpenFilePicker
  })
  await page.goto("/")

  await expect(page.getByTestId("capability-gate")).toBeVisible()
  await expect(page.getByTestId("capability-missing")).toContainText("showOpenFilePicker")

  // Fails closed. An editor that renders and breaks at the first import is the failure FR-023 is
  // about — the user finds out after the work, not before it.
  await expect(page.getByTestId("project-list")).toHaveCount(0)
  await expect(page.getByTestId("editor-shell")).toHaveCount(0)
})

test("the capability ADR 0006 actually rests on is checked for itself", async ({ page }) => {
  // A browser can have a file picker and still have no way to ask whether a *stored* handle may be
  // read — which is the one capability ADR 0006 names as structurally absent elsewhere, and the one
  // reopening a Project depends on. Without this check the product would look supported and every
  // Project would reopen Offline for ever.
  await page.addInitScript(() => {
    delete (FileSystemHandle.prototype as unknown as Record<string, unknown>).queryPermission
  })
  await page.goto("/")

  await expect(page.getByTestId("capability-gate")).toBeVisible()
  await expect(page.getByTestId("capability-missing")).toContainText(
    "FileSystemHandle.queryPermission"
  )
  await expect(page.getByTestId("capability-missing")).toContainText("reopening a Project")
})

test("a browser missing several says all of them, and what each is for", async ({ page }) => {
  await page.addInitScript(() => {
    delete (globalThis as unknown as Record<string, unknown>).showSaveFilePicker
    delete (globalThis as unknown as Record<string, unknown>).VideoDecoder
  })
  await page.goto("/")

  const missing = page.getByTestId("capability-missing")
  await expect(missing).toContainText("showSaveFilePicker")
  await expect(missing).toContainText("VideoDecoder")
  await expect(missing).toContainText("decoding your footage")
})

test("no audio encoder is not a reason to refuse the browser", async ({ page }) => {
  // FR-024 has a considered answer for a machine that cannot encode sound: say so before the export
  // starts and require an explicit choice. Gating arrival on it would refuse a browser the product
  // knows what to do with.
  await page.addInitScript(() => {
    delete (globalThis as unknown as Record<string, unknown>).AudioEncoder
  })
  await page.goto("/")

  await expect(page.getByTestId("project-list")).toBeVisible()
  await expect(page.getByTestId("capability-gate")).toHaveCount(0)
})
