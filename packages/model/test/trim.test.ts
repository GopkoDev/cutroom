import { describe, expect, it } from "vitest"

import {
  applyCommand,
  CommandError,
  frameToSourceTime,
  parseProject,
  sourceTimeBefore,
  trimRange,
  type Clip,
  type Command,
  type Project,
  type RefusalReason,
  type Source,
} from "../src/index"

// trimRange (the rule) and trim-clip (the command) — AC-01, AC-02, AC-03, AC-25. The command and
// the rule are pinned together: applyCommand refuses exactly when trimRange says no
// (contracts/public-api.md §Editing rules).

const AT = "2026-07-31T10:00:00.000Z"
const TIMEBASE = { numerator: 30, denominator: 1 }
const ZERO = { numerator: 0, denominator: 1 }

const SOURCE: Source = {
  id: "source-1",
  name: "a.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 100, lastModified: 1_754_000_000_000 },
  duration: { numerator: 10, denominator: 1 }, // 300 Frames
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
}

const clip = (id: string, startFrame: number, durationFrames: number, inSeconds = 0): Clip => ({
  id,
  sourceId: "source-1",
  startFrame,
  durationFrames,
  sourceInPoint: { numerator: inSeconds, denominator: 1 },
})

// Track 1:  prev [10,30)  target [50,90) In 5 s  next [120,150)  tiny [200,202)
// Track 2:  zero [0,20) In 2 s  other [100,110)  full [300,390) In 7 s (Source ends exactly there)
// The Source is only recorded: no handle exists anywhere in this file, as for an Offline Source.
const base = (): Project => ({
  schemaVersion: 1,
  id: "p1",
  name: "P",
  createdAt: AT,
  modifiedAt: AT,
  timebase: TIMEBASE,
  frameSize: { width: 1920, height: 1080 },
  sources: [SOURCE],
  timeline: {
    tracks: [
      {
        id: "track-1",
        kind: "video",
        name: "Video 1",
        clips: [
          clip("prev", 10, 20),
          clip("target", 50, 40, 5),
          clip("next", 120, 30),
          clip("tiny", 200, 2),
        ],
      },
      {
        id: "track-2",
        kind: "video",
        name: "Video 2",
        clips: [clip("zero", 0, 20, 2), clip("other", 100, 10), clip("full", 300, 90, 7)],
      },
    ],
    durationFrames: 390,
  },
})

const trim = (
  clipId: string,
  edge: "head" | "tail",
  frame: number
): Extract<Command, { type: "trim-clip" }> => ({ type: "trim-clip", at: AT, clipId, edge, frame })

const findClip = (p: Project, id: string): Clip => {
  for (const track of p.timeline.tracks) {
    const found = track.clips.find((c) => c.id === id)
    if (found) return found
  }
  throw new Error(`no clip ${id}`)
}

const expectReason = (fn: () => unknown, reason: RefusalReason) => {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(CommandError)
    expect((error as CommandError).reason).toBe(reason)
    return
  }
  throw new Error("expected a refusal, but nothing was thrown")
}

describe("the fixture", () => {
  it("is a valid Project", () => {
    expect(() => parseProject(JSON.parse(JSON.stringify(base())))).not.toThrow()
  })
})

describe("trimRange", () => {
  it("head: Frame 0, the previous Clip's end and the Source's beginning bound it from below", () => {
    // target: previous end 30 beats Frame 0 and 50 − 150 (In-point 5 s = 150 Frames).
    expect(trimRange(base(), "target", "head")).toEqual({ earliest: 30, latest: 89 })
    // zero: starts on Frame 0, so there is no room to the left whatever the In-point holds.
    expect(trimRange(base(), "zero", "head")).toEqual({ earliest: 0, latest: 19 })
    // other: In-point 0, so the Source's beginning (100 − 0) binds before the neighbour's end (20).
    expect(trimRange(base(), "other", "head")).toEqual({ earliest: 100, latest: 109 })
    // prev: nothing before it, Source holds 0 s — Frame 10 is its limit.
    expect(trimRange(base(), "prev", "head")).toEqual({ earliest: 10, latest: 29 })
  })

  it("tail: one Frame after the start, the next Clip's start and the Source's end bound it", () => {
    // target: next starts at 120; the Source would allow 50 + 150.
    expect(trimRange(base(), "target", "tail")).toEqual({ earliest: 51, latest: 120 })
    // other: the next Clip on its Track is full at 300; the Source allows 100 + 300.
    expect(trimRange(base(), "other", "tail")).toEqual({ earliest: 101, latest: 300 })
    // full: In-point 7 s leaves 3 s = 90 Frames; it already shows them all.
    expect(trimRange(base(), "full", "tail")).toEqual({ earliest: 301, latest: 390 })
    // zero: In-point 2 s leaves 8 s = 240 Frames; other starts at 100.
    expect(trimRange(base(), "zero", "tail")).toEqual({ earliest: 1, latest: 100 })
  })

  it("a 2-Frame Clip can move each edge by exactly one Frame", () => {
    // In-point 0: the Source's own beginning (200 − 0) binds before the neighbour's end at 150
    // (AC-02), so the head cannot move earlier at all.
    expect(trimRange(base(), "tiny", "head")).toEqual({ earliest: 200, latest: 201 })
    expect(trimRange(base(), "tiny", "tail")).toEqual({ earliest: 201, latest: 500 })
  })

  it("keeps the current edge inside the range", () => {
    for (const track of base().timeline.tracks) {
      for (const c of track.clips) {
        const head = trimRange(base(), c.id, "head")
        const tail = trimRange(base(), c.id, "tail")
        expect(head.earliest).toBeLessThanOrEqual(c.startFrame)
        expect(head.latest).toBeGreaterThanOrEqual(c.startFrame)
        expect(tail.earliest).toBeLessThanOrEqual(c.startFrame + c.durationFrames)
        expect(tail.latest).toBeGreaterThanOrEqual(c.startFrame + c.durationFrames)
      }
    }
  })

  it("rounds the Source's end up, as import does, when it is not on a Frame boundary", () => {
    const p = base()
    const odd: Project = {
      ...p,
      sources: [{ ...SOURCE, duration: { numerator: 1002, denominator: 100 } }], // 10.02 s
    }
    // 10.02 s at 30 is 300.6 Frame-lengths: framesForDuration says 301 Frames; "full" has 3.02 s left
    // after its 7 s In-point = 90.6 → 91 Frames.
    expect(trimRange(odd, "full", "tail").latest).toBe(391)
  })

  it("does not mutate the Project and is pure", () => {
    const p = base()
    const before = JSON.stringify(p)
    expect(trimRange(p, "target", "head")).toEqual(trimRange(p, "target", "head"))
    expect(JSON.stringify(p)).toBe(before)
  })
})

describe("trim-clip", () => {
  it("AC-01: tail left by k, then head right by m, lands the first Frame on the Source Frame m in", () => {
    const k = 10
    const m = 7
    const p = base()
    const afterTail = applyCommand(p, trim("target", "tail", 90 - k)).project
    const afterHead = applyCommand(afterTail, trim("target", "head", 50 + m)).project

    const trimmed = findClip(afterHead, "target")
    expect(trimmed.startFrame).toBe(50 + m)
    expect(trimmed.durationFrames).toBe(40 - m - k)
    expect(trimmed.startFrame + trimmed.durationFrames).toBe(90 - k)
    expect(trimmed.sourceInPoint).toEqual(
      frameToSourceTime(TIMEBASE, { numerator: 5, denominator: 1 }, m)
    )
    expect(trimmed.sourceInPoint).toEqual({ numerator: 157, denominator: 30 })

    for (const track of p.timeline.tracks) {
      for (const before of track.clips) {
        if (before.id === "target") continue
        expect(findClip(afterHead, before.id)).toEqual(before)
      }
    }
  })

  it("a tail Trim changes only durationFrames", () => {
    const { project } = applyCommand(base(), trim("target", "tail", 100))
    expect(findClip(project, "target")).toEqual({ ...clip("target", 50, 50, 5) })
  })

  it("a head Trim to the left extends back and moves the In-point earlier by the same Frames", () => {
    const n = 10
    const { project } = applyCommand(base(), trim("target", "head", 50 - n))
    const trimmed = findClip(project, "target")
    expect(trimmed.startFrame).toBe(40)
    expect(trimmed.durationFrames).toBe(50)
    expect(trimmed.sourceInPoint).toEqual(
      sourceTimeBefore({ numerator: 5, denominator: 1 }, frameToSourceTime(TIMEBASE, ZERO, n))
    )
    expect(trimmed.sourceInPoint).toEqual({ numerator: 14, denominator: 3 })
  })

  it("moves no other Clip on any Track, and leaves the other Track untouched", () => {
    const p = base()
    const { project } = applyCommand(p, trim("target", "head", 60))
    expect(project.timeline.tracks[1]).toEqual(p.timeline.tracks[1])
    expect(project.timeline.tracks[0]!.clips.filter((c) => c.id !== "target")).toEqual(
      p.timeline.tracks[0]!.clips.filter((c) => c.id !== "target")
    )
  })

  it("recomputes Timeline.durationFrames", () => {
    const shorter = applyCommand(base(), trim("full", "tail", 380)).project
    expect(shorter.timeline.durationFrames).toBe(380)
    const longer = applyCommand(base(), trim("tiny", "tail", 202 + 50)).project
    expect(longer.timeline.durationFrames).toBe(390)
  })

  it("every result passes parseProject, and patches invert it", () => {
    const p = base()
    for (const command of [
      trim("target", "head", 30),
      trim("target", "head", 89),
      trim("target", "tail", 51),
      trim("target", "tail", 120),
      trim("full", "tail", 301),
      trim("tiny", "head", 201),
    ]) {
      const result = applyCommand(p, command)
      expect(() => parseProject(JSON.parse(JSON.stringify(result.project)))).not.toThrow()
      expect(result.patches.length).toBeGreaterThan(0)
      expect(result.inversePatches.length).toBeGreaterThan(0)
    }
  })

  it("the range's own limits are accepted: a command built from trimRange is never refused", () => {
    const p = base()
    for (const track of p.timeline.tracks) {
      for (const c of track.clips) {
        for (const edge of ["head", "tail"] as const) {
          const range = trimRange(p, c.id, edge)
          expect(() => applyCommand(p, trim(c.id, edge, range.earliest))).not.toThrow()
          expect(() => applyCommand(p, trim(c.id, edge, range.latest))).not.toThrow()
        }
      }
    }
  })

  it("AC-02: refuses source-bounds past the Source's own beginning or end", () => {
    const p = base()
    expectReason(() => applyCommand(p, trim("other", "head", 99)), "source-bounds")
    expectReason(() => applyCommand(p, trim("full", "tail", 391)), "source-bounds")
    expectReason(() => applyCommand(p, trim("tiny", "tail", 501)), "source-bounds")
  })

  it("AC-03: refuses overlap into a neighbour at either end", () => {
    const p = base()
    expectReason(() => applyCommand(p, trim("target", "head", 29)), "overlap")
    expectReason(() => applyCommand(p, trim("target", "tail", 121)), "overlap")
  })

  it("AC-03: refuses a head before the Timeline's first Frame", () => {
    expectReason(() => applyCommand(base(), trim("zero", "head", -1)), "before-timeline-start")
  })

  it("AC-03: refuses a Clip trimmed to nothing or past its other end", () => {
    const p = base()
    expectReason(() => applyCommand(p, trim("target", "tail", 50)), "too-short")
    expectReason(() => applyCommand(p, trim("target", "tail", 40)), "too-short")
    expectReason(() => applyCommand(p, trim("target", "head", 90)), "too-short")
    expectReason(() => applyCommand(p, trim("target", "head", 95)), "too-short")
    expectReason(() => applyCommand(p, trim("tiny", "head", 202)), "too-short")
  })

  it("refuses an unknown Clip and a non-whole Frame", () => {
    const p = base()
    expectReason(() => applyCommand(p, trim("nope", "head", 60)), "unknown-clip")
    expectReason(() => applyCommand(p, trim("target", "head", 60.5)), "invalid")
    expectReason(() => applyCommand(p, trim("target", "tail", Number.NaN)), "invalid")
  })

  it("refuses whole: a refused Trim writes nothing", () => {
    const p = base()
    const before = JSON.stringify(p)
    expect(() => applyCommand(p, trim("target", "tail", 121))).toThrow(CommandError)
    expect(JSON.stringify(p)).toBe(before)
  })

  it("no change, no patches: a Trim to the current edge returns the same Project, not a refusal", () => {
    const p = base()
    for (const command of [trim("target", "head", 50), trim("target", "tail", 90)]) {
      const result = applyCommand(p, command)
      expect(result.project).toBe(p)
      expect(result.patches).toEqual([])
      expect(result.inversePatches).toEqual([])
    }
  })

  it("AC-25: works from what was recorded at import, with no handle and no Source read", () => {
    // The Project holds only the Source's recorded duration; nothing here could open a file. The
    // bounds still come out of that record, and the edit is applied.
    const p = base()
    expect(trimRange(p, "full", "tail").latest).toBe(390)
    const { project } = applyCommand(p, trim("full", "head", 310))
    expect(findClip(project, "full")).toEqual({
      ...clip("full", 310, 80),
      sourceInPoint: frameToSourceTime(TIMEBASE, { numerator: 7, denominator: 1 }, 10),
    })
    expect(() => parseProject(JSON.parse(JSON.stringify(project)))).not.toThrow()
  })
})
