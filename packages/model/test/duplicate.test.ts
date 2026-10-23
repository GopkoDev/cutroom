import { applyPatches } from "immer"
import { describe, expect, it } from "vitest"

import {
  applyCommand,
  CommandError,
  duplicateDelta,
  parseProject,
  type Clip,
  type Command,
  type Project,
  type RefusalReason,
  type Source,
} from "../src/index"

// duplicateDelta (the rule) and duplicate-clips (the command) - AC-12 and AC-13.

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

const clip = (id: string, startFrame: number, durationFrames: number, inSeconds = 0): Clip => ({
  id,
  sourceId: "source-1",
  startFrame,
  durationFrames,
  sourceInPoint: { numerator: inSeconds, denominator: 1 },
})

// Track 1:  a [10,30) In 0   b [30,50) In 1 s   c [100,130) In 2 s     (b follows a directly)
// Track 2:  x [0,30) In 0    y [60,80) In 3 s   w [90,110) In 4 s      (Gap [30,60) = 30; Gap [80,90) = 10)
// Timeline.durationFrames 130.
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
        clips: [clip("a", 10, 20), clip("b", 30, 20, 1), clip("c", 100, 30, 2)],
      },
      {
        id: "track-2",
        kind: "video",
        name: "Video 2",
        clips: [clip("x", 0, 30), clip("y", 60, 20, 3), clip("w", 90, 20, 4)],
      },
    ],
    durationFrames: 130,
  },
})

type Duplicate = Extract<Command, { type: "duplicate-clips" }>

const dup = (delta: number, pairs: [string, string][], at = AT): Duplicate => ({
  type: "duplicate-clips",
  at,
  delta,
  copies: pairs.map(([clipId, newClipId]) => ({ clipId, newClipId })),
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

describe("duplicateDelta", () => {
  it("AC-12: one Clip with a Gap after it as long as the Clip goes directly after it", () => {
    const p = base()
    // x [0,30): Gap [30,60) is 30 = its length, the copy [30,60) touches y.
    expect(duplicateDelta(p, ["x"])).toBe(30)
    // c [100,130) is the last Clip: end 130 - start 100.
    expect(duplicateDelta(p, ["c"])).toBe(30)
    // y [60,80) has no room (w starts on 90, the copy would end on 100) - see AC-13 below.
  })

  it("AC-12: several Clips on one Track go as one block directly after the Selection", () => {
    // a, b: start 10, end 50, delta 40; copies [50,70) and [70,90) stay clear of c on 100.
    expect(duplicateDelta(base(), ["a", "b"])).toBe(40)
    expect(duplicateDelta(base(), ["b", "a"])).toBe(40)
  })

  it("AC-12: a Gap inside the Selection is kept, the block still goes after the Selection", () => {
    // b [30,50) and c [100,130): start 30, end 130, delta 100; copies [130,150) and [200,230).
    expect(duplicateDelta(base(), ["b", "c"])).toBe(100)
  })

  it("AC-13: a neighbour directly after puts the copy after the last Clip on the Track", () => {
    // a [10,30), b directly after. Last Clip on Track 1 ends on 130: 130 - 10.
    expect(duplicateDelta(base(), ["a"])).toBe(120)
  })

  it("AC-13: a Gap shorter than the Clip is no room", () => {
    // y [60,80): Gap [80,90) is 10 < 20. Last Clip on Track 2 ends on 110: 110 - 60.
    expect(duplicateDelta(base(), ["y"])).toBe(50)
  })

  it("AC-13: one Track with room and one without puts the block after the last Clip on both", () => {
    // a [10,30) on Track 1 and x [0,30) on Track 2: start 0, end 30, delta 30 would fit x
    // ([30,60)) but not a ([40,60) over b). Last Clip on the two Tracks ends on 130: 130 - 0.
    expect(duplicateDelta(base(), ["a", "x"])).toBe(130)
    expect(duplicateDelta(base(), ["x", "a"])).toBe(130)
  })

  it("AC-13: only the Tracks the Selection spans count", () => {
    // x, y on Track 2: start 0, end 80, delta 80 would put x at [80,110) over w; Track 2 ends on
    // 110, so 110 - 0. Track 1 (ending on 130) is not spanned.
    expect(duplicateDelta(base(), ["x", "y"])).toBe(110)
  })

  it("a block on Track 2 with room goes directly after the Selection", () => {
    // y, w: start 60, end 110, delta 50; copies [110,130) and [140,160).
    expect(duplicateDelta(base(), ["y", "w"])).toBe(50)
  })

  it("is pure", () => {
    const p = base()
    const before = JSON.stringify(p)
    expect(duplicateDelta(p, ["a", "x"])).toBe(duplicateDelta(p, ["a", "x"]))
    expect(JSON.stringify(p)).toBe(before)
  })
})

describe("duplicate-clips", () => {
  it("AC-12: a copy shows the same part of the same Source, placed by the delta; undo restores", () => {
    const p = base()
    const result = applyCommand(p, dup(30, [["c", "c2"]]))
    const { project } = result

    expect(ids(project, 0)).toEqual(["a", "b", "c", "c2"])
    expect(findClip(project, "c2")).toEqual(clip("c2", 130, 30, 2))
    expect(findClip(project, "c")).toEqual(findClip(p, "c"))
    expect(project.timeline.tracks[1]).toEqual(p.timeline.tracks[1])
    expect(project.timeline.durationFrames).toBe(160)

    expect(result.patches.length).toBeGreaterThan(0)
    expect(applyPatches(p, result.patches)).toEqual(project)
    expect(applyPatches(project, result.inversePatches)).toEqual(p)
    expectValid(project)
  })

  it("keeps the Track ordered by startFrame when the copy lands between Clips", () => {
    // x [0,30) by 30 -> [30,60), between x and y; touches y on 60.
    const { project } = applyCommand(base(), dup(30, [["x", "x2"]]))
    expect(ids(project, 1)).toEqual(["x", "x2", "y", "w"])
    expect(findClip(project, "x2")).toEqual(clip("x2", 30, 30))
    expectValid(project)
  })

  it("AC-12: a block keeps the relative positions, across both Tracks", () => {
    const p = base()
    // y, w by 50 -> [110,130), [140,160)
    const { project } = applyCommand(
      p,
      dup(50, [
        ["y", "y2"],
        ["w", "w2"],
      ])
    )
    expect(findClip(project, "y2")).toEqual(clip("y2", 110, 20, 3))
    expect(findClip(project, "w2")).toEqual(clip("w2", 140, 20, 4))
    expect(ids(project, 1)).toEqual(["x", "y", "w", "y2", "w2"])
    expect(project.timeline.durationFrames).toBe(160)

    const mixed = applyCommand(
      p,
      dup(130, [
        ["a", "a2"],
        ["x", "x2"],
      ])
    ).project
    expect(findClip(mixed, "a2")).toEqual(clip("a2", 140, 20))
    expect(findClip(mixed, "x2")).toEqual(clip("x2", 130, 30))
    expect(ids(mixed, 0)).toEqual(["a", "b", "c", "a2"])
    expect(ids(mixed, 1)).toEqual(["x", "y", "w", "x2"])
    expect(mixed.timeline.durationFrames).toBe(160)
    expectValid(mixed)
  })

  it("the delta may be negative while every copy stays on or after Frame 0", () => {
    // c [100,130) by -50 -> [50,80); Track 1 is free there (b ends at 50). A copy can never
    // land over its own original (AC-13), so the free stretch has to be away from it.
    const { project } = applyCommand(base(), dup(-50, [["c", "c2"]]))
    expect(ids(project, 0)).toEqual(["a", "b", "c2", "c"])
    expect(findClip(project, "c2").startFrame).toBe(50)
    expectValid(project)
  })

  it("AC-13: a copy over the next Clip is refused overlap", () => {
    const p = base()
    // a by 20 -> [30,50) over b; y by 20 -> [80,100) over w.
    expectReason(() => applyCommand(p, dup(20, [["a", "a2"]])), "overlap")
    expectReason(() => applyCommand(p, dup(20, [["y", "y2"]])), "overlap")
    // a copy over an original inside the same Selection.
    expectReason(() => applyCommand(p, dup(10, [["a", "a2"]])), "overlap")
  })

  it("all copies or none: if one cannot land nothing is written", () => {
    const p = base()
    const before = JSON.stringify(p)
    // x by 30 -> [30,60) lands; a by 30 -> [40,60) is over b.
    expectReason(
      () =>
        applyCommand(
          p,
          dup(30, [
            ["x", "x2"],
            ["a", "a2"],
          ])
        ),
      "overlap"
    )
    expect(JSON.stringify(p)).toBe(before)
  })

  it("refuses before-timeline-start when a copy would begin before Frame 0", () => {
    // a [10,30) by -21 -> [-11,9): before Frame 0 and clear of a itself, so the reason is the
    // start, not an overlap with the original.
    expectReason(() => applyCommand(base(), dup(-21, [["a", "a2"]])), "before-timeline-start")
  })

  it("refuses an unknown Clip", () => {
    const p = base()
    expectReason(() => applyCommand(p, dup(30, [["ghost", "g2"]])), "unknown-clip")
    expectReason(
      () =>
        applyCommand(
          p,
          dup(30, [
            ["c", "c2"],
            ["ghost", "g2"],
          ])
        ),
      "unknown-clip"
    )
  })

  it("refuses duplicate-id: a new id already in use, or used twice", () => {
    const p = base()
    expectReason(() => applyCommand(p, dup(30, [["c", "b"]])), "duplicate-id")
    expectReason(() => applyCommand(p, dup(30, [["c", "c"]])), "duplicate-id")
    expectReason(
      () =>
        applyCommand(
          p,
          dup(50, [
            ["y", "n"],
            ["w", "n"],
          ])
        ),
      "duplicate-id"
    )
  })

  it("refuses invalid: a delta that is not whole, a repeated Clip, an empty id, a bad timestamp", () => {
    const p = base()
    expectReason(() => applyCommand(p, dup(1.5, [["c", "c2"]])), "invalid")
    expectReason(() => applyCommand(p, dup(Number.NaN, [["c", "c2"]])), "invalid")
    expectReason(
      () =>
        applyCommand(
          p,
          dup(30, [
            ["c", "c2"],
            ["c", "c3"],
          ])
        ),
      "invalid"
    )
    expectReason(() => applyCommand(p, dup(30, [["", "c2"]])), "invalid")
    expectReason(() => applyCommand(p, dup(30, [["c", ""]])), "invalid")
    expectReason(() => applyCommand(p, dup(30, [["c", "c2"]], "not a date")), "invalid")
  })

  it("no change, no patches: an empty list", () => {
    const p = base()
    for (const delta of [0, 25, -5]) {
      const result = applyCommand(p, dup(delta, []))
      expect(result.project).toBe(p)
      expect(result.patches).toEqual([])
      expect(result.inversePatches).toEqual([])
    }
  })

  it("every original keeps its id and the copies add to them", () => {
    const { project } = applyCommand(
      base(),
      dup(40, [
        ["a", "a2"],
        ["b", "b2"],
      ])
    )
    const all = project.timeline.tracks.flatMap((t) => t.clips.map((c) => c.id)).sort()
    expect(all).toEqual(["a", "a2", "b", "b2", "c", "w", "x", "y"])
    expect(findClip(project, "a2").startFrame).toBe(50)
    expect(findClip(project, "b2").startFrame).toBe(70)
  })

  it("a command built from duplicateDelta is never refused and leaves a valid Project", () => {
    const p = base()
    const sets = [
      ["a"],
      ["b"],
      ["c"],
      ["x"],
      ["y"],
      ["w"],
      ["a", "b"],
      ["b", "c"],
      ["x", "y"],
      ["y", "w"],
      ["a", "x"],
      ["b", "y"],
      ["c", "w"],
      ["a", "b", "c", "x", "y", "w"],
    ]
    for (const clipIds of sets) {
      const delta = duplicateDelta(p, clipIds)
      const command = dup(
        delta,
        clipIds.map((id): [string, string] => [id, `${id}-copy`])
      )
      const { project } = applyCommand(p, command)
      expectValid(project)
      for (const id of clipIds) {
        expect(findClip(project, `${id}-copy`)).toEqual({
          ...findClip(p, id),
          id: `${id}-copy`,
          startFrame: findClip(p, id).startFrame + delta,
        })
      }
    }
  })
})
