// The Timeline: a ruler in Frames, the video Track, its Clips to scale, and the Playhead (T048,
// FR-006, FR-007).
//
// Everything drawn here is a whole Frame. The ruler is labelled in Frames, Clips start and end on
// Frame boundaries, and the Playhead can only be put on a Frame: a pointer position becomes an
// integer in `frameAtOffset` before it reaches the store, so no position between two Frames can be
// expressed, shown or stored (FR-006). Seconds never appear — the timecode is the top bar's, and it
// is derived from the same integer.
//
// The Playhead is runtime state. Moving it is `setPlayhead`, a plain `set`: no command, no
// transaction, no undo step — dragging the Playhead is looking, not editing (data-model.md).
//
// The whole Timeline is fitted to the panel's width. It shows a little more than its own length
// (`visibleFrames`) so that the Playhead can be taken past the end of the last Clip, where the
// Preview must go empty rather than hold the last Frame (FR-008), and it always shows the Frame the
// Playhead is on, even one far past the end — a Playhead that undo left beyond a shortened Timeline
// is still where the user put it and must still be visible (T034).
//
// Tracks are drawn the other way up from the Scene's order: `tracks[0]` is backmost, so it is drawn
// at the bottom, and the reversal lives here where presentation belongs (data-model.md). This
// slice has one video Track, which is why the rule is cheap to state now.

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"

import type { Clip, Source } from "@cutroom/model"

import { cn } from "@/lib/utils"
import { useEditorStore, type SourceStatus } from "@/store"

import {
  frameAtOffset,
  offsetOfFrame,
  rulerStep,
  rulerTicks,
  visibleFrames,
} from "./timeline-scale"

const TRACK_HEADER_WIDTH = "w-20"

/** Measures an element's content width, and keeps measuring. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    setWidth(element.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  return [ref, width] as const
}

function ClipBlock({
  clip,
  source,
  status,
  pxPerFrame,
}: {
  clip: Clip
  source: Source | undefined
  status: SourceStatus | undefined
  pxPerFrame: number
}) {
  const offline = status === "offline"
  const name = source?.name ?? clip.sourceId
  const left = offsetOfFrame(clip.startFrame, pxPerFrame)
  const width = offsetOfFrame(clip.startFrame + clip.durationFrames, pxPerFrame) - left

  return (
    <div
      data-testid="timeline-clip"
      data-clip-id={clip.id}
      data-start-frame={clip.startFrame}
      data-duration-frames={clip.durationFrames}
      data-offline={offline ? "true" : undefined}
      title={`${name} — Frames ${clip.startFrame} to ${clip.startFrame + clip.durationFrames - 1}`}
      className={cn(
        "absolute inset-y-1 overflow-hidden rounded-sm border px-1.5 py-0.5 text-[0.625rem]",
        offline
          ? "border-dashed border-muted-foreground/60 bg-muted/40 text-muted-foreground"
          : "border-primary/60 bg-primary/20 text-foreground"
      )}
      style={{ left, width }}
    >
      <span className="block truncate">{name}</span>
      {offline ? <span className="block truncate">Offline</span> : null}
    </div>
  )
}

export function Timeline() {
  const project = useEditorStore((state) => state.project)
  const playheadFrame = useEditorStore((state) => state.playheadFrame)
  const sourceStatus = useEditorStore((state) => state.sourceStatus)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)

  const [bodyRef, bodyWidth] = useWidth<HTMLDivElement>()

  const durationFrames = project?.timeline.durationFrames ?? 0
  const tracks = project?.timeline.tracks ?? []
  const shown = Math.max(visibleFrames(durationFrames), playheadFrame + 1)
  const pxPerFrame = bodyWidth > 0 ? bodyWidth / shown : 0
  const step = rulerStep(pxPerFrame)
  const sources = new Map(project?.sources.map((source) => [source.id, source]))

  const moveTo = useCallback(
    (clientX: number, body: HTMLElement) => {
      const offset = clientX - body.getBoundingClientRect().left
      const frame = frameAtOffset(offset, pxPerFrame, shown)
      if (frame !== useEditorStore.getState().playheadFrame) setPlayhead(frame)
    },
    [pxPerFrame, shown, setPlayhead]
  )

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
    moveTo(event.clientX, event.currentTarget)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    moveTo(event.clientX, event.currentTarget)
  }

  // The keyboard reaches every Frame too, one at a time: FR-007 is "any Frame", and a pointer on a
  // narrow panel cannot pick out one Frame in an hour of them.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const by = event.shiftKey ? 10 : 1
    let next: number | null = null
    if (event.key === "ArrowRight") next = playheadFrame + by
    else if (event.key === "ArrowLeft") next = Math.max(0, playheadFrame - by)
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = Math.max(0, durationFrames - 1)
    if (next === null) return
    event.preventDefault()
    setPlayhead(next)
  }

  return (
    <section
      data-testid="timeline-panel"
      aria-label="Timeline"
      className="flex h-40 shrink-0 flex-col border-t"
    >
      <div className="flex shrink-0 items-baseline gap-3 px-3 pt-2 pb-1">
        <h2 className="text-xs font-medium text-muted-foreground">Timeline</h2>
        <p data-testid="timeline-duration" className="text-xs">
          {durationFrames === 0
            ? "Empty — no Clips yet."
            : `${durationFrames} Frames across ${tracks.length} Track(s).`}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 px-3 pb-2">
        <div
          className={cn(
            "flex shrink-0 flex-col text-[0.625rem] text-muted-foreground",
            TRACK_HEADER_WIDTH
          )}
        >
          <div className="h-5 shrink-0" />
          {[...tracks].reverse().map((track) => (
            <div key={track.id} className="flex h-10 items-center truncate pr-2">
              {track.name}
            </div>
          ))}
        </div>

        <div
          ref={bodyRef}
          data-testid="timeline-body"
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={shown - 1}
          aria-valuenow={playheadFrame}
          aria-valuetext={`Frame ${playheadFrame}`}
          className="relative min-w-0 flex-1 cursor-pointer touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onKeyDown={onKeyDown}
        >
          <div
            data-testid="timeline-ruler"
            className="relative h-5 border-b text-[0.625rem] text-muted-foreground"
          >
            {pxPerFrame > 0
              ? rulerTicks(shown, step).map((frame) => (
                  <span
                    key={frame}
                    className="absolute top-0 h-full border-l border-border pl-1 tabular-nums"
                    style={{ left: offsetOfFrame(frame, pxPerFrame) }}
                  >
                    {frame}
                  </span>
                ))
              : null}
          </div>

          {[...tracks].reverse().map((track) => (
            <div
              key={track.id}
              data-testid="timeline-track"
              data-track-id={track.id}
              className="relative h-10 border-b border-border/50"
            >
              {pxPerFrame > 0
                ? track.clips.map((clip) => (
                    <ClipBlock
                      key={clip.id}
                      clip={clip}
                      source={sources.get(clip.sourceId)}
                      status={sourceStatus[clip.sourceId]}
                      pxPerFrame={pxPerFrame}
                    />
                  ))
                : null}
            </div>
          ))}

          {pxPerFrame > 0 ? (
            <div
              data-testid="timeline-playhead"
              data-frame={playheadFrame}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-red-500"
              style={{ left: offsetOfFrame(playheadFrame, pxPerFrame) }}
            >
              <div className="absolute -top-0.5 -left-1 size-2 rotate-45 bg-red-500" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
