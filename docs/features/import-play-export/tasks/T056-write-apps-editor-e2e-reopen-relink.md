---
id: T056
title: "Write `apps/editor/e2e/reopen-and-relink.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-32", "AC-33", "AC-34"]
files_hint: ["apps/editor/e2e/reopen-and-relink.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T056 — Write `apps/editor/e2e/reopen-and-relink.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/reopen-and-relink.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T056 [P] [US1] Write `apps/editor/e2e/reopen-and-relink.spec.ts`: reload, assert the app lands on the Project list with the Project in it, open it, assert the Timeline is identical and the Source is marked Offline rather than silently wrong, re-grant, assert the Preview works without rebuilding the Timeline (SC-008, FR-020) — **done**: it reloads after the save has finished, and asserts that the app lands on the Project list with the Project in it, and that after opening it the Timeline is identical Clip for Clip (`data-clip-id`, start, duration, title) and in the store's `project.timeline` and `project.sources` JSON. The Source reads Offline with reason `needs-permission`, its Clip is drawn Offline, and `requestPermission` is never called before the user acts. One `relink-allow` makes it Linked with exactly one `requestPermission`, zero picks, the same document and the same undo depth, so the Timeline was not rebuilt. The Preview is read back from the canvas, not trusted from status: bright counter pixels before the reload and after the grant, all opaque black while Offline. **It found a bug, now fixed**: a Project reopened with every Source Offline never drew its first Frame — both requests reached the worker before `ready` and were answered `frames-dropped`, and nothing asked again, so the Preview stayed "nothing rendered yet" until the Playhead moved. The render effect in `EditorLayout.tsx` now also depends on `renderer`, which is set on `ready`, so the Frame is asked for again once the engine can draw it
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T056, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

### AC-33 — authorization

> **Given** a reopened Project whose Sources the browser no longer has permission to read
> **When** the Project opens
> **Then** each such Source shows as Offline and says the browser needs the user's permission again; it reattaches only after the user grants access by their own action, with no prompt on load
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)

### AC-34 — error

> **Given** a reopened Project whose Source file can no longer be reached (moved, renamed or deleted)
> **When** the Project opens
> **Then** that Source shows as Offline with the reason, and Relink is offered; picking the file again restores every Clip that references it at once
>
> — `spec.md §5, AC-34, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/reopen-and-relink.spec.ts`: reload, assert the app lands on the Project list with the Project in it, open it, assert the Timeline is identical and the Source is marked Offline rather than silently wrong, re-grant, assert the Preview works without rebuilding the Timeline (SC-008, FR-020)

## Edge cases

| Case | Behaviour |
|---|---|
| the Project opens | each such Source shows as Offline and says the browser needs the user's permission again; it reattaches only after the user grants access by their own action, with no prompt on load |
| the Project opens | that Source shows as Offline with the reason, and Relink is offered; picking the file again restores every Clip that references it at once |

## Definition of Done

- [x] Done as recorded: `reopen-and-relink.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
