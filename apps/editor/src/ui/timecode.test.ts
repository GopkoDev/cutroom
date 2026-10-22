import { describe, expect, it } from "vitest"

import { formatTimecode, timecodeParts } from "./timecode"

const FPS_30 = { numerator: 30, denominator: 1 }
const NTSC = { numerator: 30000, denominator: 1001 }
const FPS_24 = { numerator: 24, denominator: 1 }
const FPS_120 = { numerator: 120, denominator: 1 }

describe("formatTimecode", () => {
  it("starts the Timeline at zero", () => {
    expect(formatTimecode(FPS_30, 0)).toBe("00:00:00:00")
  })

  it("counts Frames inside a second and rolls over on the second", () => {
    expect(formatTimecode(FPS_30, 29)).toBe("00:00:00:29")
    expect(formatTimecode(FPS_30, 30)).toBe("00:00:01:00")
    expect(formatTimecode(FPS_24, 210)).toBe("00:00:08:18")
  })

  it("carries into minutes and hours", () => {
    expect(formatTimecode(FPS_30, 30 * 60)).toBe("00:01:00:00")
    expect(formatTimecode(FPS_30, 30 * 3600 + 30 * 61 + 7)).toBe("01:01:01:07")
  })

  it("widens FF when a second holds more than a hundred Frames", () => {
    expect(formatTimecode(FPS_120, 119)).toBe("00:00:00:119")
    expect(formatTimecode(FPS_120, 5)).toBe("00:00:00:005")
  })

  it("is wall-clock at 30000/1001: the seconds are real seconds, not 30-Frame groups", () => {
    // Frame 30 begins at 30 × 1001/30000 = 1.001 s, so it is the first Frame of second 1.
    expect(formatTimecode(NTSC, 29)).toBe("00:00:00:29")
    expect(formatTimecode(NTSC, 30)).toBe("00:00:01:00")
    // One hour of real time. Frame 107 892 begins at 3599.9964 s, Frame 107 893 at 3600.0297 s.
    // Non-drop SMPTE would call Frame 107 892 00:59:56:12 — 3.6 s behind the clock.
    expect(formatTimecode(NTSC, 107_892)).toBe("00:59:59:29")
    expect(formatTimecode(NTSC, 107_893)).toBe("01:00:00:00")
  })

  it("never shows an FF past the Frames that start inside that second", () => {
    for (let frame = 0; frame < 30_000; frame += 1) {
      const { frames } = timecodeParts(NTSC, frame)
      expect(frames).toBeGreaterThanOrEqual(0)
      expect(frames).toBeLessThan(30)
    }
  })

  it("lands on an exact second boundary without a float to tip it either way", () => {
    // 1001 s at 30000/1001 is exactly Frame 30 000. Second 1000 begins inside Frame 29 970's
    // interval, so its first Frame is 29 971 and it holds 29 of them.
    expect(formatTimecode(NTSC, 30_000)).toBe("00:16:41:00")
    expect(formatTimecode(NTSC, 29_999)).toBe("00:16:40:28")
    expect(formatTimecode(NTSC, 29_971)).toBe("00:16:40:00")
  })

  it("throws on a Frame that is not one, as the Timebase module does", () => {
    expect(() => formatTimecode(FPS_30, 1.5)).toThrow(RangeError)
    expect(() => formatTimecode(FPS_30, -1)).toThrow(RangeError)
  })
})
