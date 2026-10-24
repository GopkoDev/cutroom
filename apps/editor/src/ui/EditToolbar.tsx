// The Timeline's edit buttons: Split, Duplicate and Ripple delete (screens.md S3, US-02/04/05).
//
// They sit in the Timeline's own header row, so every Timeline edit is reachable without leaving
// it. Each one calls the same Gesture function as its key (`shortcuts.ts`): Playback stops first,
// one command, one named undo step, or a refusal in the notice above the Tracks. A plain delete
// has its key and no button, as in the Kino reference; the destructive-but-closing Ripple delete
// gets a button because it is the one a User looks for.

import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/store"

import { useEditing } from "./editing-context"

export function EditToolbar() {
  const editing = useEditing()
  const hasClips = useEditorStore(
    (state) => state.project?.timeline.tracks.some((track) => track.clips.length > 0) ?? false
  )
  const disabled = editing === null || !hasClips

  return (
    <div role="toolbar" aria-label="Edit" className="ml-auto flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        data-testid="edit-split"
        aria-keyshortcuts="S"
        title="Split at the Playhead (S)"
        disabled={disabled}
        className="h-6 px-2 text-xs"
        onClick={() => {
          editing?.edit.split()
        }}
      >
        Split
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="edit-duplicate"
        aria-keyshortcuts="Meta+D"
        title="Duplicate the selected Clips (⌘D)"
        disabled={disabled}
        className="h-6 px-2 text-xs"
        onClick={() => {
          editing?.edit.duplicateSelected()
        }}
      >
        Duplicate
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="edit-ripple-delete"
        aria-keyshortcuts="Shift+Delete"
        title="Delete the selected Clips and close the Gap (⇧⌫)"
        disabled={disabled}
        className="h-6 px-2 text-xs"
        onClick={() => {
          editing?.edit.deleteSelected(true)
        }}
      >
        Ripple delete
      </Button>
    </div>
  )
}
