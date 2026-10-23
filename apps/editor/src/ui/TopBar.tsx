// The bar across the top of the editor: the way back to the Project list, the Project's name, play
// and stop, the timecode at the Playhead, and undo/redo.
//
// The timecode is derived from the Playhead's Frame through the Timebase module on every render
// and is never stored (T050). There is no float in its path — see `timecode.ts` — and nothing here
// keeps a "current time" beside the Frame, because two representations of where the Playhead is
// are two answers that can disagree.
//
// With no Project there is no Timebase, and a timecode without one would be invented, so the bar
// shows a placeholder in its place until the first import brings the Project into being.
//
// Play and stop are one button and the spacebar (T065). Both only ask the transport
// (`audio/transport.ts`), which starts from the Playhead and, on stop, leaves the Playhead on the
// Frame that was showing (FR-010, FR-014); the label follows the store's `transport`, which only the
// transport writes. The spacebar works wherever focus is, except where Space types a character. On
// a focused button Space would also *click* it, on keyup — the play button itself after a mouse
// press, most of all, which would stop what Space just started — so the keyup is swallowed too.
//
// Export opens the export dialog (T073). While an export is in hand the way back to the Project
// list is closed: leaving the editor ends the engine, and with it the export and the file it is
// writing, which is not something one stray click should do.

import { useEffect } from "react"
import { useStore } from "zustand"
import { createStore } from "zustand/vanilla"

import type { Project } from "@cutroom/model"

import type { Transport } from "@/audio/transport"
import { Button } from "@/components/ui/button"
import { canRedo, canUndo, nextRedoLabel, nextUndoLabel, useEditorStore } from "@/store"
import { isExportBusy, type ExportController, type ExportState } from "@/store/export"

import { formatTimecode } from "./timecode"

/** Same width as a real timecode, so the bar does not shift when the first import lands. */
const NO_TIMECODE = "--:--:--:--"

function timecodeAt(project: Project | null, frame: number): string {
  return project === null ? NO_TIMECODE : formatTimecode(project.timebase, frame)
}

/**
 * The timecode at the Playhead. Its own component so that the Playhead moving every Frame while
 * playing re-renders this readout and not the bar around it (T072).
 */
function Timecode() {
  const project = useEditorStore((state) => state.project)
  const playheadFrame = useEditorStore((state) => state.playheadFrame)
  return (
    <output
      data-testid="timecode"
      aria-label="Timecode at the Playhead"
      className="font-mono text-sm tabular-nums"
    >
      {timecodeAt(project, playheadFrame)}
    </output>
  )
}

/** Whether Space pressed here is text being typed, which the transport must leave alone. */
function typesText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (!(target instanceof HTMLInputElement)) return false
  return !["button", "checkbox", "radio", "range", "reset", "submit", "file", "color"].includes(
    target.type
  )
}

function isSpace(event: KeyboardEvent): boolean {
  return (
    event.code === "Space" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
  )
}

/** Stands in for the export store before the engine exists, so the hook below is always called. */
const IDLE_EXPORTS = createStore<ExportState>()(() => ({ status: { phase: "idle" } }))

/** Whether an export is in hand. */
function useExporting(exporter: ExportController | null): boolean {
  const busy = useStore(exporter?.store ?? IDLE_EXPORTS, (state) => isExportBusy(state.status))
  return exporter !== null && busy
}

export function TopBar({
  transport,
  exporter = null,
  onExport,
}: {
  readonly transport: Transport | null
  readonly exporter?: ExportController | null
  readonly onExport?: () => void
}) {
  const project = useEditorStore((state) => state.project)
  const exporting = useExporting(exporter)
  const playing = useEditorStore((state) => state.transport === "playing")
  const undoable = useEditorStore(canUndo)
  const redoable = useEditorStore(canRedo)
  const undoLabel = useEditorStore(nextUndoLabel)
  const redoLabel = useEditorStore(nextRedoLabel)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const closeProject = useEditorStore((state) => state.closeProject)
  // Leaving the editor while the Project cannot be saved would throw the edits away (T093).
  const unsaved = useEditorStore((state) => state.saveFailure !== null)
  // Playing and exporting both need the engine, so they are closed once it has stopped (T093).
  const engineStopped = useEditorStore((state) => state.engineFatal !== null)

  useEffect(() => {
    if (transport === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSpace(event) || typesText(event.target)) return
      event.preventDefault()
      if (!event.repeat) transport.toggle()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (isSpace(event) && !typesText(event.target)) event.preventDefault()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [transport])

  return (
    <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={exporting || unsaved}
        title={
          exporting
            ? "An export is running. Cancel it or let it finish first."
            : unsaved
              ? "Your latest changes are not saved yet. Try saving again first."
              : undefined
        }
        onClick={() => void closeProject()}
      >
        Projects
      </Button>
      <h1 data-testid="project-name" className="truncate text-sm font-medium">
        {project?.name ?? "New Project"}
      </h1>

      <Button
        variant="outline"
        size="sm"
        className="ml-auto w-16"
        data-testid="transport"
        aria-pressed={playing}
        aria-keyshortcuts="Space"
        disabled={transport === null || project === null || engineStopped}
        onClick={() => {
          transport?.toggle()
        }}
      >
        {playing ? "Stop" : "Play"}
      </Button>

      <Timecode />

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          data-testid="export-open"
          disabled={project === null || exporter === null || engineStopped}
          title={
            engineStopped ? "Cutroom's engine has stopped. Reload the page to export." : undefined
          }
          onClick={() => {
            onExport?.()
          }}
        >
          Export…
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-testid="undo"
          disabled={!undoable}
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
          disabled={!redoable}
          onClick={() => {
            redo()
          }}
        >
          {redoLabel === null ? "Redo" : `Redo ${redoLabel}`}
        </Button>
      </div>
    </header>
  )
}
