---
id: T061
title: "Implement the master clock in `apps/editor/src/audio/clock.ts`"
layer: "app"
deps: ["T015"]
blocks: ["T062", "T066", "T077"]
acs: ["AC-13", "AC-17", "AC-18"]
files_hint: ["apps/editor/src/audio/clock.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T061 — Implement the master clock in `apps/editor/src/audio/clock.ts`

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** T062, T066, T077 · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the master clock in `apps/editor/src/audio/clock.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T061 [US2] Implement the master clock in `apps/editor/src/audio/clock.ts`: derive the current Frame from `audioContext.currentTime` through the Timebase, never from a timer (FR-011, FR-013) — **done**: `createAudioClock` holds one anchor, `{ frame, contextSeconds }`, set `START_DELAY_SECONDS` (0.1 s) after the press so the engine can decode the first sound before it is due. `frame()` is `frameAtContextTime(timebase, anchor, currentTime)`, computed from the anchor in one step and never from a timer or a count of animation frames, so a suspended context holds the clock still and asking a thousand times changes nothing. `frameAtContextTime` is deliberately the **floor** — the last Frame that has begun — not `secondsToFrame`'s nearest rule: the question is which Frame is on screen, and nearest would show every Frame half a Frame before its sound. Its float estimate is corrected against `frameToContextTime`, so the two agree exactly at every boundary (tested to Frame 1,000,007 at 30000/1001), and drift stays in [0, 1) Frame every 10 ms for ten minutes. Three model functions, each in its own section and test file: `frameToContextTime`, `frameAtContextTime`, `timelineSampleToContextTime`. No output-latency compensation yet: the clock reads `currentTime`, not `getOutputTimestamp()`, so picture can trail sound by the device's output latency (noticeable on Bluetooth). 7 clock tests and 15 model tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T061, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-13 — happy

> **Given** the Playhead is inside a Clip
> **When** the user starts playback
> **Then** playback begins from the Playhead's current Frame; picture and sound advance together, and the Playhead moves in step with them
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — domain invariant

> **Given** a machine too slow to produce every Frame in time
> **When** playback runs
> **Then** sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — domain invariant

> **Given** a Source of any length with sound
> **When** it plays from start to end
> **Then** sound and picture stay in sync for the whole length, without cumulative drift
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the master clock in `apps/editor/src/audio/clock.ts`: derive the current Frame from `audioContext.currentTime` through the Timebase, never from a timer (FR-011, FR-013)

## Edge cases

| Case | Behaviour |
|---|---|
| playback runs | sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture |
| it plays from start to end | sound and picture stay in sync for the whole length, without cumulative drift |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
