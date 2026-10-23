// One Clip on the Timeline (screens.md SCR-02 `ClipView`, ADR 0021).
//
// It is positioned in Frames times the Timeline's scale, and it subscribes to exactly three things:
// its own Clip, handed down by its Track; whether it is selected; and what an open drag says about
// it, reduced to a short string so that a pointer move re-renders only the Clips being dragged —
// the rest see the same string and stay as they are. That subscription discipline is what keeps a
// drag within one display frame on a heavy Project (spec §6 Drag feedback).
//
// It carries no pointer handlers of its own. The Timeline's body captures the pointer for the
// whole press so that a scrub, a click and a drag are one gesture it can tell apart; the Clip only
// says, through `data-clip-id` and its handles' `data-handle`, what is under the pointer.
//
// While a drag is open the committed Clip stays where the Project has it (`data-start-frame`,
// `data-duration-frames`) — the Project does not change until release (ADR 0020):
//
//   * a **Trim** draws the Clip at its preview edges (`data-preview-*`), with a limit mark on the
//     held edge (`data-at-limit`) while the pointer is past a limit (AC-02, AC-03);
//   * a **move** dims the Clip and draws a ghost where it would land, on this Track or the other,
//     marked `data-drop="refused"` with the rule's reason while it cannot land there (AC-07).

import { memo } from "react"

import type { Clip } from "@cutroom/model"

import { cn } from "@/lib/utils"
import { useEditorStore, type EditorState } from "@/store"

import { offsetOfFrame } from "../timeline-scale"

/** How tall a Track row is, in pixels: a ghost on the other Track is this far up or down. */
export const TRACK_ROW_PX = 40

export interface ClipViewProps {
  readonly clip: Clip
  readonly trackId: string
  /** The Tracks top to bottom, as drawn: where a ghost on another Track goes. */
  readonly trackOrder: readonly string[]
  readonly sourceName: string
  readonly offline: boolean
  readonly pxPerFrame: number
}

/**
 * What the open drag says about one Clip, as a string: "" when it is not being dragged, else a
 * trim (`t|edge|frame|atLimit`) or a move (`m|delta|toTrackId|ok|reason`).
 */
function dragViewOf(state: EditorState, clipId: string): string {
  const drag = state.drag
  if (drag === null) return ""
  if (drag.kind === "trim") {
    return drag.clipId === clipId ? `t|${drag.edge}|${drag.frame}|${drag.atLimit ? 1 : 0}` : ""
  }
  if (!drag.clipIds.includes(clipId)) return ""
  const verdict = drag.verdict
  return `m|${drag.delta}|${drag.toTrackId ?? ""}|${verdict.ok ? 1 : 0}|${verdict.ok ? "" : verdict.reason}`
}

export const ClipView = memo(function ClipView({
  clip,
  trackId,
  trackOrder,
  sourceName,
  offline,
  pxPerFrame,
}: ClipViewProps) {
  const selected = useEditorStore((state) => state.selection.includes(clip.id))
  const dragView = useEditorStore((state) => dragViewOf(state, clip.id))

  const end = clip.startFrame + clip.durationFrames
  let shownStart = clip.startFrame
  let shownEnd = end
  let atLimit = false
  let trimming = false
  let ghost: { start: number; rows: number; ok: boolean; reason: string } | null = null

  const parts = dragView.split("|")
  if (parts[0] === "t") {
    trimming = true
    const frame = Number(parts[2])
    if (parts[1] === "head") shownStart = frame
    else shownEnd = frame
    atLimit = parts[3] === "1"
  } else if (parts[0] === "m") {
    const delta = Number(parts[1])
    const toTrackId = parts[2] === "" ? trackId : (parts[2] ?? trackId)
    ghost = {
      start: clip.startFrame + delta,
      rows: trackOrder.indexOf(toTrackId) - trackOrder.indexOf(trackId),
      ok: parts[3] === "1",
      reason: parts[4] ?? "",
    }
  }

  const left = offsetOfFrame(shownStart, pxPerFrame)
  const width = offsetOfFrame(shownEnd, pxPerFrame) - left
  const last = end - 1

  return (
    <>
      <div
        data-testid="timeline-clip"
        data-clip-id={clip.id}
        data-start-frame={clip.startFrame}
        data-duration-frames={clip.durationFrames}
        data-offline={offline ? "true" : undefined}
        data-selected={selected ? "true" : undefined}
        data-dragging={ghost !== null ? "true" : undefined}
        data-preview-start-frame={trimming ? shownStart : undefined}
        data-preview-duration-frames={trimming ? shownEnd - shownStart : undefined}
        data-at-limit={atLimit ? "true" : undefined}
        role="option"
        aria-selected={selected}
        aria-label={`${sourceName}, Frames ${clip.startFrame} to ${last}${offline ? ", Offline" : ""}`}
        title={`${sourceName} — Frames ${clip.startFrame} to ${last}`}
        className={cn(
          "absolute inset-y-1 overflow-hidden rounded-sm border px-1.5 py-0.5 text-[0.625rem]",
          offline
            ? "border-dashed border-muted-foreground/60 bg-muted/40 text-muted-foreground"
            : "border-primary/60 bg-primary/20 text-foreground",
          selected && "ring-2 ring-primary",
          ghost !== null && "opacity-40"
        )}
        style={{ left, width }}
      >
        <span className="pointer-events-none block truncate">{sourceName}</span>
        {offline ? <span className="pointer-events-none block truncate">Offline</span> : null}
        <div
          data-testid="clip-head-handle"
          data-handle="head"
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-1.5 cursor-ew-resize",
            atLimit && parts[1] === "head" && "bg-amber-500"
          )}
        />
        <div
          data-testid="clip-tail-handle"
          data-handle="tail"
          aria-hidden
          className={cn(
            "absolute inset-y-0 right-0 w-1.5 cursor-ew-resize",
            atLimit && parts[1] === "tail" && "bg-amber-500"
          )}
        />
      </div>
      {ghost === null ? null : (
        <div
          data-testid="clip-ghost"
          data-clip-id={clip.id}
          data-start-frame={ghost.start}
          data-drop={ghost.ok ? "ok" : "refused"}
          data-reason={ghost.ok ? undefined : ghost.reason}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-1 rounded-sm border-2 border-dashed",
            ghost.ok
              ? "border-primary bg-primary/10"
              : "cursor-not-allowed border-destructive bg-destructive/10"
          )}
          style={{
            left: offsetOfFrame(ghost.start, pxPerFrame),
            width: offsetOfFrame(end, pxPerFrame) - offsetOfFrame(clip.startFrame, pxPerFrame),
            transform: ghost.rows === 0 ? undefined : `translateY(${ghost.rows * TRACK_ROW_PX}px)`,
          }}
        />
      )}
    </>
  )
})
