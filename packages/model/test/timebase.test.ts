import { describe, expect, it } from "vitest"

import {
  frameToSampleIndex,
  frameToSeconds,
  frameToSourceTime,
  framesForDuration,
  secondsToFrame,
  type Rational,
  type Timebase,
} from "../src/timebase"

// Timebase is the one module every conversion in the product goes through, so these tests are
// written to pin behaviour rather than to describe it: the tie-breaking rule, the truncation rule,
// the bound on sample error, and the exactness of Source time. Each is something another module
// will silently depend on.

const FILM: Timebase = { numerator: 24, denominator: 1 } // 24
const VIDEO: Timebase = { numerator: 30, denominator: 1 } // 30
const NTSC: Timebase = { numerator: 30000, denominator: 1001 } // 29.97
const POWER_OF_TWO: Timebase = { numerator: 32, denominator: 1 } // exact halves in binary
const SLOW: Timebase = { numerator: 2, denominator: 1 } // 0.5 s per Frame

const SAMPLE_RATE = 48_000

/**
 * The expected values are derived here independently of the module — in BigInt, from the
 * definitions — so a test agreeing with the implementation means two derivations agree, not that
 * one of them was copied.
 */
const exactSourceTime = (timebase: Timebase, inPoint: Rational, frame: number) => {
  const numerator =
    BigInt(inPoint.numerator) * BigInt(timebase.numerator) +
    BigInt(frame) * BigInt(timebase.denominator) * BigInt(inPoint.denominator)
  const denominator = BigInt(inPoint.denominator) * BigInt(timebase.numerator)
  let a = numerator
  let b = denominator
  while (b !== 0n) [a, b] = [b, a % b]
  return { numerator: Number(numerator / a), denominator: Number(denominator / a) }
}

/** The true, unrounded sample position of a Frame, as an exact ratio, for measuring error. */
const exactSamplePosition = (timebase: Timebase, sampleRate: number, frame: number) => ({
  numerator: BigInt(frame) * BigInt(timebase.denominator) * BigInt(sampleRate),
  denominator: BigInt(timebase.numerator),
})

/** |index − exact| in samples, as an exact comparison against a half-sample. */
const errorExceedsHalfASample = (
  timebase: Timebase,
  sampleRate: number,
  frame: number,
  index: number
) => {
  const { numerator, denominator } = exactSamplePosition(timebase, sampleRate, frame)
  const difference = BigInt(index) * denominator - numerator
  const magnitude = difference < 0n ? -difference : difference
  return 2n * magnitude > denominator
}

describe("frameToSeconds", () => {
  it("puts Frame 0 at zero and whole seconds where they belong", () => {
    expect(frameToSeconds(NTSC, 0)).toBe(0)
    expect(frameToSeconds(VIDEO, 30)).toBe(1)
    expect(frameToSeconds(FILM, 24 * 60)).toBe(60)
    // 30000 Frames of 1001/30000 s is 1001 s, to the last bit.
    expect(frameToSeconds(NTSC, 30_000)).toBe(1001)
  })

  it("keeps a Frame's time exact where 29.97 makes it awkward", () => {
    expect(frameToSeconds(NTSC, 1)).toBeCloseTo(1001 / 30_000, 15)
    expect(frameToSeconds(NTSC, 17_982)).toBeCloseTo(17_982 * (1001 / 30_000), 9)
  })

  it("stays exact for a Frame far enough out that the integer product is not", () => {
    // frame * denominator is 9,016,206,453,994,740 here — past Number.MAX_SAFE_INTEGER, so the
    // product cannot be formed in doubles without losing its low bits. Splitting into whole
    // seconds (300,540,215,133) plus a remainder (4740/30000) never forms it.
    expect(frameToSeconds(NTSC, 9_007_199_254_740)).toBe(300_540_215_133 + 4740 / 30_000)
  })
})

describe("secondsToFrame — the only rounding of time in the codebase", () => {
  it("lands on the Frame when the time is exactly a Frame boundary", () => {
    expect(secondsToFrame(VIDEO, 0)).toBe(0)
    expect(secondsToFrame(VIDEO, 1)).toBe(30)
    expect(secondsToFrame(POWER_OF_TWO, 5 / 32)).toBe(5)
    expect(secondsToFrame(NTSC, 1001)).toBe(30_000)
  })

  it("rounds an exact half Frame up, on both sides of a Frame", () => {
    // 32 and 2 Frames per second put every half-Frame boundary on an exactly representable double,
    // so this pins the tie rule itself rather than a float artefact.
    expect(secondsToFrame(POWER_OF_TWO, 9 / 64)).toBe(5) // 4.5 Frames -> 5
    expect(secondsToFrame(POWER_OF_TWO, 11 / 64)).toBe(6) // 5.5 Frames -> 6
    expect(secondsToFrame(SLOW, 1.25)).toBe(3) // 2.5 Frames -> 3
    expect(secondsToFrame(SLOW, 1.75)).toBe(4) // 3.5 Frames -> 4
    expect(secondsToFrame(SLOW, 0.25)).toBe(1) // 0.5 Frames -> 1
  })

  it("takes the nearer Frame just either side of a half Frame", () => {
    const midpoint = (100.5 * 1001) / 30_000 // between Frame 100 and Frame 101 at 29.97
    expect(secondsToFrame(NTSC, midpoint - 1e-6)).toBe(100)
    expect(secondsToFrame(NTSC, midpoint + 1e-6)).toBe(101)

    expect(secondsToFrame(VIDEO, 3.4832)).toBe(104) // 104.496 Frames
    expect(secondsToFrame(VIDEO, 3.4835)).toBe(105) // 104.505 Frames
  })

  it("inverts frameToSeconds for every Frame in ten minutes of 29.97", () => {
    const misses: number[] = []
    for (let frame = 0; frame <= 17_982; frame++) {
      if (secondsToFrame(NTSC, frameToSeconds(NTSC, frame)) !== frame) misses.push(frame)
    }
    expect(misses).toEqual([])
  })

  it("refuses a negative or unusable time rather than inventing a Frame", () => {
    expect(() => secondsToFrame(VIDEO, -0.001)).toThrow(/seconds must be a finite number >= 0/)
    expect(() => secondsToFrame(VIDEO, Number.NaN)).toThrow(/got NaN/)
    expect(() => secondsToFrame(VIDEO, Number.POSITIVE_INFINITY)).toThrow(/got Infinity/)
    expect(() => secondsToFrame(VIDEO, 1e300)).toThrow(/beyond the range of exact integers/)
  })
})

describe("frameToSampleIndex", () => {
  it("is exact wherever the two grids meet", () => {
    expect(frameToSampleIndex(NTSC, SAMPLE_RATE, 0)).toBe(0)
    // At 48 kHz a 29.97 Frame is 1601.6 samples, so every fifth Frame is a whole sample and no
    // other one is.
    expect(frameToSampleIndex(NTSC, SAMPLE_RATE, 5)).toBe(8008)
    expect(frameToSampleIndex(NTSC, SAMPLE_RATE, 100)).toBe(160_160)
    expect(frameToSampleIndex(VIDEO, SAMPLE_RATE, 30)).toBe(SAMPLE_RATE)
  })

  it("takes the nearest sample when the Frame boundary falls between two", () => {
    expect(frameToSampleIndex(NTSC, SAMPLE_RATE, 1)).toBe(1602) // 1601.6
    expect(frameToSampleIndex(NTSC, SAMPLE_RATE, 2)).toBe(3203) // 3203.2
    expect(frameToSampleIndex(NTSC, SAMPLE_RATE, 3)).toBe(4805) // 4804.8
    expect(frameToSampleIndex(NTSC, SAMPLE_RATE, 4)).toBe(6406) // 6406.4
  })

  it("rounds an exact half sample up, like secondsToFrame", () => {
    // 2 Frames per second at 1 Hz puts Frame 1 exactly halfway between sample 0 and sample 1.
    expect(frameToSampleIndex(SLOW, 1, 1)).toBe(1)
    expect(frameToSampleIndex(SLOW, 1, 3)).toBe(2) // 1.5 -> 2
  })

  it("stays within half a sample for every Frame of ten minutes at 29.97", () => {
    const drifted: number[] = []
    for (let frame = 0; frame <= 17_982; frame++) {
      const index = frameToSampleIndex(NTSC, SAMPLE_RATE, frame)
      if (errorExceedsHalfASample(NTSC, SAMPLE_RATE, frame, index)) drifted.push(frame)
    }
    expect(drifted).toEqual([])
  })

  it("does not accumulate: the error at ten minutes is no worse than at Frame 1", () => {
    // The property ADR 0002 is built on. Naive per-Frame accumulation — 1602 samples each, the
    // nearest whole sample to 1601.6 — is out by 0.4 samples after one Frame and by thousands
    // after ten minutes. Computing from the absolute Frame is out by less than a sample at both.
    const tenMinutes = 17_982
    const exact = (frame: number) => (frame * 1001 * SAMPLE_RATE) / 30_000

    const ours = frameToSampleIndex(NTSC, SAMPLE_RATE, tenMinutes)
    const naive = tenMinutes * Math.round((SAMPLE_RATE * 1001) / 30_000)

    expect(ours).toBe(28_799_971)
    expect(naive).toBe(28_807_164)
    expect(naive - ours).toBe(7193) // ~150 ms of audio, and growing with the Timeline

    const errorAtFrameOne = Math.abs(frameToSampleIndex(NTSC, SAMPLE_RATE, 1) - exact(1))
    const errorAtTenMinutes = Math.abs(ours - exact(tenMinutes))
    expect(errorAtTenMinutes).toBeLessThanOrEqual(0.5)
    expect(errorAtTenMinutes).toBeLessThanOrEqual(Math.max(errorAtFrameOne, 0.5))
    expect(Math.abs(naive - exact(tenMinutes))).toBeGreaterThan(7000)
  })

  it("refuses a sample rate that is not a positive whole number", () => {
    expect(() => frameToSampleIndex(NTSC, 0, 1)).toThrow(
      /sampleRate must be a positive safe integer, got 0/
    )
    expect(() => frameToSampleIndex(NTSC, -48_000, 1)).toThrow(/sampleRate/)
    expect(() => frameToSampleIndex(NTSC, 44_100.5, 1)).toThrow(/sampleRate/)
  })

  it("refuses to return a sample index a Number cannot hold exactly", () => {
    expect(() => frameToSampleIndex(NTSC, SAMPLE_RATE, Number.MAX_SAFE_INTEGER)).toThrow(
      /beyond Number.MAX_SAFE_INTEGER/
    )
  })
})

describe("framesForDuration", () => {
  it("counts the Frames a duration exactly fills", () => {
    expect(framesForDuration(VIDEO, { numerator: 10, denominator: 1 })).toBe(300)
    expect(framesForDuration(FILM, { numerator: 10, denominator: 1 })).toBe(240)
    // 10.01 s is exactly 300 Frames at 29.97 — the case that makes NTSC durations look tidy.
    expect(framesForDuration(NTSC, { numerator: 1001, denominator: 100 })).toBe(300)
    expect(framesForDuration(NTSC, { numerator: 0, denominator: 1 })).toBe(0)
  })

  it("rounds up, because the last partly covered Frame still starts inside the media", () => {
    // 10.000 s at 29.97 is 299.7 Frame lengths. A count of 300 means indices 0..299, and index 299
    // begins at 9.9766 s — inside the file. Truncating to 299 would discard that Frame.
    expect(framesForDuration(NTSC, { numerator: 10, denominator: 1 })).toBe(300)
    expect(frameToSeconds(NTSC, 299)).toBeLessThan(10)
    // ...while index 300 — the exclusive end, never displayed — is the one past the media.
    expect(frameToSeconds(NTSC, 300)).toBeGreaterThan(10)

    // 9.9999 s at 30 fps is 299.997 Frame lengths: 300 Frames, the last starting at 9.9667 s.
    expect(framesForDuration(VIDEO, { numerator: 99_999, denominator: 10_000 })).toBe(300)
    expect(frameToSeconds(VIDEO, 299)).toBeLessThan(9.9999)
  })

  it("adds nothing when the duration divides exactly", () => {
    // The ceiling must not inflate a whole count: 10 s at 30 fps is 300 Frames, indices 0..299,
    // and index 300 starts exactly at the end — outside, so it is not counted.
    expect(framesForDuration(VIDEO, { numerator: 10, denominator: 1 })).toBe(300)
    expect(frameToSeconds(VIDEO, 300)).toBe(10)
  })

  it("handles a Source-native duration that is a long ratio", () => {
    // 70 minutes of 30 fps media expressed in the Source's own timescale.
    expect(framesForDuration(VIDEO, { numerator: 4200, denominator: 1 })).toBe(126_000)
    expect(framesForDuration(NTSC, { numerator: 4_204_200, denominator: 1000 })).toBe(126_000)
  })

  it("refuses a duration that is not a non-negative ratio", () => {
    expect(() => framesForDuration(VIDEO, { numerator: -1, denominator: 1 })).toThrow(
      /duration numerator must be a non-negative safe integer, got -1/
    )
    expect(() => framesForDuration(VIDEO, { numerator: 1, denominator: 0 })).toThrow(
      /duration denominator must be a positive safe integer, got 0/
    )
    expect(() => framesForDuration(VIDEO, { numerator: 1.5, denominator: 1 })).toThrow(
      /duration numerator/
    )
  })
})

describe("frameToSourceTime", () => {
  const tenMinutesOfVideo = 18_000 // 10 minutes at 30 Frames per second

  it("returns the in point itself at Frame 0", () => {
    // Source frame 100 of a 30000/1001 Source, in that Source's own timescale.
    const ntscInPoint: Rational = { numerator: 1001, denominator: 300 }
    expect(frameToSourceTime(VIDEO, ntscInPoint, 0)).toEqual({ numerator: 1001, denominator: 300 })

    // Source frame 48 of a 24 fps Source: exactly 2 s.
    expect(frameToSourceTime(VIDEO, { numerator: 2, denominator: 1 }, 0)).toEqual({
      numerator: 2,
      denominator: 1,
    })
    expect(frameToSourceTime(VIDEO, { numerator: 0, denominator: 30_000 }, 0)).toEqual({
      numerator: 0,
      denominator: 1,
    })
  })

  it("maps a 30 fps Project Frame into a 30000/1001 Source without drift at either end", () => {
    const inPoint: Rational = { numerator: 1001, denominator: 300 } // Source frame 100 at 29.97

    expect(frameToSourceTime(VIDEO, inPoint, 0)).toEqual(inPoint)
    // Ten minutes later is the in point plus exactly 600 s — 1001/300 + 600 = 181001/300 — and the
    // Source's own 29.97 grid never has to be reasoned about to say so.
    expect(frameToSourceTime(VIDEO, inPoint, tenMinutesOfVideo)).toEqual({
      numerator: 181_001,
      denominator: 300,
    })

    const mapped = frameToSourceTime(VIDEO, inPoint, tenMinutesOfVideo)
    expect(mapped.numerator / mapped.denominator - inPoint.numerator / inPoint.denominator).toBe(
      600
    )
  })

  it("maps a 30 fps Project Frame into a 24 fps Source without drift at either end", () => {
    const inPoint: Rational = { numerator: 2, denominator: 1 } // Source frame 48 at 24

    expect(frameToSourceTime(VIDEO, inPoint, 0)).toEqual(inPoint)
    expect(frameToSourceTime(VIDEO, inPoint, tenMinutesOfVideo)).toEqual({
      numerator: 602,
      denominator: 1,
    })
    // Frame 1 of the Project is 1/30 s into the Project but 2 + 1/30 = 61/30 s into the Source, and
    // 61/30 s is 48.8 Frames of that Source — between two of its Frames, which is exactly the case
    // a float would round away and then keep rounding.
    expect(frameToSourceTime(VIDEO, inPoint, 1)).toEqual({ numerator: 61, denominator: 30 })
  })

  it("maps a 29.97 Project Frame into a Source just as exactly", () => {
    expect(frameToSourceTime(NTSC, { numerator: 0, denominator: 1 }, 17_982)).toEqual({
      numerator: 2_999_997,
      denominator: 5000,
    })
  })

  it("agrees with the definition for every Frame across ten minutes", () => {
    const inPoint: Rational = { numerator: 1001, denominator: 300 }
    const disagreements: number[] = []
    for (let frame = 0; frame <= tenMinutesOfVideo; frame += 7) {
      const expected = exactSourceTime(VIDEO, inPoint, frame)
      const actual = frameToSourceTime(VIDEO, inPoint, frame)
      if (actual.numerator !== expected.numerator || actual.denominator !== expected.denominator) {
        disagreements.push(frame)
      }
    }
    expect(disagreements).toEqual([])
  })

  it("beats stepping a float Frame by Frame, which is what it exists to replace", () => {
    const inPoint: Rational = { numerator: 1001, denominator: 300 }
    const exact = frameToSourceTime(VIDEO, inPoint, tenMinutesOfVideo)

    let accumulated = inPoint.numerator / inPoint.denominator
    for (let frame = 0; frame < tenMinutesOfVideo; frame++) accumulated += 1 / 30

    expect(exact.numerator / exact.denominator).toBe(181_001 / 300)
    expect(accumulated).not.toBe(181_001 / 300)
  })

  it("returns the result in lowest terms so equal instants compare equal", () => {
    const a = frameToSourceTime(VIDEO, { numerator: 1001, denominator: 300 }, 30)
    const b = frameToSourceTime(VIDEO, { numerator: 2002, denominator: 600 }, 30)
    expect(a).toEqual(b)
    expect(a).toEqual({ numerator: 1301, denominator: 300 })
  })

  it("refuses an in point that is not a non-negative ratio", () => {
    expect(() => frameToSourceTime(VIDEO, { numerator: -1, denominator: 30 }, 0)).toThrow(
      /sourceInPoint numerator must be a non-negative safe integer, got -1/
    )
    expect(() => frameToSourceTime(VIDEO, { numerator: 1, denominator: -30 }, 0)).toThrow(
      /sourceInPoint denominator must be a positive safe integer, got -30/
    )
  })
})

describe("every function is total", () => {
  const zeroInPoint: Rational = { numerator: 0, denominator: 1 }
  const callers: [string, (timebase: Timebase, frame: number) => unknown][] = [
    ["frameToSeconds", (timebase, frame) => frameToSeconds(timebase, frame)],
    ["frameToSampleIndex", (timebase, frame) => frameToSampleIndex(timebase, SAMPLE_RATE, frame)],
    ["frameToSourceTime", (timebase, frame) => frameToSourceTime(timebase, zeroInPoint, frame)],
  ]

  for (const [name, call] of callers) {
    it(`${name} rejects a Frame that is not a whole non-negative index`, () => {
      expect(() => call(VIDEO, -1)).toThrow(/frame must be a non-negative safe integer, got -1/)
      expect(() => call(VIDEO, 1.5)).toThrow(/frame must be a non-negative safe integer, got 1.5/)
      expect(() => call(VIDEO, Number.NaN)).toThrow(/got NaN/)
      expect(() => call(VIDEO, Number.POSITIVE_INFINITY)).toThrow(/got Infinity/)
      expect(() => call(VIDEO, 2 ** 60)).toThrow(/frame must be a non-negative safe integer/)
    })

    it(`${name} rejects a Timebase that is not a positive ratio`, () => {
      expect(() => call({ numerator: 30, denominator: 0 }, 1)).toThrow(
        /Timebase denominator must be a positive safe integer, got 0/
      )
      expect(() => call({ numerator: 0, denominator: 1 }, 1)).toThrow(
        /Timebase numerator must be a positive safe integer, got 0/
      )
      expect(() => call({ numerator: -30, denominator: 1 }, 1)).toThrow(/Timebase numerator/)
      expect(() => call({ numerator: 29.97, denominator: 1 }, 1)).toThrow(/Timebase numerator/)
      expect(() => call({ numerator: 30, denominator: 1.001 }, 1)).toThrow(/Timebase denominator/)
    })

    it(`${name} names the function and the argument when it throws`, () => {
      expect(() => call(VIDEO, -1)).toThrow(new RegExp(`^${name}: `))
    })
  }

  it("rejects a Timebase that is not a ratio at all", () => {
    const notATimebase = null as unknown as Timebase
    expect(() => frameToSeconds(notATimebase, 0)).toThrow(
      /Timebase must be a \{ numerator, denominator \}, got null/
    )
    expect(() => secondsToFrame(29.97 as unknown as Timebase, 0)).toThrow(
      /Timebase must be a \{ numerator, denominator \}, got 29.97/
    )
  })

  it("throws RangeError rather than returning a plausible number", () => {
    expect(() => frameToSeconds(VIDEO, -1)).toThrow(RangeError)
    expect(() => secondsToFrame(VIDEO, -1)).toThrow(RangeError)
    expect(() => frameToSampleIndex(VIDEO, 0, 0)).toThrow(RangeError)
    expect(() => framesForDuration(VIDEO, { numerator: 1, denominator: 0 })).toThrow(RangeError)
    expect(() => frameToSourceTime(VIDEO, zeroInPoint, -1)).toThrow(RangeError)
  })
})
