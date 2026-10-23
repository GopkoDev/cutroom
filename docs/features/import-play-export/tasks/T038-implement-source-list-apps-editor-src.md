---
id: T038
title: "Implement the Source list in `apps/editor/src/ui/SourcesPanel.tsx` — named for what it holds, since…"
layer: "ui"
deps: ["T034", "T035", "T036"]
blocks: []
acs: ["AC-01", "AC-08"]
files_hint: ["apps/editor/src/ui/SourcesPanel.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T038 — Implement the Source list in `apps/editor/src/ui/SourcesPanel.tsx` — named for what it holds, since…

## Place in the sequence

- **Blocked by:** T034, T035, T036 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the Source list in `apps/editor/src/ui/SourcesPanel.tsx` — named for what it holds, since….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T038 [US1] Implement the Source list in `apps/editor/src/ui/SourcesPanel.tsx` — named for what it holds, since CONTEXT.md lists "Media" among the words to avoid for a Source: `showOpenFilePicker` behind a user gesture, storing the handle via the link table, handing the resolved `File` to the engine, and rendering each Source as a row carrying its name and duration once `source-attached` returns (FR-001, FR-002, FR-004) — **done**: a click opens `showOpenFilePicker` as its first act, with **no type filter**: whether a file can be used is the engine's to say at runtime (Principle I), and FR-003 wants the user to see the refusal of an audio-only file or a still, not to find it unpickable. `importPickedFile` runs in a fixed order: read the `File` → `attach-source` → link-table row → the model's `importSequence` inside one `transact` → mark Linked. The engine reads the file before anything is written, so a `source-failed` leaves the Project untouched with nothing to roll back, and the handle is stored before the document names the Source, so no Project names a Source this machine was never told how to reach. One gap: if the model refuses after the link row is written, that row is orphaned, because the link table has no delete — harmless, since it is keyed by an id nothing uses. Each row shows the name, the duration (the Source's length in Project Frames, the same count the Clip gets, as timecode and count) and Linked/Offline/Checking. 6 unit tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T038, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy

> **Given** an empty Project
> **When** the user picks a video file from their own machine
> **Then** the system reads the Source's duration, picture size and Source Timebase; a Source appears in the Source list with its name and duration; and one Clip covering the whole Source appears on the Timeline starting at Frame 0
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a user importing a video file
> **When** the import completes
> **Then** the Source is addressed where it already lives and its contents are never copied into the product's own storage
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the Source list in `apps/editor/src/ui/SourcesPanel.tsx` — named for what it holds, since CONTEXT.md lists "Media" among the words to avoid for a Source: `showOpenFilePicker` behind a user gesture, storing the handle via the link table, handing the resolved `File` to the engine, and rendering each Source as a row carrying its name and duration once `source-attached` returns (FR-001, FR-002, FR-004)

## Edge cases

| Case | Behaviour |
|---|---|
| the import completes | the Source is addressed where it already lives and its contents are never copied into the product's own storage |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
