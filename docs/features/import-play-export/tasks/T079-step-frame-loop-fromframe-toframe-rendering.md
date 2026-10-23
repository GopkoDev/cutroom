---
id: T079
title: "Step the Frame loop from `fromFrame` to `toFrame`, rendering each Frame through the same `renderScene` used…"
layer: "app"
deps: ["T015", "T031", "T078"]
blocks: []
acs: ["AC-21"]
files_hint: ["packages/engine/src/export/run.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T079 — Step the Frame loop from `fromFrame` to `toFrame`, rendering each Frame through the same `renderScene` used…

## Place in the sequence

- **Blocked by:** T015, T031, T078 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Step the Frame loop from `fromFrame` to `toFrame`, rendering each Frame through the same `renderScene` used….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T079 [US3] Step the Frame loop from `fromFrame` to `toFrame`, rendering each Frame through the same `renderScene` used by Preview and calling `videoSource.add(frameToSeconds(timebase, frame), frameToSeconds(timebase, 1))` — through the conversion module, never by dividing by a frame rate here (Principle II, Principle III, FR-016) — **done**: steps the half-open range `[fromFrame, toFrame)` through the same `renderByStreaming` and `renderScene` as playback, capturing each video frame right after its render and before any wait, so nothing can clear the canvas in between. Timestamps are `frameToSeconds(timebase, frame − fromFrame)` and `frameToSeconds(timebase, 1)`, so the file starts at 0 s; the track's frame rate is the new model `framesPerSecond` (exact at a 1/30000 timescale) and audio timestamps come from `ticksToSeconds` — nothing divides by a rate. Checked: a 3 s export from Frame 30 has 90 packets, video 3.000 s, `avc1.640028`, and its burned-in counters at output Frames 0, 45 and 89 read 000030, 000075, 000119; the 60 s export's read 000000, 000900, 001799
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T079, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-21 — happy

> **Given** a Project with one Clip
> **When** the user exports and chooses where the file goes
> **Then** a single MP4 file is written to the chosen location, containing every Frame of the Timeline and its sound, matching what the Preview showed
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Step the Frame loop from `fromFrame` to `toFrame`, rendering each Frame through the same `renderScene` used by Preview and calling `videoSource.add(frameToSeconds(timebase, frame), frameToSeconds(timebase, 1))` — through the conversion module, never by dividing by a frame rate here (Principle II, Principle III, FR-016)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
