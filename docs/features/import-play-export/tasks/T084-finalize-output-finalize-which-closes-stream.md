---
id: T084
title: "Finalize with `output.finalize()`, which closes the stream, and report `export-done` with the byte count"
layer: "app"
deps: ["T078"]
blocks: []
acs: ["AC-21"]
files_hint: ["packages/engine/src/export/run.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T084 — Finalize with `output.finalize()`, which closes the stream, and report `export-done` with the byte count

## Place in the sequence

- **Blocked by:** T078 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Finalize with `output.finalize()`, which closes the stream, and report `export-done` with the byte count.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T084 [US3] Finalize with `output.finalize()`, which closes the stream, and report `export-done` with the byte count — **done**: the file is committed in exactly one place: Mediabunny's `output.cancel()` closes its target and closing a file stream commits it, so the worker's wrapper commits only on the close inside `finalize` and aborts on every other ending. The stream is marked for commit, `output.finalize()` runs, then `export-done { bytes }` is sent, `bytes` being the furthest byte written (25 311 for the 3 s file, equal to its OPFS size) **Audio sync fix (ADR 0014)**: Chrome's AAC encoder adds 2112 samples of priming (44 ms at 48 kHz) that WebCodecs does not report, and Mediabunny writes no edit list for it, so exports first played 44 ms late with a long tail (60.075 s for 60 s). `export/encoder-delay.ts` now measures the delay before each export (an impulse round trip through the same `AudioSampleSource` settings, about 12 ms); `export/edit-list.ts` rewrites Mediabunny's final `moov` — last in the file because `fastStart: false`, which is checked — with `elst` `media_time` = delay and `segment_duration` = `samplesTotal`, an AAC `roll` = −1 sample group (without it AVFoundation trims its assumed 2112 again and plays 44 ms early), and trailing packets past the edit dropped. Measured on 3 s at 30/1 and 60 s at 30/1 and 30000/1001: clicks exactly at 0/48000/96000 in Mediabunny, Web Audio, ffmpeg and AVFoundation; container duration equals video duration exactly; Mediabunny's packet-based duration is under one AAC frame long because it ignores the edit's end. Opus, the fallback, is unchanged (its pre-skip is already applied; AVFoundation plays it 6.5 ms late)
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T084, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Finalize with `output.finalize()`, which closes the stream, and report `export-done` with the byte count

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
