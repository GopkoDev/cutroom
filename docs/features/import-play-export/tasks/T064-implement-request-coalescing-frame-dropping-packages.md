---
id: T064
title: "Implement request coalescing and Frame dropping in `packages/engine/src/playback/scheduler.ts`"
layer: "app"
deps: []
blocks: []
acs: ["AC-17"]
files_hint: ["packages/engine/src/playback/scheduler.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T064 — Implement request coalescing and Frame dropping in `packages/engine/src/playback/scheduler.ts`

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement request coalescing and Frame dropping in `packages/engine/src/playback/scheduler.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T064 [US2] Implement request coalescing and Frame dropping in `packages/engine/src/playback/scheduler.ts`: newer Frame requests supersede older ones, dropped counts are reported as `frames-dropped` and never surfaced as errors (FR-012) — **done**: by generalising T044's latch into `playback/scheduler.ts` rather than adding a second one, because what it serialises is the sinks: scrub and clock Renders draw from the same pooled canvas and decoder, and two latches would let them overlap. One Render runs at a time; one render request and one transport change may wait, in arrival order, and transport changes run between Renders, never under one. A newer request displaces the waiting one whatever its reason, and that one is reported `frames-dropped: 1`, so every request still gets exactly one answer. **Protocol change**: Frames playback passes over are reported as `frame-rendered.skipped`, counted by the worker from the previous Frame of the run (or `fromFrame`), not as `frames-dropped` — an extra `frames-dropped` would break the client's one-answer-per-request pairing, and with the client guard the worker almost never displaces a request, so `frames-dropped` now means only "a request that got no picture". T070 and T072 therefore measure `sum(skipped)`. A clock Frame while stopped is served by random access; a repeated clock Frame with the same revision is answered without re-rendering, which took p99 Frame interval from 44 to 18.7 ms. 8 stacked 1080p Clips for 25 s: 747 of 750 Frames shown, 3 skipped, never an error
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T064, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-17 — domain invariant

> **Given** a machine too slow to produce every Frame in time
> **When** playback runs
> **Then** sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement request coalescing and Frame dropping in `packages/engine/src/playback/scheduler.ts`: newer Frame requests supersede older ones, dropped counts are reported as `frames-dropped` and never surfaced as errors (FR-012)

## Edge cases

| Case | Behaviour |
|---|---|
| playback runs | sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
