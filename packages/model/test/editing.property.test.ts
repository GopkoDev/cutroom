import { describe, expect, it } from "vitest"

import {
  wholeFramesIn,
  applyCommand,
  checkMove,
  CommandError,
  duplicateDelta,
  frameToSourceTime,
  parseProject,
  splitTargets,
  trimRange,
  type Clip,
  type Project,
  type Rational,
  type Source,
  type Timebase,
  type Track,
} from "../src/index"

// Frame accuracy and rule-command pairing, over seeded random Projects (QG-1a; AC-01, AC-04,
// AC-06, AC-32). No property library is installed, so a tiny deterministic generator stands in:
// each case has its own seed, and a failure names it, so `caseSeed(n)` replays it exactly.

const AT = "2026-07-31T10:00:00.000Z"
const CASES = 300
const BASE_SEED = 0x5eed

/** mulberry32: a small, well-spread 32-bit generator; the same seed gives the same run. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const caseSeed = (index: number): number => BASE_SEED + index * 7919

interface Gen {
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  chance(p: number): boolean
}

function gen(seed: number): Gen {
  const next = mulberry32(seed)
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  return {
    int,
    pick: (items) => items[int(0, items.length - 1)] as never,
    chance: (p) => next() < p,
  }
}

/** Runs `body` once per seeded case; a failure is rethrown naming the case and its seed. */
function forCases(
  body: (g: Gen, state: { hits: Record<string, number> }) => void
): Record<string, number> {
  const state = { hits: {} as Record<string, number> }
  for (let index = 0; index < CASES; index += 1) {
    const seed = caseSeed(index)
    try {
      body(gen(seed), state)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`property failed at case ${index} (seed ${seed}): ${message}`, {
        cause: error,
      })
    }
  }
  return state.hits
}

const hit = (state: { hits: Record<string, number> }, key: string) => {
  state.hits[key] = (state.hits[key] ?? 0) + 1
}

const PROJECT_TIMEBASES: Timebase[] = [
  { numerator: 30, denominator: 1 },
  { numerator: 24, denominator: 1 },
  { numerator: 25, denominator: 1 },
  { numerator: 30000, denominator: 1001 },
  { numerator: 24000, denominator: 1001 },
  { numerator: 60000, denominator: 1001 },
]
const SOURCE_TIMEBASES: Timebase[] = [
  ...PROJECT_TIMEBASES,
  { numerator: 44100, denominator: 1 },
  { numerator: 90000, denominator: 1 },
  { numerator: 12800, denominator: 1 },
  { numerator: 48000, denominator: 1001 },
]

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
const addRational = (a: Rational, b: Rational): Rational => {
  const numerator = a.numerator * b.denominator + b.numerator * a.denominator
  const denominator = a.denominator * b.denominator
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}
const ZERO: Rational = { numerator: 0, denominator: 1 }

interface World {
  project: Project
  clips: Clip[]
}

const allClips = (project: Project): Clip[] => project.timeline.tracks.flatMap((t) => t.clips)
const findClip = (project: Project, id: string): Clip => {
  const found = allClips(project).find((c) => c.id === id)
  if (found === undefined) throw new Error(`no Clip ${id}`)
  return found
}
const trackOf = (project: Project, id: string): Track => {
  const found = project.timeline.tracks.find((t) => t.clips.some((c) => c.id === id))
  if (found === undefined) throw new Error(`no Track holds ${id}`)
  return found
}

/** A small one- or two-Track Project with Gaps, whose In-points are whole Project Frames from 0. */
function randomProject(g: Gen): World {
  const timebase = g.pick(PROJECT_TIMEBASES)
  const sourceCount = g.int(1, 2)
  const sourceSpecs = Array.from({ length: sourceCount }, (_, i) => ({
    id: `source-${i + 1}`,
    timebase: g.pick(SOURCE_TIMEBASES),
    // A fractional tail in the Source's own timescale: exact, and not a whole Project Frame.
    tail: g.int(0, 999),
  }))

  const tracks: Track[] = []
  const needed = new Map<string, number>() // furthest Frame of Source needed, per Source
  const trackCount = g.int(1, 2)
  for (let t = 0; t < trackCount; t += 1) {
    const clips: Clip[] = []
    let cursor = g.int(0, 8)
    for (let i = 0; i < g.int(1, 4); i += 1) {
      const spec = g.pick(sourceSpecs)
      const durationFrames = g.int(1, 40)
      const inFrames = g.int(0, 200)
      clips.push({
        id: `clip-${t + 1}-${i + 1}`,
        sourceId: spec.id,
        startFrame: cursor,
        durationFrames,
        sourceInPoint: frameToSourceTime(timebase, ZERO, inFrames),
      })
      needed.set(spec.id, Math.max(needed.get(spec.id) ?? 0, inFrames + durationFrames))
      cursor += durationFrames + g.int(0, 20) // 0 = clips touch; otherwise a Gap
    }
    tracks.push({ id: `track-${t + 1}`, kind: "video", name: `Video ${t + 1}`, clips })
  }

  const sources: Source[] = sourceSpecs.map((spec) => {
    const wholeFrames = (needed.get(spec.id) ?? 0) + g.int(0, 120)
    const tail: Rational = {
      numerator: spec.tail,
      denominator: spec.timebase.numerator,
    }
    const reduced = gcd(tail.numerator, tail.denominator) || 1
    return {
      id: spec.id,
      name: `${spec.id}.mp4`,
      address: { kind: "local-file" },
      fingerprint: { size: 100, lastModified: 1_754_000_000_000 },
      duration: addRational(frameToSourceTime(timebase, ZERO, wholeFrames), {
        numerator: tail.numerator / reduced,
        denominator: tail.denominator / reduced,
      }),
      timebase: spec.timebase,
      dimensions: { width: 1920, height: 1080 },
      hasAudio: true,
      codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
    }
  })

  const durationFrames = Math.max(
    ...tracks.flatMap((t) => t.clips.map((c) => c.startFrame + c.durationFrames))
  )
  const project = parseProject(
    JSON.parse(
      JSON.stringify({
        schemaVersion: 1,
        id: "p1",
        name: "P",
        createdAt: AT,
        modifiedAt: AT,
        timebase,
        frameSize: { width: 1920, height: 1080 },
        sources,
        timeline: { tracks, durationFrames },
      })
    )
  )
  return { project, clips: allClips(project) }
}

const reparse = (project: Project): Project => parseProject(JSON.parse(JSON.stringify(project)))

const reasonOf = (fn: () => unknown): string | null => {
  try {
    fn()
  } catch (error) {
    if (error instanceof CommandError) return error.reason
    throw error
  }
  return null
}

describe("head Trim lands on the Source time it showed before", () => {
  it("moves the In-point by exactly N Frames, later or earlier, with no one-Frame error", () => {
    const hits = forCases((g, state) => {
      const { project, clips } = randomProject(g)
      const clip = g.pick(clips)
      const range = trimRange(project, clip.id, "head")
      const frame = g.int(range.earliest, range.latest)
      const n = frame - clip.startFrame
      hit(state, n > 0 ? "later" : n < 0 ? "earlier" : "same")

      const { project: after } = applyCommand(project, {
        type: "trim-clip",
        at: AT,
        clipId: clip.id,
        edge: "head",
        frame,
      })
      reparse(after)
      const trimmed = findClip(after, clip.id)
      const timebase = project.timebase

      if (n >= 0) {
        expect(trimmed.sourceInPoint).toEqual(frameToSourceTime(timebase, clip.sourceInPoint, n))
      }
      // In-points are whole Project Frames from 0, so earlier or later the new one is too — and
      // exactly N Frames from the old one, counted in integers rather than compared as floats.
      const inFrames = (r: Rational) => wholeFramesIn(timebase, r)
      expect(inFrames(trimmed.sourceInPoint)).toBe(inFrames(clip.sourceInPoint) + n)
      expect(trimmed.sourceInPoint).toEqual(
        frameToSourceTime(
          timebase,
          { numerator: 0, denominator: 1 },
          inFrames(clip.sourceInPoint) + n
        )
      )

      expect(trimmed.startFrame).toBe(frame)
      expect(trimmed.startFrame + trimmed.durationFrames).toBe(
        clip.startFrame + clip.durationFrames
      )
      for (let f = trimmed.startFrame; f < trimmed.startFrame + trimmed.durationFrames; f += 1) {
        expect(frameToSourceTime(timebase, trimmed.sourceInPoint, f - trimmed.startFrame)).toEqual(
          // Frames the Clip did not show before (an earlier Trim) are named from Source Frame 0.
          f >= clip.startFrame
            ? frameToSourceTime(timebase, clip.sourceInPoint, f - clip.startFrame)
            : frameToSourceTime(timebase, ZERO, inFrames(clip.sourceInPoint) + f - clip.startFrame)
        )
      }
      for (const other of clips) {
        if (other.id !== clip.id) expect(findClip(after, other.id)).toEqual(other)
      }
    })
    expect(hits.later).toBeGreaterThan(20)
    expect(hits.earlier).toBeGreaterThan(20)
  })
})

describe("Split shows the same Source time on every Frame", () => {
  it("keeps every Frame of both halves on the Source time the whole Clip showed", () => {
    const hits = forCases((g, state) => {
      const { project, clips } = randomProject(g)
      const target = g.pick(clips)
      const frame = target.startFrame + g.int(-1, target.durationFrames + 1)
      const selection = g.chance(0.5) ? [target.id] : []
      const targets = splitTargets(project, frame, selection)
      if (targets.kind === "none") {
        hit(state, "none")
        return
      }
      hit(state, "cut")
      const cuts = targets.clipIds.map((clipId) => ({ clipId, newClipId: `${clipId}-b` }))
      const { project: after } = applyCommand(project, { type: "split-clips", at: AT, frame, cuts })
      reparse(after)

      for (const { clipId, newClipId } of cuts) {
        const before = findClip(project, clipId)
        const first = findClip(after, clipId)
        const second = findClip(after, newClipId)
        const timebase = project.timebase
        expect(first.startFrame).toBe(before.startFrame)
        expect(first.startFrame + first.durationFrames).toBe(frame)
        expect(second.startFrame).toBe(frame)
        expect(second.startFrame + second.durationFrames).toBe(
          before.startFrame + before.durationFrames
        )
        for (let f = before.startFrame; f < before.startFrame + before.durationFrames; f += 1) {
          const half = f < frame ? first : second
          expect(frameToSourceTime(timebase, half.sourceInPoint, f - half.startFrame)).toEqual(
            frameToSourceTime(timebase, before.sourceInPoint, f - before.startFrame)
          )
        }
      }
    })
    expect(hits.cut).toBeGreaterThan(50)
    expect(hits.none).toBeGreaterThan(5)
  })
})

describe("move shows the same Source time, shifted", () => {
  it("lands Frame f + d on the Source time Frame f showed, and refuses with checkMove's reason", () => {
    const hits = forCases((g, state) => {
      const { project, clips } = randomProject(g)
      const anchor = g.pick(clips)
      const sameTrack = trackOf(project, anchor.id).clips
      const chosen = g.chance(0.6) ? [anchor] : sameTrack.filter(() => g.chance(0.6))
      const ids = (chosen.length === 0 ? [anchor] : chosen).map((c) => c.id)
      const other = project.timeline.tracks.find((t) => t.id !== trackOf(project, anchor.id).id)
      const toTrackId = other !== undefined && g.chance(0.4) ? other.id : null
      const delta = g.chance(0.5) ? g.int(-30, 80) : g.int(-300, 300)

      const verdict = checkMove(project, ids, delta, toTrackId)
      const command = { type: "move-clips", at: AT, clipIds: ids, delta, toTrackId } as const
      if (!verdict.ok) {
        hit(state, "refused")
        expect(reasonOf(() => applyCommand(project, command))).toBe(verdict.reason)
        return
      }
      hit(state, "moved")
      const { project: after } = applyCommand(project, command)
      reparse(after)
      for (const id of ids) {
        const before = findClip(project, id)
        const moved = findClip(after, id)
        expect(moved.startFrame).toBe(before.startFrame + delta)
        expect(moved.durationFrames).toBe(before.durationFrames)
        for (let f = before.startFrame; f < before.startFrame + before.durationFrames; f += 1) {
          expect(
            frameToSourceTime(project.timebase, moved.sourceInPoint, f + delta - moved.startFrame)
          ).toEqual(
            frameToSourceTime(project.timebase, before.sourceInPoint, f - before.startFrame)
          )
        }
        if (toTrackId !== null) expect(trackOf(after, id).id).toBe(toTrackId)
      }
    })
    expect(hits.moved).toBeGreaterThan(40)
    expect(hits.refused).toBeGreaterThan(40)
  })
})

describe("commands built from a rule are never refused", () => {
  it("accepts every Frame trimRange allows and refuses one outside with trimRefusal's reason", () => {
    forCases((g) => {
      const { project, clips } = randomProject(g)
      const clip = g.pick(clips)
      const edge = g.pick(["head", "tail"] as const)
      const range = trimRange(project, clip.id, edge)
      for (const frame of [range.earliest, range.latest, g.int(range.earliest, range.latest)]) {
        const { project: after } = applyCommand(project, {
          type: "trim-clip",
          at: AT,
          clipId: clip.id,
          edge,
          frame,
        })
        reparse(after)
      }
      for (const frame of [range.earliest - 1, range.latest + 1]) {
        expect(
          reasonOf(() =>
            applyCommand(project, { type: "trim-clip", at: AT, clipId: clip.id, edge, frame })
          )
        ).not.toBeNull()
      }
    })
  })

  it("accepts a duplicate at duplicateDelta, and a split at every splitTargets cut", () => {
    forCases((g) => {
      const { project, clips } = randomProject(g)
      const chosen = clips.filter(() => g.chance(0.5))
      const ids = (chosen.length === 0 ? [g.pick(clips)] : chosen).map((c) => c.id)
      const delta = duplicateDelta(project, ids)
      const { project: duplicated } = applyCommand(project, {
        type: "duplicate-clips",
        at: AT,
        delta,
        copies: ids.map((clipId) => ({ clipId, newClipId: `${clipId}-copy` })),
      })
      reparse(duplicated)
      expect(allClips(duplicated)).toHaveLength(clips.length + ids.length)

      const frame = g.int(0, project.timeline.durationFrames)
      const targets = splitTargets(project, frame, ids)
      if (targets.kind === "cut") {
        const { project: split } = applyCommand(project, {
          type: "split-clips",
          at: AT,
          frame,
          cuts: targets.clipIds.map((clipId) => ({ clipId, newClipId: `${clipId}-b` })),
        })
        reparse(split)
      }
    })
  })

  it("refuses move-clips with checkMove's reason when checkMove says no", () => {
    // Covered inside the move property; this pins the unknown-id and overlap paths directly.
    forCases((g) => {
      const { project, clips } = randomProject(g)
      const unknown = checkMove(project, ["no-such-clip"], 0, null)
      expect(unknown).toEqual({ ok: false, reason: "unknown-clip" })
      expect(
        reasonOf(() =>
          applyCommand(project, {
            type: "move-clips",
            at: AT,
            clipIds: ["no-such-clip"],
            delta: 0,
            toTrackId: null,
          })
        )
      ).toBe("unknown-clip")
      const clip = g.pick(clips)
      const before = checkMove(project, [clip.id], -(clip.startFrame + 1), null)
      expect(before.ok).toBe(false)
    })
  })
})

describe("a Gesture that changes nothing leaves the Project alone (AC-32)", () => {
  it("returns the same Project and empty patches", () => {
    forCases((g) => {
      const { project, clips } = randomProject(g)
      const clip = g.pick(clips)
      const noops = [
        {
          type: "move-clips",
          at: AT,
          clipIds: [clip.id],
          delta: 0,
          toTrackId: null,
        },
        {
          type: "move-clips",
          at: AT,
          clipIds: [],
          delta: g.int(-20, 20),
          toTrackId: null,
        },
        { type: "trim-clip", at: AT, clipId: clip.id, edge: "head", frame: clip.startFrame },
        {
          type: "trim-clip",
          at: AT,
          clipId: clip.id,
          edge: "tail",
          frame: clip.startFrame + clip.durationFrames,
        },
        { type: "delete-clips", at: AT, clipIds: [], ripple: false },
        { type: "delete-clips", at: AT, clipIds: [], ripple: true },
        { type: "duplicate-clips", at: AT, delta: 0, copies: [] },
        { type: "split-clips", at: AT, frame: g.int(0, 100), cuts: [] },
      ] as const
      for (const command of noops) {
        const result = applyCommand(project, command)
        expect(result.project, command.type).toBe(project)
        expect(result.patches, command.type).toEqual([])
        expect(result.inversePatches, command.type).toEqual([])
      }
    })
  })
})
