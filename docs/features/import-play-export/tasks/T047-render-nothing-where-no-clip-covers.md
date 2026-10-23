---
id: T047
title: "Render nothing where no Clip covers the Frame, so the Preview goes empty past the end of the Clip instead of…"
layer: "app"
deps: ["T031"]
blocks: []
acs: ["AC-05"]
files_hint: ["packages/engine/src/compose/"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T047 — Render nothing where no Clip covers the Frame, so the Preview goes empty past the end of the Clip instead of…

## Place in the sequence

- **Blocked by:** T031 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Render nothing where no Clip covers the Frame, so the Preview goes empty past the end of the Clip instead of….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T047 [US1] Render nothing where no Clip covers the Frame, so the Preview goes empty past the end of the Clip instead of holding the last Frame (FR-008, US1 scenario 3) — **done**: a Clip that does not cover the Frame is never asked for a picture, and the renderer rebuilds the stage from the pictures it is given and destroys the sprites of Clips not drawn. With `clearBeforeRender`, a Frame no Clip covers is the opaque black background and nothing else. A covering Clip whose Source is not attached, or has no picture at that time, renders empty the same way. Checked in a real worker: Frame 30 of a 24-Frame Clip read back entirely black
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T047, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-05 — domain invariant

> **Given** a Clip on the Timeline
> **When** the user moves the Playhead past the end of the Clip, or to any Frame with no Clip under it
> **Then** the Preview shows nothing for that Frame rather than the last Frame or a neighbouring one, because the Preview shows the composited result of the Timeline
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Render nothing where no Clip covers the Frame, so the Preview goes empty past the end of the Clip instead of holding the last Frame (FR-008, US1 scenario 3)

## Edge cases

| Case | Behaviour |
|---|---|
| the user moves the Playhead past the end of the Clip, or to any Frame with no Clip under it | the Preview shows nothing for that Frame rather than the last Frame or a neighbouring one, because the Preview shows the composited result of the Timeline |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
