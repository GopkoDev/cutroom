// The Move rule (ADR 0019, contracts/public-api.md §Editing rules).
//
// A Move shifts one or several Clips by the same number of Frames, along their own Tracks or onto
// the other. Both the reducer and the drag preview ask this file, so the Timeline cannot show a
// place as free that the release then refuses (AC-07). It reads a parsed Project and nothing else;
// only whole Frames are added and compared (ADR 0002). The Clips that are moving are left out of
// the overlap check: they leave their old places as they take their new ones, so a Clip may land
// over the place another moving Clip is vacating.
//
// Room is left here for `duplicateDelta`, which is a placement rule of the same family.

import type { RefusalReason } from "../commands"
import type { Clip, Project, Track } from "../document/types"

/** The answer to "may this happen?": yes, or no with the reason a notice needs. */
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: RefusalReason }

const refused = (reason: RefusalReason): Verdict => ({ ok: false, reason })

/**
 * May the Clips named by `clipIds` all move by `delta` Frames, each staying on its own Track, or all
 * onto the Track `toTrackId`? Total: an unknown id is a verdict, never an exception. When more than
 * one rule is broken the reason is the first in contract order: `unknown-clip`, `unknown-track`,
 * `invalid`, `overlap`, `before-timeline-start`. An empty list moves nothing and is allowed.
 */
export function checkMove(
  project: Project,
  clipIds: readonly string[],
  delta: number,
  toTrackId: string | null
): Verdict {
  const tracks = project.timeline.tracks as readonly Track[]
  const moving = new Set(clipIds)

  const sourceOf = new Map<string, Track>()
  for (const track of tracks) {
    for (const clip of track.clips) if (moving.has(clip.id)) sourceOf.set(clip.id, track)
  }
  for (const id of moving) if (!sourceOf.has(id)) return refused("unknown-clip")

  const target = toTrackId === null ? undefined : tracks.find((track) => track.id === toTrackId)
  if (toTrackId !== null && target === undefined) return refused("unknown-track")
  if (!Number.isSafeInteger(delta)) return refused("invalid")
  // A Selection on both Tracks moves only along them, never onto one.
  if (target !== undefined && new Set(sourceOf.values()).size > 1) return refused("invalid")

  let beforeStart = false
  for (const [id, from] of sourceOf) {
    const clip = from.clips.find((candidate) => candidate.id === id) as Clip
    const start = clip.startFrame + delta
    const end = start + clip.durationFrames
    if (start < 0) beforeStart = true
    for (const other of (target ?? from).clips) {
      if (moving.has(other.id)) continue
      if (start < other.startFrame + other.durationFrames && other.startFrame < end) {
        return refused("overlap")
      }
    }
  }
  return beforeStart ? refused("before-timeline-start") : { ok: true }
}
