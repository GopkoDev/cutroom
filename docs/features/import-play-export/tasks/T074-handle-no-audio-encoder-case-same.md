---
id: T074
title: "Handle the no-audio-encoder case in the same dialog"
layer: "ui"
deps: ["T032"]
blocks: []
acs: ["AC-27", "AC-28"]
files_hint: ["apps/editor/src/ui/ExportDialog.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T074 — Handle the no-audio-encoder case in the same dialog

## Place in the sequence

- **Blocked by:** T032 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Handle the no-audio-encoder case in the same dialog.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T074 [US3] Handle the no-audio-encoder case in the same dialog: say so before the export starts and require an explicit choice to continue without sound, never producing a silent file by default (FR-024) — **done**: if any Clip's Source has sound (Offline Sources count) and nothing can encode it, the dialog says so before starting, and Export stays disabled until "Export without sound" is ticked. A Timeline with no sound at all exports with no audio track and no question — there is nothing to lose, and the Preview was silent too — and the dialog says so
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T074, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-27 — error

> **Given** a Timeline with sound, on a machine that can encode no sound at all
> **When** the user opens Export
> **Then** the system says so before the Export starts and requires an explicit choice to continue without sound; it never produces a silent file without the user having chosen that
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

### AC-28 — happy

> **Given** a Timeline with no sound
> **When** the user exports it
> **Then** the file is written without a sound track and without asking, because no sound would be lost
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Handle the no-audio-encoder case in the same dialog: say so before the export starts and require an explicit choice to continue without sound, never producing a silent file by default (FR-024)

## Edge cases

| Case | Behaviour |
|---|---|
| the user opens Export | the system says so before the Export starts and requires an explicit choice to continue without sound; it never produces a silent file without the user having chosen that |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
