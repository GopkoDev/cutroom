---
id: T041
title: "Implement Project creation on first import as a pure command sequence in…"
layer: "domain"
deps: ["T021", "T022"]
blocks: []
acs: ["AC-01", "AC-02", "AC-03"]
files_hint: ["packages/model/src/commands/import.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "M"
status: "done"
step: ""
---

# T041 — Implement Project creation on first import as a pure command sequence in…

## Place in the sequence

- **Blocked by:** T021, T022 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement Project creation on first import as a pure command sequence in….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T041 [US1] Implement Project creation on first import as a pure command sequence in `packages/model/src/commands/import.ts`: adopt the Source Timebase as the Project's Timebase and its dimensions as the Project's frame size, then add one Clip covering the whole Source at Frame 0. `apps/editor` only supplies the ids and calls it (FR-005, spec assumption) — **done**: `importSequence(project, request)` returns the commands and applies none, so the editor runs them inside one `transact` and the whole import is one undo step that aborts cleanly if any command is refused. Only the first Source sets up the Project: it copies that Source's Timebase and dimensions, and no later import changes them. The Clip's `durationFrames` is `framesForDuration` in the Project's Timebase, so this file does no rate arithmetic of its own. Four rules were chosen. **Every id is asked for every time**, and the Project and Track ids are ignored when a Project already exists, so the caller never has to know which kind of import it is making. **An import into an existing Project still places a Clip**, starting where the first video Track ends (Frame 0 on an empty Track, FR-005's case). Without it, a Source whose Timebase differs from the Project's could be listed but never seen; this bent the "one Clip" assumption, and the spec's assumption now says so (confirmed 2026-10-23). **Imports that can never succeed are refused before any command exists**, with a `CommandError`: a Source too short to cover one Frame, a malformed duration, or no video Track. Ids already in use stay the reducer's to refuse. **A new Project is named after its Source without the extension**, falling back to "Untitled Project"
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T041, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

Touches the persisted shapes: the Project Document and/or the IndexedDB stores (`projects`, `source-links`). No SQL, no staged migrations (this repository has none).

— `data-model.md §Entities, §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`@cutroom/model` public functions and types.

— `contracts/public-api.md, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-01 — happy

> **Given** an empty Project
> **When** the user picks a video file from their own machine
> **Then** the system reads the Source's duration, picture size and Source Timebase; a Source appears in the Source list with its name and duration; and one Clip covering the whole Source appears on the Timeline starting at Frame 0
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — happy

> **Given** an empty Project
> **When** the first Source is imported
> **Then** the Project adopts that Source's Timebase and picture size as its own Timebase and frame size, and the user is not asked to configure the Project before seeing anything
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — happy

> **Given** a Project that already holds a Clip on its video Track
> **When** the user imports another video file
> **Then** the new Source is placed whole as one more Clip, butt-joined where the video Track ends
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement Project creation on first import as a pure command sequence in `packages/model/src/commands/import.ts`: adopt the Source Timebase as the Project's Timebase and its dimensions as the Project's frame size, then add one Clip covering the whole Source at Frame 0. `apps/editor` only supplies the ids and calls it (FR-005, spec assumption)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
