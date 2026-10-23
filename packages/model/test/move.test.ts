import { applyPatches } from "immer"
import { describe, expect, it } from "vitest"

import {
  applyCommand,
  checkMove,
  CommandError,
  parseProject,
  type Clip,
  type Command,
  type Project,
  type RefusalReason,
  type Source,
} from "../src/index"

// checkMove (the rule) and move-clips (the command) — AC-06 to AC-09. The command and the rule are
// pinned together: a command whose checkMove verdict is ok is never refused, and a refused one
// gives the verdict's reason (contracts/public-api.md §Editing rules).

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

// Track 1:  a [40,60) In 0   b [70,100) In 5 s   c [120,150) In 2 s     (Gap [0,40) before a)
// Track 2:  d [10,40) In 0   e [60,90) In 0
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
        clips: [clip("a", 40, 20), clip("b", 70, 30, 5), clip("c", 120, 30, 2)],
      },
      {
        id: "track-2",
        kind: "video",
        name: "Video 2",
        clips: [clip("d", 10, 30), clip("e", 60, 30)],
      },
    ],
    durationFrames: 150,
  },
})

type Move = Extract<Command, { type: "move-clips" }>

const move = (clipIds: string[], delta: number, toTrackId: string | null = null): Move => ({
  type: "move-clips",
  at: AT,
  clipIds,
  delta,
  toTrackId,
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

describe("checkMove", () => {
  it("allows a move into a Gap, adjacent to neighbours, and to Frame 0 exactly", () => {
    const p = base()
    expect(checkMove(p, ["c"], -110, null)).toEqual({ ok: true }) // [10,40) in the Gap
    expect(checkMove(p, ["a"], 10, null)).toEqual({ ok: true }) // [50,70) touches b, no overlap
    expect(checkMove(p, ["a"], -40, null)).toEqual({ ok: true }) // starts on Frame 0
    expect(checkMove(p, ["c"], 10, null)).toEqual({ ok: true }) // later than the Timeline's end
  })

  it("AC-07: overlap with a Clip that is not moving", () => {
    const p = base()
    expect(checkMove(p, ["a"], 20, null)).toEqual({ ok: false, reason: "overlap" }) // [60,80) vs b
    expect(checkMove(p, ["a"], 30, null)).toEqual({ ok: false, reason: "overlap" })
    expect(checkMove(p, ["c"], -30, null)).toEqual({ ok: false, reason: "overlap" }) // [90,120) vs b
  })

  it("AC-07: landing before the Timeline's first Frame", () => {
    const p = base()
    expect(checkMove(p, ["a"], -41, null)).toEqual({ ok: false, reason: "before-timeline-start" })
    expect(checkMove(p, ["d"], -11, null)).toEqual({ ok: false, reason: "before-timeline-start" })
  })

  it("moving Clips may overlap each other's old places", () => {
    const p = base()
    // a lands on [60,80), over b's old place [70,100); b lands on [90,120), touching c.
    expect(checkMove(p, ["a", "b"], 20, null)).toEqual({ ok: true })
    // Same set, the other order of ids.
    expect(checkMove(p, ["b", "a"], 20, null)).toEqual({ ok: true })
  })

  it("AC-09: Clips on both Tracks move along their own Tracks", () => {
    const p = base()
    expect(checkMove(p, ["a", "b", "d", "e"], 5, null)).toEqual({ ok: true })
    // b would land on [100,130) over c.
    expect(checkMove(p, ["a", "b", "d", "e"], 30, null)).toEqual({ ok: false, reason: "overlap" })
    // d would start at -20.
    expect(checkMove(p, ["a", "d"], -30, null)).toEqual({
      ok: false,
      reason: "before-timeline-start",
    })
  })

  it("AC-08: onto the other Track, where it is free and where it is not", () => {
    const p = base()
    expect(checkMove(p, ["c"], -20, "track-2")).toEqual({ ok: true }) // [100,130) after e
    expect(checkMove(p, ["a"], 0, "track-2")).toEqual({ ok: true }) // [40,60) exactly between d and e
    expect(checkMove(p, ["b"], 0, "track-2")).toEqual({ ok: false, reason: "overlap" }) // [70,100) vs e
    expect(checkMove(p, ["a", "b"], 0, "track-1")).toEqual({ ok: true }) // its own Track
  })

  it("AC-09: Clips from two Tracks with a toTrackId are invalid", () => {
    const p = base()
    expect(checkMove(p, ["a", "d"], 5, "track-1")).toEqual({ ok: false, reason: "invalid" })
    expect(checkMove(p, ["a", "d"], 5, "track-2")).toEqual({ ok: false, reason: "invalid" })
  })

  it("an unknown Clip or Track is a verdict, not an exception", () => {
    const p = base()
    expect(checkMove(p, ["ghost"], 5, null)).toEqual({ ok: false, reason: "unknown-clip" })
    expect(checkMove(p, ["a", "ghost"], 5, null)).toEqual({ ok: false, reason: "unknown-clip" })
    expect(checkMove(p, ["a"], 5, "ghost")).toEqual({ ok: false, reason: "unknown-track" })
  })

  it("is pure", () => {
    const p = base()
    const before = JSON.stringify(p)
    expect(checkMove(p, ["a", "b"], 20, null)).toEqual(checkMove(p, ["a", "b"], 20, null))
    expect(JSON.stringify(p)).toBe(before)
  })
})

describe("move-clips", () => {
  it("AC-06: C dropped into the Gap before A plays first, on the dropped Frame; undo restores", () => {
    const p = base()
    // c [120,150) moved by -110 starts on Frame 10 and ends on 40, filling the Gap [0,40) after Frame 10.
    const result = applyCommand(p, move(["c"], -110))
    const { project } = result

    expect(ids(project, 0)).toEqual(["c", "a", "b"])
    expect(findClip(project, "c").startFrame).toBe(10)
    expect(findClip(project, "c").durationFrames).toBe(30)
    expect(findClip(project, "c").sourceInPoint).toEqual(findClip(p, "c").sourceInPoint)
    expect(findClip(project, "a")).toEqual(findClip(p, "a"))
    expect(findClip(project, "b")).toEqual(findClip(p, "b"))
    expect(project.timeline.tracks[1]).toEqual(p.timeline.tracks[1])

    expect(result.patches.length).toBeGreaterThan(0)
    expect(applyPatches(p, result.patches)).toEqual(project)
    expect(applyPatches(project, result.inversePatches)).toEqual(p)
    expectValid(project)
  })

  it("AC-08: a Clip goes from the lower Track to the upper one, same id, at that Frame", () => {
    const p = base()
    const result = applyCommand(p, move(["c"], -20, "track-2"))
    const { project } = result

    expect(ids(project, 0)).toEqual(["a", "b"])
    expect(ids(project, 1)).toEqual(["d", "e", "c"])
    expect(findClip(project, "c")).toEqual(clip("c", 100, 30, 2))
    expect(applyPatches(project, result.inversePatches)).toEqual(p)
    expectValid(project)
  })

  it("keeps each Track ordered by startFrame when a Clip lands between others on the other Track", () => {
    const { project } = applyCommand(base(), move(["a"], 0, "track-2"))
    expect(ids(project, 0)).toEqual(["b", "c"])
    expect(ids(project, 1)).toEqual(["d", "a", "e"])
    expect(findClip(project, "a")).toEqual(clip("a", 40, 20))
    expectValid(project)
  })

  it("AC-09: Clips on both Tracks move by the same delta and keep their spacing", () => {
    const p = base()
    const result = applyCommand(p, move(["a", "b", "d", "e"], 5))
    const { project } = result
    for (const id of ["a", "b", "d", "e"]) {
      expect(findClip(project, id)).toEqual({
        ...findClip(p, id),
        startFrame: findClip(p, id).startFrame + 5,
      })
    }
    expect(findClip(project, "c")).toEqual(findClip(p, "c"))
    expect(ids(project, 0)).toEqual(["a", "b", "c"])
    expect(ids(project, 1)).toEqual(["d", "e"])
    expect(applyPatches(project, result.inversePatches)).toEqual(p)
    expectValid(project)
  })

  it("moving Clips may pass over each other's old places", () => {
    const { project } = applyCommand(base(), move(["a", "b"], 20))
    expect(findClip(project, "a").startFrame).toBe(60)
    expect(findClip(project, "b").startFrame).toBe(90)
    expectValid(project)
  })

  it("AC-09: if any one Clip cannot land none moves", () => {
    const p = base()
    const before = JSON.stringify(p)
    // b would land on [100,130) over c, while a, d and e could land.
    expectReason(() => applyCommand(p, move(["a", "b", "d", "e"], 30)), "overlap")
    // d would start at -20, while a could land.
    expectReason(() => applyCommand(p, move(["a", "d"], -30)), "before-timeline-start")
    expect(JSON.stringify(p)).toBe(before)
  })

  it("AC-09: a two-Track Selection with a toTrackId is refused invalid", () => {
    expectReason(() => applyCommand(base(), move(["a", "d"], 5, "track-2")), "invalid")
  })

  it("AC-07: refuses with the reason checkMove gives", () => {
    const p = base()
    expectReason(() => applyCommand(p, move(["a"], 20)), "overlap")
    expectReason(() => applyCommand(p, move(["a"], -41)), "before-timeline-start")
    expectReason(() => applyCommand(p, move(["ghost"], 5)), "unknown-clip")
    expectReason(() => applyCommand(p, move(["a", "ghost"], 5)), "unknown-clip")
    expectReason(() => applyCommand(p, move(["a"], 5, "ghost")), "unknown-track")
    expectReason(() => applyCommand(p, move(["b"], 0, "track-2")), "overlap")
  })

  it("refuses invalid: a delta that is not whole, a repeated id, an empty id", () => {
    const p = base()
    expectReason(() => applyCommand(p, move(["a"], 1.5)), "invalid")
    expectReason(() => applyCommand(p, move(["a"], Number.NaN)), "invalid")
    expectReason(() => applyCommand(p, move(["a", "a"], 5)), "invalid")
    expectReason(() => applyCommand(p, move([""], 5)), "invalid")
    expectReason(() => applyCommand(p, move(["a"], 5, "")), "invalid")
  })

  it("no change, no patches: delta 0 on the Clips' own Track, and an empty list", () => {
    const p = base()
    for (const command of [
      move(["a"], 0),
      move(["a", "d"], 0),
      move(["a", "b"], 0, "track-1"),
      move(["d"], 0, "track-2"),
      move([], 25),
      move([], 0, "track-2"),
    ]) {
      const result = applyCommand(p, command)
      expect(result.project).toBe(p)
      expect(result.patches).toEqual([])
      expect(result.inversePatches).toEqual([])
    }
  })

  it("a move by 0 onto the other Track is a change", () => {
    const p = base()
    const result = applyCommand(p, move(["a"], 0, "track-2"))
    expect(result.project).not.toBe(p)
    expect(result.patches.length).toBeGreaterThan(0)
  })

  it("recomputes Timeline.durationFrames: later lengthens, earlier shortens", () => {
    expect(applyCommand(base(), move(["c"], 10)).project.timeline.durationFrames).toBe(160)
    // c leaves the end: b ends on 100, e on 90.
    expect(applyCommand(base(), move(["c"], -110)).project.timeline.durationFrames).toBe(100)
  })

  it("every Clip keeps its id and none is lost or repeated", () => {
    const { project } = applyCommand(base(), move(["a", "c"], -10, "track-1"))
    const all = project.timeline.tracks.flatMap((t) => t.clips.map((c) => c.id)).sort()
    expect(all).toEqual(["a", "b", "c", "d", "e"])
  })

  it("a command whose checkMove verdict is ok is never refused, and a refused one agrees", () => {
    const p = base()
    const sets: [string[], (string | null)[]][] = [
      [["a"], [null, "track-1", "track-2"]],
      [["c"], [null, "track-2"]],
      [["d"], [null, "track-1"]],
      [
        ["a", "b"],
        [null, "track-2"],
      ],
      [["a", "d"], [null]],
      [["b", "e"], [null]],
      [["a", "b", "d", "e"], [null]],
    ]
    let applied = 0
    for (const [clipIds, targets] of sets) {
      for (const toTrackId of targets) {
        for (let delta = -160; delta <= 160; delta++) {
          const verdict = checkMove(p, clipIds, delta, toTrackId)
          if (verdict.ok) {
            const { project } = applyCommand(p, move(clipIds, delta, toTrackId))
            expectValid(project)
            applied++
          } else {
            expectReason(() => applyCommand(p, move(clipIds, delta, toTrackId)), verdict.reason)
          }
        }
      }
    }
    expect(applied).toBeGreaterThan(100)
  })
})
