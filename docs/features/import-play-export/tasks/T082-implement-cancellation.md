---
id: T082
title: "Implement cancellation"
layer: "app"
deps: ["T078"]
blocks: []
acs: ["AC-25"]
files_hint: ["packages/engine/src/export/run.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T082 — Implement cancellation

## Place in the sequence

- **Blocked by:** T078 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement cancellation.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T082 [US3] Implement cancellation: abort the loop, close the writable stream without finalizing, delete or leave clearly unfinished output, and answer `export-cancelled` within two seconds (FR-018, SC-009) — **engine half done**: stops the loop and every wait (each races a stop signal, so cancel never queues behind an encode or decode), aborts the stream so nothing is committed, and answers `export-cancelled` — measured 1.4 ms, file 0 bytes, `committed` rejected; the running-export slot clears on the answer. Stray export messages with none running are ignored; a second `export-start` while one runs is `fatal`. UI half: Cancel sends `export-cancel` and aborts the mix; the dialog shows "Cancelling…" until `export-cancelled` (89 ms measured through the UI) and then says what became of the file
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T082, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-25 — error

> **Given** an Export is running
> **When** the user cancels it
> **Then** the Export stops promptly, and no partial file is left presented as finished
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement cancellation: abort the loop, close the writable stream without finalizing, delete or leave clearly unfinished output, and answer `export-cancelled` within two seconds (FR-018, SC-009)

## Edge cases

| Case | Behaviour |
|---|---|
| the user cancels it | the Export stops promptly, and no partial file is left presented as finished |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
