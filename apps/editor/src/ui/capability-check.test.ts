import { describe, expect, it } from "vitest"

import { missingCapabilities } from "./capability-check"

const everything = {
  showOpenFilePicker: () => undefined,
  OffscreenCanvas: class {},
  VideoDecoder: class {},
  VideoEncoder: class {},
}

function without(...names: (keyof typeof everything)[]): Partial<typeof everything> {
  return Object.fromEntries(
    Object.entries(everything).filter(([name]) => !names.includes(name as keyof typeof everything))
  )
}

describe("missingCapabilities", () => {
  it("is empty for a browser that has all of them", () => {
    expect(missingCapabilities(everything)).toEqual([])
  })

  it("names the file picker when it is absent (Firefox, Safari)", () => {
    expect(missingCapabilities(without("showOpenFilePicker")).map((m) => m.name)).toEqual([
      "showOpenFilePicker",
    ])
  })

  it("names WebCodecs when only half of it is there", () => {
    expect(missingCapabilities(without("VideoEncoder")).map((m) => m.name)).toEqual(["WebCodecs"])
  })

  it("lists everything for a browser with nothing", () => {
    expect(missingCapabilities({}).map((m) => m.name)).toEqual([
      "showOpenFilePicker",
      "OffscreenCanvas",
      "WebCodecs",
    ])
  })
})
