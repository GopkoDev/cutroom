---
id: T046
title: "Draw one `SceneClip` in `packages/engine/src/compose/scene-clip.ts`"
layer: "app"
deps: ["T031"]
blocks: []
acs: ["AC-07"]
files_hint: ["packages/engine/src/compose/scene-clip.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T046 — Draw one `SceneClip` in `packages/engine/src/compose/scene-clip.ts`

## Place in the sequence

- **Blocked by:** T031 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Draw one `SceneClip` in `packages/engine/src/compose/scene-clip.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T046 [US1] Draw one `SceneClip` in `packages/engine/src/compose/scene-clip.ts`: wrap the sink's canvas as a PixiJS texture source, update it per Frame, and fit the Source's dimensions into the Project's frame size (FR-009) — **done**: `fitInside` is "contain", centred, with floored offsets, comparing aspects by cross-multiplication so a Source with the Frame's exact aspect fills it exactly; pixel rounding here is about space, not time. `createSceneClipSprite` wraps the sink's canvas as a `CanvasSource` once and calls `update()` on later Frames. The source must be given `width`, `height` and `resolution: 1` explicitly: without them it divides by an undefined resolution and resizes, and so clears, the canvas it was handed. Outside the fitted rectangle nothing is painted, so a lower Track or the black stage shows through rather than bars of our own. Checked: a 1280×720 Source in a 640×480 Project lands at y=60, 640×360
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T046, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-07 — domain invariant

> **Given** a Source whose own picture size or aspect differs from the Project's frame size
> **When** the Preview shows one of its Frames
> **Then** the picture is shown at the Project's frame size and aspect, regardless of the Source's own dimensions
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Draw one `SceneClip` in `packages/engine/src/compose/scene-clip.ts`: wrap the sink's canvas as a PixiJS texture source, update it per Frame, and fit the Source's dimensions into the Project's frame size (FR-009)

## Edge cases

| Case | Behaviour |
|---|---|
| the Preview shows one of its Frames | the picture is shown at the Project's frame size and aspect, regardless of the Source's own dimensions |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
