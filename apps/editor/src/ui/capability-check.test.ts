import { describe, expect, it } from "vitest"

import { insecureContext, missingCapabilities, type CapabilityScope } from "./capability-check"

// Chrome on the desktop, reduced to the shapes the checks read.
const chrome = {
  showOpenFilePicker: () => undefined,
  showSaveFilePicker: () => undefined,
  FileSystemHandle: class {
    queryPermission() {}
  },
  OffscreenCanvas: class {},
  HTMLCanvasElement: class {
    transferControlToOffscreen() {}
  },
  VideoDecoder: class {},
  VideoEncoder: class {},
  AudioDecoder: class {},
  indexedDB: {},
  Worker: class {},
  isSecureContext: true,
} satisfies CapabilityScope

function without(...names: (keyof typeof chrome)[]): CapabilityScope {
  return Object.fromEntries(
    Object.entries(chrome).filter(([name]) => !names.includes(name as keyof typeof chrome))
  )
}

const names = (scope: CapabilityScope) => missingCapabilities(scope).map((m) => m.name)

describe("missingCapabilities", () => {
  it("is empty for Chrome", () => {
    expect(missingCapabilities(chrome)).toEqual([])
  })

  it("names the file pickers when they are absent (Firefox, Safari)", () => {
    expect(names(without("showOpenFilePicker", "showSaveFilePicker"))).toEqual([
      "showOpenFilePicker",
      "showSaveFilePicker",
    ])
  })

  it("names queryPermission even when the picker is there", () => {
    const pickerOnly = { ...chrome, FileSystemHandle: class {} }
    expect(names(pickerOnly)).toEqual(["FileSystemHandle.queryPermission"])
  })

  it("requires the canvas transfer, not just the OffscreenCanvas type", () => {
    const noTransfer = { ...chrome, HTMLCanvasElement: class {} }
    expect(names(noTransfer)).toEqual(["OffscreenCanvas"])
  })

  it("does not gate on AudioEncoder, which FR-024 has an answer for", () => {
    expect("AudioEncoder" in chrome).toBe(false)
    expect(missingCapabilities(chrome)).toEqual([])
  })

  it("counts a check that throws as missing", () => {
    const hostile = new Proxy(chrome, {
      has(target, name) {
        if (name === "VideoDecoder") throw new Error("not telling")
        return name in target
      },
    })
    expect(names(hostile)).toEqual(["VideoDecoder"])
  })

  it("lists everything, in order, for a scope with nothing", () => {
    expect(names({})).toEqual([
      "showOpenFilePicker",
      "showSaveFilePicker",
      "FileSystemHandle.queryPermission",
      "OffscreenCanvas",
      "VideoDecoder",
      "VideoEncoder",
      "AudioDecoder",
      "indexedDB",
      "Worker",
    ])
  })
})

describe("insecureContext", () => {
  it("is true only when the scope says it is not secure", () => {
    expect(insecureContext({ isSecureContext: false })).toBe(true)
    expect(insecureContext({ isSecureContext: true })).toBe(false)
    expect(insecureContext({})).toBe(false)
  })
})
