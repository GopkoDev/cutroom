---
id: T053
title: "Write the Playwright test `apps/editor/e2e/import-and-scrub.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-04", "AC-11"]
files_hint: ["apps/editor/e2e/import-and-scrub.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T053 — Write the Playwright test `apps/editor/e2e/import-and-scrub.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write the Playwright test `apps/editor/e2e/import-and-scrub.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T053 [P] [US1] Write the Playwright test `apps/editor/e2e/import-and-scrub.spec.ts`: import the fixture, request Frame 210, read the canvas back and assert the counter region matches; repeat with `sync-1080p2997.mp4` in a 30 fps Project — **done**: two tests. The burned-in counter is read back as a number, not compared to a reference image: the 5×7 glyphs and `writeSprite` geometry are copied from `make-fixtures.ts` (a script, so not importable), and each glyph square is sampled as the mean luma of its central half. A digit must match a glyph exactly or reads `?`, and every sample must sit more than 48 from the threshold, so a scaled, offset or blank picture fails instead of reading as a plausible wrong number. The reader is checked on Frame 0 first. The Playhead is moved by keyboard, the way a user reaches one exact Frame, and the test waits for the engine's "showing Frame N" before reading. Frame 210 of `sync-1080p30.mp4` reads `000210`. `sync-1080p2997.mp4` is imported second, so it is butt-joined at Frame 900 into the 30/1 Project, 900 Frames long; Project Frames 900, 1110 and 1799 read Source Frames 0, 209 and 898 — 7 s exactly falls in Source Frame 209 because 210 starts at 7.007 s, and the Clip's last Project Frame is the Source's last Frame. Expectations are floor(30000k/30030). Mutation-checked: expecting 211 and 210 fails with 000210 and 000209. About 1–2 s per test
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T053, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-04 — happy

> **Given** a Clip on the Timeline
> **When** the user moves the Playhead to any Frame within it
> **Then** the Preview shows the picture of that Frame
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — cross-context

> **Given** a Project whose Timebase was set by its first Source
> **When** a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project)
> **Then** every Frame of the Timeline still shows the correct picture, and playback does not drift
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write the Playwright test `apps/editor/e2e/import-and-scrub.spec.ts`: import the fixture, request Frame 210, read the canvas back and assert the counter region matches; repeat with `sync-1080p2997.mp4` in a 30 fps Project

## Edge cases

| Case | Behaviour |
|---|---|
| a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project) | every Frame of the Timeline still shows the correct picture, and playback does not drift |

## Definition of Done

- [x] Done as recorded: `import-and-scrub.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
