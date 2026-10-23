---
id: T081
title: "Report progress as `export-progress` and render it in the dialog with elapsed and estimated remaining time…"
layer: "ui"
deps: ["T078"]
blocks: []
acs: ["AC-24"]
files_hint: ["packages/engine/src/export/run.ts", "apps/editor/src/ui/ExportDialog.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T081 — Report progress as `export-progress` and render it in the dialog with elapsed and estimated remaining time…

## Place in the sequence

- **Blocked by:** T078 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Report progress as `export-progress` and render it in the dialog with elapsed and estimated remaining time….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T081 [US3] Report progress as `export-progress` and render it in the dialog with elapsed and estimated remaining time (FR-018) — **engine half done**: `export-progress { framesDone, framesTotal }` at most every 100 ms, always for 0 and the last Frame. UI half: Frames done / total, percent, elapsed and estimated time left from the pace so far, updated twice a second while the editor stays usable. Checked: 900 Frames at 1080p exported in 4 s through the dialog
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T081, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-24 — happy

> **Given** an Export is running
> **When** the user watches it
> **Then** progress is reported in terms they can act on: how much is done, and roughly how long remains
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Report progress as `export-progress` and render it in the dialog with elapsed and estimated remaining time (FR-018)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
