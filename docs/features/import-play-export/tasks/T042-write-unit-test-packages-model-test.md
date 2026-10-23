---
id: T042
title: "Write a unit test in `packages/model/test/import.test.ts` for the adopt-Timebase-and-add-Clip command…"
layer: "tests"
deps: []
blocks: []
acs: ["AC-02", "AC-03"]
files_hint: ["packages/model/test/import.test.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T042 — Write a unit test in `packages/model/test/import.test.ts` for the adopt-Timebase-and-add-Clip command…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write a unit test in `packages/model/test/import.test.ts` for the adopt-Timebase-and-add-Clip command….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T042 [P] [US1] Write a unit test in `packages/model/test/import.test.ts` for the adopt-Timebase-and-add-Clip command sequence, including a 30000/1001 Source and a Source whose duration is not a whole number of Project Frames — **done**: 30 tests, taking the suite to 248. Every sequence runs through the real reducer and through `parseProject` (key order included), and undoing it returns exactly the previous Project, or no Project at all. Cases: a 30000/1001 Source, adopted exactly; a 10.000 s Source at 29.97, which is 300 Frames and not 299; a 10.01 s Source at 30 fps, which is 301 Frames; and the 29.97 fixture imported into a 30 fps Project, which keeps its own Timebase and is counted in 30 fps Frames. Mutation check: using the Source's Timebase instead of the established Project's fails 2 tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T042, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

`@cutroom/model` public functions and types.

— `contracts/public-api.md, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-02 — happy

> **Given** an empty Project
> **When** the first Source is imported
> **Then** the Project adopts that Source's Timebase and picture size as its own Timebase and frame size, and the user is not asked to configure the Project before seeing anything
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — happy

> **Given** a Project that already holds a Clip on its video Track
> **When** the user imports another video file
> **Then** the new Source is placed whole as one more Clip, butt-joined where the video Track ends
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write a unit test in `packages/model/test/import.test.ts` for the adopt-Timebase-and-add-Clip command sequence, including a 30000/1001 Source and a Source whose duration is not a whole number of Project Frames

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `import.test.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
