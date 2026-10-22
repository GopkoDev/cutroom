import { describe, expect, it } from "vitest"

import {
  frameAtOffset,
  offsetOfFrame,
  rulerStep,
  rulerTicks,
  visibleFrames,
} from "./timeline-scale"

describe("frameAtOffset", () => {
  it("answers a whole Frame for every pixel, never a position between two", () => {
    for (let px = 0; px < 500; px += 0.37) {
      expect(Number.isInteger(frameAtOffset(px, 3.3, 1000))).toBe(true)
    }
  })

  it("snaps to the nearest Frame, an exact half going up", () => {
    // 10 px per Frame: Frame 4 owns [35, 45).
    expect(frameAtOffset(34.99, 10, 100)).toBe(3)
    expect(frameAtOffset(35, 10, 100)).toBe(4)
    expect(frameAtOffset(44.99, 10, 100)).toBe(4)
    expect(frameAtOffset(45, 10, 100)).toBe(5)
  })

  it("clamps to the Frames the Timeline shows", () => {
    expect(frameAtOffset(-50, 10, 100)).toBe(0)
    expect(frameAtOffset(5000, 10, 100)).toBe(99)
  })

  it("answers Frame 0 rather than NaN before the Timeline has a width", () => {
    expect(frameAtOffset(12, 0, 100)).toBe(0)
    expect(frameAtOffset(Number.NaN, 10, 100)).toBe(0)
    expect(frameAtOffset(12, 10, 0)).toBe(0)
  })

  it("round-trips every Frame through its own left edge", () => {
    for (let frame = 0; frame < 300; frame += 1) {
      expect(frameAtOffset(offsetOfFrame(frame, 2.7), 2.7, 300)).toBe(frame)
    }
  })
})

describe("visibleFrames", () => {
  it("leaves room past the end of the Timeline, so the Playhead can step off the last Clip", () => {
    expect(visibleFrames(300)).toBe(338)
    expect(visibleFrames(1)).toBe(31)
    expect(visibleFrames(0)).toBe(30)
  })
})

describe("the ruler", () => {
  it("steps in whole Frames on a 1-2-5 progression, far enough apart to read", () => {
    expect(rulerStep(100)).toBe(1)
    expect(rulerStep(20)).toBe(5)
    expect(rulerStep(1)).toBe(100)
    expect(rulerStep(0.05)).toBe(2000)
  })

  it("labels Frames from zero up to what is shown", () => {
    expect(rulerTicks(338, 100)).toEqual([0, 100, 200, 300])
    expect(rulerTicks(30, 10)).toEqual([0, 10, 20])
  })
})
