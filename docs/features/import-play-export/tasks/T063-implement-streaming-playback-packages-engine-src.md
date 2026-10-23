---
id: T063
title: "Implement streaming playback in `packages/engine/src/playback/stream.ts`"
layer: "app"
deps: ["T043"]
blocks: []
acs: ["AC-13"]
files_hint: ["packages/engine/src/playback/stream.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T063 — Implement streaming playback in `packages/engine/src/playback/stream.ts`

## Place in the sequence

- **Blocked by:** T043 · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement streaming playback in `packages/engine/src/playback/stream.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T063 [US2] Implement streaming playback in `packages/engine/src/playback/stream.ts`: open a `canvasesAtTimestamps` iterator per active Clip on `transport: playing`, close it on stop, and open a fresh one after a seek (research R2) — **done**: each Clip visible during playback walks a `canvasesAtTimestamps` iterator held in the slot T043 left on its sink, fed every Frame's Source time through `sourceSecondsAt`, so the model does all the arithmetic (R7). It is fed **eagerly**, because Mediabunny only decodes a GOP once it has seen a timestamp past it, and a lazily fed iterator stalls until the next keyframe. `transport: playing` closes the previous run's iterators and opens new ones at `fromFrame` for the Clips covering it, so the first picture is already decoding; `stopped` closes them; a seek during playback is a second `playing`. A stream reopens when the Frame is behind it, when the Clip moved or the Timebase changed (`streamKey`), or when the Frame is more than `STEP_LIMIT` (30) ahead; shorter gaps are walked — decoded, not drawn. The next picture starts decoding only when the last loan is released, and a pull counts as on loan from the moment it starts, so draw-before-next-pull holds. Checked in a real worker: stream pictures matched scrub pictures for every Frame checked, before and after a seek and after the clock went backwards; reopening after a seek gave the first Frame in about 10 ms; 60 s of `sync-1080p30-10min` at 1080p showed all 1800 Frames, Frame interval p50 16.6 ms, p99 18.7 ms
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T063, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-13 — happy

> **Given** the Playhead is inside a Clip
> **When** the user starts playback
> **Then** playback begins from the Playhead's current Frame; picture and sound advance together, and the Playhead moves in step with them
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement streaming playback in `packages/engine/src/playback/stream.ts`: open a `canvasesAtTimestamps` iterator per active Clip on `transport: playing`, close it on stop, and open a fresh one after a seek (research R2)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
