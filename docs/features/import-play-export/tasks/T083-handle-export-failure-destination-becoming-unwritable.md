---
id: T083
title: "Handle export failure — the destination becoming unwritable or the encoder erroring — by reporting…"
layer: "app"
deps: ["T078"]
blocks: []
acs: ["AC-26"]
files_hint: ["packages/engine/src/export/run.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T083 — Handle export failure — the destination becoming unwritable or the encoder erroring — by reporting…

## Place in the sequence

- **Blocked by:** T078 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Handle export failure — the destination becoming unwritable or the encoder erroring — by reporting….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T083 [US3] Handle export failure — the destination becoming unwritable or the encoder erroring — by reporting `export-failed` and never presenting a partial file as complete (spec edge case) — **done**: encoder errors, writes the worker sees fail, a malformed audio stream, a Source going Offline or relinked mid-export, and setup or finalize errors all produce `export-failed { reason }` with the stream aborted first, so a failure never has a committed file behind it. A failure the worker cannot see — a write or commit failing on the main thread — surfaces only through `committed`. A Source already Offline at the start renders empty, as in the Preview. Checked: a malformed audio stream (failed after 38 ms) and a detached Source both gave `export-failed` with a 0-byte file — **UI half done**: `export-failed`, the engine stopping, a failed commit and a failed mix are all shown plainly as failures (a mix failure cancels the export, so it never quietly finishes silent). On any ending short of done the file is compared with a size and modification-time snapshot taken at pick time: changed or empty, it is removed; unchanged and non-empty, it is the user's own file and stays (checked: cancelling over an existing 1000-byte file left it intact); unremovable, the dialog says it is unfinished. Only `export-done` plus a committed file is shown as finished
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T083, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-26 — error

> **Given** an Export is running
> **When** it fails, or the destination runs out of space or stops accepting writes partway
> **Then** the failure is reported plainly, and no partial file is presented as finished. This is one rule, and it covers every way an Export can end short: cancelled, failed or interrupted
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Handle export failure — the destination becoming unwritable or the encoder erroring — by reporting `export-failed` and never presenting a partial file as complete (spec edge case)

## Edge cases

| Case | Behaviour |
|---|---|
| it fails, or the destination runs out of space or stops accepting writes partway | the failure is reported plainly, and no partial file is presented as finished. This is one rule, and it covers every way an Export can end short: cancelled, failed or interrupted |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
