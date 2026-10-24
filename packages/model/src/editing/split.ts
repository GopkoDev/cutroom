// The Split rule (ADR 0019, contracts/public-api.md §Editing rules).
//
// A Split cuts a Clip at the Playhead into two that meet there. The Clip must be *strictly* inside:
// the Playhead on its first Frame would leave an empty first half, and on its end an empty second
// half, and a Clip has at least one Frame. So "under the Frame" means `startFrame < frame < end`.
// Both the reducer and the editor ask this file, so the editor's notice (AC-05) and the reducer's
// refusal cannot disagree. It reads a parsed Project and nothing else; only whole Frames are
// compared (ADR 0002).

import type { RefusalReason } from "../commands"
import type { Clip, Project } from "../document/types"

/**
 * What a Split at a Frame would cut. `none` is not a refusal: the editor shows the notice and sends
 * no command (AC-05). `because` tells the two empty cases apart for that notice.
 */
export type SplitTargets =
  | { readonly kind: "cut"; readonly clipIds: string[] }
  | {
      readonly kind: "none"
      readonly because: "selection-not-under-frame" | "nothing-under-frame"
    }

const strictlyInside = (clip: Clip, frame: number): boolean =>
  clip.startFrame < frame && frame < clip.startFrame + clip.durationFrames

/**
 * The Clips a Split at `frame` cuts. With a Selection, the selected Clips the Frame is strictly
 * inside (ids that name no Clip are ignored); with none, every Clip strictly under the Frame on
 * every Track. Ids come back in Timeline order, Track by Track.
 */
export function splitTargets(
  project: Project,
  frame: number,
  selectedClipIds: readonly string[]
): SplitTargets {
  const selected = new Set(selectedClipIds)
  const hasSelection = selected.size > 0
  const clipIds: string[] = []
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (hasSelection && !selected.has(clip.id)) continue
      if (strictlyInside(clip, frame)) clipIds.push(clip.id)
    }
  }
  if (clipIds.length > 0) return { kind: "cut", clipIds }
  return {
    kind: "none",
    because: hasSelection ? "selection-not-under-frame" : "nothing-under-frame",
  }
}

/**
 * Why `clip` cannot be cut at `frame`, or `null` if it can — the same verdict as {@link splitTargets}
 * for one Clip. The reducer uses it so it refuses exactly when the rule says no.
 */
export function splitRefusal(clip: Clip, frame: number): RefusalReason | null {
  return strictlyInside(clip, frame) ? null : "nothing-to-split"
}
