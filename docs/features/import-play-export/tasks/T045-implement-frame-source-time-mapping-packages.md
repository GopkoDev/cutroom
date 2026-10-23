---
id: T045
title: "Implement Frame-to-Source-time mapping in `packages/engine/src/playback/mapping.ts` as a thin call into…"
layer: "app"
deps: ["T015"]
blocks: []
acs: ["AC-11"]
files_hint: ["packages/engine/src/playback/mapping.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T045 — Implement Frame-to-Source-time mapping in `packages/engine/src/playback/mapping.ts` as a thin call into…

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement Frame-to-Source-time mapping in `packages/engine/src/playback/mapping.ts` as a thin call into….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T045 [US1] Implement Frame-to-Source-time mapping in `packages/engine/src/playback/mapping.ts` as a thin call into `frameToSourceTime` from `@cutroom/model`, turning the rational it returns into whatever the decoder wants at that one boundary. A Source whose Timebase differs from the Project's is handled by the arithmetic living in the model, not by this module reimplementing it — R7 makes frame-rate arithmetic outside the conversion module a defect (spec edge case, Principle II) — **done**: `covers(clip, frame)` and `sourceSecondsAt(timebase, clip, frame)`. The only arithmetic here is integer Frame comparison, `frame - startFrame`, and one `numerator / denominator` at the decoder's boundary; everything that depends on the Timebase, a Source whose own Timebase differs from the Project's included, happens inside `frameToSourceTime`. That one division is safe at Frame boundaries: equal rationals divide to the same double, and Mediabunny's `roundIfAlmostInteger` snaps a timestamp a few ULPs from a timescale tick onto that tick, so a Frame that starts exactly where a Source Frame starts selects that Source Frame and not the one before it. Asking for a Frame the Clip does not cover throws rather than decoding a picture that does not belong on screen. Open question: `sourceInPoint` is read in Mediabunny's timestamp space — seconds as the container states them — so a file whose first timestamp is above 0 renders empty at in-point 0; import must write in-points in the same space
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T045, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-11 — cross-context

> **Given** a Project whose Timebase was set by its first Source
> **When** a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project)
> **Then** every Frame of the Timeline still shows the correct picture, and playback does not drift
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement Frame-to-Source-time mapping in `packages/engine/src/playback/mapping.ts` as a thin call into `frameToSourceTime` from `@cutroom/model`, turning the rational it returns into whatever the decoder wants at that one boundary. A Source whose Timebase differs from the Project's is handled by the arithmetic living in the model, not by this module reimplementing it — R7 makes frame-rate arithmetic outside the conversion module a defect (spec edge case, Principle II)

## Edge cases

| Case | Behaviour |
|---|---|
| a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project) | every Frame of the Timeline still shows the correct picture, and playback does not drift |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
