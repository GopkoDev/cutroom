---
id: T058
title: "Assert in `apps/editor/e2e/undo-does-not-touch-status.spec.ts` that undo after an import restores the…"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-38"]
files_hint: ["apps/editor/e2e/undo-does-not-touch-status.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T058 — Assert in `apps/editor/e2e/undo-does-not-touch-status.spec.ts` that undo after an import restores the…

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Assert in `apps/editor/e2e/undo-does-not-touch-status.spec.ts` that undo after an import restores the….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T058 [P] [US1] Assert in `apps/editor/e2e/undo-does-not-touch-status.spec.ts` that undo after an import restores the document without changing any Source's Linked/Offline status — **done**: every import goes through the panel, and every status change comes from the real tracker — the file renamed on disk and the window refocused; no test calls `markSource` itself. The status is moved after the import, in both directions, before anything is undone, because a status still equal to what it was at import time would also pass against an undo that "restored" it. Three cases: undoing the first import leaves `sourceStatus` intact and redo shows the row Linked at once; a Source that went Offline after two imports stays Offline, reason included, through undo, undo and redo, and going Offline adds no history entry; a Source that was Offline when the second Source came in, and has since come back, stays Linked when that import is undone. 3 tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T058, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-38 — domain invariant

> **Given** a Source that is Linked or Offline
> **When** the user undoes or redoes an edit
> **Then** the Source's Linked or Offline status is unchanged, because it belongs to the machine and the moment, not to the Project
>
> — `spec.md §5, AC-38, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Assert in `apps/editor/e2e/undo-does-not-touch-status.spec.ts` that undo after an import restores the document without changing any Source's Linked/Offline status

## Edge cases

| Case | Behaviour |
|---|---|
| the user undoes or redoes an edit | the Source's Linked or Offline status is unchanged, because it belongs to the machine and the moment, not to the Project |

## Definition of Done

- [x] Done as recorded: `undo-does-not-touch-status.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
