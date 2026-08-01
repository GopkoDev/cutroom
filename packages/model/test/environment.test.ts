import { describe, expect, it } from "vitest"

// The absence of the browser is the property this package is built on, and absence is exactly what
// nobody notices going missing. These assertions fail the moment someone gives the model a DOM
// environment "just for one test" — which is how the constraint would otherwise erode.

describe("the model runs outside the browser", () => {
  it("has no document and no window", () => {
    expect("document" in globalThis).toBe(false)
    expect("window" in globalThis).toBe(false)
  })

  it("has no rendering, media or storage APIs", () => {
    const browserOnly = [
      "OffscreenCanvas",
      "ImageBitmap",
      "createImageBitmap",
      "VideoEncoder",
      "VideoDecoder",
      "AudioContext",
      "indexedDB",
      "showOpenFilePicker",
    ]
    // Compared as a list so a failure names the API that turned up rather than saying `false`.
    expect(browserOnly.filter((api) => api in globalThis)).toEqual([])
  })

  it("still has the platform the model is allowed to use", () => {
    expect(typeof structuredClone).toBe("function")
    expect(typeof BigInt).toBe("function")
  })
})
