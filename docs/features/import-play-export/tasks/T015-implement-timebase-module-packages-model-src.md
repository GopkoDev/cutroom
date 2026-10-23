---
id: T015
title: "Implement the Timebase module in `packages/model/src/timebase.ts`"
layer: "domain"
deps: []
blocks: ["T017", "T018", "T019", "T020", "T021", "T022", "T023", "T024", "T025", "T044", "T045", "T061", "T079", "T086"]
acs: ["AC-06", "AC-11"]
files_hint: ["packages/model/src/timebase.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T015 — Implement the Timebase module in `packages/model/src/timebase.ts`

## Place in the sequence

- **Blocked by:** — · **Blocks:** T017, T018, T019, T020, T021, T022, T023, T024, T025, T044, T045, T061, T079, T086 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the Timebase module in `packages/model/src/timebase.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T015 [P] Implement the Timebase module in `packages/model/src/timebase.ts`: `frameToSeconds`, `secondsToFrame`, `frameToSampleIndex`, `framesForDuration`, `frameToSourceTime`, with exact ratios throughout and total functions that throw on invalid input (contracts/model-api.md). `frameToSourceTime` is what makes a Source whose Timebase differs from the Project's someone else's problem exactly once — `packages/engine` calls it instead of doing rate arithmetic of its own (R7) — **done**: every conversion is a rational in BigInt collapsed to a Number once, at the end, so no intermediate float exists to carry error. Three rules the contract left open had to be decided and are now documented at their definition: `secondsToFrame` rounds to the nearest Frame with an exact half going **up**, so Frame n owns [n − ½, n + ½); `frameToSampleIndex` uses that same tie rule; and `framesForDuration` **rounds up**, because a count of n means the indices 0…n−1 — a 10.000 s Source at 29.97 is 300 Frames, index 299 starting at 9.9766 s, inside the file; only index 300, the exclusive end nobody decodes, would sit past it. (This corrected an off-by-one: the first implementation truncated to 299 and threw away a real Frame.) Invalid input is a `RangeError` naming the function, the argument and the value. Negative Frames and negative seconds are rejected rather than floored. `frameToSourceTime` deliberately takes no Source Timebase: a Source's time is seconds in its own timescale, so the mapping needs no rate arithmetic about the Source at all, and returning a reduced exact ratio means the engine inherits nothing to compound
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T015, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

`@cutroom/model` public functions and types.

— `contracts/public-api.md, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-06 — domain invariant

> **Given** any Project
> **When** the user places or moves the Playhead, or the system stores a position on the Timeline
> **Then** the position is a whole Frame; the system never presents or stores a position between two Frames
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — cross-context

> **Given** a Project whose Timebase was set by its first Source
> **When** a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project)
> **Then** every Frame of the Timeline still shows the correct picture, and playback does not drift
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the Timebase module in `packages/model/src/timebase.ts`: `frameToSeconds`, `secondsToFrame`, `frameToSampleIndex`, `framesForDuration`, `frameToSourceTime`, with exact ratios throughout and total functions that throw on invalid input (contracts/model-api.md). `frameToSourceTime` is what makes a Source whose Timebase differs from the Project's someone else's problem exactly once — `packages/engine` calls it instead of doing rate arithmetic of its own (R7)

## Edge cases

| Case | Behaviour |
|---|---|
| the user places or moves the Playhead, or the system stores a position on the Timeline | the position is a whole Frame; the system never presents or stores a position between two Frames |
| a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project) | every Frame of the Timeline still shows the correct picture, and playback does not drift |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
