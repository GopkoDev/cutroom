// The Ripple delete rule (ADR 0019, contracts/public-api.md §Editing rules).
//
// A Ripple delete closes the Gap a deletion leaves, and it does so per Track: a Clip moves back by
// the total length deleted before it on its own Track and by nothing from any other. `delta` is a
// positive count of Frames the Clip moves back (its new `startFrame` is `startFrame - delta`), so
// the caller subtracts and never has to think about signs. Both the reducer and the editor's
// preview ask this file, so what is shown is what is applied. It reads a parsed Project and nothing
// else; only whole Frames are added (ADR 0002).

import type { Project } from "../document/types"

/**
 * How far each Clip that stays moves back when `clipIds` are Ripple-deleted. Clips before the first
 * deleted one on their Track, Clips on Tracks with no deletion, and the deleted Clips themselves get
 * no entry. Ids that name no Clip are ignored. Entries come in Timeline order, Track by Track.
 */
export function rippleShifts(
  project: Project,
  clipIds: readonly string[]
): { clipId: string; delta: number }[] {
  const deleted = new Set(clipIds)
  const shifts: { clipId: string; delta: number }[] = []
  for (const track of project.timeline.tracks) {
    // Clips are ordered by `startFrame`, so everything deleted before a Clip is already summed.
    let removed = 0
    for (const clip of track.clips) {
      if (deleted.has(clip.id)) removed += clip.durationFrames
      else if (removed > 0) shifts.push({ clipId: clip.id, delta: removed })
    }
  }
  return shifts
}
