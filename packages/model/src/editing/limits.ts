// The rules of editing as pure functions (ADR 0019, contracts/public-api.md §Editing rules).
//
// The reducer decides with these, the drag preview draws with them on every pointer move, and the
// agent can ask them before it issues a command — so the preview cannot promise what the release
// then refuses. They read a parsed Project and nothing else: every bound comes from what the
// document recorded at import (`Source.duration`), never from a file, so they work the same for an
// Offline Source (AC-25). All arithmetic on time goes through `timebase.ts`; this file only adds
// and compares whole Frames (ADR 0002).

import type { RefusalReason } from "../commands"
import type { Clip, Project, Track } from "../document/types"
import { framesForDuration, sourceTimeBefore, wholeFramesIn } from "../timebase"

/** Which end of a Clip a Trim moves. */
export type TrimEdge = "head" | "tail"

/**
 * Every Frame an edge may sit at, inclusive at both ends. For `head` the Frame is the Clip's
 * `startFrame`; for `tail` it is the exclusive end, `startFrame + durationFrames`. The edge's
 * current Frame is always inside. For a Clip that does not exist the range is empty
 * (`earliest > latest`), because these functions never throw on an unknown id.
 */
export interface TrimRange {
  readonly earliest: number
  readonly latest: number
}

interface Located {
  readonly clip: Clip
  readonly previous: Clip | undefined
  readonly next: Clip | undefined
}

/** The Clip and its neighbours on its own Track. Clips on a Track are ordered by `startFrame`. */
function locate(project: Project, clipId: string): Located | undefined {
  for (const track of project.timeline.tracks as readonly Track[]) {
    const index = track.clips.findIndex((clip) => clip.id === clipId)
    const clip = track.clips[index]
    if (clip !== undefined) {
      return { clip, previous: track.clips[index - 1], next: track.clips[index + 1] }
    }
  }
  return undefined
}

const end = (clip: Clip): number => clip.startFrame + clip.durationFrames

/** How far back the Clip may reach: the Frame its Source's beginning (container time 0) would land on. */
function sourceStartLimit(project: Project, clip: Clip): number {
  return clip.startFrame - wholeFramesIn(project.timebase, clip.sourceInPoint)
}

/**
 * How far forward the Clip may reach, from the Source's recorded end. Rounded up, as import
 * rounds: a Source's last partial Frame is a Frame with media behind it.
 */
function sourceEndLimit(project: Project, clip: Clip): number | undefined {
  const source = project.sources.find((candidate) => candidate.id === clip.sourceId)
  if (source === undefined) return undefined
  const remaining = sourceTimeBefore(source.duration, clip.sourceInPoint)
  return clip.startFrame + framesForDuration(project.timebase, remaining)
}

/**
 * The Frames an edge of a Clip may be dragged to.
 *
 * `head`: no earlier than Frame 0, the end of the Clip before it, or the Frame the Source's
 * beginning lands on — whichever is latest; no later than one Frame before the Clip's end.
 * `tail`: no earlier than one Frame after the Clip's start; no later than the next Clip's start or
 * the Frame the Source's end lands on — whichever is earliest.
 */
export function trimRange(project: Project, clipId: string, edge: TrimEdge): TrimRange {
  const found = locate(project, clipId)
  if (found === undefined) return { earliest: 0, latest: -1 }
  const { clip, previous, next } = found

  if (edge === "head") {
    return {
      earliest: Math.max(
        0,
        previous === undefined ? 0 : end(previous),
        sourceStartLimit(project, clip)
      ),
      latest: end(clip) - 1,
    }
  }
  const sourceEnd = sourceEndLimit(project, clip)
  return {
    earliest: clip.startFrame + 1,
    latest: Math.min(
      next === undefined ? Infinity : next.startFrame,
      sourceEnd === undefined ? Infinity : sourceEnd
    ),
  }
}

/**
 * Why an edge cannot go to `frame`, or `null` if it can — the same verdict as testing `frame`
 * against {@link trimRange}, with the reason a notice needs. When more than one rule is broken the
 * reason is the first in contract order: `overlap`, `before-timeline-start`, `too-short`,
 * `source-bounds`. An unknown Clip has no reason here; the reducer refuses it before asking.
 */
export function trimRefusal(
  project: Project,
  clipId: string,
  edge: TrimEdge,
  frame: number
): RefusalReason | null {
  const found = locate(project, clipId)
  if (found === undefined) return null
  const { previous, next } = found
  const range = trimRange(project, clipId, edge)
  if (frame >= range.earliest && frame <= range.latest) return null

  if (edge === "head") {
    if (previous !== undefined && frame < end(previous)) return "overlap"
    if (frame < 0) return "before-timeline-start"
    if (frame > range.latest) return "too-short"
    return "source-bounds"
  }
  if (next !== undefined && frame > next.startFrame) return "overlap"
  if (frame < range.earliest) return "too-short"
  return "source-bounds"
}
