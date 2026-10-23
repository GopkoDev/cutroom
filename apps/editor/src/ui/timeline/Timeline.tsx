// The Timeline: a ruler in Frames, the video Tracks with their headers, their Clips to scale, and
// the Playhead (FR-006, FR-007; editing: screens.md SCR-02, ADR 0021).
//
// Everything drawn here is a whole Frame. The ruler is labelled in Frames, Clips start and end on
// Frame boundaries, and the Playhead can only be put on a Frame: a pointer position becomes an
// integer in `frameAtOffset` before it reaches the store, so no position between two Frames can be
// expressed, shown or stored (FR-006). Seconds never appear — the timecode is the top bar's, and it
// is derived from the same integer.
//
// The Playhead is runtime state. Moving it is `setPlayhead`, a plain `set`: no command, no
// transaction, no undo step — dragging the Playhead is looking, not editing (data-model.md). The
// Selection is runtime state the same way: a click, a modifier click or a click on a Gap changes
// it and records nothing (AC-14).
//
// The whole Timeline is fitted to the panel's width. It shows a little more than its own length
// (`visibleFrames`) so that the Playhead can be taken past the end of the last Clip, where the
// Preview must go empty rather than hold the last Frame (FR-008), and it always shows the Frame the
// Playhead is on, even one far past the end (T034).
//
// Tracks are drawn the other way up from the Scene's order: `tracks[0]` is backmost, so it is drawn
// at the bottom, and the upper Track — which covers it — above it (data-model.md, AC-20).
//
// ## One press, three gestures
//
// The body captures the pointer for the whole of a press, so it alone tells apart what the press
// is. It reads what is under the pointer from the elements (`data-clip-id`, `data-handle`):
//
//   * **on a Gap or the ruler** — a scrub, as in step 1: the Playhead follows the pointer; a press
//     on a Gap that does not move also clears the Selection;
//   * **on a Clip** — the Playhead goes to the pressed Frame, as anywhere on the Timeline
//     (screens.md S4, FR-007), and the Clip is selected: alone, or toggled with Shift or ⌘. A
//     press on one of its handles is the same press; only what a drag from it does differs.
//
// A press on a Clip that moves past `DRAG_THRESHOLD_PX` becomes a drag (ADR 0020): a Trim from a
// handle, a move from the body. From then on pointer moves go to the drag controller, which asks
// the model where the edge stops or whether the Clips can land, and touch nothing else — the
// Playhead stays put, the Project and the engine are untouched until release. Release commits
// one command; Escape, or losing the pointer, cancels (AC-19).
//
// ## Render cost
//
// While playing, the Playhead moves every Frame. So only `TimelineBody` — the slider's element and
// the Playhead line on it — reads `playheadFrame`; the ruler and the Tracks are built by `Timeline`,
// which reads only how many Frames are shown and which Tracks exist, and handed to the body as
// children it does not rebuild (T072). Each Track row subscribes to its own Clips and each Clip to
// its own mark (ADR 0021).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react"
import { useShallow } from "zustand/react/shallow"

import { cn } from "@/lib/utils"
import { useEditorStore } from "@/store"

import { useEditing } from "../editing-context"
import { Notice } from "../Notice"
import {
  frameAtOffset,
  offsetOfFrame,
  rulerStep,
  rulerTicks,
  visibleFrames,
} from "../timeline-scale"
import { AddTrackButton, TrackHeader } from "./TrackHeader"
import { TrackRow } from "./TrackRow"

const TRACK_HEADER_WIDTH = "w-24"

/** How far a press may wander, in pixels, and still be a click rather than a drag. */
export const DRAG_THRESHOLD_PX = 3

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

/**
 * How many Frames the Timeline shows: a little more than its length, and always the Playhead's
 * Frame. A selector, so the Timeline re-renders when this changes and not on every Playhead move.
 */
function shownFramesOf(state: {
  project: { timeline: { durationFrames: number } } | null
  playheadFrame: number
}): number {
  return Math.max(
    visibleFrames(state.project?.timeline.durationFrames ?? 0),
    state.playheadFrame + 1
  )
}

/**
 * The Timeline's body: the Playhead slider and the Playhead drawn on it. The only part of the
 * Timeline that reads the Playhead; `children` (the ruler and the Tracks) come from `Timeline` and
 * are the same elements from one Playhead move to the next, so React leaves them alone.
 */
function TimelineBody({
  bodyRef,
  shown,
  pxPerFrame,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  children,
}: {
  readonly bodyRef: RefObject<HTMLDivElement | null>
  readonly shown: number
  readonly pxPerFrame: number
  readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  readonly onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  readonly onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  readonly children: ReactNode
}) {
  const playheadFrame = useEditorStore((state) => state.playheadFrame)

  return (
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
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {children}

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
  )
}

/** The refusal notice above the Tracks (screens.md S1): why an edit did not happen. */
function EditRefusalNotice() {
  const refusal = useEditorStore((state) => state.editRefusal)
  const dismiss = useEditorStore((state) => state.reportEditRefusal)
  if (refusal === null) return null
  return (
    <Notice
      testId="edit-refusal"
      tone="attention"
      title={refusal.title}
      details={refusal.detail ?? null}
      data={{ "data-reason": refusal.reason }}
      className="mx-3 mb-1"
      actions={[
        {
          label: "Dismiss",
          testId: "edit-refusal-dismiss",
          variant: "outline",
          onClick: () => {
            dismiss(null)
          },
        },
      ]}
    >
      <p>{refusal.explanation}</p>
    </Notice>
  )
}

/** What a press on the body is, decided when it lands. */
type Press =
  | { readonly kind: "scrub"; readonly onTrack: boolean; readonly x: number; readonly y: number }
  | {
      readonly kind: "clip"
      readonly clipId: string
      /** `null` for the body, else which handle. */
      readonly handle: "head" | "tail" | null
      /** A press on an already-selected Clip without a modifier selects it alone on release. */
      readonly collapseOnRelease: boolean
      readonly x: number
      readonly y: number
      /** The edge's Frame when the press landed, for a Trim; the Clip's start for a move. */
      readonly fromFrame: number
      /** Set once the press has become a drag. */
      dragging: boolean
    }

export function Timeline() {
  const hasProject = useEditorStore((state) => state.project !== null)
  const durationFrames = useEditorStore((state) => state.project?.timeline.durationFrames ?? 0)
  // Bottom Track last: the order they are drawn in, top to bottom.
  const trackIds = useEditorStore(
    useShallow((state) =>
      [...(state.project?.timeline.tracks ?? [])].reverse().map((track) => track.id)
    )
  )
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const shown = useEditorStore(shownFramesOf)

  const [bodyRef, bodyWidth] = useWidth<HTMLDivElement>()
  const press = useRef<Press | null>(null)
  const editing = useEditing()

  // Escape cancels an open drag (AC-19). Listening on the window, because a drag's pointer is
  // captured by the body but the key goes wherever focus is.
  useEffect(() => {
    if (editing === null) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || useEditorStore.getState().drag === null) return
      event.preventDefault()
      event.stopImmediatePropagation()
      editing.drag.cancel()
      press.current = null
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [editing])

  const pxPerFrame = bodyWidth > 0 ? bodyWidth / shown : 0
  const step = rulerStep(pxPerFrame)

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

    const target = event.target instanceof Element ? event.target : null
    const clipElement = target?.closest<HTMLElement>("[data-clip-id]") ?? null
    const clipId = clipElement?.dataset.clipId
    if (clipElement === null || clipId === undefined) {
      press.current = {
        kind: "scrub",
        onTrack: target?.closest("[data-testid=timeline-track]") != null,
        x: event.clientX,
        y: event.clientY,
      }
      moveTo(event.clientX, event.currentTarget)
      return
    }

    const handleName = target?.closest<HTMLElement>("[data-handle]")?.dataset.handle
    const handle = handleName === "head" || handleName === "tail" ? handleName : null
    const state = useEditorStore.getState()
    const start = Number(clipElement.dataset.startFrame)
    const length = Number(clipElement.dataset.durationFrames)
    const modifier = event.shiftKey || event.metaKey || event.ctrlKey
    const wasSelected = state.selection.includes(clipId)
    if (modifier) state.toggleSelected(clipId)
    else if (!wasSelected) state.select(clipId)
    press.current = {
      kind: "clip",
      clipId,
      handle,
      collapseOnRelease: !modifier && wasSelected,
      x: event.clientX,
      y: event.clientY,
      fromFrame: handle === "tail" ? start + length : start,
      dragging: false,
    }
    moveTo(event.clientX, event.currentTarget)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const current = press.current
    if (current === null) return
    if (current.kind === "scrub") {
      moveTo(event.clientX, event.currentTarget)
      return
    }
    if (editing === null || pxPerFrame <= 0) return

    if (!current.dragging) {
      const moved =
        Math.abs(event.clientX - current.x) > DRAG_THRESHOLD_PX ||
        Math.abs(event.clientY - current.y) > DRAG_THRESHOLD_PX
      if (!moved) return
      current.dragging = true
      if (current.handle === null) editing.drag.openMove(current.clipId)
      else editing.drag.openTrim(current.clipId, current.handle)
    }

    // Whole Frames only: the pointer's distance from where it pressed, rounded to a Frame.
    const delta = Math.round((event.clientX - current.x) / pxPerFrame)
    if (current.handle !== null) {
      editing.drag.trimTo(current.fromFrame + delta)
      return
    }
    editing.drag.moveTo(delta, trackUnder(event.clientX, event.clientY, current.clipId))
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = press.current
    press.current = null
    if (current === null) return
    if (current.kind === "clip" && current.dragging) {
      // A pointer that is cancelled, rather than released, drops the drag (AC-19).
      if (event.type === "pointercancel") editing?.drag.cancel()
      else editing?.drag.release()
      return
    }
    const moved =
      Math.abs(event.clientX - current.x) > DRAG_THRESHOLD_PX ||
      Math.abs(event.clientY - current.y) > DRAG_THRESHOLD_PX
    if (moved) return
    const state = useEditorStore.getState()
    if (current.kind === "scrub") {
      // A click on a Gap clears the Selection (AC-14); a click on the ruler only scrubs.
      if (current.onTrack) state.clearSelection()
    } else if (current.collapseOnRelease) {
      state.select(current.clipId)
    }
  }

  /** The Track row under the pointer, or the grabbed Clip's own Track when it is over none. */
  function trackUnder(clientX: number, clientY: number, clipId: string): string {
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      if (element instanceof HTMLElement && element.dataset.testid === "timeline-track") {
        const id = element.dataset.trackId
        if (id !== undefined) return id
      }
    }
    const project = useEditorStore.getState().project
    const own = project?.timeline.tracks.find((track) =>
      track.clips.some((clip) => clip.id === clipId)
    )
    return own?.id ?? ""
  }

  // The keyboard reaches every Frame too, one at a time: FR-007 is "any Frame", and a pointer on a
  // narrow panel cannot pick out one Frame in an hour of them.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const playheadFrame = useEditorStore.getState().playheadFrame
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
      className="flex shrink-0 flex-col border-t"
    >
      <div className="flex shrink-0 items-baseline gap-3 px-3 pt-2 pb-1">
        <h2 className="text-xs font-medium text-muted-foreground">Timeline</h2>
        <p data-testid="timeline-duration" className="text-xs">
          {durationFrames === 0
            ? "Empty — no Clips yet."
            : `${durationFrames} Frames across ${trackIds.length} Track(s).`}
        </p>
      </div>

      <EditRefusalNotice />

      <div className="flex min-h-0 flex-1 px-3 pb-2">
        <div
          className={cn(
            "flex shrink-0 flex-col text-[0.625rem] text-muted-foreground",
            TRACK_HEADER_WIDTH
          )}
        >
          <div className="flex h-5 shrink-0 items-center">
            {hasProject ? <AddTrackButton /> : null}
          </div>
          {trackIds.map((trackId) => (
            <TrackHeader key={trackId} trackId={trackId} />
          ))}
        </div>

        <TimelineBody
          bodyRef={bodyRef}
          shown={shown}
          pxPerFrame={pxPerFrame}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
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

          <div role="listbox" aria-label="Clips" aria-multiselectable>
            {trackIds.map((trackId) => (
              <TrackRow
                key={trackId}
                trackId={trackId}
                trackOrder={trackIds}
                pxPerFrame={pxPerFrame}
              />
            ))}
          </div>
        </TimelineBody>
      </div>
    </section>
  )
}
