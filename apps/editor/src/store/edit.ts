// One function per editing Gesture that is not a drag: Split, delete, Ripple delete, Duplicate,
// add and remove a Track, and place a Source (sad.md §5, `store/edit.ts`).
//
// Every button and every key reaches the Project through here, so the rules that hold for all of
// them are stated once:
//
//   * **Playback stops first** (AC-31), before the Playhead or the Selection is read, so a Split
//     cuts exactly at the Frame the User sees when they press S.
//   * **The Selection becomes ids.** Commands never see the Selection (ADR 0019): each function
//     turns it into the Clip ids its command names, asking the model's rule functions where the
//     edit lands (`splitTargets`, `duplicateDelta`, `placeSourceCommand`).
//   * **New ids and the instant come from here**, through the injected `newId` and `now`; the
//     reducer mints none and reads no clock.
//   * **One Gesture, one command, one history entry named for it** ("Split", "Ripple delete", …),
//     inside one `transact`, so it is one save written at once (ADR 0011, ADR 0020). A command
//     that changes nothing produces no patches, and the store then records nothing (AC-32).
//   * **A refusal is told, and nothing changes.** A rule the User can act on (no Clip under the
//     Playhead, a third Track, the last Track) becomes the refusal notice in the User's words
//     (`explainRefusal`); anything else the reducer refuses — which the rule functions should
//     have made impossible — shows the same notice with the reducer's message under Details.
//
// Nothing here touches a file, a handle or a permission, which is what lets every edit work on an
// Offline Source's Clips exactly as on a Linked one's (AC-25). An Export in progress needs nothing
// either: it renders the Scene frozen when it started (ADR 0015), so edits made meanwhile are made
// and saved as usual (AC-26).

import {
  applyCommand,
  CommandError,
  duplicateDelta,
  placeSourceCommand,
  splitTargets,
  type Command,
} from "@cutroom/model"

import { explainRefusal, isActionableRefusal } from "@/ui/failure-wording"

import type { EditorStore } from "./index"

export interface EditDependencies {
  readonly store: EditorStore
  /** The instant stamped on each command; `new Date().toISOString()` in the app. */
  readonly now: () => string
  /** A fresh id for each new Clip and Track; `crypto.randomUUID` in the app. */
  readonly newId: () => string
  /** Stops Playback on the Frame it reached; a no-op when stopped. */
  readonly stopPlayback: () => void
}

export interface EditActions {
  /** Split at the Playhead: the selected Clips under it, or every Clip under it (AC-04, AC-29). */
  split(): void
  /** Delete the selected Clips, leaving Gaps, or closing them with `ripple` (AC-10, AC-11). */
  deleteSelected(ripple: boolean): void
  /** Duplicate the selected Clips as one block (AC-12, AC-13). */
  duplicateSelected(): void
  /** Add an empty video Track on top (AC-20, AC-30). */
  addTrack(): void
  /** Remove a Track with its Clips (AC-21, AC-22). */
  removeTrack(trackId: string): void
  /** Place a Source from the Source list after the last Clip on the bottom Track (AC-24). */
  placeSource(sourceId: string): void
  /** Close the refusal notice. */
  dismissRefusal(): void
}

/**
 * Puts a refusal on screen in the User's words. The reducer's `detail` is kept only for a refusal
 * the User cannot act on, which is a bug to report (screens.md SCR-02).
 */
export function reportRefusal(store: EditorStore, reason: string, detail?: string): void {
  const words = explainRefusal(reason)
  store
    .getState()
    .reportEditRefusal(
      detail === undefined || isActionableRefusal(reason)
        ? { reason, ...words }
        : { reason, ...words, detail }
    )
}

export function createEditActions({
  store,
  now,
  newId,
  stopPlayback,
}: EditDependencies): EditActions {
  const state = () => store.getState()

  /**
   * What every Gesture does before it decides anything. False while a drag is open: its preview is
   * the one edit in flight, and its release is computed from the Project as the drag found it, so
   * no other Gesture may change that Project under it (review R-12).
   */
  function begin(): boolean {
    if (state().drag !== null) return false
    stopPlayback()
    state().reportEditRefusal(null)
    return true
  }

  function refuse(reason: string, detail?: string): void {
    reportRefusal(store, reason, detail)
  }

  /**
   * Applies one command as one named Gesture. Returns false when the reducer refused it; the
   * refusal is then on screen and the Project is as it was.
   */
  function apply(label: string, command: Command): boolean {
    // Asked of the reducer first, on its own: it is a pure function, and a refusal found this way
    // opens no transaction, so a refused Gesture costs no save and no history (AC-22, AC-30).
    const project = state().project
    try {
      applyCommand(project, command)
    } catch (error) {
      if (!(error instanceof CommandError)) throw error
      refuse(error.reason, error.message)
      return false
    }
    try {
      const run = state().run
      state().transact(label, () => {
        run(command)
      })
      return true
    } catch (error) {
      if (!(error instanceof CommandError)) throw error
      refuse(error.reason, error.message)
      return false
    }
  }

  return {
    split() {
      if (!begin()) return
      const { project, playheadFrame, selection } = state()
      if (project === null) return
      const targets = splitTargets(project, playheadFrame, [...selection])
      if (targets.kind === "none") {
        refuse(targets.because)
        return
      }
      const cuts = targets.clipIds.map((clipId) => ({ clipId, newClipId: newId() }))
      const applied = apply("Split", {
        type: "split-clips",
        at: now(),
        frame: playheadFrame,
        cuts,
      })
      if (applied) state().setSelection(cuts.map((cut) => cut.newClipId))
    },

    deleteSelected(ripple) {
      if (!begin()) return
      const { project, selection } = state()
      if (project === null || selection.length === 0) return
      const applied = apply(ripple ? "Ripple delete" : "Delete", {
        type: "delete-clips",
        at: now(),
        clipIds: [...selection],
        ripple,
      })
      if (applied) state().clearSelection()
    },

    duplicateSelected() {
      if (!begin()) return
      const { project, selection } = state()
      if (project === null || selection.length === 0) return
      const copies = selection.map((clipId) => ({ clipId, newClipId: newId() }))
      const applied = apply("Duplicate", {
        type: "duplicate-clips",
        at: now(),
        delta: duplicateDelta(project, [...selection]),
        copies,
      })
      if (applied) state().setSelection(copies.map((copy) => copy.newClipId))
    },

    addTrack() {
      if (!begin()) return
      const project = state().project
      if (project === null) return
      apply("Add Track", {
        type: "add-track",
        at: now(),
        track: { id: newId(), name: `Video ${project.timeline.tracks.length + 1}` },
      })
    },

    removeTrack(trackId) {
      if (!begin()) return
      if (state().project === null) return
      const applied = apply("Remove Track", { type: "remove-track", at: now(), trackId })
      if (applied) state().setSelection(state().selection)
    },

    placeSource(sourceId) {
      if (!begin()) return
      const project = state().project
      if (project === null) return
      const clipId = newId()
      let command: Command
      try {
        command = placeSourceCommand(project, { at: now(), sourceId, clipId })
      } catch (error) {
        if (!(error instanceof CommandError)) throw error
        refuse(error.reason, error.message)
        return
      }
      if (apply("Place", command)) state().setSelection([clipId])
    },

    dismissRefusal() {
      state().reportEditRefusal(null)
    },
  }
}
