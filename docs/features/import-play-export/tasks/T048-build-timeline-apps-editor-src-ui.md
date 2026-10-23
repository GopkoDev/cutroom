---
id: T048
title: "Build the Timeline in `apps/editor/src/ui/Timeline.tsx`"
layer: "ui"
deps: ["T035", "T036"]
blocks: []
acs: ["AC-04", "AC-06"]
files_hint: ["apps/editor/src/ui/Timeline.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T048 — Build the Timeline in `apps/editor/src/ui/Timeline.tsx`

## Place in the sequence

- **Blocked by:** T035, T036 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Build the Timeline in `apps/editor/src/ui/Timeline.tsx`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T048 [US1] Build the Timeline in `apps/editor/src/ui/Timeline.tsx`: a ruler in Frames, one video Track, the Clip drawn to scale, and a draggable Playhead that snaps to whole Frames (FR-006, FR-007) — **done**: every pixel-to-Frame conversion happens in the pure `timeline-scale.ts`: nearest Frame, an exact half going up — `secondsToFrame`'s tie rule, so the two ways a position becomes a Frame cannot disagree — clamped to the Frames shown. The Timeline is fitted to its width and shows a tail of max(30, length/8) Frames past the last Clip, so the Playhead can reach the empty Frames FR-008 asks about, and it always includes the Playhead's Frame, because undo leaves the Playhead past a shortened Timeline on purpose (T034). The ruler is labelled in whole Frames on a 1-2-5 step. Clips span `[x(start), x(start+duration))`, so butt joins share one pixel boundary; an Offline Source's Clips are drawn dashed and stay in place (FR-022). Dragging uses pointer capture, and the keyboard reaches every Frame (arrows ±1, Shift ±10, Home, End). Moving the Playhead is `setPlayhead` alone: looking, not editing. 8 unit tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T048, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-04 — happy

> **Given** a Clip on the Timeline
> **When** the user moves the Playhead to any Frame within it
> **Then** the Preview shows the picture of that Frame
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** any Project
> **When** the user places or moves the Playhead, or the system stores a position on the Timeline
> **Then** the position is a whole Frame; the system never presents or stores a position between two Frames
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Build the Timeline in `apps/editor/src/ui/Timeline.tsx`: a ruler in Frames, one video Track, the Clip drawn to scale, and a draggable Playhead that snaps to whole Frames (FR-006, FR-007)

## Edge cases

| Case | Behaviour |
|---|---|
| the user places or moves the Playhead, or the system stores a position on the Timeline | the position is a whole Frame; the system never presents or stores a position between two Frames |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
