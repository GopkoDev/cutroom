import { applyPatches } from "immer"
import { describe, expect, it } from "vitest"

import {
  applyCommand,
  CommandError,
  parseProject,
  rippleShifts,
  type Clip,
  type Command,
  type Project,
  type RefusalReason,
  type Source,
} from "../src/index"

// rippleShifts (the rule) and delete-clips (the command) - AC-10 and AC-11.
// Reading of rippleShifts: `delta` is a POSITIVE number of Frames the Clip moves BACK (its new
// startFrame is startFrame - delta). The command tests pin the resulting positions too.

const AT = "2026-07-31T10:00:00.000Z"

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

const clip = (id: string, startFrame: number, durationFrames: number): Clip => ({
  id,
  sourceId: "source-1",
  startFrame,
  durationFrames,
  sourceInPoint: { numerator: 0, denominator: 1 },
})

// Track 1:  a [10,30) 20   b [40,60) 20   c [70,100) 30   f [110,120) 10
// Track 2:  x [0,30) 30    y [30,50) 20   z [80,110) 30
// Timeline.durationFrames 120 (f ends last).
const base = (): Project => ({
  schemaVersion: 1,
  id: "p1",
  name: "P",
  createdAt: AT,
  modifiedAt: AT,
  timebase: { numerator: 30, denominator: 1 },
  frameSize: { width: 1920, height: 1080 },
  sources: [SOURCE],
  timeline: {
    tracks: [
      {
        id: "track-1",
        kind: "video",
        name: "Video 1",
        clips: [clip("a", 10, 20), clip("b", 40, 20), clip("c", 70, 30), clip("f", 110, 10)],
      },
      {
        id: "track-2",
        kind: "video",
        name: "Video 2",
        clips: [clip("x", 0, 30), clip("y", 30, 20), clip("z", 80, 30)],
      },
    ],
    durationFrames: 120,
  },
})

type Delete = Extract<Command, { type: "delete-clips" }>

const del = (clipIds: string[], ripple: boolean, at = AT): Delete => ({
  type: "delete-clips",
  at,
  clipIds,
  ripple,
})

const findClip = (p: Project, id: string): Clip => {
  for (const track of p.timeline.tracks) {
    const found = track.clips.find((c) => c.id === id)
    if (found) return found
  }
  throw new Error(`no clip ${id}`)
}

const ids = (p: Project, trackIndex: number): string[] =>
  p.timeline.tracks[trackIndex]!.clips.map((c) => c.id)

const starts = (p: Project, trackIndex: number): number[] =>
  p.timeline.tracks[trackIndex]!.clips.map((c) => c.startFrame)

const sorted = (shifts: { clipId: string; delta: number }[]) =>
  [...shifts].sort((l, r) => l.clipId.localeCompare(r.clipId))

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

const expectValid = (p: Project) =>
  expect(() => parseProject(JSON.parse(JSON.stringify(p)))).not.toThrow()

describe("the fixture", () => {
  it("is a valid Project", () => {
    expectValid(base())
  })
})

describe("rippleShifts", () => {
  it("each later Clip on the Track moves back by the length deleted before it", () => {
    // b (20) deleted: c and f move back 20; a is before it; Track 2 has no entry.
    expect(sorted(rippleShifts(base(), ["b"]))).toEqual([
      { clipId: "c", delta: 20 },
      { clipId: "f", delta: 20 },
    ])
  })

  it("Clips before the first deleted one and on other Tracks get no entry", () => {
    // c (30) deleted: only f follows it on Track 1.
    expect(rippleShifts(base(), ["c"])).toEqual([{ clipId: "f", delta: 30 }])
    // y (20) deleted on Track 2: only z; Track 1 untouched, x is before it.
    expect(rippleShifts(base(), ["y"])).toEqual([{ clipId: "z", delta: 20 }])
  })

  it("the last Clip of a Track has nothing after it", () => {
    expect(rippleShifts(base(), ["f"])).toEqual([])
    expect(rippleShifts(base(), ["z"])).toEqual([])
  })

  it("several deletions: a kept Clip between moves back by what was deleted before it only", () => {
    // a (20) and c (30) deleted on Track 1: b follows a only (20); f follows both (50).
    // x (30) deleted on Track 2: y and z move back 30.
    expect(sorted(rippleShifts(base(), ["a", "c", "x"]))).toEqual([
      { clipId: "b", delta: 20 },
      { clipId: "f", delta: 50 },
      { clipId: "y", delta: 30 },
      { clipId: "z", delta: 30 },
    ])
  })

  it("the order of the ids does not matter", () => {
    expect(sorted(rippleShifts(base(), ["x", "c", "a"]))).toEqual(
      sorted(rippleShifts(base(), ["a", "c", "x"]))
    )
  })

  it("a deleted Clip gets no entry of its own, even after another deleted one", () => {
    // a and b both deleted: c and f move back 40; neither a nor b is listed.
    expect(sorted(rippleShifts(base(), ["a", "b"]))).toEqual([
      { clipId: "c", delta: 40 },
      { clipId: "f", delta: 40 },
    ])
  })

  it("unknown ids are ignored; an empty list gives no entries", () => {
    expect(sorted(rippleShifts(base(), ["ghost", "b"]))).toEqual([
      { clipId: "c", delta: 20 },
      { clipId: "f", delta: 20 },
    ])
    expect(rippleShifts(base(), [])).toEqual([])
    expect(rippleShifts(base(), ["ghost"])).toEqual([])
  })

  it("is pure", () => {
    const p = base()
    const before = JSON.stringify(p)
    expect(rippleShifts(p, ["a", "c"])).toEqual(rippleShifts(p, ["a", "c"]))
    expect(JSON.stringify(p)).toBe(before)
  })
})

describe("delete-clips", () => {
  it("AC-10: deleting B leaves A and C exactly where they were, with a Gap", () => {
    const p = base()
    const result = applyCommand(p, del(["b"], false))
    const { project } = result

    expect(ids(project, 0)).toEqual(["a", "c", "f"])
    expect(findClip(project, "a")).toEqual(findClip(p, "a"))
    expect(findClip(project, "c")).toEqual(findClip(p, "c"))
    expect(findClip(project, "f")).toEqual(findClip(p, "f"))
    expect(starts(project, 0)).toEqual([10, 70, 110]) // Gap [30,70) where a Gap of b's length was added
    expect(project.timeline.tracks[1]).toEqual(p.timeline.tracks[1])
    expect(project.timeline.durationFrames).toBe(120)

    expect(result.patches.length).toBeGreaterThan(0)
    expect(applyPatches(p, result.patches)).toEqual(project)
    expect(applyPatches(project, result.inversePatches)).toEqual(p)
    expectValid(project)
  })

  it("a Track holding none of the deleted Clips is left as it was, not rewritten (review R-15)", () => {
    // ADR 0021: a TrackRow re-renders only when its own Track changes, and an undo entry holds
    // only what changed, so the untouched Track must keep its identity and get no patch.
    for (const ripple of [false, true]) {
      const p = base()
      const result = applyCommand(p, del(["b"], ripple))
      expect(result.project.timeline.tracks[1]).toBe(p.timeline.tracks[1])
      const touched = result.patches.map((patch) => patch.path.slice(0, 3).join("."))
      expect(touched.filter((path) => path.startsWith("timeline.tracks.1"))).toEqual([])
    }
  })

  it("AC-11: a Ripple delete of B moves C and what follows back by B's length, one undo restores", () => {
    const p = base()
    const result = applyCommand(p, del(["b"], true))
    const { project } = result

    expect(ids(project, 0)).toEqual(["a", "c", "f"])
    expect(findClip(project, "a")).toEqual(findClip(p, "a"))
    expect(findClip(project, "c")).toEqual({ ...findClip(p, "c"), startFrame: 50 }) // 70 - 20
    expect(findClip(project, "f")).toEqual({ ...findClip(p, "f"), startFrame: 90 }) // 110 - 20
    expect(project.timeline.tracks[1]).toEqual(p.timeline.tracks[1]) // other Track does not move
    // f now ends on 100, z (Track 2) on 110.
    expect(project.timeline.durationFrames).toBe(110)

    expect(applyPatches(p, result.patches)).toEqual(project)
    expect(applyPatches(project, result.inversePatches)).toEqual(p)
    expectValid(project)
  })

  it("AC-11: several Clips on two Tracks, each Track closes its own Gaps in one command", () => {
    const p = base()
    const result = applyCommand(p, del(["a", "c", "x"], true))
    const { project } = result

    expect(ids(project, 0)).toEqual(["b", "f"])
    expect(ids(project, 1)).toEqual(["y", "z"])
    expect(findClip(project, "b").startFrame).toBe(20) // 40 - 20
    expect(findClip(project, "f").startFrame).toBe(60) // 110 - (20 + 30)
    expect(findClip(project, "y").startFrame).toBe(0) // 30 - 30
    expect(findClip(project, "z").startFrame).toBe(50) // 80 - 30
    // Only the start changes.
    expect(findClip(project, "f")).toEqual({ ...findClip(p, "f"), startFrame: 60 })
    // Track 1 ends on 70, Track 2 on 80.
    expect(project.timeline.durationFrames).toBe(80)

    expect(applyPatches(p, result.patches)).toEqual(project)
    expect(applyPatches(project, result.inversePatches)).toEqual(p)
    expectValid(project)
  })

  it("without ripple several Clips on two Tracks leave every other Clip where it was", () => {
    const p = base()
    const { project } = applyCommand(p, del(["a", "c", "x"], false))
    expect(starts(project, 0)).toEqual([40, 110])
    expect(starts(project, 1)).toEqual([30, 80])
    expectValid(project)
  })

  it("Timeline.durationFrames is recomputed when the last Clip is deleted", () => {
    // f (ends 120) leaves: c ends on 100, z on 110.
    expect(applyCommand(base(), del(["f"], false)).project.timeline.durationFrames).toBe(110)
    expect(applyCommand(base(), del(["f"], true)).project.timeline.durationFrames).toBe(110)
    // f and z leave: c ends on 100, y on 50.
    expect(applyCommand(base(), del(["f", "z"], false)).project.timeline.durationFrames).toBe(100)
  })

  it("deleting every Clip leaves empty Tracks and a zero-length Timeline", () => {
    const { project } = applyCommand(base(), del(["a", "b", "c", "f", "x", "y", "z"], true))
    expect(ids(project, 0)).toEqual([])
    expect(ids(project, 1)).toEqual([])
    expect(project.timeline.tracks).toHaveLength(2)
    expect(project.timeline.durationFrames).toBe(0)
    expectValid(project)
  })

  it("refuses an unknown Clip, and nothing is written", () => {
    const p = base()
    const before = JSON.stringify(p)
    expectReason(() => applyCommand(p, del(["ghost"], false)), "unknown-clip")
    expectReason(() => applyCommand(p, del(["b", "ghost"], true)), "unknown-clip")
    expect(JSON.stringify(p)).toBe(before)
  })

  it("refuses invalid: a repeated id, an empty id, a bad timestamp", () => {
    const p = base()
    expectReason(() => applyCommand(p, del(["b", "b"], false)), "invalid")
    expectReason(() => applyCommand(p, del(["b", "b"], true)), "invalid")
    expectReason(() => applyCommand(p, del([""], false)), "invalid")
    expectReason(() => applyCommand(p, del(["b"], false, "not a date")), "invalid")
  })

  it("no change, no patches: an empty list, ripple or not", () => {
    const p = base()
    for (const ripple of [false, true]) {
      const result = applyCommand(p, del([], ripple))
      expect(result.project).toBe(p)
      expect(result.patches).toEqual([])
      expect(result.inversePatches).toEqual([])
    }
  })

  it("every other Clip keeps its id and nothing is repeated", () => {
    const { project } = applyCommand(base(), del(["b", "y"], true))
    const all = project.timeline.tracks.flatMap((t) => t.clips.map((c) => c.id)).sort()
    expect(all).toEqual(["a", "c", "f", "x", "z"])
  })
})
