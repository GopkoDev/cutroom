---
id: T076
title: "Freeze the Scene at export start in `apps/editor/src/store/export.ts` and send it inside `export-start`, so…"
layer: "app"
deps: ["T034"]
blocks: ["T088"]
acs: ["AC-30"]
files_hint: ["apps/editor/src/store/export.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T076 — Freeze the Scene at export start in `apps/editor/src/store/export.ts` and send it inside `export-start`, so…

## Place in the sequence

- **Blocked by:** T034 · **Blocks:** T088 · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Freeze the Scene at export start in `apps/editor/src/store/export.ts` and send it inside `export-start`, so….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T076 [US3] Freeze the Scene at export start in `apps/editor/src/store/export.ts` and send it inside `export-start`, so later edits cannot affect the running export (FR-019) — **done**: `store/export.ts` captures the Scene with `projectScene(project)` in the click's own task; it is frozen and shares nothing with the Project, and the same object goes into `export-start` and to the mixer, so the picture and the sound are of one Timeline. Editing carries on during an export; a unit test edits the Timeline mid-export and checks the posted Scene still has 1 Clip of 300 Frames. One export at a time: a second start while choosing a destination, running or cancelling is refused before the picker opens, and the engine client refuses too; "Projects" is disabled and the page asks before unloading while an export is in hand
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T076, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-30 — cross-context

> **Given** an Export is running
> **When** the user keeps editing the Timeline
> **Then** the exported file reflects the Timeline as it was when the Export started, unaffected by the later edits
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Freeze the Scene at export start in `apps/editor/src/store/export.ts` and send it inside `export-start`, so later edits cannot affect the running export (FR-019)

## Edge cases

| Case | Behaviour |
|---|---|
| the user keeps editing the Timeline | the exported file reflects the Timeline as it was when the Export started, unaffected by the later edits |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
