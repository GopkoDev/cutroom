// One Clip on the Timeline (screens.md SCR-02 `ClipView`, ADR 0021).
//
// It is positioned in Frames times the Timeline's scale, and it subscribes to exactly two things:
// its own Clip, handed down by its Track, and whether it is selected. A Selection change re-renders
// the Clips whose mark changed and nothing else, which is what keeps a click — and later a drag —
// within the frame budget on a heavy Project (spec §6 Drag feedback).
//
// It carries no pointer handlers of its own. The Timeline's body captures the pointer for the
// whole press so that a scrub, a click and a drag are one gesture it can tell apart; the Clip only
// says, through `data-clip-id` and its handles' `data-handle`, what is under the pointer.

import { memo } from "react"

import type { Clip } from "@cutroom/model"

import { cn } from "@/lib/utils"
import { useEditorStore } from "@/store"

import { offsetOfFrame } from "../timeline-scale"

export interface ClipViewProps {
  readonly clip: Clip
  readonly sourceName: string
  readonly offline: boolean
  readonly pxPerFrame: number
}

export const ClipView = memo(function ClipView({
  clip,
  sourceName,
  offline,
  pxPerFrame,
}: ClipViewProps) {
  const selected = useEditorStore((state) => state.selection.includes(clip.id))

  const left = offsetOfFrame(clip.startFrame, pxPerFrame)
  const width = offsetOfFrame(clip.startFrame + clip.durationFrames, pxPerFrame) - left
  const last = clip.startFrame + clip.durationFrames - 1

  return (
    <div
      data-testid="timeline-clip"
      data-clip-id={clip.id}
      data-start-frame={clip.startFrame}
      data-duration-frames={clip.durationFrames}
      data-offline={offline ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      role="option"
      aria-selected={selected}
      aria-label={`${sourceName}, Frames ${clip.startFrame} to ${last}${offline ? ", Offline" : ""}`}
      title={`${sourceName} — Frames ${clip.startFrame} to ${last}`}
      className={cn(
        "absolute inset-y-1 overflow-hidden rounded-sm border px-1.5 py-0.5 text-[0.625rem]",
        offline
          ? "border-dashed border-muted-foreground/60 bg-muted/40 text-muted-foreground"
          : "border-primary/60 bg-primary/20 text-foreground",
        selected && "ring-2 ring-primary"
      )}
      style={{ left, width }}
    >
      <span className="pointer-events-none block truncate">{sourceName}</span>
      {offline ? <span className="pointer-events-none block truncate">Offline</span> : null}
      <div
        data-testid="clip-head-handle"
        data-handle="head"
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
      />
      <div
        data-testid="clip-tail-handle"
        data-handle="tail"
        aria-hidden
        className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
      />
    </div>
  )
})
