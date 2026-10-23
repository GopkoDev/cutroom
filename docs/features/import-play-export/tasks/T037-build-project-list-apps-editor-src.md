---
id: T037
title: "Build the Project list in `apps/editor/src/ui/ProjectList.tsx`"
layer: "ui"
deps: ["T027"]
blocks: []
acs: ["AC-32"]
files_hint: ["apps/editor/src/ui/ProjectList.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T037 — Build the Project list in `apps/editor/src/ui/ProjectList.tsx`

## Place in the sequence

- **Blocked by:** T027 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** my Project kept between sessions without being asked to save, listed so I can reopen it, and its Sources reattached — or shown as Offline with a way to Relink them
> **So that** closing the tab, reloading or moving a file never costs me the Timeline I built
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Build the Project list in `apps/editor/src/ui/ProjectList.tsx`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T037 Build the Project list in `apps/editor/src/ui/ProjectList.tsx`: show what T027 returns, each Project with its name and when it was last modified, open one on click, and offer creating a new empty one. This is where the app lands when no Project is open, including after a reload. Without it FR-020's "list existing Projects so one can be reopened" has no surface the user can reach — a store that can enumerate Projects nobody can see does not satisfy the requirement, and quickstart's persistence walk-through asserts the screen, not the store — **done**, and "a new empty one" turned out to be the wrong shape, which is recorded here rather than papered over. The spec has the Project adopt the first Source's Timebase and picture size "so the user is not asked to configure a Project before seeing anything" (Assumptions, T041), and no command in this slice can change a Project's Timebase or frame size afterwards — so a Project created eagerly would be stuck with numbers we invented and the adoption could never happen; worse, `create-project` refuses to run when a Project is already open, so eager creation would make T041's sequence unrunnable. New Project therefore opens the editor with **no** Project document, and the first import brings one into being. That state was already required of the shell regardless, since undoing `create-project` returns to exactly it. The list itself keeps `listProjects`'s bargain: a Project this build cannot open is shown, disabled, naming its schema version and saying the work is still there — dropping it would undo the generosity that store went out of its way to provide — and a summary whose name is unusable is rendered as "Untitled Project" on the screen and never written back, since inventing a name in storage turns a display choice into an edit
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T037, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-32 — happy

> **Given** a user who has worked on a Project
> **When** they leave and come back in a later session, including after a reload or a browser restart
> **Then** the Project was kept without them being asked to save; the Project list shows it with its name and when it was last modified; and opening it shows the same Timeline
>
> — `spec.md §5, AC-32, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Build the Project list in `apps/editor/src/ui/ProjectList.tsx`: show what T027 returns, each Project with its name and when it was last modified, open one on click, and offer creating a new empty one. This is where the app lands when no Project is open, including after a reload. Without it FR-020's "list existing Projects so one can be reopened" has no surface the user can reach — a store that can enumerate Projects nobody can see does not satisfy the requirement, and quickstart's persistence walk-through asserts the screen, not the store

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
