---
id: T086
title: "Write `apps/editor/e2e/export-duration.spec.ts` asserting the exported duration equals…"
layer: "tests"
deps: ["T013", "T015"]
blocks: []
acs: ["AC-31"]
files_hint: ["apps/editor/e2e/export-duration.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T086 — Write `apps/editor/e2e/export-duration.spec.ts` asserting the exported duration equals…

## Place in the sequence

- **Blocked by:** T013, T015 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/export-duration.spec.ts` asserting the exported duration equals….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T086 [P] [US3] Write `apps/editor/e2e/export-duration.spec.ts` asserting the exported duration equals `frameToSeconds(timebase, durationFrames)` and that audio sync marks still align at the end (SC-006) — **done**: the permanent regression test for ADR 0014. It exports a one-Clip 30/1 Project (30 s) and a 60 s Project of the 30 fps fixture followed by the 29.97 fixture, both through the dialog, parses the file's boxes in Node and requires `mvhd`, both `tkhd`s, the video `mdhd` and the sound `elst` segment to equal `frameToSeconds(timebase, durationFrames)` **exactly**, as integers on each box's own clock — Mediabunny's packet-based `computeDuration()` ignores the edit's end, so it is only annotated (30.0147 s, 60.0093 s). It also requires a positive priming `media_time` (measured 2112/48000), sound media covering the edit by less than one packet, the AAC `roll` −1 group over every packet (the stand-in for QuickTime, which a test cannot drive), ffprobe durations of exactly the Timeline with start 0, and one video packet per Frame on the grid. Every click is located by correlating with the fixture's tone in both Chrome's `decodeAudioData` and host ffmpeg and must sit within ±2 samples of where the Timeline puts it: measured lag 0 at every click in both; Web Audio returns exactly the Timeline's samples, ffmpeg +704 and +448 (under one packet). Mutation-checked: setting the sound edit's `media_time` to 0 shifts every click to +2112. Needs host ffmpeg, which `pnpm fixtures` already requires
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T086, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-31 — happy

> **Given** an exported file
> **When** it is played in a common video player
> **Then** its duration matches the Timeline, and its picture and sound are in sync throughout
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/export-duration.spec.ts` asserting the exported duration equals `frameToSeconds(timebase, durationFrames)` and that audio sync marks still align at the end (SC-006)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `export-duration.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
