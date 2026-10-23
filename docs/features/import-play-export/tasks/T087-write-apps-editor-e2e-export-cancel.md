---
id: T087
title: "Write `apps/editor/e2e/export-cancel.spec.ts` asserting cancellation within two seconds and no complete file…"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-25"]
files_hint: ["apps/editor/e2e/export-cancel.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T087 — Write `apps/editor/e2e/export-cancel.spec.ts` asserting cancellation within two seconds and no complete file…

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/export-cancel.spec.ts` asserting cancellation within two seconds and no complete file….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T087 [P] [US3] Write `apps/editor/e2e/export-cancel.spec.ts` asserting cancellation within two seconds and no complete file left behind (SC-009) — **done**: on the same 1800-Frame Project, timed in the page from the Cancel `click` to `export-cancelled` appearing, ≤ 2000 ms. Cancelled at once (0/1800): 16–24 ms, file removed (absent or empty), and the next export to the same name finishes with its size equal to `data-bytes`. Mid-run (≈650/1800): 17 ms, removed. Over an existing real MP4 (≈419/1800): 15–17 ms, file untouched and byte-identical
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T087, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-25 — error

> **Given** an Export is running
> **When** the user cancels it
> **Then** the Export stops promptly, and no partial file is left presented as finished
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/export-cancel.spec.ts` asserting cancellation within two seconds and no complete file left behind (SC-009)

## Edge cases

| Case | Behaviour |
|---|---|
| the user cancels it | the Export stops promptly, and no partial file is left presented as finished |

## Definition of Done

- [x] Done as recorded: `export-cancel.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
