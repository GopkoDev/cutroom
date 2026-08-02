import { produce } from "immer"
import { describe, expect, it } from "vitest"

import { applyCommand } from "../src/commands/apply"
import { parseProject } from "../src/document/parse"
import type { Clip, Project, Source, Track } from "../src/document/types"
import { projectScene, type Scene } from "../src/scene"

// What these tests are for.
//
// The Scene projection makes three promises, and each one fails silently if nobody checks it.
//
//   - **It carries only what draws.** Checked by asserting the exact key sets, not by spot-checking
//     a field. A Scene that grew a `name` would pass every "does it have what I need" test ever
//     written; only "does it have anything else" catches it.
//   - **It is deterministic.** Two Projects equal in the parts that draw give Scenes whose JSON is
//     byte-identical — asserted on the bytes, since key order is part of the claim.
//   - **It is memoisable.** An edit that does not change the picture must not change the Scene.
//     This is asserted at both strengths the module documents: deep equality always, and reference
//     equality when structural sharing survives — and, just as importantly, an edit that *does*
//     change the picture is asserted to get through, because a memo that never misses is a bug
//     that looks exactly like a memo that works.
//
// The Projects here go through `parseProject` rather than being asserted into shape, so a fixture
// that could not survive a save and a reload fails here rather than proving something about a
// document the product cannot produce.

// ---------------------------------------------------------------------------- fixtures

const AT = {
  created: "2026-07-31T10:00:00.000Z",
  modified: "2026-07-31T10:05:00.000Z",
  later: "2026-07-31T11:00:00.000Z",
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
  durationFrames: 120,
  sourceInPoint: { numerator: 0, denominator: 1 },
  ...overrides,
})

/**
 * Builds a Project through the parser. Every call produces fresh objects, so a test that expects
 * the memo to miss really does miss — two fixtures that happened to share a `timeline` object would
 * make the memoisation tests assert nothing.
 */
const aProject = (overrides: Partial<Project> = {}): Project => {
  const tracks: readonly Track[] = overrides.timeline?.tracks ?? [
    { id: "track-1", kind: "video", name: "Video 1", clips: [aClip()] },
  ]
  const durationFrames = tracks.reduce(
    (end, track) =>
      track.clips.reduce(
        (most, clip) => Math.max(most, clip.startFrame + clip.durationFrames),
        end
      ),
    0
  )
  return parseProject({
    schemaVersion: 1,
    id: "project-1",
    name: "First cut",
    createdAt: AT.created,
    modifiedAt: AT.modified,
    timebase: { numerator: 30000, denominator: 1001 },
    frameSize: { width: 1920, height: 1080 },
    sources: [aSource()],
    ...overrides,
    timeline: { tracks, durationFrames },
  })
}

/** A Project with two Clips on one Track — the shape T024's brief asks to see printed. */
const twoClips = (): Project =>
  aProject({
    sources: [aSource(), aSource({ id: "source-2", name: "b-roll.mp4" })],
    timeline: {
      tracks: [
        {
          id: "track-1",
          kind: "video",
          name: "Video 1",
          clips: [
            aClip({ id: "clip-1", sourceId: "source-1", startFrame: 0, durationFrames: 120 }),
            aClip({
              id: "clip-2",
              sourceId: "source-2",
              startFrame: 120,
              durationFrames: 90,
              sourceInPoint: { numerator: 5, denominator: 2 },
            }),
          ],
        },
      ],
      durationFrames: 210,
    },
  })

/** Collects every object reachable in a value, so "shares nothing" can be asserted rather than hoped. */
const objectsIn = (value: unknown, found: Set<object> = new Set()): Set<object> => {
  if (typeof value !== "object" || value === null || found.has(value)) return found
  found.add(value)
  for (const child of Object.values(value)) objectsIn(child, found)
  return found
}

// ---------------------------------------------------------------------------- what a Scene is

describe("what a Scene carries", () => {
  it("projects a Project with two Clips", () => {
    const scene = projectScene(twoClips())

    expect(scene).toStrictEqual({
      timebase: { numerator: 30000, denominator: 1001 },
      frameSize: { width: 1920, height: 1080 },
      clips: [
        {
          clipId: "clip-1",
          sourceId: "source-1",
          startFrame: 0,
          durationFrames: 120,
          sourceInPoint: { numerator: 0, denominator: 1 },
        },
        {
          clipId: "clip-2",
          sourceId: "source-2",
          startFrame: 120,
          durationFrames: 90,
          sourceInPoint: { numerator: 5, denominator: 2 },
        },
      ],
    } satisfies Scene)
  })

  it("carries nothing beyond the three things a renderer needs", () => {
    // Asserted as the whole key set. Anything added to a Scene has to be argued for here first.
    expect(Object.keys(projectScene(twoClips()))).toEqual(["timebase", "frameSize", "clips"])
  })

  it("carries nothing on a SceneClip that does not draw", () => {
    const [clip] = projectScene(twoClips()).clips
    expect(Object.keys(clip!)).toEqual([
      "clipId",
      "sourceId",
      "startFrame",
      "durationFrames",
      "sourceInPoint",
    ])
  })

  it("leaves the Project's names, ids and timestamps behind", () => {
    // The Project below is full of strings a renderer has no use for; none may appear in the JSON.
    const project = aProject({
      name: "Confidential rough cut",
      timeline: {
        tracks: [{ id: "track-1", kind: "video", name: "Video 1", clips: [aClip()] }],
        durationFrames: 120,
      },
    })
    const json = JSON.stringify(projectScene(project))

    for (const absent of [
      "Confidential rough cut", // the Project's name
      "project-1", // the Project's id
      "track-1", // a Track draws nothing; its id is not a reference the renderer can use
      "Video 1", // the Track's name
      "sync-1080p30.mp4", // the Source's name
      AT.created,
      AT.modified,
      "schemaVersion",
    ]) {
      expect(json).not.toContain(absent)
    }
  })

  it("has no transform, because no Clip can yet vary one", () => {
    // data-model.md lists `transform` on a SceneClip, but schema version 1 has no Clip field to
    // feed it (docs/future.md puts it in a later slice, with its own schema change). This test is
    // the record of that deliberate omission: it fails when the Clip field lands, which is exactly
    // when the Scene should gain it.
    const [clip] = projectScene(twoClips()).clips
    expect(clip).not.toHaveProperty("transform")
  })

  it("says nothing about whether a Source can be reached", () => {
    // Linked and Offline are runtime state outside the document. A Clip whose Source is Offline
    // stays in the Scene and renders as empty, so that granting a permission is not an edit.
    const scene = projectScene(twoClips())
    expect(JSON.stringify(scene)).not.toContain("offline")
    expect(scene.clips.map((clip) => clip.sourceId)).toEqual(["source-1", "source-2"])
  })
})

// ---------------------------------------------------------------------------- ordering

describe("ordering is back to front and stable", () => {
  it("takes Tracks in array order, tracks[0] backmost", () => {
    const project = aProject({
      sources: [aSource(), aSource({ id: "source-2" })],
      timeline: {
        tracks: [
          {
            id: "track-1",
            kind: "video",
            name: "Video 1",
            clips: [aClip({ id: "back", sourceId: "source-1" })],
          },
          {
            id: "track-2",
            kind: "video",
            name: "Video 2",
            clips: [aClip({ id: "front", sourceId: "source-2" })],
          },
        ],
        durationFrames: 120,
      },
    })

    expect(projectScene(project).clips.map((clip) => clip.clipId)).toEqual(["back", "front"])
  })

  it("keeps Clips within a Track in document order, which is ascending startFrame", () => {
    const scene = projectScene(twoClips())
    expect(scene.clips.map((clip) => clip.startFrame)).toEqual([0, 120])
  })

  it("draws only video Tracks", () => {
    // `TrackKind` has one member today, so this Track is cast into a shape schema version 1 cannot
    // hold. The cast is the point: the guard is written and pinned now, so that the day the union
    // grows an "audio" member, audio Clips do not silently start appearing in the picture.
    const audio = {
      id: "track-2",
      kind: "audio",
      name: "Audio 1",
      clips: [aClip({ id: "inaudible" })],
    } as unknown as Track
    const project = produce(aProject(), (draft) => {
      ;(draft.timeline.tracks as Track[]).push(audio)
    })

    expect(projectScene(project).clips.map((clip) => clip.clipId)).toEqual(["clip-1"])
  })
})

// ---------------------------------------------------------------------------- determinism

describe("determinism", () => {
  it("gives the same Project the same Scene twice", () => {
    const project = twoClips()
    const first = projectScene(project)
    const second = projectScene(project)

    expect(second).toStrictEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it("gives two separately built, equal Projects byte-identical Scenes", () => {
    // Different objects entirely, so nothing here can be answered from the memo — this is the
    // guarantee that survives a save, a reload and a re-parse.
    const a = twoClips()
    const b = twoClips()
    expect(a).not.toBe(b)

    expect(JSON.stringify(projectScene(a))).toBe(JSON.stringify(projectScene(b)))
  })

  it("survives a Project that has been through structuredClone", () => {
    const project = twoClips()
    const reloaded = parseProject(structuredClone(project))

    expect(JSON.stringify(projectScene(reloaded))).toBe(JSON.stringify(projectScene(project)))
  })

  it("does not touch the Project it reads", () => {
    const project = twoClips()
    const before = structuredClone(project)
    projectScene(project)

    expect(project).toStrictEqual(before)
  })
})

// ---------------------------------------------------------------------------- memoisation

describe("an edit that does not change the picture does not change the Scene", () => {
  it("renaming the Project returns the very same Scene object", () => {
    const project = twoClips()
    const before = projectScene(project)

    // A rename leaves `timeline` untouched by reference, which is what the memo is keyed on.
    const renamed: Project = { ...project, name: "Second cut", modifiedAt: AT.later }

    expect(projectScene(renamed)).toBe(before)
  })

  it("renaming through Immer returns the very same Scene object", () => {
    // The reducer writes with Immer, which rebuilds only the path it wrote to. This is the same
    // structural sharing `applyCommand` deliberately preserves rather than re-parsing its output.
    const project = twoClips()
    const before = projectScene(project)
    const renamed = produce(project, (draft) => {
      draft.name = "Second cut"
      draft.modifiedAt = AT.later
    })

    expect(renamed).not.toBe(project)
    expect(projectScene(renamed)).toBe(before)
  })

  it("a Relink through the real reducer returns the very same Scene object", () => {
    // A Relink records a Source's new file name and fingerprint. Neither draws anything, and the
    // Timeline is not touched — so the Scene must not move, and the store must not repost it.
    const project = twoClips()
    const before = projectScene(project)
    const { project: relinked } = applyCommand(project, {
      type: "relink-source",
      at: AT.later,
      sourceId: "source-1",
      name: "sync-1080p30 (moved).mp4",
      fingerprint: { size: 12_345_678, lastModified: 1_754_999_999_000 },
    })

    expect(relinked).not.toBe(project)
    expect(relinked.sources[0]!.name).toBe("sync-1080p30 (moved).mp4")
    expect(projectScene(relinked)).toBe(before)
  })

  it("still gives an equal Scene when structural sharing is lost", () => {
    // The weaker guarantee, and the one a caller may actually rely on: a reference may change for
    // reasons that have nothing to do with the picture — here a save and a reload — and the Scene
    // is still equal. `!==` is licence to skip work, never proof that work is needed.
    const project = twoClips()
    const before = projectScene(project)
    const reloaded = parseProject(structuredClone({ ...project, name: "Second cut" }))

    expect(projectScene(reloaded)).not.toBe(before)
    expect(projectScene(reloaded)).toStrictEqual(before)
  })
})

describe("an edit that does change the picture does change the Scene", () => {
  it("adding a Clip", () => {
    const project = twoClips()
    const before = projectScene(project)
    const { project: withClip } = applyCommand(project, {
      type: "add-clip",
      at: AT.later,
      trackId: "track-1",
      clip: aClip({ id: "clip-3", sourceId: "source-2", startFrame: 210, durationFrames: 60 }),
    })

    const after = projectScene(withClip)
    expect(after).not.toBe(before)
    expect(after.clips.map((clip) => clip.clipId)).toEqual(["clip-1", "clip-2", "clip-3"])
  })

  it("changing the frame size, even though the Timeline is untouched", () => {
    // The memo is keyed on `timeline`, and `frameSize` is not inside it. Without the value check on
    // a hit this is exactly the edit that would come back stale.
    const project = twoClips()
    const before = projectScene(project)
    const resized: Project = { ...project, frameSize: { width: 1280, height: 720 } }

    expect(resized.timeline).toBe(project.timeline)
    const after = projectScene(resized)
    expect(after).not.toBe(before)
    expect(after.frameSize).toStrictEqual({ width: 1280, height: 720 })
    // And the original is still projected as it was — a miss must not have poisoned the entry.
    expect(projectScene(project)).toStrictEqual(before)
  })

  it("changing the Timebase, even though the Timeline is untouched", () => {
    const project = twoClips()
    const before = projectScene(project)
    const retimed: Project = { ...project, timebase: { numerator: 25, denominator: 1 } }

    const after = projectScene(retimed)
    expect(after).not.toBe(before)
    expect(after.timebase).toStrictEqual({ numerator: 25, denominator: 1 })
  })
})

// ---------------------------------------------------------------------------- crossing the wire

describe("a Scene survives postMessage", () => {
  it("round-trips through structuredClone unchanged", () => {
    const scene = projectScene(twoClips())
    const posted = structuredClone(scene)

    expect(posted).toStrictEqual(scene)
    expect(JSON.stringify(posted)).toBe(JSON.stringify(scene))
  })

  it("holds nothing but plain data", () => {
    // structuredClone would refuse a function and preserve a class instance, a Date or a Map, so
    // "it cloned" is not the whole claim. Every reachable object must be a plain object or an
    // array, and every leaf a string, a number or a boolean.
    const walk = (value: unknown, path: string): void => {
      if (value === null || typeof value !== "object") {
        expect(["string", "number", "boolean"], `${path} is a ${typeof value}`).toContain(
          typeof value
        )
        return
      }
      const prototype = Object.getPrototypeOf(value) as object | null
      expect(
        [Object.prototype, Array.prototype],
        `${path} is not a plain object or array`
      ).toContain(prototype)
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`)
    }

    walk(projectScene(twoClips()), "scene")
  })

  it("shares no object with the Project it came from", () => {
    // An export carries its own frozen Scene so later edits cannot reach it (FR-019). That is only
    // true if the Scene is a snapshot rather than a view.
    const project = twoClips()
    const scene = projectScene(project)
    const shared = [...objectsIn(scene)].filter((object) => objectsIn(project).has(object))

    expect(shared).toEqual([])
  })

  it("is frozen, because the same object is handed to every caller", () => {
    const scene = projectScene(twoClips())

    expect(Object.isFrozen(scene)).toBe(true)
    expect(Object.isFrozen(scene.clips)).toBe(true)
    expect(Object.isFrozen(scene.clips[0])).toBe(true)
    expect(Object.isFrozen(scene.clips[0]!.sourceInPoint)).toBe(true)
  })
})

// ---------------------------------------------------------------------------- totality

describe("totality", () => {
  it("projects a Project with no Clips", () => {
    const project = aProject({
      sources: [],
      timeline: {
        tracks: [{ id: "track-1", kind: "video", name: "Video 1", clips: [] }],
        durationFrames: 0,
      },
    })

    expect(projectScene(project)).toStrictEqual({
      timebase: { numerator: 30000, denominator: 1001 },
      frameSize: { width: 1920, height: 1080 },
      clips: [],
    } satisfies Scene)
  })

  it("projects a Project with no Tracks at all", () => {
    const project = aProject({
      sources: [],
      timeline: { tracks: [], durationFrames: 0 },
    })

    expect(projectScene(project).clips).toEqual([])
  })

  it("projects a Clip whose Source is the only one and whose in-point is not zero", () => {
    const project = aProject({
      timeline: {
        tracks: [
          {
            id: "track-1",
            kind: "video",
            name: "Video 1",
            clips: [aClip({ sourceInPoint: { numerator: 1001, denominator: 30000 } })],
          },
        ],
        durationFrames: 120,
      },
    })

    expect(projectScene(project).clips[0]!.sourceInPoint).toStrictEqual({
      numerator: 1001,
      denominator: 30000,
    })
  })
})
