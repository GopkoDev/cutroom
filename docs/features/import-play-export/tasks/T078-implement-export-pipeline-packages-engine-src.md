---
id: T078
title: "Implement the export pipeline in `packages/engine/src/export/run.ts`"
layer: "app"
deps: []
blocks: ["T079", "T080", "T081", "T082", "T083", "T084"]
acs: ["AC-21"]
files_hint: ["packages/engine/src/export/run.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T078 — Implement the export pipeline in `packages/engine/src/export/run.ts`

## Place in the sequence

- **Blocked by:** — · **Blocks:** T079, T080, T081, T082, T083, T084 · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the export pipeline in `packages/engine/src/export/run.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T078 [US3] Implement the export pipeline in `packages/engine/src/export/run.ts`: `Output` + `Mp4OutputFormat` + `StreamTarget`, a `CanvasSource` over the renderer canvas, and an `AudioSampleSource` fed by `AudioSample`s built from the transferred chunks (research R4) — **done**: `export/run.ts` builds an MP4 `Output` streamed through a wrapper over the destination, with video from its **own** `OffscreenCanvas`, Pixi renderer and sink set — borrowing the Preview's canvas would put exported Frames on screen and scrubs into the file, and shared sinks would let a scrub seek the export's decoder — and AAC audio from the mixer's chunks, copied once into one buffer per chunk. **Protocol change**: `export-start.writable` is a plain `WritableStream`, because Chrome refuses to transfer a `FileSystemWritableFileStream` (`DataCloneError`); the main thread wraps the file with `forwardingWritable(file)` from `@cutroom/engine` → `{ writable, committed }`, and a file is finished only when both `export-done` has arrived and `committed` has resolved — measured: a destination where every write failed still produced `export-done` while `committed` rejected with `QuotaExceededError`. The sink map is now one per consumer (`createSinkSet`, `previewSinks`), and the Preview keeps scrubbing while an export runs (5 of 5 scrubs rendered during one). Output memory stays under about 16 MB (8 MiB write blocks). Measured: 60 s of 1080p30 with audio exported in 9.8 s
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T078, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Implement the export pipeline in `packages/engine/src/export/run.ts`: `Output` + `Mp4OutputFormat` + `StreamTarget`, a `CanvasSource` over the renderer canvas, and an `AudioSampleSource` fed by `AudioSample`s built from the transferred chunks (research R4)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
