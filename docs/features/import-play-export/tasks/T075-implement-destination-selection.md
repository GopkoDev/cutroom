---
id: T075
title: "Implement destination selection"
layer: "app"
deps: []
blocks: []
acs: ["AC-21", "AC-29"]
files_hint: ["apps/editor/src/store/export.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T075 — Implement destination selection

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement destination selection.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T075 [US3] Implement destination selection: `showSaveFilePicker`, `createWritable`, and transfer of the `FileSystemWritableFileStream` to the worker (FR-015, research R4) — **done**: the click calls `showSaveFilePicker` before any `await`, opens `createWritable()` on the main thread, and transfers the `writable` of `forwardingWritable(file)`, because Chrome will not transfer the file stream itself ("could not be cloned"). "Done" is shown only after both `export-done` and `committed`; a commit that fails is a failure. Closing the picker starts nothing. **Guarded**: a destination that is the same file as any Source's handle (`isSameEntry`, asked of the Source status tracker through `sourceAt`, so handles stay out of the store) is refused before it is read or opened and shown as `export-refused`; the Source's file is left byte for byte as it was and a later export to another name finishes (unit tests and `export-refuses-a-source.spec.ts`, which fails with the guard unwired). Whether real Chrome's save picker empties an existing file the moment it is picked — which would make the guard too late — is not verified; see decisions.md
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T075, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-21 — happy

> **Given** a Project with one Clip
> **When** the user exports and chooses where the file goes
> **Then** a single MP4 file is written to the chosen location, containing every Frame of the Timeline and its sound, matching what the Preview showed
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-29 — error

> **Given** a Project whose Source reads from a file on the user's disk
> **When** the user chooses that same file as the Export's destination
> **Then** the system refuses to export over it and says why, and the Source's file is left untouched
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement destination selection: `showSaveFilePicker`, `createWritable`, and transfer of the `FileSystemWritableFileStream` to the worker (FR-015, research R4)

## Edge cases

| Case | Behaviour |
|---|---|
| the user chooses that same file as the Export's destination | the system refuses to export over it and says why, and the Source's file is left untouched |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
