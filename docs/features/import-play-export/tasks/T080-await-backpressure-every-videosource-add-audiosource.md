---
id: T080
title: "Await backpressure on every `videoSource.add()` and `audioSource.add()`, and acknowledge audio chunks with…"
layer: "app"
deps: ["T078"]
blocks: []
acs: ["AC-21"]
files_hint: ["packages/engine/src/export/run.ts", "apps/editor/src/audio/offline-mix.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T080 — Await backpressure on every `videoSource.add()` and `audioSource.add()`, and acknowledge audio chunks with…

## Place in the sequence

- **Blocked by:** T078 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Await backpressure on every `videoSource.add()` and `audioSource.add()`, and acknowledge audio chunks with….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T080 [US3] Await backpressure on every `videoSource.add()` and `audioSource.add()`, and acknowledge audio chunks with `export-audio-ack` so the main thread cannot outrun the encoder (research R4, protocol invariant 4) — **done**: every video and audio `add()` is awaited, and `export-audio-ack` is sent only after the encoder has taken the chunk; chunks are encoded one at a time in arrival order. `export-audio-chunk` rules are now explicit: `startSample` counts from the start of the exported stream, chunks are contiguous with the last `final`, and the total is `frameToSampleIndex(toFrame) − frameToSampleIndex(fromFrame)` — a gap, an overlap, a wrong channel count or a short stream is `export-failed`; samples past the end are dropped. The PCM itself comes from `export-audio-request { toFrame }` → `export-audio-pcm`, decoded from the frozen Scene starting one Frame before `fromFrame`
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T080, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Await backpressure on every `videoSource.add()` and `audioSource.add()`, and acknowledge audio chunks with `export-audio-ack` so the main thread cannot outrun the encoder (research R4, protocol invariant 4)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
