// A drag is a preview, and the Project changes once, on release (ADR 0020).
//
// A Trim or a move by pointer has three phases, and this module is all three:
//
//   * **Open.** A press on a Clip's edge or body becomes a drag once the pointer has moved past a
//     few pixels (the Timeline decides that). Playback stops first, on the Frame it reached
//     (AC-31), and a preview opens. No transaction opens: nothing has been decided yet.
//   * **Move.** Each pointer move updates only the preview, asking the model's own rule functions
//     where the edge stops (`trimRange`) or whether the Clips can land (`checkMove`). The Project,
//     the Scene and the engine are untouched, so the Preview keeps showing the committed Timeline,
//     and nothing is saved — a reload in the middle of a drag finds the Project as it was before
//     it (AC-17, AC-19).
//   * **Release.** If the preview can land and differs from where it started, one
//     `transact(label, …)` runs one command: one history entry, one save written at once. Escape,
//     a refused release or an unchanged release drops the preview and touches nothing (AC-07,
//     AC-32).
//
// Because the rules are the model's (ADR 0019), the preview cannot promise what the release then
// refuses: a Frame from `trimRange` and an `ok` from `checkMove` are never refused by the reducer.
//
// While a preview is open the store reports undo and redo as unavailable (AC-18), the same rule it
// applies to an open transaction — taking back half a Gesture is not a thing that exists.

import {
  applyCommand,
  checkMove,
  CommandError,
  trimRange,
  type Clip,
  type Command,
  type Project,
  type Verdict,
} from "@cutroom/model"

import { reportRefusal } from "./edit"
import type { EditorStore } from "./index"

export type TrimEdge = "head" | "tail"

/** An open Trim: which edge of which Clip, and where it sits now, held inside its limits. */
export interface TrimPreview {
  readonly kind: "trim"
  readonly clipId: string
  readonly edge: TrimEdge
  /** For `head` the Clip's would-be first Frame; for `tail` its would-be end (exclusive). */
  readonly frame: number
  /** Whether the pointer is past a limit and the edge is being held there (AC-02, AC-03). */
  readonly atLimit: boolean
}

/** An open move: which Clips, by how much, onto which Track, and whether they can land there. */
export interface MovePreview {
  readonly kind: "move"
  /** The Clip under the pointer; the Track it is dragged over decides `toTrackId`. */
  readonly grabbedClipId: string
  readonly clipIds: readonly string[]
  readonly delta: number
  /** `null` while the grabbed Clip stays on its own Track. */
  readonly toTrackId: string | null
  readonly verdict: Verdict
}

export type DragPreview = TrimPreview | MovePreview

export interface DragDependencies {
  readonly store: EditorStore
  /** The instant stamped on the command; `new Date().toISOString()` in the app. */
  readonly now: () => string
  /** Stops Playback on the Frame it reached; a no-op when stopped. */
  readonly stopPlayback: () => void
}

export interface DragController {
  openTrim(clipId: string, edge: TrimEdge): void
  openMove(clipId: string): void
  /** The pointer is over `frame` for the edge being trimmed. */
  trimTo(frame: number): void
  /** The grabbed Clip is `delta` Frames from where it started, over the Track `trackId`. */
  moveTo(delta: number, trackId: string): void
  /** Commits the preview if it can land and changed something; true when it did. */
  release(): boolean
  /** Drops the preview without touching anything (Escape, AC-19). */
  cancel(): void
}

function findClip(project: Project, clipId: string): { clip: Clip; trackId: string } | null {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId)
    if (clip !== undefined) return { clip, trackId: track.id }
  }
  return null
}

function edgeFrame(clip: Clip, edge: TrimEdge): number {
  return edge === "head" ? clip.startFrame : clip.startFrame + clip.durationFrames
}

/** "Move" for one Clip, "Move 3 Clips" for several — the undo step's name (AC-16). */
function moveLabel(count: number): string {
  return count === 1 ? "Move" : `Move ${count} Clips`
}

export function createDragController({
  store,
  now,
  stopPlayback,
}: DragDependencies): DragController {
  const state = () => store.getState()

  return {
    openTrim(clipId, edge) {
      const project = state().project
      const found = project === null ? null : findClip(project, clipId)
      if (found === null) return
      stopPlayback()
      // A drag is the next Gesture: the refusal notice of the last one closes (screens.md S1).
      state().reportEditRefusal(null)
      state().setDrag({
        kind: "trim",
        clipId,
        edge,
        frame: edgeFrame(found.clip, edge),
        atLimit: false,
      })
    },

    openMove(clipId) {
      const project = state().project
      if (project === null || findClip(project, clipId) === null) return
      stopPlayback()
      state().reportEditRefusal(null)
      // Dragging a Clip that is not selected makes it the only selected Clip and moves it alone;
      // dragging a selected one moves the whole Selection (AC-09).
      if (!state().selection.includes(clipId)) state().select(clipId)
      state().setDrag({
        kind: "move",
        grabbedClipId: clipId,
        clipIds: state().selection,
        delta: 0,
        toTrackId: null,
        verdict: { ok: true },
      })
    },

    trimTo(frame) {
      const { drag, project } = state()
      if (drag?.kind !== "trim" || project === null) return
      const range = trimRange(project, drag.clipId, drag.edge)
      const held = Math.min(range.latest, Math.max(range.earliest, frame))
      if (held === drag.frame && (held !== frame) === drag.atLimit) return
      state().setDrag({ ...drag, frame: held, atLimit: held !== frame })
    },

    moveTo(delta, trackId) {
      const { drag, project } = state()
      if (drag?.kind !== "move" || project === null) return
      const grabbed = findClip(project, drag.grabbedClipId)
      if (grabbed === null) return
      const toTrackId = trackId === grabbed.trackId ? null : trackId
      if (delta === drag.delta && toTrackId === drag.toTrackId) return
      state().setDrag({
        ...drag,
        delta,
        toTrackId,
        verdict: checkMove(project, drag.clipIds, delta, toTrackId),
      })
    },

    release() {
      const { drag, project } = state()
      state().setDrag(null)
      if (drag === null || project === null) return false

      let command: Command
      let label: string
      if (drag.kind === "trim") {
        const found = findClip(project, drag.clipId)
        if (found !== null && drag.frame === edgeFrame(found.clip, drag.edge)) return false
        command = {
          type: "trim-clip",
          at: now(),
          clipId: drag.clipId,
          edge: drag.edge,
          frame: drag.frame,
        }
        label = "Trim"
      } else {
        if (!drag.verdict.ok || (drag.delta === 0 && drag.toTrackId === null)) return false
        command = {
          type: "move-clips",
          at: now(),
          clipIds: [...drag.clipIds],
          delta: drag.delta,
          toTrackId: drag.toTrackId,
        }
        label = moveLabel(drag.clipIds.length)
      }

      // The preview was judged against the Project as it was when the pointer last moved. If that
      // Project changed since (an import that landed mid-drag), the reducer is the judge: asked
      // first, on its own, a refusal opens no transaction and is told like any other (R-12).
      try {
        applyCommand(project, command)
      } catch (error) {
        if (!(error instanceof CommandError)) throw error
        reportRefusal(store, error.reason, error.message)
        return false
      }
      const run = state().run
      try {
        state().transact(label, () => {
          run(command)
        })
      } catch (error) {
        if (!(error instanceof CommandError)) throw error
        reportRefusal(store, error.reason, error.message)
        return false
      }
      // Compared by identity, not by history length: at the 200-step cap the length stays put.
      return state().project !== project
    },

    cancel() {
      if (state().drag !== null) state().setDrag(null)
    },
  }
}
