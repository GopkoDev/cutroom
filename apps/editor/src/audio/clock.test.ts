import { describe, expect, it } from "vitest"

import type { Timebase } from "@cutroom/model"

import { createAudioClock, START_MARGIN_SECONDS } from "./clock"
import { FakeAudioContext } from "./fake-audio-context"

// The clock's whole promise is that its Frame is a function of the audio clock's reading and
// nothing else — not of how often it is asked, nor of how long ago. The fake context's clock moves
// only when a test moves it, which is what lets these say "and no timer" with a straight face.

const VIDEO: Timebase = { numerator: 30, denominator: 1 }
const NTSC: Timebase = { numerator: 30000, denominator: 1001 }

describe("the audio clock", () => {
  it("is stopped until started", () => {
    const clock = createAudioClock({ context: new FakeAudioContext() })
    expect(clock.frame()).toBeNull()
    expect(clock.anchor()).toBeNull()
  })

  it("holds a Frame with no anchor while the start's sound is not in hand", () => {
    const context = new FakeAudioContext()
    const clock = createAudioClock({ context })
    clock.hold(120)
    context.currentTime = 5
    expect(clock.frame()).toBe(120)
    expect(clock.anchor()).toBeNull()

    clock.start(VIDEO, 120)
    expect(clock.anchor()).toEqual({ frame: 120, contextSeconds: 5 + START_MARGIN_SECONDS })
    clock.stop()
    expect(clock.frame()).toBeNull()
  })

  it("anchors the starting Frame a short margin ahead of the context's clock", () => {
    const context = new FakeAudioContext()
    context.currentTime = 4
    const clock = createAudioClock({ context })

    const anchor = clock.start(VIDEO, 120)
    expect(anchor).toEqual({ frame: 120, contextSeconds: 4 + START_MARGIN_SECONDS })
    expect(clock.anchor()).toEqual(anchor)
  })

  it("reports the starting Frame until the sound begins, then follows currentTime", () => {
    const context = new FakeAudioContext()
    const clock = createAudioClock({ context, startMarginSeconds: 0.1 })
    clock.start(VIDEO, 120)

    expect(clock.frame()).toBe(120)
    context.currentTime = 0.1 + 0.5 / 30
    expect(clock.frame()).toBe(120)
    context.currentTime = 0.1 + 1 / 30
    expect(clock.frame()).toBe(121)
    context.currentTime = 1.1
    expect(clock.frame()).toBe(150)
  })

  it("does not move while the context's clock stands still — a suspended context", () => {
    const context = new FakeAudioContext()
    context.currentTime = 2
    const clock = createAudioClock({ context })
    clock.start(VIDEO, 0)
    for (let asked = 0; asked < 100; asked += 1) expect(clock.frame()).toBe(0)
  })

  it("gives the same Frame however often it is asked, so a display rate cannot leak in", () => {
    const context = new FakeAudioContext()
    const clock = createAudioClock({ context, startMarginSeconds: 0 })
    clock.start(NTSC, 0)
    context.currentTime = 300
    const once = clock.frame()
    for (let asked = 0; asked < 1000; asked += 1) clock.frame()
    expect(clock.frame()).toBe(once)
    expect(once).toBe(Math.floor((300 * 30000) / 1001))
  })

  it("is within one Frame of the audio clock ten minutes in at 30000/1001 (SC-002)", () => {
    const context = new FakeAudioContext()
    const clock = createAudioClock({ context, startMarginSeconds: 0.1 })
    clock.start(NTSC, 0)
    context.currentTime = 600.1
    const exact = (600 * 30000) / 1001
    const frame = clock.frame() ?? Number.NaN
    expect(exact - frame).toBeGreaterThanOrEqual(0)
    expect(exact - frame).toBeLessThan(1)
  })

  it("forgets its anchor on stop, and a restart anchors afresh", () => {
    const context = new FakeAudioContext()
    const clock = createAudioClock({ context, startMarginSeconds: 0 })
    clock.start(VIDEO, 0)
    context.currentTime = 10
    clock.stop()
    expect(clock.frame()).toBeNull()

    clock.start(VIDEO, 42)
    expect(clock.frame()).toBe(42)
  })
})
