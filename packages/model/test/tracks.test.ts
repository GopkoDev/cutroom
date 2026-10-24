import { applyPatches } from "immer"
import { describe, expect, it } from "vitest"

import {
  applyCommand,
  CommandError,
  MAX_VIDEO_TRACKS,
  parseProject,
  projectScene,
  type Clip,
  type Command,
  type Project,
  type RefusalReason,
  type Source,
} from "../src/index"

// add-track and remove-track - AC-20, AC-21, AC-22, AC-30.

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

const project = (tracks: Project["timeline"]["tracks"], durationFrames: number): Project => ({
  schemaVersion: 1,
  id: "p1",
  name: "P",
  createdAt: AT,
  modifiedAt: AT,
  timebase: { numerator: 30, denominator: 1 },
  frameSize: { width: 1920, height: 1080 },
  sources: [SOURCE],
  timeline: { tracks, durationFrames },
})

// One Track: a [0,30), b [40,60). Duration 60.
const one = (): Project =>
  project(
    [
      {
        id: "track-1",
        kind: "video",
        name: "Video 1",
        clips: [clip("a", 0, 30), clip("b", 40, 20)],
      },
    ],
    60
  )

// Two Tracks. Lower: a [0,30), b [40,60). Upper: x [10,40), y [100,150). Duration 150.
const two = (): Project =>
  project(
    [
      {
        id: "track-1",
        kind: "video",
        name: "Video 1",
        clips: [clip("a", 0, 30), clip("b", 40, 20)],
      },
      {
        id: "track-2",
        kind: "video",
        name: "Video 2",
        clips: [clip("x", 10, 30), clip("y", 100, 50)],
      },
    ],
    150
  )

type AddTrack = Extract<Command, { type: "add-track" }>
type RemoveTrack = Extract<Command, { type: "remove-track" }>

const add = (id: string, name = "Video 2", at = AT): AddTrack => ({
  type: "add-track",
  at,
  track: { id, name },
})

const remove = (trackId: string, at = AT): RemoveTrack => ({
  type: "remove-track",
  at,
  trackId,
})

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

describe("add-track", () => {
  it("AC-20: appends an empty video Track above the first, which is untouched", () => {
    const p = one()
    const result = applyCommand(p, add("track-2", "Video 2"))
    const { project: after } = result

    expect(after.timeline.tracks).toHaveLength(2)
    expect(after.timeline.tracks[0]).toEqual(p.timeline.tracks[0])
    expect(after.timeline.tracks[1]).toEqual({
      id: "track-2",
      kind: "video",
      name: "Video 2",
      clips: [],
    })
    expect(after.timeline.durationFrames).toBe(60)

    expect(result.patches.length).toBeGreaterThan(0)
    expect(applyPatches(p, result.patches)).toEqual(after)
    expect(applyPatches(after, result.inversePatches)).toEqual(p)
    expectValid(after)
  })

  it("AC-20: a Clip placed on the new Track comes after the lower Track's Clips in the Scene", () => {
    const { project: withTrack } = applyCommand(one(), add("track-2"))
    const { project: placed } = applyCommand(withTrack, {
      type: "add-clip",
      at: AT,
      trackId: "track-2",
      clip: clip("top", 10, 20),
    })

    expect(placed.timeline.tracks[1]!.clips.map((c) => c.id)).toEqual(["top"])
    expect(projectScene(placed).clips.map((c) => c.clipId)).toEqual(["a", "b", "top"])
    expectValid(placed)
  })

  it("AC-30: refuses a third Track, and nothing is written", () => {
    expect(MAX_VIDEO_TRACKS).toBe(2)
    const p = two()
    const before = JSON.stringify(p)
    expectReason(() => applyCommand(p, add("track-3", "Video 3")), "track-limit")
    expect(JSON.stringify(p)).toBe(before)
  })

  it("refuses duplicate-id for a Track id already used", () => {
    const p = one()
    expectReason(() => applyCommand(p, add("track-1")), "duplicate-id")
  })

  it("refuses invalid: an empty id, a bad timestamp", () => {
    const p = one()
    expectReason(() => applyCommand(p, add("")), "invalid")
    expectReason(() => applyCommand(p, add("track-2", "Video 2", "not a date")), "invalid")
  })
})

describe("remove-track", () => {
  it("AC-21: removes the upper Track and its Clips, the Timeline shrinks, one undo restores in full", () => {
    const p = two()
    const result = applyCommand(p, remove("track-2"))
    const { project: after } = result

    expect(after.timeline.tracks).toHaveLength(1)
    expect(after.timeline.tracks[0]).toEqual(p.timeline.tracks[0])
    expect(after.timeline.tracks.flatMap((t) => t.clips.map((c) => c.id))).toEqual(["a", "b"])
    // y (ends 150) left with the Track; b ends on 60.
    expect(after.timeline.durationFrames).toBe(60)

    expect(applyPatches(p, result.patches)).toEqual(after)
    const restored = applyPatches(after, result.inversePatches)
    expect(restored).toEqual(p)
    expect(restored.timeline.tracks[1]!.clips.map((c) => c.id)).toEqual(["x", "y"])
    expectValid(after)
  })

  it("removing the lower Track leaves the upper one as tracks[0]", () => {
    const p = two()
    const result = applyCommand(p, remove("track-1"))
    const { project: after } = result

    expect(after.timeline.tracks).toHaveLength(1)
    expect(after.timeline.tracks[0]).toEqual(p.timeline.tracks[1])
    expect(after.timeline.durationFrames).toBe(150)

    expect(applyPatches(after, result.inversePatches)).toEqual(p)
    expectValid(after)
  })

  it("removing an empty Track changes nothing but the Track list", () => {
    const { project: withTrack } = applyCommand(one(), add("track-2"))
    const { project: after } = applyCommand(withTrack, remove("track-2"))
    expect(after.timeline).toEqual(one().timeline)
    expectValid(after)
  })

  it("AC-22: refuses to remove the only Track, and nothing is written", () => {
    const p = one()
    const before = JSON.stringify(p)
    expectReason(() => applyCommand(p, remove("track-1")), "last-track")
    expect(JSON.stringify(p)).toBe(before)
  })

  it("refuses an unknown Track", () => {
    expectReason(() => applyCommand(two(), remove("ghost")), "unknown-track")
  })

  it("refuses invalid: a bad timestamp", () => {
    expectReason(() => applyCommand(two(), remove("track-2", "not a date")), "invalid")
  })
})
