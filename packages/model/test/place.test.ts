import { describe, expect, it, vi } from "vitest"

import {
  applyCommand,
  CommandError,
  framesForDuration,
  importCommands,
  parseProject,
  placeSourceCommand,
  type Command,
  type Project,
  type Source,
} from "../src/index"

// T010 (AC-24, AC-25): placing a Source again from the Source list. The command is built from the
// Project alone (an Offline Source places like a Linked one), lands on `tracks[0]` — the bottom
// Track — after its last Clip, and an import builds its own `add-clip` the same way.

const AT = "2026-07-31T10:00:00.000Z"
const LATER = "2026-07-31T11:00:00.000Z"

const aSource = (overrides: Partial<Source> = {}): Source => ({
  id: "source-1",
  name: "sync-1080p30.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 12_345_678, lastModified: 1_754_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
  ...overrides,
})

const run = (prior: Project | null, commands: readonly Command[]): Project => {
  let project = prior
  for (const command of commands) project = applyCommand(project, command).project
  if (project === null) throw new Error("expected a Project")
  return project
}

const request = { at: LATER, sourceId: "source-1", clipId: "clip-new" }

/** 30 fps; Track "track-1" holds clip-1 (0..300); Source "source-2" (5 s) is recorded but unplaced. */
const oneTrack = run(
  null,
  importCommands(null, {
    at: AT,
    source: aSource(),
    clipId: "clip-1",
    projectId: "project-1",
    trackId: "track-1",
  })
)
const withSecond = run(oneTrack, [
  {
    type: "import-source",
    at: AT,
    source: aSource({ id: "source-2", duration: { numerator: 5, denominator: 1 } }),
  },
])

/** Two Tracks: the bottom one ends at 300, the upper one holds a later Clip (400..450). */
const twoTracks = run(withSecond, [
  { type: "add-track", at: AT, track: { id: "track-2", name: "Video 2" } },
  {
    type: "add-clip",
    at: AT,
    trackId: "track-2",
    clip: {
      id: "clip-upper",
      sourceId: "source-2",
      startFrame: 400,
      durationFrames: 50,
      sourceInPoint: { numerator: 0, denominator: 1 },
    },
  },
])

describe("placeSourceCommand", () => {
  it("builds an add-clip for the whole Source after the last Clip on the bottom Track", () => {
    const command = placeSourceCommand(withSecond, { ...request, sourceId: "source-2" })
    expect(command).toStrictEqual({
      type: "add-clip",
      at: LATER,
      trackId: "track-1",
      clip: {
        id: "clip-new",
        sourceId: "source-2",
        startFrame: 300,
        durationFrames: 150,
        sourceInPoint: { numerator: 0, denominator: 1 },
      },
    })
  })

  it("uses the length recorded at import, converted into the Project's Frames", () => {
    const source = twoTracks.sources[0] as Source
    const command = placeSourceCommand(twoTracks, request)
    expect(command.clip.durationFrames).toBe(framesForDuration(twoTracks.timebase, source.duration))
    expect(command.clip.durationFrames).toBe(300)
  })

  it("lands on tracks[0] even when a second Track holds later Clips", () => {
    const command = placeSourceCommand(twoTracks, request)
    expect(command.trackId).toBe(twoTracks.timeline.tracks[0]?.id)
    expect(command.clip.startFrame).toBe(300)
  })

  it("lands at Frame 0 of an empty bottom Track while the upper Track has Clips", () => {
    const emptied = run(twoTracks, [
      { type: "delete-clips", at: AT, clipIds: ["clip-1"], ripple: false },
    ])
    const command = placeSourceCommand(emptied, request)
    expect(command.trackId).toBe("track-1")
    expect(command.clip.startFrame).toBe(0)
  })

  it("applies, and the Project that results passes parseProject", () => {
    const placed = run(twoTracks, [placeSourceCommand(twoTracks, request)])
    expect(placed.timeline.tracks[0]?.clips.map((clip) => clip.id)).toStrictEqual([
      "clip-1",
      "clip-new",
    ])
    expect(parseProject(placed)).toStrictEqual(placed)
  })

  it("places a Source that no Clip uses any more (deleted from the Timeline)", () => {
    const unused = run(oneTrack, [
      { type: "delete-clips", at: AT, clipIds: ["clip-1"], ripple: false },
    ])
    expect(unused.sources).toHaveLength(1)
    const placed = run(unused, [placeSourceCommand(unused, request)])
    expect(placed.timeline.tracks[0]?.clips).toStrictEqual([
      {
        id: "clip-new",
        sourceId: "source-1",
        startFrame: 0,
        durationFrames: 300,
        sourceInPoint: { numerator: 0, denominator: 1 },
      },
    ])
    expect(parseProject(placed)).toStrictEqual(placed)
  })

  it("is pure: reads only the Project, no clock, no randomness, no mutation", () => {
    const before = structuredClone(twoTracks)
    const now = vi.spyOn(Date, "now")
    const random = vi.spyOn(Math, "random")
    expect(placeSourceCommand(twoTracks, request)).toStrictEqual(
      placeSourceCommand(twoTracks, request)
    )
    expect(now).not.toHaveBeenCalled()
    expect(random).not.toHaveBeenCalled()
    expect(twoTracks).toStrictEqual(before)
  })

  it("refuses an unknown Source id with unknown-source", () => {
    const attempt = () => placeSourceCommand(twoTracks, { ...request, sourceId: "nope" })
    expect(attempt).toThrow(CommandError)
    expect(attempt).toThrow(expect.objectContaining({ reason: "unknown-source" }))
  })

  it("refuses a Source shorter than one Frame with too-short", () => {
    const short = run(oneTrack, [
      {
        type: "import-source",
        at: AT,
        source: aSource({ id: "source-0", duration: { numerator: 0, denominator: 1 } }),
      },
    ])
    const attempt = () => placeSourceCommand(short, { ...request, sourceId: "source-0" })
    expect(attempt).toThrow(CommandError)
    expect(attempt).toThrow(expect.objectContaining({ reason: "too-short" }))
  })
})

describe("importCommands shares the placement rule", () => {
  const second = {
    at: LATER,
    source: aSource({ id: "source-3", duration: { numerator: 2, denominator: 1 } }),
    clipId: "clip-3",
    projectId: "unused",
    trackId: "unused",
  }

  it("builds, for a one-Track Project, the add-clip placeSourceCommand builds", () => {
    const [importing, adding] = importCommands(oneTrack, second)
    const recorded = run(oneTrack, [importing as Command])
    expect(adding).toStrictEqual(
      placeSourceCommand(recorded, { at: LATER, sourceId: "source-3", clipId: "clip-3" })
    )
    expect(adding).toMatchObject({
      trackId: "track-1",
      clip: { startFrame: 300, durationFrames: 60 },
    })
  })

  it("places the imported Clip at the end of tracks[0] when there are two Tracks", () => {
    const [, adding] = importCommands(twoTracks, second)
    expect(adding).toMatchObject({
      type: "add-clip",
      trackId: twoTracks.timeline.tracks[0]?.id,
      clip: { startFrame: 300, durationFrames: 60 },
    })
  })
})

describe("add-clip and the Source's bounds", () => {
  it("refuses a Clip longer than its Source allows with source-bounds", () => {
    const source = oneTrack.sources[0] as Source
    const inPoint = { numerator: 0, denominator: 1 }
    const allowed = framesForDuration(oneTrack.timebase, source.duration)
    const attempt = () =>
      applyCommand(oneTrack, {
        type: "add-clip",
        at: LATER,
        trackId: "track-1",
        clip: {
          id: "clip-long",
          sourceId: source.id,
          startFrame: 300,
          durationFrames: allowed + 1,
          sourceInPoint: inPoint,
        },
      })
    expect(attempt).toThrow(CommandError)
    expect(attempt).toThrow(expect.objectContaining({ reason: "source-bounds" }))
  })
})
