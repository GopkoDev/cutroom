import { describe, expect, it } from "vitest"

import {
  anchorAtTimelineSample,
  frameAtContextTime,
  frameToContextTime,
  frameToSampleIndex,
  timelineSampleToContextTime,
  type PlaybackAnchor,
  type Timebase,
} from "../src/timebase"

// The conversions between the Timeline and the audio clock during playback (ADR 0008). What these
// pin: which Frame is on screen at an instant (the last one begun, not the nearest), that the
// answer never drifts however far playback has run, and that the Timeline's samples land where the
// Frames that show them begin.

const VIDEO: Timebase = { numerator: 30, denominator: 1 }
const NTSC: Timebase = { numerator: 30000, denominator: 1001 }

const AT_ZERO: PlaybackAnchor = { frame: 0, contextSeconds: 0 }

describe("frameToContextTime", () => {
  it("places the anchor's Frame at the anchor's instant", () => {
    expect(frameToContextTime(VIDEO, { frame: 120, contextSeconds: 3.25 }, 120)).toBe(3.25)
  })

  it("measures Frames after the anchor in the Timebase", () => {
    expect(frameToContextTime(VIDEO, { frame: 120, contextSeconds: 3.25 }, 150)).toBe(4.25)
  })

  it("places a Frame before the anchor earlier than the anchor", () => {
    expect(frameToContextTime(VIDEO, { frame: 120, contextSeconds: 10 }, 90)).toBe(9)
  })

  it("does not drift at 30000/1001 ten minutes from the anchor", () => {
    // 17982 Frames is exactly 17982 × 1001 / 30000 = 600.0 − 0.0006 s.
    const seconds = frameToContextTime(NTSC, { frame: 0, contextSeconds: 5 }, 17982)
    expect(seconds).toBeCloseTo(5 + (17982 * 1001) / 30000, 9)
  })

  it("rejects a fractional Frame and a non-finite anchor", () => {
    expect(() => frameToContextTime(VIDEO, AT_ZERO, 1.5)).toThrow(RangeError)
    expect(() => frameToContextTime(VIDEO, { frame: 0, contextSeconds: Number.NaN }, 1)).toThrow(
      RangeError
    )
  })
})

describe("frameAtContextTime", () => {
  it("is the anchor's Frame until the sound has started", () => {
    const anchor = { frame: 42, contextSeconds: 2 }
    expect(frameAtContextTime(VIDEO, anchor, 0)).toBe(42)
    expect(frameAtContextTime(VIDEO, anchor, 2)).toBe(42)
  })

  it("is the last Frame that has begun, not the nearest", () => {
    // 0.9 of a Frame in: Frame 0 is still the one on screen.
    expect(frameAtContextTime(VIDEO, AT_ZERO, 0.9 / 30)).toBe(0)
    expect(frameAtContextTime(VIDEO, AT_ZERO, 1.01 / 30)).toBe(1)
  })

  it("agrees with frameToContextTime at every boundary, so the two cannot disagree", () => {
    const anchor = { frame: 7, contextSeconds: 1234.5678 }
    for (const frame of [7, 8, 9, 1000, 17_989, 107_899, 1_000_007]) {
      const begins = frameToContextTime(NTSC, anchor, frame)
      expect(frameAtContextTime(NTSC, anchor, begins)).toBe(frame)
      if (frame > anchor.frame) {
        // The instant before a Frame begins still shows the previous one.
        const before = begins - 1e-7
        expect(frameAtContextTime(NTSC, anchor, before)).toBe(frame - 1)
      }
    }
  })

  // 60 000 instants: ~0.85 s on a quiet machine, but past Vitest's 5 s default when the machine
  // is busy with other work. The limit is the harness's, not part of what SC-002 asserts.
  it("stays within one Frame of the audio clock for ten minutes at 30000/1001 (SC-002)", () => {
    const anchor = { frame: 0, contextSeconds: 0.1 }
    for (let seconds = 0; seconds <= 600; seconds += 0.01) {
      const frame = frameAtContextTime(NTSC, anchor, anchor.contextSeconds + seconds)
      const exact = (seconds * 30000) / 1001
      expect(exact - frame).toBeGreaterThanOrEqual(-1e-6)
      expect(exact - frame).toBeLessThan(1)
    }
  }, 30_000)

  it("rejects a non-finite clock reading", () => {
    expect(() => frameAtContextTime(VIDEO, AT_ZERO, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe("timelineSampleToContextTime", () => {
  const SAMPLE_RATE = 48_000

  it("sounds a Frame's first sample when the Frame begins", () => {
    const anchor = { frame: 0, contextSeconds: 10 }
    const sample = frameToSampleIndex(VIDEO, SAMPLE_RATE, 30)
    expect(timelineSampleToContextTime(VIDEO, anchor, SAMPLE_RATE, sample)).toBe(11)
    expect(frameToContextTime(VIDEO, anchor, 30)).toBe(11)
  })

  it("measures from the anchor's Frame, placing earlier samples before the anchor", () => {
    const anchor = { frame: 30, contextSeconds: 10 }
    expect(timelineSampleToContextTime(VIDEO, anchor, SAMPLE_RATE, SAMPLE_RATE)).toBe(10)
    expect(timelineSampleToContextTime(VIDEO, anchor, SAMPLE_RATE, 0)).toBe(9)
  })

  it("lands within half a sample of the Frame that shows it ten minutes in at 30000/1001", () => {
    // Frame 17982 begins at 17982 × 1001 / 30000 s, which at 48 kHz is sample 28,799,971.2 —
    // between two samples, so the nearest sample is 0.2 of a sample early.
    const anchor = { frame: 0, contextSeconds: 0.25 }
    const sample = frameToSampleIndex(NTSC, SAMPLE_RATE, 17_982)
    expect(sample).toBe(28_799_971)
    const sampleTime = timelineSampleToContextTime(NTSC, anchor, SAMPLE_RATE, sample)
    const frameTime = frameToContextTime(NTSC, anchor, 17_982)
    expect(frameTime - sampleTime).toBeCloseTo(0.2 / SAMPLE_RATE, 9)
  })

  it("does not drift with the anchor far into a long Timeline", () => {
    const anchor = { frame: 107_892, contextSeconds: 3.5 } // an hour in at 30000/1001
    const sample = frameToSampleIndex(NTSC, SAMPLE_RATE, anchor.frame)
    const at = timelineSampleToContextTime(NTSC, anchor, SAMPLE_RATE, sample)
    expect(Math.abs(at - anchor.contextSeconds)).toBeLessThanOrEqual(0.5 / SAMPLE_RATE)
  })

  it("rejects a fractional or negative sample and a zero sample rate", () => {
    expect(() => timelineSampleToContextTime(VIDEO, AT_ZERO, SAMPLE_RATE, 0.5)).toThrow(RangeError)
    expect(() => timelineSampleToContextTime(VIDEO, AT_ZERO, SAMPLE_RATE, -1)).toThrow(RangeError)
    expect(() => timelineSampleToContextTime(VIDEO, AT_ZERO, 0, 0)).toThrow(RangeError)
  })
})

describe("anchorAtTimelineSample", () => {
  const SAMPLE_RATE = 48_000

  it("puts the sample at context time 0 exactly, on a Frame boundary between two samples", () => {
    // Frame 1 at 30000/1001 begins at sample 1601.6; its nearest sample, 1602, begins 0.4 of a
    // sample later, so the anchor's Frame begins 0.4 / 48000 s before context time 0.
    const sample = frameToSampleIndex(NTSC, SAMPLE_RATE, 1)
    expect(sample).toBe(1602)
    const anchor = anchorAtTimelineSample(NTSC, SAMPLE_RATE, sample, 1)
    expect(anchor.frame).toBe(1)
    expect(anchor.contextSeconds).toBeCloseTo(-0.4 / SAMPLE_RATE, 15)
    expect(timelineSampleToContextTime(NTSC, anchor, SAMPLE_RATE, sample)).toBe(0)
  })

  it("is exact ten minutes and an hour in, with the anchor a Frame early", () => {
    for (const frame of [17_982, 107_892, 1_000_007]) {
      const sample = frameToSampleIndex(NTSC, SAMPLE_RATE, frame)
      const anchor = anchorAtTimelineSample(NTSC, SAMPLE_RATE, sample, frame - 1)
      expect(timelineSampleToContextTime(NTSC, anchor, SAMPLE_RATE, sample)).toBe(0)
      // Ten seconds of samples later is ten seconds later, to far better than a sample.
      const later = timelineSampleToContextTime(NTSC, anchor, SAMPLE_RATE, sample + 480_000)
      expect(Math.abs(later - 10)).toBeLessThan(1e-12)
      // The Frame the anchor names begins where the Timebase says, measured from the sample.
      expect(frameToContextTime(NTSC, anchor, frame - 1)).toBe(anchor.contextSeconds)
    }
  })

  it("places a sample of another rate on the same instants", () => {
    // 44.1 kHz sound against a 48 kHz mix: Timeline second 3 is sample 132300 at 44.1 kHz.
    const anchor = anchorAtTimelineSample(VIDEO, SAMPLE_RATE, 3 * SAMPLE_RATE, 89)
    expect(anchor.contextSeconds).toBeCloseTo(-1 / 30, 15)
    expect(timelineSampleToContextTime(VIDEO, anchor, 44_100, 132_300)).toBeCloseTo(0, 15)
  })

  it("rejects a fractional sample, a zero rate and a negative Frame", () => {
    expect(() => anchorAtTimelineSample(VIDEO, SAMPLE_RATE, 0.5, 0)).toThrow(RangeError)
    expect(() => anchorAtTimelineSample(VIDEO, 0, 0, 0)).toThrow(RangeError)
    expect(() => anchorAtTimelineSample(VIDEO, SAMPLE_RATE, 0, -1)).toThrow(RangeError)
  })
})
