import { applyPatches, type Patch } from "immer"
import { describe, expect, it, vi } from "vitest"

import { applyCommand, CommandError, type CommandResult } from "../src/commands/apply"
import type { Command } from "../src/commands/index"
import { parseProject } from "../src/document/parse"
import type { Clip, Project, Source } from "../src/document/types"

// What these tests are for.
//
// The reducer makes two promises that nothing else in Cutroom can check for it.
//
//   - **It is a function.** So every command is run twice on the same Project and the two answers
//     are compared whole — document, patches and inverse patches — and the clock and the random
//     source are watched to prove they were never reached for.
//   - **It is invertible.** So every command is applied and then undone by its own inverse patches,
//     and what comes back is compared to the Project that went in with `toStrictEqual`. "Looks
//     right" is not the claim; "is the same document" is.
//
// The cases that get the most attention are the ones where Immer's patches are structural rather
// than scalar, because that is where an undo silently stops being exact: a Clip inserted into the
// *middle* of a Track — whose inverse is a replace and a remove that only work in the order Immer
// emitted them — and a Source modified at the head of a list of three, whose neighbours must come
// back in the same order and not merely with the same contents.
//
// The reducer validates by construction rather than by re-parsing its own output (see the comment
// at the top of apply.ts), so the check that construction was right lives here: every command's
// result goes through `parseProject`, which is the same gate the document faces on its next load.

// ---------------------------------------------------------------------------- fixtures

const AT = {
  created: "2026-07-31T10:00:00.000Z",
  imported: "2026-07-31T10:01:00.000Z",
  clipped: "2026-07-31T10:02:00.000Z",
  relinked: "2026-07-31T10:03:00.000Z",
} as const

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

const aClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: "clip-1",
  sourceId: "source-1",
  startFrame: 0,
  durationFrames: 300,
  sourceInPoint: { numerator: 0, denominator: 1 },
  ...overrides,
})

const CREATE = {
  type: "create-project",
  at: AT.created,
  projectId: "project-1",
  name: "Untitled",
  timebase: { numerator: 30000, denominator: 1001 },
  frameSize: { width: 1920, height: 1080 },
  track: { id: "track-1", name: "Video 1" },
} as const satisfies Command

const IMPORT = {
  type: "import-source",
  at: AT.imported,
  source: aSource(),
} as const satisfies Command

const ADD_CLIP = {
  type: "add-clip",
  at: AT.clipped,
  trackId: "track-1",
  clip: aClip(),
} as const satisfies Command

const importing = (id: string): Command => ({
  type: "import-source",
  at: AT.imported,
  source: aSource({ id, name: `${id}.mp4` }),
})

const adding = (clip: Clip): Command => ({
  type: "add-clip",
  at: AT.clipped,
  trackId: "track-1",
  clip,
})

/** An empty Project, one Source in it, and one Clip covering that Source — the import sequence. */
const emptyProject = applyCommand(null, CREATE).project
const oneSource = applyCommand(emptyProject, IMPORT).project
const oneClip = applyCommand(oneSource, ADD_CLIP).project

/** Three Sources, so a command can touch one that is neither the first nor the last of its list. */
const threeSources = ["source-1", "source-2", "source-3"].reduce<Project>(
  (project, id) => applyCommand(project, importing(id)).project,
  emptyProject
)

/** A Track with a hole in it: Frames 0–99 and 200–299 taken, 100–199 free. */
const trackWithGap = [
  aClip({ id: "clip-a", startFrame: 0, durationFrames: 100 }),
  aClip({ id: "clip-c", startFrame: 200, durationFrames: 100 }),
].reduce<Project>((project, clip) => applyCommand(project, adding(clip)).project, oneSource)

const FILL_THE_GAP = adding(aClip({ id: "clip-b", startFrame: 100, durationFrames: 100 }))

const RELINK: Command = {
  type: "relink-source",
  at: AT.relinked,
  sourceId: "source-1",
  name: "renamed.mp4",
  fingerprint: { size: 12_345_678, lastModified: 1_754_000_000_000 },
}

// ---------------------------------------------------------------------------- helpers

/**
 * Replays patches onto a document, in either direction — what the store's undo and redo will do.
 *
 * The cast marks a place where Immer's types stop short of its behaviour. `applyPatches` is
 * declared `<T extends Objectish>`, so it cannot describe the one case `create-project` depends on:
 * a base of `null` that a root `replace` patch supplies wholesale, and a `null` that the inverse
 * root patch restores. The run time handles both — undoing the creation of a Project means having
 * no Project — and the tests below are what prove it.
 */
const replay = (base: Project | null, patches: readonly Patch[]): Project | null =>
  applyPatches(base as Project, patches) as Project | null

/** Undo: the new Project with the inverse patches replayed onto it. */
const rewind = (result: CommandResult): Project | null =>
  replay(result.project, result.inversePatches)

const clipsOn = (project: Project): readonly Clip[] => project.timeline.tracks[0]?.clips ?? []

interface Scenario {
  readonly name: string
  readonly prior: Project | null
  readonly command: Command
}

const scenarios: readonly Scenario[] = [
  { name: "create-project", prior: null, command: CREATE },
  { name: "import-source into an empty Project", prior: emptyProject, command: IMPORT },
  { name: "import-source alongside three others", prior: threeSources, command: importing("s4") },
  { name: "add-clip onto an empty Track", prior: oneSource, command: ADD_CLIP },
  { name: "add-clip into the middle of a Track", prior: trackWithGap, command: FILL_THE_GAP },
  { name: "relink-source", prior: oneClip, command: RELINK },
  {
    name: "relink-source on the first of three Sources",
    prior: threeSources,
    command: { ...RELINK, sourceId: "source-1" },
  },
]

// ---------------------------------------------------------------------------- the two promises

describe.each(scenarios)("$name", ({ prior, command }) => {
  it("is undone exactly by its own inverse patches", () => {
    const result = applyCommand(prior, command)
    expect(rewind(result)).toStrictEqual(prior)
  })

  it("is reached exactly by its own forward patches", () => {
    const result = applyCommand(prior, command)
    expect(replay(prior, result.patches)).toStrictEqual(result.project)
  })

  it("gives the same answer every time it is applied", () => {
    const once = applyCommand(prior, command)
    const twice = applyCommand(prior, command)
    expect(twice.project).toStrictEqual(once.project)
    expect(twice.patches).toStrictEqual(once.patches)
    expect(twice.inversePatches).toStrictEqual(once.inversePatches)
  })

  it("produces a document parseProject accepts unchanged", () => {
    const { project } = applyCommand(prior, command)
    expect(parseProject(project)).toStrictEqual(project)
  })

  it("produces a document that survives a structured clone", () => {
    const { project } = applyCommand(prior, command)
    expect(structuredClone(project)).toStrictEqual(project)
  })

  it("leaves the Project it was given untouched", () => {
    const before = prior === null ? null : structuredClone(prior)
    applyCommand(prior, command)
    expect(prior === null ? null : structuredClone(prior)).toStrictEqual(before)
  })
})

describe("purity", () => {
  it("reaches for no clock and no random source", () => {
    const now = vi.spyOn(Date, "now")
    const random = vi.spyOn(Math, "random")
    const uuid = vi.spyOn(globalThis.crypto, "randomUUID")

    for (const { prior, command } of scenarios) applyCommand(prior, command)

    expect(now).not.toHaveBeenCalled()
    expect(random).not.toHaveBeenCalled()
    expect(uuid).not.toHaveBeenCalled()
  })

  it("takes the document's timestamp from the command, never from the moment", () => {
    expect(applyCommand(emptyProject, IMPORT).project.modifiedAt).toBe(AT.imported)
    expect(emptyProject.createdAt).toBe(AT.created)
    expect(emptyProject.modifiedAt).toBe(AT.created)
  })

  it("shares the parts of the document it did not touch, so a Scene stays memoisable", () => {
    const result = applyCommand(oneClip, RELINK)
    expect(result.project.timeline).toBe(oneClip.timeline)
    expect(result.project).not.toBe(oneClip)
  })
})

// ---------------------------------------------------------------------------- create-project

describe("create-project", () => {
  it("starts from nothing and undoes back to nothing", () => {
    const result = applyCommand(null, CREATE)
    expect(result.project.id).toBe("project-1")
    expect(result.project.sources).toStrictEqual([])
    expect(result.project.timeline.durationFrames).toBe(0)
    expect(rewind(result)).toBeNull()
  })

  it("carries the first Track, since this slice has no command that makes one", () => {
    expect(emptyProject.timeline.tracks).toStrictEqual([
      { id: "track-1", kind: "video", name: "Video 1", clips: [] },
    ])
  })

  it("adopts the Timebase it is given, exactly, as a ratio", () => {
    expect(emptyProject.timebase).toStrictEqual({ numerator: 30000, denominator: 1001 })
  })

  it("refuses to run over a Project that is already open", () => {
    expect(() => applyCommand(oneClip, CREATE)).toThrow(/a Project is already open/)
  })

  it("refuses a Timebase that is not a positive ratio", () => {
    const command = { ...CREATE, timebase: { numerator: 30, denominator: 0 } }
    expect(() => applyCommand(null, command)).toThrow(/timebase denominator must be a whole number/)
  })

  it("refuses a timestamp parseProject would later reject", () => {
    expect(() => applyCommand(null, { ...CREATE, at: "2026-02-30T10:00:00.000Z" })).toThrow(
      /at must be an ISO 8601 date and time/
    )
  })

  it("refuses an empty id", () => {
    expect(() => applyCommand(null, { ...CREATE, projectId: "" })).toThrow(
      /projectId must not be empty/
    )
  })
})

// ---------------------------------------------------------------------------- import-source

describe("import-source", () => {
  it("appends the Source and leaves the Timeline alone", () => {
    const result = applyCommand(emptyProject, IMPORT)
    expect(result.project.sources).toStrictEqual([aSource()])
    expect(result.project.timeline).toStrictEqual(emptyProject.timeline)
  })

  it("undoes by removing the Source it added and nothing else", () => {
    const result = applyCommand(threeSources, importing("s4"))
    expect(result.project.sources.map((source) => source.id)).toStrictEqual([
      "source-1",
      "source-2",
      "source-3",
      "s4",
    ])
    const back = rewind(result)!
    expect(back.sources.map((source) => source.id)).toStrictEqual([
      "source-1",
      "source-2",
      "source-3",
    ])
    expect(back).toStrictEqual(threeSources)
  })

  it("refuses an id another Source already carries", () => {
    expect(() => applyCommand(threeSources, importing("source-2"))).toThrow(/ids are never reused/)
  })

  it("refuses a duration that is not an exact ratio", () => {
    const command: Command = {
      type: "import-source",
      at: AT.imported,
      source: aSource({ id: "s9", duration: { numerator: 10.5, denominator: 1 } }),
    }
    expect(() => applyCommand(emptyProject, command)).toThrow(
      /source.duration numerator must be a whole number/
    )
  })

  it("refuses to run before there is a Project", () => {
    expect(() => applyCommand(null, IMPORT)).toThrow(/there is no Project open/)
  })
})

// ---------------------------------------------------------------------------- add-clip

describe("add-clip", () => {
  it("places the Clip and moves the Timeline's derived duration with it", () => {
    const result = applyCommand(oneSource, ADD_CLIP)
    expect(clipsOn(result.project)).toStrictEqual([aClip()])
    expect(result.project.timeline.durationFrames).toBe(300)
  })

  it("keeps the Clips ordered by startFrame, inserting rather than appending", () => {
    const result = applyCommand(trackWithGap, FILL_THE_GAP)
    expect(clipsOn(result.project).map((clip) => clip.id)).toStrictEqual([
      "clip-a",
      "clip-b",
      "clip-c",
    ])
  })

  it("restores the order, not merely the contents, when the middle insert is undone", () => {
    const result = applyCommand(trackWithGap, FILL_THE_GAP)
    const back = rewind(result)!
    expect(clipsOn(back).map((clip) => clip.id)).toStrictEqual(["clip-a", "clip-c"])
    expect(back).toStrictEqual(trackWithGap)
  })

  it("leaves the Timeline's duration alone when the Clip lands inside it", () => {
    expect(trackWithGap.timeline.durationFrames).toBe(300)
    expect(applyCommand(trackWithGap, FILL_THE_GAP).project.timeline.durationFrames).toBe(300)
  })

  it("allows a butt join on both sides — adjacency is integer equality", () => {
    expect(() => applyCommand(trackWithGap, FILL_THE_GAP)).not.toThrow()
  })

  it("refuses a Clip that would start inside the one before it", () => {
    const command = adding(aClip({ id: "clip-x", startFrame: 99, durationFrames: 1 }))
    expect(() => applyCommand(trackWithGap, command)).toThrow(/Clips must not overlap/)
  })

  it("refuses a Clip that would run into the one after it", () => {
    const command = adding(aClip({ id: "clip-x", startFrame: 100, durationFrames: 101 }))
    expect(() => applyCommand(trackWithGap, command)).toThrow(/Clips must not overlap/)
  })

  it("refuses a Frame that is not a whole number", () => {
    const command = adding(aClip({ id: "clip-x", startFrame: 10.5 }))
    expect(() => applyCommand(oneSource, command)).toThrow(/clip.startFrame must be a whole number/)
  })

  it("refuses a Clip of no length", () => {
    const command = adding(aClip({ id: "clip-x", durationFrames: 0 }))
    expect(() => applyCommand(oneSource, command)).toThrow(
      /clip.durationFrames must be a whole number, 1 or greater/
    )
  })

  it("refuses a negative startFrame", () => {
    const command = adding(aClip({ id: "clip-x", startFrame: -1 }))
    expect(() => applyCommand(oneSource, command)).toThrow(/clip.startFrame must be a whole number/)
  })

  it("refuses an id another Clip already carries", () => {
    const command = adding(aClip({ id: "clip-a", startFrame: 400 }))
    expect(() => applyCommand(trackWithGap, command)).toThrow(/ids are never reused/)
  })

  it("refuses a sourceId no Source carries", () => {
    const command = adding(aClip({ id: "clip-x", sourceId: "nothing", startFrame: 400 }))
    expect(() => applyCommand(trackWithGap, command)).toThrow(/no Source in this Project carries/)
  })

  it("refuses a Track that is not there", () => {
    const command: Command = { ...ADD_CLIP, trackId: "track-9" }
    expect(() => applyCommand(oneSource, command)).toThrow(/no Track in this Project carries/)
  })
})

// ---------------------------------------------------------------------------- relink-source

describe("relink-source", () => {
  it("records the file the Source now goes by", () => {
    const result = applyCommand(oneClip, RELINK)
    expect(result.project.sources[0]?.name).toBe("renamed.mp4")
  })

  it("patches only what actually changed — a renamed file leaves the fingerprint alone", () => {
    const result = applyCommand(oneClip, RELINK)
    expect(result.patches.map((patch) => patch.path.join("/"))).toStrictEqual([
      "sources/0/name",
      "modifiedAt",
    ])
  })

  it("patches the fingerprint when the file behind the Source really is a different one", () => {
    const moved: Command = { ...RELINK, fingerprint: { size: 12_345_678, lastModified: 1 } }
    const result = applyCommand(oneClip, moved)
    expect(result.patches.map((patch) => patch.path.join("/"))).toStrictEqual([
      "sources/0/name",
      "sources/0/fingerprint",
      "modifiedAt",
    ])
    expect(rewind(result)).toStrictEqual(oneClip)
  })

  it("never touches anything a Source's link status could live in", () => {
    const result = applyCommand(oneClip, RELINK)
    const touched = result.patches.map((patch) => patch.path.join("/")).join(" ")
    expect(touched).not.toMatch(/status|linked|offline|handle/i)
  })

  it("changes nothing at all when the file it was given is the file it already had", () => {
    const noop: Command = { ...RELINK, name: oneClip.sources[0]?.name ?? "" }
    const result = applyCommand(oneClip, noop)
    expect(result.project).toBe(oneClip)
    expect(result.patches).toStrictEqual([])
    expect(result.inversePatches).toStrictEqual([])
  })

  it("leaves every Clip referring to the Source exactly as it was (FR-022)", () => {
    const result = applyCommand(oneClip, RELINK)
    expect(clipsOn(result.project)).toStrictEqual(clipsOn(oneClip))
  })

  it("restores the Source in place when undone, without disturbing its neighbours", () => {
    const result = applyCommand(threeSources, { ...RELINK, sourceId: "source-2" })
    expect(result.project.sources.map((source) => source.name)).toStrictEqual([
      "source-1.mp4",
      "renamed.mp4",
      "source-3.mp4",
    ])
    expect(rewind(result)).toStrictEqual(threeSources)
  })

  it("refuses a Source that is not there", () => {
    expect(() => applyCommand(oneClip, { ...RELINK, sourceId: "nothing" })).toThrow(
      /no Source in this Project carries/
    )
  })
})

// ---------------------------------------------------------------------------- refusals

describe("a refused command", () => {
  const refusals: readonly { readonly name: string; readonly command: Command }[] = [
    { name: "an overlapping Clip", command: adding(aClip({ id: "x", startFrame: 250 })) },
    { name: "a fractional Frame", command: adding(aClip({ id: "x", startFrame: 0.5 })) },
    { name: "a duplicate Source id", command: importing("source-1") },
    { name: "a Track that is not there", command: { ...ADD_CLIP, trackId: "nope" } },
    { name: "a Source that is not there", command: { ...RELINK, sourceId: "nope" } },
    { name: "a Project that already exists", command: CREATE },
  ]

  it.each(refusals)("throws a CommandError for $name", ({ command }) => {
    expect(() => applyCommand(trackWithGap, command)).toThrow(CommandError)
    expect(() => applyCommand(trackWithGap, command)).toThrow(/^applyCommand: /)
  })

  it.each(refusals)("leaves the Project exactly as it was after $name", ({ command }) => {
    const before = structuredClone(trackWithGap)
    expect(() => applyCommand(trackWithGap, command)).toThrow(CommandError)
    expect(structuredClone(trackWithGap)).toStrictEqual(before)
    expect(parseProject(trackWithGap)).toStrictEqual(trackWithGap)
  })
})

// ------------------------------------------------------------------- the sequence, end to end

describe("a sequence of commands", () => {
  it("undoes one command at a time back to no Project at all", () => {
    const create = applyCommand(null, CREATE)
    const load = applyCommand(create.project, IMPORT)
    const place = applyCommand(load.project, ADD_CLIP)

    expect(place.project.timeline.durationFrames).toBe(300)
    expect(rewind(place)).toStrictEqual(load.project)
    expect(rewind(load)).toStrictEqual(create.project)
    expect(rewind(create)).toBeNull()
  })

  it("redoes forward again over the same patches", () => {
    const create = applyCommand(null, CREATE)
    const load = applyCommand(create.project, IMPORT)
    const place = applyCommand(load.project, ADD_CLIP)

    let project: Project | null = null
    for (const step of [create, load, place]) project = replay(project, step.patches)
    expect(project).toStrictEqual(place.project)
  })
})
