import { applyPatches } from "immer"
import { describe, expect, it } from "vitest"

import {
  applyCommand,
  CommandError,
  frameToSourceTime,
  parseProject,
  splitTargets,
  type Clip,
  type Command,
  type Project,
  type RefusalReason,
  type Source,
} from "../src/index"

// splitTargets (the rule) and split-clips (the command) — AC-04, AC-05, AC-29. The command and the
// rule are pinned together: a command built from a splitTargets cut is never refused
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

// Track 1:  a [10,50) In 0     b [60,100) In 5 s
// Track 2:  c [20,80) In 2 s   d [100,130) In 0
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
        clips: [clip("a", 10, 40), clip("b", 60, 40, 5)],
      },
      {
        id: "track-2",
        kind: "video",
        name: "Video 2",
        clips: [clip("c", 20, 60, 2), clip("d", 100, 30)],
      },
    ],
    durationFrames: 130,
  },
})

type Split = Extract<Command, { type: "split-clips" }>

const split = (frame: number, ...cuts: [string, string][]): Split => ({
  type: "split-clips",
  at: AT,
  frame,
  cuts: cuts.map(([clipId, newClipId]) => ({ clipId, newClipId })),
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

describe("the fixture", () => {
  it("is a valid Project", () => {
    expect(() => parseProject(JSON.parse(JSON.stringify(base())))).not.toThrow()
  })
})

describe("splitTargets", () => {
  it("with a Selection: the selected Clips the Frame is strictly inside", () => {
    expect(splitTargets(base(), 30, ["a"])).toEqual({ kind: "cut", clipIds: ["a"] })
    // a and c are both under Frame 40; only the selected one is cut.
    expect(splitTargets(base(), 40, ["c"])).toEqual({ kind: "cut", clipIds: ["c"] })
    expect(splitTargets(base(), 40, ["a", "c"])).toEqual({ kind: "cut", clipIds: ["a", "c"] })
    // Frame 60 is b's first Frame, so of the selected only c qualifies.
    expect(splitTargets(base(), 60, ["b", "c"])).toEqual({ kind: "cut", clipIds: ["c"] })
  })

  it("an unknown selected id is ignored", () => {
    expect(splitTargets(base(), 40, ["ghost", "a"])).toEqual({ kind: "cut", clipIds: ["a"] })
    expect(splitTargets(base(), 40, ["ghost"]).kind).toBe("none")
  })

  it("AC-05: a Selection none of whose Clips the Frame is strictly inside", () => {
    // Playhead inside unselected Clips only.
    expect(splitTargets(base(), 40, ["b"])).toEqual({
      kind: "none",
      because: "selection-not-under-frame",
    })
    // On the selected Clip's first Frame, at its end, and in a Gap.
    expect(splitTargets(base(), 10, ["a"])).toEqual({
      kind: "none",
      because: "selection-not-under-frame",
    })
    expect(splitTargets(base(), 50, ["a"])).toEqual({
      kind: "none",
      because: "selection-not-under-frame",
    })
    expect(splitTargets(base(), 55, ["a"])).toEqual({
      kind: "none",
      because: "selection-not-under-frame",
    })
  })

  it("AC-29: with no Selection, every Clip strictly under the Frame, on every Track", () => {
    expect(splitTargets(base(), 40, [])).toEqual({ kind: "cut", clipIds: ["a", "c"] })
    expect(splitTargets(base(), 85, [])).toEqual({ kind: "cut", clipIds: ["b"] })
  })

  it("with no Selection, a Clip's first Frame and its end are not under the Frame", () => {
    // 20 is c's first Frame, a is inside.
    expect(splitTargets(base(), 20, [])).toEqual({ kind: "cut", clipIds: ["a"] })
    // 60 is b's first Frame, c is inside.
    expect(splitTargets(base(), 60, [])).toEqual({ kind: "cut", clipIds: ["c"] })
    // 50 is a's end (exclusive), c is inside.
    expect(splitTargets(base(), 50, [])).toEqual({ kind: "cut", clipIds: ["c"] })
  })

  it("AC-05: with no Selection and nothing strictly under the Frame", () => {
    const none = { kind: "none", because: "nothing-under-frame" }
    expect(splitTargets(base(), 10, [])).toEqual(none) // a's first Frame, nothing else
    expect(splitTargets(base(), 100, [])).toEqual(none) // b's end and d's first Frame
    expect(splitTargets(base(), 5, [])).toEqual(none) // a Gap before everything
    expect(splitTargets(base(), 130, [])).toEqual(none) // the Timeline's end
    expect(splitTargets(base(), 500, [])).toEqual(none) // past it
  })

  it("is pure", () => {
    const p = base()
    const before = JSON.stringify(p)
    expect(splitTargets(p, 40, [])).toEqual(splitTargets(p, 40, []))
    expect(JSON.stringify(p)).toBe(before)
  })
})

describe("split-clips", () => {
  it("AC-04: the Clip becomes two that meet at the Frame, losing and repeating nothing", () => {
    const p = base()
    const { project } = applyCommand(p, split(30, ["a", "a2"]))

    const first = findClip(project, "a")
    const second = findClip(project, "a2")
    expect(first.startFrame).toBe(10)
    expect(first.startFrame + first.durationFrames).toBe(30)
    expect(second.startFrame).toBe(30)
    expect(first.durationFrames + second.durationFrames).toBe(40)
    expect(second.startFrame + second.durationFrames).toBe(50)
    expect(first.sourceId).toBe("source-1")
    expect(second.sourceId).toBe("source-1")
    expect(first.sourceInPoint).toEqual(ZERO)
    expect(second.sourceInPoint).toEqual(frameToSourceTime(TIMEBASE, ZERO, 20))
  })

  it("the second half's In-point advances by the offset, exactly (ADR 0018)", () => {
    // b starts at 60 with In-point 5 s; split at 70 is offset 10: 5 s + 10/30 s = 16/3 s.
    const { project } = applyCommand(base(), split(70, ["b", "b2"]))
    const second = findClip(project, "b2")
    expect(second.sourceInPoint).toEqual(
      frameToSourceTime(TIMEBASE, { numerator: 5, denominator: 1 }, 10)
    )
    expect(second.sourceInPoint.numerator * 3).toBe(second.sourceInPoint.denominator * 16)
    expect(findClip(project, "b")).toEqual(clip("b", 60, 10, 5))
    expect(second.startFrame).toBe(70)
    expect(second.durationFrames).toBe(30)
  })

  it("splitting one Frame in and one Frame before the end leaves one-Frame halves", () => {
    const head = applyCommand(base(), split(11, ["a", "a2"])).project
    expect(findClip(head, "a").durationFrames).toBe(1)
    expect(findClip(head, "a2").durationFrames).toBe(39)
    const tail = applyCommand(base(), split(49, ["a", "a2"])).project
    expect(findClip(tail, "a").durationFrames).toBe(39)
    expect(findClip(tail, "a2").durationFrames).toBe(1)
    expect(findClip(tail, "a2").sourceInPoint).toEqual(frameToSourceTime(TIMEBASE, ZERO, 39))
  })

  it("keeps the Track ordered by startFrame and every other Clip as it was", () => {
    const p = base()
    const { project } = applyCommand(p, split(30, ["a", "a2"]))
    expect(ids(project, 0)).toEqual(["a", "a2", "b"])
    expect(project.timeline.tracks[1]).toEqual(p.timeline.tracks[1])
    expect(findClip(project, "b")).toEqual(findClip(p, "b"))

    const second = applyCommand(p, split(70, ["b", "b2"])).project
    expect(ids(second, 0)).toEqual(["a", "b", "b2"])
    const middle = applyCommand(p, split(40, ["c", "c2"])).project
    expect(ids(middle, 1)).toEqual(["c", "c2", "d"])
  })

  it("leaves Timeline.durationFrames as it was", () => {
    expect(applyCommand(base(), split(30, ["a", "a2"])).project.timeline.durationFrames).toBe(130)
    expect(applyCommand(base(), split(110, ["d", "d2"])).project.timeline.durationFrames).toBe(130)
  })

  it("AC-29: cuts on two Tracks apply in one command, and one undo takes them all back", () => {
    const p = base()
    const result = applyCommand(p, split(40, ["a", "a2"], ["c", "c2"]))
    const { project } = result

    expect(ids(project, 0)).toEqual(["a", "a2", "b"])
    expect(ids(project, 1)).toEqual(["c", "c2", "d"])
    expect(findClip(project, "a")).toEqual(clip("a", 10, 30))
    expect(findClip(project, "a2")).toEqual({
      ...clip("a2", 40, 10),
      sourceInPoint: frameToSourceTime(TIMEBASE, ZERO, 30),
    })
    expect(findClip(project, "c")).toEqual(clip("c", 20, 20, 2))
    expect(findClip(project, "c2")).toEqual({
      ...clip("c2", 40, 40),
      sourceInPoint: frameToSourceTime(TIMEBASE, { numerator: 2, denominator: 1 }, 20),
    })

    expect(result.patches.length).toBeGreaterThan(0)
    expect(applyPatches(project, result.inversePatches)).toEqual(p)
    expect(applyPatches(p, result.patches)).toEqual(project)
  })

  it("a command built from a splitTargets cut is never refused", () => {
    const p = base()
    for (const frame of [11, 25, 40, 49, 55, 60, 79, 85, 99, 115]) {
      const targets = splitTargets(p, frame, [])
      if (targets.kind !== "cut") continue
      const cuts = targets.clipIds.map((clipId) => ({ clipId, newClipId: `${clipId}-2` }))
      const result = applyCommand(p, { type: "split-clips", at: AT, frame, cuts })
      expect(() => parseProject(JSON.parse(JSON.stringify(result.project)))).not.toThrow()
      expect(applyPatches(result.project, result.inversePatches)).toEqual(p)
    }
  })

  it("every result passes parseProject", () => {
    for (const command of [
      split(30, ["a", "a2"]),
      split(40, ["a", "a2"], ["c", "c2"]),
      split(11, ["a", "a2"]),
      split(129, ["d", "d2"]),
    ]) {
      const { project } = applyCommand(base(), command)
      expect(() => parseProject(JSON.parse(JSON.stringify(project)))).not.toThrow()
    }
  })

  it("refuses nothing-to-split for a Clip the Frame is not strictly inside", () => {
    const p = base()
    expectReason(() => applyCommand(p, split(10, ["a", "a2"])), "nothing-to-split") // first Frame
    expectReason(() => applyCommand(p, split(50, ["a", "a2"])), "nothing-to-split") // its end
    expectReason(() => applyCommand(p, split(40, ["b", "b2"])), "nothing-to-split") // before it
    expectReason(() => applyCommand(p, split(55, ["a", "a2"])), "nothing-to-split") // after it
  })

  it("refuses unknown-clip", () => {
    expectReason(() => applyCommand(base(), split(30, ["ghost", "g2"])), "unknown-clip")
  })

  it("refuses duplicate-id when the new id is already on the Timeline", () => {
    const p = base()
    expectReason(() => applyCommand(p, split(30, ["a", "b"])), "duplicate-id")
    expectReason(() => applyCommand(p, split(30, ["a", "a"])), "duplicate-id")
  })

  it("refuses invalid: the same Clip twice, and a Frame that is not whole", () => {
    const p = base()
    expectReason(() => applyCommand(p, split(30, ["a", "a2"], ["a", "a3"])), "invalid")
    expectReason(() => applyCommand(p, split(30.5, ["a", "a2"])), "invalid")
    expectReason(() => applyCommand(p, split(Number.NaN, ["a", "a2"])), "invalid")
  })

  it("whole or refused: one bad cut among good ones writes nothing", () => {
    const p = base()
    const before = JSON.stringify(p)
    // c is cut cleanly at 40, b is not under Frame 40.
    expectReason(
      () => applyCommand(p, split(40, ["a", "a2"], ["b", "b2"], ["c", "c2"])),
      "nothing-to-split"
    )
    expect(JSON.stringify(p)).toBe(before)
  })

  it("no change, no patches: an empty list of cuts returns the same Project", () => {
    const p = base()
    const result = applyCommand(p, split(30))
    expect(result.project).toBe(p)
    expect(result.patches).toEqual([])
    expect(result.inversePatches).toEqual([])
  })
})
