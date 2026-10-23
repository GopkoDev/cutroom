---
id: T088
title: "Write `apps/editor/e2e/export-ignores-later-edits.spec.ts`"
layer: "tests"
deps: ["T013", "T076"]
blocks: []
acs: ["AC-30"]
files_hint: ["apps/editor/e2e/export-ignores-later-edits.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T088 — Write `apps/editor/e2e/export-ignores-later-edits.spec.ts`

## Place in the sequence

- **Blocked by:** T013, T076 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/export-ignores-later-edits.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T088 [P] [US3] Write `apps/editor/e2e/export-ignores-later-edits.spec.ts`: start an export, change the Timeline while it runs, let it finish, and assert the output matches the Timeline as it stood at the start. FR-019 is the one requirement in this phase that a correct-looking implementation can fail silently — the frozen Scene of T076 either travelled with the export or it did not, and nothing else reveals which (FR-019, spec edge case) — **done**: starts from three Clips (30 fps, 29.97, and the 30 fps fixture again under another name — 2700 Frames) and, while the export runs, edits through the editor's own buttons: import `silent-720p24` (4 Clips), undo, redo, undo, undo, leaving 2 Clips and 1800 Frames; it checks the export was still running when the edits finished (all done by Frame 32–52 of 2700). The output has 2700 packets on the 30 fps grid and 90 s of video, and counters at 12 Frames across all three Clips and both joins match the Timeline as it stood at the start; afterwards the Timeline still shows the edited state. Not mutation-tested: there is no simple way to make the controller export the live Timeline
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T088, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Write `apps/editor/e2e/export-ignores-later-edits.spec.ts`: start an export, change the Timeline while it runs, let it finish, and assert the output matches the Timeline as it stood at the start. FR-019 is the one requirement in this phase that a correct-looking implementation can fail silently — the frozen Scene of T076 either travelled with the export or it did not, and nothing else reveals which (FR-019, spec edge case)

## Edge cases

| Case | Behaviour |
|---|---|
| the user keeps editing the Timeline | the exported file reflects the Timeline as it was when the Export started, unaffected by the later edits |

## Definition of Done

- [x] Done as recorded: `export-ignores-later-edits.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
