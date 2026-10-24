// The editor's keyboard (ux-flows §Platform decisions, sad.md §8 "Keyboard").
//
//   S                 Split at the Playhead
//   ⌘D                Duplicate the selected Clips
//   Delete, Backspace delete the selected Clips, leaving Gaps
//   ⇧Delete           Ripple delete
//   ⌘Z, ⇧⌘Z           undo, redo
//   ⌘A                select every Clip
//   Escape            clear the Selection and close the refusal notice
//
// One handler on the window, so the keys work wherever focus is in the editor — except where a key
// types a character or edits text, which they must leave alone (`typesText`, the rule the
// transport's Space already follows). Each key calls the same function as its button, so a key and
// a click can never do two different things. Escape during a drag is the Timeline's: it cancels the
// drag first and stops the key there (`timeline/Timeline.tsx`).
//
// Ctrl stands in for ⌘ off a Mac, so the bindings are the platform's usual ones everywhere.

import type { EditorStore } from "@/store"

import type { Editing } from "./editing-context"

/** Whether a key pressed here is text being typed, which shortcuts must leave alone. */
export function typesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (!(target instanceof HTMLInputElement)) return false
  return !["button", "checkbox", "radio", "range", "reset", "submit", "file", "color"].includes(
    target.type
  )
}

/** Installs the editing keys; returns the uninstall. */
export function installShortcuts(store: EditorStore, editing: Editing): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || typesText(event.target)) return
    const command = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    const state = store.getState()
    // While a drag is open its preview is the one edit in flight: no key may change the Project or
    // the Selection under it (review R-12). Escape is the Timeline's, which cancels the drag.
    if (state.drag !== null) return
    let handled = true

    if (command && key === "z" && event.shiftKey) state.redo()
    else if (command && key === "z") state.undo()
    else if (command && key === "a") state.selectAll()
    else if (command && key === "d") editing.edit.duplicateSelected()
    else if (command || event.altKey) handled = false
    else if (key === "s" && !event.shiftKey) editing.edit.split()
    else if ((key === "delete" || key === "backspace") && event.shiftKey)
      editing.edit.deleteSelected(true)
    else if (key === "delete" || key === "backspace") editing.edit.deleteSelected(false)
    else if (key === "escape") {
      state.clearSelection()
      editing.edit.dismissRefusal()
    } else handled = false

    if (handled) event.preventDefault()
  }
  window.addEventListener("keydown", onKeyDown)
  return () => {
    window.removeEventListener("keydown", onKeyDown)
  }
}
