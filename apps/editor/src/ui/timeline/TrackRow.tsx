// One Track's lane on the Timeline (screens.md SCR-02 `TrackRow`, ADR 0021).
//
// It subscribes to its own Track's Clips and to nothing else: the model's commands share structure
// (Immer), so an edit on the other Track leaves this array the same object and this row as it was.
// Each Clip is a `ClipView`, which in turn subscribes only to what concerns it.

import type { Clip } from "@cutroom/model"

import { useEditorStore } from "@/store"

import { ClipView } from "./ClipView"
import { TRACK_ROW_HEIGHT } from "./TrackHeader"

const NO_CLIPS: readonly Clip[] = []

export function TrackRow({
  trackId,
  trackOrder,
  pxPerFrame,
}: {
  readonly trackId: string
  /** The Tracks top to bottom, as drawn: where a dragged Clip's ghost goes on another Track. */
  readonly trackOrder: readonly string[]
  readonly pxPerFrame: number
}) {
  const clips = useEditorStore(
    (state) =>
      state.project?.timeline.tracks.find((track) => track.id === trackId)?.clips ?? NO_CLIPS
  )
  const sources = useEditorStore((state) => state.project?.sources)
  const sourceStatus = useEditorStore((state) => state.sourceStatus)

  return (
    <div
      data-testid="timeline-track"
      data-track-id={trackId}
      className={`relative ${TRACK_ROW_HEIGHT} border-b border-border/50`}
    >
      {pxPerFrame > 0
        ? clips.map((clip) => (
            <ClipView
              key={clip.id}
              clip={clip}
              trackId={trackId}
              trackOrder={trackOrder}
              sourceName={
                sources?.find((source) => source.id === clip.sourceId)?.name ?? clip.sourceId
              }
              offline={sourceStatus[clip.sourceId] === "offline"}
              pxPerFrame={pxPerFrame}
            />
          ))
        : null}
    </div>
  )
}
