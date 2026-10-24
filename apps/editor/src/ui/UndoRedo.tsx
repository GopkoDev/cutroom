// Undo and Redo, each naming the step it would act on (US-07, AC-16, AC-18; screens.md S2).
//
// "Undo Trim", "Redo Ripple delete": the label is the history entry's, which is the Gesture's own
// name (`store/edit.ts`, `store/drag.ts`). When a control cannot act it says so instead of failing
// silently — there is nothing left, or a drag is still open and taking back half a Gesture is not
// a thing that exists (AC-18) — and it is disabled, so the key does nothing either.

import { Button } from "@/components/ui/button"
import { nextRedoLabel, nextUndoLabel, useEditorStore } from "@/store"

export function UndoRedo() {
  const undoLabel = useEditorStore(nextUndoLabel)
  const redoLabel = useEditorStore(nextRedoLabel)
  const dragging = useEditorStore((state) => state.drag !== null)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)

  const why = (nothing: string) => (dragging ? "Finish the drag first" : nothing)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        data-testid="undo"
        aria-keyshortcuts="Meta+Z"
        disabled={undoLabel === null}
        title={undoLabel === null ? why("Nothing to undo") : `Undo ${undoLabel} (⌘Z)`}
        onClick={() => {
          undo()
        }}
      >
        {undoLabel === null ? "Undo" : `Undo ${undoLabel}`}
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="redo"
        aria-keyshortcuts="Shift+Meta+Z"
        disabled={redoLabel === null}
        title={redoLabel === null ? why("Nothing to redo") : `Redo ${redoLabel} (⇧⌘Z)`}
        onClick={() => {
          redo()
        }}
      >
        {redoLabel === null ? "Redo" : `Redo ${redoLabel}`}
      </Button>
    </>
  )
}
