import { expect, test } from "@playwright/test"

// The smoke test for the harness itself: Playwright starts the dev server, Chrome reaches it, and
// the page it lands on is a context the engine can actually run in. Everything in Phases 3–5
// assumes all four of those, and when one of them breaks the failure otherwise shows up as a
// puzzling assertion inside an unrelated spec.

test("the dev server serves the editor", async ({ page }) => {
  const response = await page.goto("/")

  expect(response?.status()).toBe(200)
  await expect(page.locator("#root")).toBeAttached()
})

test("the browser has what this slice is built on", async ({ page }) => {
  await page.goto("/")

  const available = await page.evaluate(async () => {
    const present = (name: string) => name in globalThis

    // Every one of these is load-bearing: a persisted file handle (ADR 0005), an OffscreenCanvas
    // for the worker (ADR 0003), and WebCodecs for decode and export. `isSecureContext` is listed
    // because losing it silently removes the first two rather than erroring.
    const capability: Record<string, boolean | string> = {
      isSecureContext: globalThis.isSecureContext,
      showOpenFilePicker: present("showOpenFilePicker"),
      showSaveFilePicker: present("showSaveFilePicker"),
      OffscreenCanvas: present("OffscreenCanvas"),
      VideoDecoder: present("VideoDecoder"),
      VideoEncoder: present("VideoEncoder"),
      indexedDB: present("indexedDB"),
    }

    const codec = { codec: "avc1.640028", codedWidth: 1920, codedHeight: 1080 }
    capability.decodesH264 = (await VideoDecoder.isConfigSupported(codec)).supported === true

    return capability
  })

  expect(available).toEqual({
    isSecureContext: true,
    showOpenFilePicker: true,
    showSaveFilePicker: true,
    OffscreenCanvas: true,
    VideoDecoder: true,
    VideoEncoder: true,
    indexedDB: true,
    decodesH264: true,
  })
})
