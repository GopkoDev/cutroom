// A Track's header: its name and the way to remove it (US-08, screens.md SCR-02 `TrackHeader`).
//
// Removing a Track is a Gesture like any other: `removeTrack` stops Playback, applies one command
// and names the undo step, and refuses the last Track with the refusal notice (AC-21, AC-22). The
// button is always offered, even on the only Track, because the refusal tells the User why — a
// button that silently does nothing, or that vanishes, says less.

import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/store"

import { useEditing } from "../editing-context"

export const TRACK_ROW_HEIGHT = "h-10"

export function TrackHeader({ trackId }: { readonly trackId: string }) {
  const name = useEditorStore(
    (state) => state.project?.timeline.tracks.find((track) => track.id === trackId)?.name ?? ""
  )
  const editing = useEditing()

  return (
    <div
      data-testid="track-header"
      data-track-id={trackId}
      className={`flex ${TRACK_ROW_HEIGHT} items-center gap-1 pr-1`}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Button
        variant="ghost"
        size="sm"
        data-testid="track-remove"
        aria-label={`Remove Track ${name}`}
        title={`Remove ${name} and its Clips`}
        disabled={editing === null}
        className="h-6 px-1.5 text-[0.625rem]"
        onClick={() => {
          editing?.edit.removeTrack(trackId)
        }}
      >
        ×
      </Button>
    </div>
  )
}

/** Adds a video Track on top (AC-20); a third is refused with the notice (AC-30). */
export function AddTrackButton() {
  const editing = useEditing()
  const hasProject = useEditorStore((state) => state.project !== null)
  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="track-add"
      aria-label="Add Track"
      title="Add a video Track on top"
      disabled={editing === null || !hasProject}
      className="h-5 justify-start px-1 text-[0.625rem]"
      onClick={() => {
        editing?.edit.addTrack()
      }}
    >
      + Track
    </Button>
  )
}
