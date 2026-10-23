---
id: T093
title: "Make every failure the user can hit legible"
layer: "ui"
deps: []
blocks: []
acs: ["AC-09", "AC-26", "AC-33", "AC-34"]
files_hint: ["apps/editor/src/ui/failure-wording.ts", "apps/editor/src/ui/Notice.tsx", "docs/features/import-play-export/_evidence/failures.md"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "M"
status: "done"
step: ""
---

# T093 — Make every failure the user can hit legible

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 6 — Polish & Cross-Cutting Concerns (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** user
> **I want** my Project kept between sessions without being asked to save, listed so I can reopen it, and its Sources reattached — or shown as Offline with a way to Relink them
> **So that** closing the tab, reloading or moving a file never costs me the Timeline I built
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Make every failure the user can hit legible.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T093 [P] Make every failure the user can hit legible: undecodable file, permission denied, Source offline, export failed, worker fatal — each with a plain statement and, where applicable, an action — **done**: every failure a user can hit follows one rule — a plain statement in the product's terms, the action beside it (Allow access / Find the file… / Try again / Choose another name… / Choose another file… / Reload), and the platform's or engine's own words folded under "Details" — rendered by one `Notice` component with words from the pure, unit-tested `failure-wording.ts`, which never shows `[object Object]`. The inventory is `failures.md` (about 45 rows: trigger, screen, action, covering test). Three silent failures surfaced: a failed save (now a banner with Try again, "Projects" and unload held while it lasts), storage blocked by another tab (wired for the first database upgrade), and a Source check that threw ("Checking…" for ever; now Offline with the reason). A worker `fatal` now says the Preview, playback, import and export are unavailable, says the Project is saved only after flushing the saver, offers Reload with the reason and stack under Details, and disables what needs the engine — before, an import blamed the file. Wrong blame fixed: a failing file picker and an engine stopping mid-import no longer say the file cannot be used. Export failures are worded by stage and cause; a full destination, which the engine saw only as "Cannot close a ERRORED writable stream", is now reported from the platform's own error as not enough space, and "Try again" reopens the save dialog with the same settings unless the Timeline's sound changed (FR-024). 33 unit tests and 8 e2e tests (`failures-are-legible.spec.ts`, faults injected as real DOMExceptions by `e2e/faults.ts`)
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T093, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-09 — error

> **Given** any Project
> **When** the user picks a file the product cannot decode
> **Then** the system states plainly that the file cannot be used and why, and the Project is left unchanged
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — error

> **Given** an Export is running
> **When** it fails, or the destination runs out of space or stops accepting writes partway
> **Then** the failure is reported plainly, and no partial file is presented as finished. This is one rule, and it covers every way an Export can end short: cancelled, failed or interrupted
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

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

- [x] Make every failure the user can hit legible: undecodable file, permission denied, Source offline, export failed, worker fatal — each with a plain statement and, where applicable, an action

## Edge cases

| Case | Behaviour |
|---|---|
| the user picks a file the product cannot decode | the system states plainly that the file cannot be used and why, and the Project is left unchanged |
| it fails, or the destination runs out of space or stops accepting writes partway | the failure is reported plainly, and no partial file is presented as finished. This is one rule, and it covers every way an Export can end short: cancelled, failed or interrupted |
| the Project opens | each such Source shows as Offline and says the browser needs the user's permission again; it reattaches only after the user grants access by their own action, with no prompt on load |
| the Project opens | that Source shows as Offline with the reason, and Relink is offered; picking the file again restores every Clip that references it at once |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 6, commits a49c7f8).
- [x] Delivered in Spec Kit Phase 6 (Polish & Cross-Cutting Concerns), commits a49c7f8
