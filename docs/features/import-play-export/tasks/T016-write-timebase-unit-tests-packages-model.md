---
id: T016
title: "Write Timebase unit tests in `packages/model/test/timebase.test.ts` covering exact-Frame, half-Frame either…"
layer: "tests"
deps: []
blocks: []
acs: ["AC-11"]
files_hint: ["packages/model/test/timebase.test.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T016 — Write Timebase unit tests in `packages/model/test/timebase.test.ts` covering exact-Frame, half-Frame either…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write Timebase unit tests in `packages/model/test/timebase.test.ts` covering exact-Frame, half-Frame either….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T016 [P] Write Timebase unit tests in `packages/model/test/timebase.test.ts` covering exact-Frame, half-Frame either side, 30000/1001 sample alignment, accumulated-error absence over 10 minutes of Frames, and `frameToSourceTime` mapping a 30 fps Project Frame into a 30000/1001 Source and a 24 fps Source without drift at either end — **done**: 38 tests. The half-Frame cases are asserted on 32/1 and 2/1 Timebases so that every half-Frame boundary is an exactly representable double and the test pins the tie rule itself rather than a float artefact; the 29.97 cases sit just either side of the midpoint, where the answer is not float-dependent. Accumulation is checked two ways: exactly, in integers, that no Frame in the first ten minutes is off by more than half a sample; and by value, that the Frame at ten minutes is sample 28,799,971 where naive per-Frame addition of 1602 samples gives 28,807,164 — 7,193 samples, 0.15 s of audio, and growing. Both rounding rules were mutation-checked: truncating `secondsToFrame` fails 6 tests, rounding `framesForDuration` fails 1
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T016, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

`@cutroom/model` public functions and types.

— `contracts/public-api.md, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-11 — cross-context

> **Given** a Project whose Timebase was set by its first Source
> **When** a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project)
> **Then** every Frame of the Timeline still shows the correct picture, and playback does not drift
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write Timebase unit tests in `packages/model/test/timebase.test.ts` covering exact-Frame, half-Frame either side, 30000/1001 sample alignment, accumulated-error absence over 10 minutes of Frames, and `frameToSourceTime` mapping a 30 fps Project Frame into a 30000/1001 Source and a 24 fps Source without drift at either end

## Edge cases

| Case | Behaviour |
|---|---|
| a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project) | every Frame of the Timeline still shows the correct picture, and playback does not drift |

## Definition of Done

- [x] Done as recorded: `timebase.test.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
