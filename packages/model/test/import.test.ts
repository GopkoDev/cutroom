import { applyPatches, type Patch } from "immer"
import { describe, expect, it, vi } from "vitest"

import { applyCommand, CommandError } from "../src/commands/apply"
import { FIRST_TRACK_NAME, importCommands, type ImportRequest } from "../src/commands/import"
import type { Command } from "../src/commands/index"
import { parseProject } from "../src/document/parse"
import type { Project, Source } from "../src/document/types"

// What these tests are for.
//
// `importCommands` decides what an import does and applies nothing, so every test here runs the
// commands through the real reducer and asserts on the Project that comes out — a list of commands
// that merely *looks* right proves nothing until `applyCommand` has accepted every one of them in
// order. Every resulting Project then goes through `parseProject`, the gate it meets on its next
// load.
//
// The cases that matter most are the two the Timebase makes hard: a 30000/1001 Source, whose rate
// the new Project must adopt exactly and not as 29.97, and a Source whose duration is not a whole
// number of the Project's Frames, where the Clip must keep the last Frame that starts inside the
// media rather than truncate it away.

// ---------------------------------------------------------------------------- fixtures

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

/** `sync-1080p2997.mp4`: 300 of its own Frames at 30000/1001, i.e. exactly 10.01 s. */
const ntscSource = (overrides: Partial<Source> = {}): Source =>
  aSource({
    name: "sync-1080p2997.mp4",
    duration: { numerator: 1001, denominator: 100 },
    timebase: { numerator: 30000, denominator: 1001 },
    ...overrides,
  })

const aRequest = (overrides: Partial<ImportRequest> = {}): ImportRequest => ({
  at: AT,
  source: aSource(),
  clipId: "clip-1",
  projectId: "project-1",
  trackId: "track-1",
  ...overrides,
})

/** Runs an import's commands through the reducer, as the store's transaction would. */
const run = (prior: Project | null, commands: readonly Command[]) => {
  let project = prior
  const inverses: (readonly Patch[])[] = []
  for (const command of commands) {
    const result = applyCommand(project, command)
    project = result.project
    inverses.push(result.inversePatches)
  }
  if (project === null) throw new Error("an import's commands always end with a Project")
  return { project, inverses }
}

const importInto = (prior: Project | null, request: ImportRequest): Project =>
  run(prior, importCommands(prior, request)).project

const clipsOn = (project: Project) => project.timeline.tracks[0]?.clips ?? []

/** A 30 fps Project holding one 300-Frame Clip — what the first import of the 30 fps fixture makes. */
const thirtyFps = importInto(null, aRequest())

// ---------------------------------------------------------------------------- the first import

describe("importing into no Project", () => {
  it("creates the Project, records the Source and adds the Clip, in that order", () => {
    expect(importCommands(null, aRequest()).map((command) => command.type)).toStrictEqual([
      "create-project",
      "import-source",
      "add-clip",
    ])
  })

  it("adopts the Source Timebase and dimensions as the Project's Timebase and frame size", () => {
    const project = importInto(
      null,
      aRequest({ source: aSource({ dimensions: { width: 1280, height: 720 } }) })
    )
    expect(project.timebase).toStrictEqual({ numerator: 30, denominator: 1 })
    expect(project.frameSize).toStrictEqual({ width: 1280, height: 720 })
  })

  it("adds one Clip covering the whole Source at Frame 0 on the only Track", () => {
    const project = importInto(null, aRequest())
    expect(project.timeline.tracks).toHaveLength(1)
    expect(project.timeline.tracks[0]).toMatchObject({
      id: "track-1",
      kind: "video",
      name: FIRST_TRACK_NAME,
    })
    expect(clipsOn(project)).toStrictEqual([
      {
        id: "clip-1",
        sourceId: "source-1",
        startFrame: 0,
        durationFrames: 300,
        sourceInPoint: { numerator: 0, denominator: 1 },
      },
    ])
    expect(project.timeline.durationFrames).toBe(300)
  })

  it("records the Source exactly as it was read", () => {
    const source = aSource()
    expect(importInto(null, aRequest({ source })).sources).toStrictEqual([source])
  })

  it("uses the caller's ids and timestamp and nothing else", () => {
    const project = importInto(
      null,
      aRequest({ projectId: "p", trackId: "t", clipId: "c", at: LATER })
    )
    expect(project.id).toBe("p")
    expect(project.timeline.tracks[0]?.id).toBe("t")
    expect(clipsOn(project)[0]?.id).toBe("c")
    expect(project.createdAt).toBe(LATER)
    expect(project.modifiedAt).toBe(LATER)
  })

  it("produces a Project parseProject accepts unchanged, key order included", () => {
    const project = importInto(null, aRequest())
    expect(parseProject(project)).toStrictEqual(project)
    expect(JSON.stringify(parseProject(project))).toBe(JSON.stringify(project))
  })

  it("does not share the Source's Timebase or dimensions objects with the Project", () => {
    const source = aSource()
    const project = importInto(null, aRequest({ source }))
    expect(project.timebase).not.toBe(source.timebase)
    expect(project.frameSize).not.toBe(source.dimensions)
  })
})

describe("a 30000/1001 Source", () => {
  const project = importInto(null, aRequest({ source: ntscSource() }))

  it("gives the Project exactly 30000/1001, not 29.97 or a reduced approximation", () => {
    expect(project.timebase).toStrictEqual({ numerator: 30000, denominator: 1001 })
  })

  it("is covered by exactly its own 300 Frames when the Project shares its Timebase", () => {
    expect(clipsOn(project)[0]?.durationFrames).toBe(300)
    expect(project.timeline.durationFrames).toBe(300)
  })

  it("keeps the last Frame of a 10.000 s Source, which is 299.7 Frame lengths", () => {
    const tenSeconds = importInto(
      null,
      aRequest({ source: ntscSource({ duration: { numerator: 10, denominator: 1 } }) })
    )
    // Index 299 starts at 9.9766 s, inside the file; truncating to 299 would throw it away.
    expect(clipsOn(tenSeconds)[0]?.durationFrames).toBe(300)
  })
})

describe("a Source whose duration is not a whole number of Project Frames", () => {
  it("rounds up, so a 10.01 s Source in a 30 fps Project is 301 Frames, not 300", () => {
    // 300.3 Frame lengths: Frame 300 starts at 10.000 s, inside the media, and is kept.
    const project = importInto(
      null,
      aRequest({ source: aSource({ duration: { numerator: 1001, denominator: 100 } }) })
    )
    expect(clipsOn(project)[0]?.durationFrames).toBe(301)
  })

  it("rounds up a sliver of a Frame too: 10 s plus a millisecond is 301 Frames", () => {
    const project = importInto(
      null,
      aRequest({ source: aSource({ duration: { numerator: 10_001, denominator: 1000 } }) })
    )
    expect(clipsOn(project)[0]?.durationFrames).toBe(301)
  })

  it("counts a 29.97 Source in its established 30 fps Project in 30 fps Frames", () => {
    const project = importInto(
      thirtyFps,
      aRequest({ source: ntscSource({ id: "source-2" }), clipId: "clip-2" })
    )
    expect(project.timebase).toStrictEqual({ numerator: 30, denominator: 1 })
    expect(clipsOn(project)[1]?.durationFrames).toBe(301)
  })
})

// ---------------------------------------------------------------------------- an established Project

describe("importing into a Project that already exists", () => {
  const second = aRequest({
    at: LATER,
    source: ntscSource({ id: "source-2" }),
    clipId: "clip-2",
    projectId: "unused-project",
    trackId: "unused-track",
  })

  it("does not create a Project and does not touch the Timebase or frame size", () => {
    const commands = importCommands(thirtyFps, second)
    expect(commands.map((command) => command.type)).toStrictEqual(["import-source", "add-clip"])
    const project = run(thirtyFps, commands).project
    expect(project.id).toBe(thirtyFps.id)
    expect(project.timebase).toStrictEqual(thirtyFps.timebase)
    expect(project.frameSize).toStrictEqual(thirtyFps.frameSize)
    expect(project.createdAt).toBe(AT)
    expect(project.modifiedAt).toBe(LATER)
  })

  it("leaves the new Source's own Timebase alone", () => {
    const project = importInto(thirtyFps, second)
    expect(project.sources[1]?.timebase).toStrictEqual({ numerator: 30000, denominator: 1001 })
  })

  it("places the Clip where the existing Track ends, a butt join", () => {
    const project = importInto(thirtyFps, second)
    expect(clipsOn(project).map((clip) => [clip.id, clip.startFrame])).toStrictEqual([
      ["clip-1", 0],
      ["clip-2", 300],
    ])
    expect(project.timeline.durationFrames).toBe(601)
    expect(parseProject(project)).toStrictEqual(project)
  })

  it("places the Clip at Frame 0 on a Track with nothing on it", () => {
    const empty = applyCommand(null, importCommands(null, aRequest())[0] as Command).project
    const project = importInto(empty, aRequest())
    expect(project.timebase).toStrictEqual(empty.timebase)
    expect(clipsOn(project)[0]?.startFrame).toBe(0)
  })

  it("refuses a Project with no video Track before producing a command", () => {
    const trackless: Project = { ...thirtyFps, timeline: { tracks: [], durationFrames: 0 } }
    expect(() => importCommands(trackless, second)).toThrow(CommandError)
    expect(() => importCommands(trackless, second)).toThrow(/no video Track/)
  })
})

// ---------------------------------------------------------------------------- names

describe("the name of a Project an import creates", () => {
  it.each([
    ["interview.mp4", "interview"],
    ["take.2.final.mov", "take.2.final"],
    ["no-extension", "no-extension"],
    [".mp4", "Untitled Project"],
    ["   .mp4", "Untitled Project"],
  ])("%j makes %j", (sourceName, projectName) => {
    const project = importInto(null, aRequest({ source: aSource({ name: sourceName }) }))
    expect(project.name).toBe(projectName)
    expect(project.sources[0]?.name).toBe(sourceName)
  })
})

// ---------------------------------------------------------------------------- refusals

describe("an import that could never succeed", () => {
  it("is refused before any command exists when the Source covers no Frame", () => {
    const empty = aRequest({ source: aSource({ duration: { numerator: 0, denominator: 1 } }) })
    expect(() => importCommands(null, empty)).toThrow(CommandError)
    expect(() => importCommands(null, empty)).toThrow(/too short to cover a single Frame/)
  })

  it("is refused as a CommandError, not a RangeError, when the duration is malformed", () => {
    const malformed = aRequest({ source: aSource({ duration: { numerator: 10, denominator: 0 } }) })
    expect(() => importCommands(null, malformed)).toThrow(CommandError)
    expect(() => importCommands(null, malformed)).toThrow(/duration is unusable/)
  })

  it("is refused by the reducer, not here, when an id is already in use", () => {
    const reused = aRequest({ clipId: "clip-2" }) // source-1 is already in `thirtyFps`
    const commands = importCommands(thirtyFps, reused)
    expect(() => run(thirtyFps, commands)).toThrow(/already in this Project/)
  })
})

// ---------------------------------------------------------------------------- one undo step

describe("the whole import", () => {
  const replay = (base: Project | null, patches: readonly Patch[]): Project | null =>
    applyPatches(base as Project, patches) as Project | null

  const undoAll = (prior: Project | null, request: ImportRequest): Project | null => {
    const { project, inverses } = run(prior, importCommands(prior, request))
    return inverses.reduceRight<Project | null>((state, patches) => replay(state, patches), project)
  }

  it("is undone back to no Project by its inverse patches, newest first", () => {
    expect(undoAll(null, aRequest())).toBeNull()
  })

  it("is undone back to the exact prior Project when one existed", () => {
    const second = aRequest({ source: ntscSource({ id: "source-2" }), clipId: "clip-2", at: LATER })
    expect(undoAll(thirtyFps, second)).toStrictEqual(thirtyFps)
  })

  it("is the same every time, and reaches for no clock and no randomness", () => {
    const now = vi.spyOn(Date, "now")
    const random = vi.spyOn(Math, "random")
    const uuid = vi.spyOn(crypto, "randomUUID")
    expect(importCommands(null, aRequest())).toStrictEqual(importCommands(null, aRequest()))
    expect(importCommands(thirtyFps, aRequest({ clipId: "c" }))).toStrictEqual(
      importCommands(thirtyFps, aRequest({ clipId: "c" }))
    )
    expect(now).not.toHaveBeenCalled()
    expect(random).not.toHaveBeenCalled()
    expect(uuid).not.toHaveBeenCalled()
  })

  it("leaves the Project it was given untouched", () => {
    const before = structuredClone(thirtyFps)
    importInto(thirtyFps, aRequest({ source: aSource({ id: "source-2" }), clipId: "clip-2" }))
    expect(thirtyFps).toStrictEqual(before)
  })
})
