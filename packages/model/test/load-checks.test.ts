import { describe, expect, it } from "vitest"

import { applyCommand } from "../src/commands/apply"
import { importCommands } from "../src/commands/import"
import { parseProject } from "../src/document/parse"
import type { Project, Source } from "../src/document/types"
import { framesForDuration, sourceTimeBefore } from "../src/timebase"

// T003 (AC-02, AC-22): two load checks, "every invariant is checked on load, not only on edit".
//
//   - a Clip stays within its Source: sourceInPoint <= Source.duration and
//     durationFrames <= framesForDuration(timebase, Source.duration - sourceInPoint)
//   - a Timeline has at least one Track
//
// The refused cases are the RED. The accepted cases (exactly at the ceiling, and Projects as the
// step-1 import saved them) pass today and must keep passing: they guard against a check that is
// stricter than the import's own rounding (sad.md section 11).

const aSource = (overrides: Record<string, unknown> = {}) => ({
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

const aClip = (overrides: Record<string, unknown> = {}) => ({
  id: "clip-1",
  sourceId: "source-1",
  startFrame: 0,
  durationFrames: 300,
  sourceInPoint: { numerator: 0, denominator: 1 },
  ...overrides,
})

const aProject = (
  clip: Record<string, unknown>,
  source: Record<string, unknown> = aSource(),
  timebase = { numerator: 30, denominator: 1 }
) => ({
  schemaVersion: 1,
  id: "project-1",
  name: "First cut",
  createdAt: "2026-07-31T09:00:00.000Z",
  modifiedAt: "2026-07-31T09:30:00.000Z",
  timebase,
  frameSize: { width: 1920, height: 1080 },
  sources: [source],
  timeline: {
    tracks: [{ id: "track-1", kind: "video", name: "Video 1", clips: [clip] }],
    durationFrames: Number(clip.startFrame) + Number(clip.durationFrames),
  },
})

/** The message of the TypeError parseProject throws, or a failure if it throws anything else. */
const refusal = (document: unknown): string => {
  try {
    parseProject(document)
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError)
    const message = (error as Error).message
    expect(message.startsWith("parseProject: ")).toBe(true)
    return message
  }
  throw new Error("parseProject accepted a document it should have refused")
}

// ------------------------------------------------------------------------------------ refused

describe("a Clip must stay within its Source", () => {
  const timebase = { numerator: 30, denominator: 1 }
  const duration = { numerator: 10, denominator: 1 }
  const ceiling = framesForDuration(timebase, duration)

  it("refuses a Clip one Frame longer than the Source holds", () => {
    const message = refusal(aProject(aClip({ durationFrames: ceiling + 1 })))

    expect(message).toContain("timeline.tracks[0].clips[0]")
  })

  it("refuses a Clip longer than what remains after its In-point", () => {
    // In-point 2 s leaves 8 s = 240 Frames; 241 is one past.
    const inPoint = { numerator: 2, denominator: 1 }
    const remaining = framesForDuration(timebase, sourceTimeBefore(duration, inPoint))
    const message = refusal(
      aProject(aClip({ sourceInPoint: inPoint, durationFrames: remaining + 1 }))
    )

    expect(remaining).toBe(240)
    expect(message).toContain("timeline.tracks[0].clips[0]")
  })

  it("refuses an In-point past the end of the Source", () => {
    const message = refusal(
      aProject(aClip({ sourceInPoint: { numerator: 11, denominator: 1 }, durationFrames: 1 }))
    )

    expect(message).toContain("timeline.tracks[0].clips[0]")
    expect(message).toMatch(/sourceInPoint/)
  })

  it("refuses an In-point equal to the Source duration, where no Frame fits", () => {
    const message = refusal(
      aProject(aClip({ sourceInPoint: { numerator: 10, denominator: 1 }, durationFrames: 1 }))
    )

    expect(message).toContain("timeline.tracks[0].clips[0]")
  })
})

describe("a Timeline must have a Track", () => {
  it("refuses a Timeline with no Track", () => {
    const document = { ...aProject(aClip()), timeline: { tracks: [], durationFrames: 0 } }

    expect(refusal(document)).toContain("timeline.tracks")
  })
})

// ----------------------------------------------------------------------------------- accepted

describe("a Clip exactly at the ceiling", () => {
  it("is accepted on an integer rate", () => {
    const parsed = parseProject(aProject(aClip({ durationFrames: 300 })))

    expect(parsed.timeline.tracks[0]?.clips[0]?.durationFrames).toBe(300)
  })

  it("is accepted at a non-integer rate, where the Source ends between two Frames", () => {
    // 10 s at 30000/1001 is 299.7 Frame-lengths: the ceiling is 300, the last Frame starting inside.
    const timebase = { numerator: 30000, denominator: 1001 }
    const source = aSource({ timebase })
    const ceiling = framesForDuration(timebase, { numerator: 10, denominator: 1 })

    expect(ceiling).toBe(300)
    expect(
      parseProject(aProject(aClip({ durationFrames: ceiling }), source, timebase))
    ).toBeDefined()
  })

  it("is accepted after an In-point that leaves a part-Frame remainder", () => {
    const timebase = { numerator: 30000, denominator: 1001 }
    const inPoint = { numerator: 1001, denominator: 30000 } // exactly Frame 1
    const remaining = framesForDuration(
      timebase,
      sourceTimeBefore({ numerator: 10, denominator: 1 }, inPoint)
    )
    const parsed = parseProject(
      aProject(
        aClip({ sourceInPoint: inPoint, durationFrames: remaining }),
        aSource({ timebase }),
        timebase
      )
    )

    expect(parsed.timeline.tracks[0]?.clips[0]?.durationFrames).toBe(remaining)
  })
})

describe("Projects as step 1 saved them", () => {
  // Built by running the step-1 import (importCommands + applyCommand) on a Source whose duration,
  // Source Timebase and dimensions are what ffprobe reports for the fixture in
  // packages/engine/test/fixtures:
  //   ffprobe -v error -show_entries format=duration:stream=time_base,r_frame_rate,duration -of json
  // The Clip is therefore In-point 0 with durationFrames = framesForDuration(project timebase,
  // Source.duration), the same ceiling the new check uses.
  const step1Project = (source: Source): Project => {
    let project: Project | null = null
    const commands = importCommands(null, {
      at: "2026-07-31T09:00:00.000Z",
      source,
      clipId: "clip-1",
      projectId: "project-1",
      trackId: "track-1",
    })
    for (const command of commands) project = applyCommand(project, command).project
    if (project === null) throw new Error("the import produced no Project")
    return project
  }

  const sourceOf = (overrides: Partial<Source>): Source =>
    ({
      id: "source-1",
      name: "x.mp4",
      address: { kind: "local-file" },
      fingerprint: { size: 1, lastModified: 1_754_000_000_000 },
      duration: { numerator: 1, denominator: 1 },
      timebase: { numerator: 30, denominator: 1 },
      dimensions: { width: 1920, height: 1080 },
      hasAudio: true,
      codecs: {},
      ...overrides,
    }) as Source

  const fixtures: [string, Source][] = [
    // ffprobe: r_frame_rate 30/1, duration 30.000000 (video and format).
    [
      "sync-1080p30.mp4",
      sourceOf({
        name: "sync-1080p30.mp4",
        duration: { numerator: 30, denominator: 1 },
        timebase: { numerator: 30, denominator: 1 },
      }),
    ],
    // ffprobe: r_frame_rate 30000/1001, video stream duration 29.996633 = 899899/30000 s (899
    // Frames on a 1/30000 clock), format duration 30.000000. Ceiling is 899 Frames, off a boundary.
    [
      "sync-1080p2997.mp4 (video duration)",
      sourceOf({
        name: "sync-1080p2997.mp4",
        duration: { numerator: 899_899, denominator: 30_000 },
        timebase: { numerator: 30_000, denominator: 1001 },
      }),
    ],
    // The same file if the engine records the container's 30 s instead: 899.1 Frames, ceiling 900.
    [
      "sync-1080p2997.mp4 (format duration)",
      sourceOf({
        name: "sync-1080p2997.mp4",
        duration: { numerator: 30, denominator: 1 },
        timebase: { numerator: 30_000, denominator: 1001 },
      }),
    ],
    // ffprobe: r_frame_rate 24/1, duration 10.000000, 1280x720, no audio stream.
    [
      "silent-720p24.mp4",
      sourceOf({
        name: "silent-720p24.mp4",
        duration: { numerator: 10, denominator: 1 },
        timebase: { numerator: 24, denominator: 1 },
        dimensions: { width: 1280, height: 720 },
        hasAudio: false,
      }),
    ],
  ]

  it.each(fixtures)("%s still loads", (_name, source) => {
    const project = step1Project(source)
    const clip = project.timeline.tracks[0]?.clips[0]

    expect(clip?.sourceInPoint).toEqual({ numerator: 0, denominator: 1 })
    expect(clip?.durationFrames).toBe(framesForDuration(project.timebase, source.duration))
    expect(parseProject(structuredClone(project))).toEqual(project)
  })
})
