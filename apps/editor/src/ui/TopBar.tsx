// The bar across the top of the editor: the way back to the Project list, the Project's name, the
// timecode at the Playhead, and undo/redo.
//
// The timecode is derived from the Playhead's Frame through the Timebase module on every render
// and is never stored (T050). There is no float in its path — see `timecode.ts` — and nothing here
// keeps a "current time" beside the Frame, because two representations of where the Playhead is
// are two answers that can disagree.
//
// With no Project there is no Timebase, and a timecode without one would be invented, so the bar
// shows a placeholder in its place until the first import brings the Project into being.

import type { Project } from "@cutroom/model"

import { Button } from "@/components/ui/button"
import { canRedo, canUndo, useEditorStore } from "@/store"

import { formatTimecode } from "./timecode"

/** Same width as a real timecode, so the bar does not shift when the first import lands. */
const NO_TIMECODE = "--:--:--:--"

function timecodeAt(project: Project | null, frame: number): string {
  return project === null ? NO_TIMECODE : formatTimecode(project.timebase, frame)
}

export function TopBar() {
  const project = useEditorStore((state) => state.project)
  const playheadFrame = useEditorStore((state) => state.playheadFrame)
  const undoable = useEditorStore(canUndo)
  const redoable = useEditorStore(canRedo)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const closeProject = useEditorStore((state) => state.closeProject)

  return (
    <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
      <Button variant="ghost" size="sm" onClick={() => void closeProject()}>
        Projects
      </Button>
      <h1 data-testid="project-name" className="truncate text-sm font-medium">
        {project?.name ?? "New Project"}
      </h1>

      <output
        data-testid="timecode"
        aria-label="Timecode at the Playhead"
        className="ml-auto font-mono text-sm tabular-nums"
      >
        {timecodeAt(project, playheadFrame)}
      </output>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          data-testid="undo"
          disabled={!undoable}
          onClick={() => {
            undo()
          }}
        >
          Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="redo"
          disabled={!redoable}
          onClick={() => {
            redo()
          }}
        >
          Redo
        </Button>
      </div>
    </header>
  )
}
