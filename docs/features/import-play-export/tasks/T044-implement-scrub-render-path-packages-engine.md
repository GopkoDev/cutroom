---
id: T044
title: "Implement the scrub render path in `packages/engine/src/playback/scrub.ts`"
layer: "app"
deps: ["T015", "T043"]
blocks: []
acs: ["AC-04"]
files_hint: ["packages/engine/src/playback/scrub.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T044 — Implement the scrub render path in `packages/engine/src/playback/scrub.ts`

## Place in the sequence

- **Blocked by:** T015, T043 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the scrub render path in `packages/engine/src/playback/scrub.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T044 [US1] Implement the scrub render path in `packages/engine/src/playback/scrub.ts`: abandon any iterator, call `sink.getCanvas(t)` for each visible `SceneClip`, convert the Frame to Source time through T045, and hand the canvas to the compositor (research R2) — **done**: `renderByRandomAccess` filters the Scene's Clips with `covers`, drops the sinks of Clips not visible, closes any stream (none exist yet), calls `getCanvas` at `sourceSecondsAt` for every visible Clip concurrently, composites in the Scene's order and releases every loan in a `finally`. `createScrub` is the FR-012 latch T030 deferred, now that a Render spans `await`s: one Render runs, at most one request waits, a newer request replaces the waiting one, and each replaced request is reported as `frames-dropped: 1`; if a Render throws, the waiting request is reported dropped and the error goes to `fatal`. `renderScene` now takes `(scene, pictures)` and keeps one sprite per drawn `clipId`. Checked in a real worker: a burst of 20 requests gave 18 drops, then the first and the newest Frame. `clock` requests take this path until T063 fills the `stream` slot left for it
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T044, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-04 — happy

> **Given** a Clip on the Timeline
> **When** the user moves the Playhead to any Frame within it
> **Then** the Preview shows the picture of that Frame
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the scrub render path in `packages/engine/src/playback/scrub.ts`: abandon any iterator, call `sink.getCanvas(t)` for each visible `SceneClip`, convert the Frame to Source time through T045, and hand the canvas to the compositor (research R2)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea

Note: `packages/engine/src/playback/scrub.ts` — named by the Spec Kit task but not present at `53f38c4` (the code may have been arranged differently; follow the implementation record).
