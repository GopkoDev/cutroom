---
id: T050
title: "Display the timecode in `apps/editor/src/ui/TopBar.tsx`, derived from the Frame through the Timebase module…"
layer: "ui"
deps: []
blocks: []
acs: ["AC-06"]
files_hint: ["apps/editor/src/ui/TopBar.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T050 — Display the timecode in `apps/editor/src/ui/TopBar.tsx`, derived from the Frame through the Timebase module…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Display the timecode in `apps/editor/src/ui/TopBar.tsx`, derived from the Frame through the Timebase module….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T050 [US1] Display the timecode in `apps/editor/src/ui/TopBar.tsx`, derived from the Frame through the Timebase module and never from a float — **done**, as wall-clock `HH:MM:SS:FF`, not SMPTE. At integer rates it equals non-drop timecode; at 30000/1001 it stays on the clock where non-drop falls 3.6 s behind per hour, and it matches the real seconds a Source's duration and an exported file report — drop-frame is defined only for 29.97/59.94 and would be a second rule. No float: the model's `frameToTimecode(timebase, frame)` returns `{ hours, minutes, seconds, frames }` in exact integers — the second is floor(frame ÷ Timebase) and its first Frame is ceil(second × Timebase), the same count `framesForDuration` gives — with its own mutation-checked tests, and `timecode.ts` is only a formatter (padding and the `FF` width). FF widens past 99 Frames per second. With no Project the bar shows `--:--:--:--`. 8 tests, including the one-hour boundary at 30000/1001
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T050, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 — domain invariant

> **Given** any Project
> **When** the user places or moves the Playhead, or the system stores a position on the Timeline
> **Then** the position is a whole Frame; the system never presents or stores a position between two Frames
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Display the timecode in `apps/editor/src/ui/TopBar.tsx`, derived from the Frame through the Timebase module and never from a float

## Edge cases

| Case | Behaviour |
|---|---|
| the user places or moves the Playhead, or the system stores a position on the Timeline | the position is a whole Frame; the system never presents or stores a position between two Frames |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
