---
id: T052
title: "Build the Relink flow in `apps/editor/src/ui/RelinkPrompt.tsx`"
layer: "ui"
deps: []
blocks: []
acs: ["AC-33", "AC-34", "AC-35"]
files_hint: ["apps/editor/src/ui/RelinkPrompt.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T052 — Build the Relink flow in `apps/editor/src/ui/RelinkPrompt.tsx`

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Build the Relink flow in `apps/editor/src/ui/RelinkPrompt.tsx`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T052 [US1] Build the Relink flow in `apps/editor/src/ui/RelinkPrompt.tsx`: offer re-granting permission on reopen, or picking the file again, verifying the fingerprint before rebinding (FR-021) — **done**: a prompt beside the Preview, not a dialog in front of it, because Offline is a normal state (Principle V). `needs-permission` leads with "Allow access": the tracker hands over the handle synchronously and `requestPermission` is the first thing awaited, which a test asserts. "Find the file…" is always offered and goes through `relinkSource` (size verified; name and timestamp corrected); only on a match does it attach and then run `relink-source`, so a mismatch changes nothing and the message gives both sizes. Undoing a Relink restores the old name and never the Offline status. The Timeline is never rebuilt. 5 unit tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T052, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

### AC-35 — domain invariant

> **Given** an Offline Source being relinked
> **When** the user picks a file that is not the same file (a different size from the one recorded)
> **Then** the Relink is refused, and the Source's existing link and its Clips are left as they were
>
> — `spec.md §5, AC-35, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Build the Relink flow in `apps/editor/src/ui/RelinkPrompt.tsx`: offer re-granting permission on reopen, or picking the file again, verifying the fingerprint before rebinding (FR-021)

## Edge cases

| Case | Behaviour |
|---|---|
| the Project opens | each such Source shows as Offline and says the browser needs the user's permission again; it reattaches only after the user grants access by their own action, with no prompt on load |
| the Project opens | that Source shows as Offline with the reason, and Relink is offered; picking the file again restores every Clip that references it at once |
| the user picks a file that is not the same file (a different size from the one recorded) | the Relink is refused, and the Source's existing link and its Clips are left as they were |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
