// The Selection: which Clips the next edit acts on (CONTEXT "Selection", AC-14, AC-15).
//
// It is session state, like the Playhead: never in the Project, never in history, never saved,
// never posted to the engine. Commands never read it either — an edit turns the Selection into
// Clip ids before it builds its command (ADR 0019), so the model, and later the agent, never has
// to know what was selected.
//
// What it must never do is name a Clip that is not on the Timeline. An undo of a Split takes the
// second half away, a redo of a delete takes the deleted Clips away again, and the next edit would
// then be asked to act on a Clip that is not there. So the store prunes it after every undo and
// redo with `prune` below, and the edits only ever add ids of Clips they have just created.
//
// An ordered list rather than a set: it is plain data, so it can sit in the store and be compared
// in tests, and the order is the order the User built it in, which nothing depends on yet.

import type { Project } from "@cutroom/model"

/** Adds `clipId` to the Selection, or takes it out if it is already there. */
export function toggle(selection: readonly string[], clipId: string): readonly string[] {
  return selection.includes(clipId)
    ? selection.filter((id) => id !== clipId)
    : [...selection, clipId]
}

/** Every Clip id on the Timeline, bottom Track first, each Track in Timeline order. */
export function allClipIds(project: Project | null): readonly string[] {
  if (project === null) return []
  return project.timeline.tracks.flatMap((track) =>
    [...track.clips].sort((a, b) => a.startFrame - b.startFrame).map((clip) => clip.id)
  )
}

/** The Selection without any id that is no longer on the Timeline, in the order it had. */
export function prune(selection: readonly string[], project: Project | null): readonly string[] {
  if (selection.length === 0) return selection
  const present = new Set(allClipIds(project))
  const kept = selection.filter((id) => present.has(id))
  return kept.length === selection.length ? selection : kept
}
