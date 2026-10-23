---
id: T051
title: "Implement Source status as a plain store action outside the undo history in…"
layer: "app"
deps: ["T034"]
blocks: []
acs: ["AC-33", "AC-34", "AC-36", "AC-37"]
files_hint: ["apps/editor/src/store/source-status.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "M"
status: "done"
step: ""
---

# T051 — Implement Source status as a plain store action outside the undo history in…

## Place in the sequence

- **Blocked by:** T034 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement Source status as a plain store action outside the undo history in….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T051 [US1] Implement Source status as a plain store action outside the undo history in `apps/editor/src/store/source-status.ts`: mark a Source Offline when its handle is missing, permission is not granted, or `getFile()` throws, and render its Clips as empty (FR-021, FR-022). Checked on three occasions, not one — when a Project is opened, when the window regains focus, and whenever a read of the file fails mid-session. The last is what the "file moved or deleted while the Project is open" edge case actually needs: a Source that vanishes under a running Project must go Offline on the next Frame it is asked for, not at the next reload, or the Preview keeps showing pictures that no longer have a file behind them — **done**: every status write is `markSource`, a plain `set`, so undo cannot change one, and a test proves undoing an import leaves the status alone. An Offline Source now carries a reason — `needs-permission`, `never-linked-here`, `unreachable` or `unreadable` (the file is there but the engine refused it) — while the status stays two-valued. Status is derived again on three occasions only: on open (`checkAll`, `queryPermission` only, no prompt), on window focus, and mid-session — a coalesced `getFile()` check of Linked Sources on every Playhead move, plus a `source-failed` for an already-attached Source. A handle whose file has changed size is `unreachable`, the same rule a Relink applies. Going Offline sends `detach-source`, which the worker answers with `releaseSource`; coming back attaches the fresh `File`. The status is written only after the attach settles, and the shell re-asks for the Frame on every status change, so the Preview empties or fills with no Scene change. Handles stay in the tracker, not the store (ADR 0004), so a re-grant can call `requestPermission` synchronously. Open contract question: the engine renders a read failure during scrub as an empty Clip and does not send `source-failed`, so the mid-session path currently relies on the `getFile()` check alone. 13 unit tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T051, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

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

### AC-36 — cross-context

> **Given** a Clip whose Source has become Offline
> **When** the Timeline is shown or played
> **Then** the Clip stays on the Timeline and shows nothing; it becomes usable again once the Source is reattached, without the user rebuilding the Timeline
>
> — `spec.md §5, AC-36, verbatim` · full text: [spec.md](../spec.md)

### AC-37 — cross-context

> **Given** a Project open with a Frame showing
> **When** the Source's file is moved or deleted and the Playhead moves
> **Then** the Source is reported Offline from the next Frame the Preview is asked to draw, not only after a reload, and the Preview shows no stale picture
>
> — `spec.md §5, AC-37, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement Source status as a plain store action outside the undo history in `apps/editor/src/store/source-status.ts`: mark a Source Offline when its handle is missing, permission is not granted, or `getFile()` throws, and render its Clips as empty (FR-021, FR-022). Checked on three occasions, not one — when a Project is opened, when the window regains focus, and whenever a read of the file fails mid-session. The last is what the "file moved or deleted while the Project is open" edge case actually needs: a Source that vanishes under a running Project must go Offline on the next Frame it is asked for, not at the next reload, or the Preview keeps showing pictures that no longer have a file behind them

## Edge cases

| Case | Behaviour |
|---|---|
| the Project opens | each such Source shows as Offline and says the browser needs the user's permission again; it reattaches only after the user grants access by their own action, with no prompt on load |
| the Project opens | that Source shows as Offline with the reason, and Relink is offered; picking the file again restores every Clip that references it at once |
| the Timeline is shown or played | the Clip stays on the Timeline and shows nothing; it becomes usable again once the Source is reattached, without the user rebuilding the Timeline |
| the Source's file is moved or deleted and the Playhead moves | the Source is reported Offline from the next Frame the Preview is asked to draw, not only after a reload, and the Preview shows no stale picture |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
