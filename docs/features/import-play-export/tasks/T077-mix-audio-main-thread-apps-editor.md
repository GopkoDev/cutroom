---
id: T077
title: "Mix the audio on the main thread in `apps/editor/src/audio/offline-mix.ts` with `OfflineAudioContext`, using…"
layer: "app"
deps: ["T060", "T061"]
blocks: []
acs: ["AC-21"]
files_hint: ["apps/editor/src/audio/offline-mix.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T077 — Mix the audio on the main thread in `apps/editor/src/audio/offline-mix.ts` with `OfflineAudioContext`, using…

## Place in the sequence

- **Blocked by:** T060, T061 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Mix the audio on the main thread in `apps/editor/src/audio/offline-mix.ts` with `OfflineAudioContext`, using….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T077 [US3] Mix the audio on the main thread in `apps/editor/src/audio/offline-mix.ts` with `OfflineAudioContext`, using the same graph construction as playback, and stream the PCM to the worker in chunks (ADR 0008, Principle III) — **done**: the export's sound is mixed on the main thread by the same `createAudioGraph` playback uses, on an `OfflineAudioContext` (Principle III), fed Timeline-positioned PCM the worker decodes from the **frozen** Scene. **Protocol change**: `export-audio-request { toFrame }`, answered by one `export-audio-pcm { toFrame, chunks }` — playback's decode cannot be reused, because it is driven by clock Frames that also render onto the canvas the export encodes, follows the live Scene, and is paced in real time; the PCM starts a Frame before `fromFrame` because the resampler interpolates from it. The mix runs in 10 s segments, each its own context and graph (≈3.8 MB out plus 3.8 MB in per Clip, dropped once sent), instead of one render that would hold 230 MB of output plus a copy of every input for 10 min of 48 kHz stereo and send nothing until done; PCM is pulled one segment ahead so decoding overlaps mixing, and a silent segment sends zeros without building a context. Segments end on **whole Timeline seconds**, each context anchored by the new `anchorAtTimelineSample` so its first output sample is exactly that Timeline sample: Frame boundaries were tried first and came out up to 0.022 off a single render when resampling, because Chrome rounds `start` offsets to a whole input sample, while every integer rate has a sample exactly on a whole second (7.5e-9). Output is exactly `frameToSampleIndex(toFrame) − frameToSampleIndex(fromFrame)` samples, always stereo, sent as `export-audio-chunk`s of 32768 samples with at most 2 unacknowledged (invariant 4), the last `final`; an `AbortSignal` stops it at once at any await. Checked in Chrome: a real mix of the click fixtures at 30 and 29.97 matched the engine's PCM bit for bit, clicks at second·48000 + 7; resampled to 44.1 kHz, segmented matched a single render to 7.5e-9. 16 unit tests against a fake context that really sums; mutation-checked (naive Frame anchor fails 2, no ack limit fails 2)
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T077, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-21 — happy

> **Given** a Project with one Clip
> **When** the user exports and chooses where the file goes
> **Then** a single MP4 file is written to the chosen location, containing every Frame of the Timeline and its sound, matching what the Preview showed
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Mix the audio on the main thread in `apps/editor/src/audio/offline-mix.ts` with `OfflineAudioContext`, using the same graph construction as playback, and stream the PCM to the worker in chunks (ADR 0008, Principle III)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
