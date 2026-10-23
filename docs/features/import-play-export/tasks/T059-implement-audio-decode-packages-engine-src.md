---
id: T059
title: "Implement audio decode in `packages/engine/src/sources/audio.ts` using `AudioSampleSink`, emitting…"
layer: "app"
deps: []
blocks: []
acs: ["AC-13", "AC-19"]
files_hint: ["packages/engine/src/sources/audio.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T059 — Implement audio decode in `packages/engine/src/sources/audio.ts` using `AudioSampleSink`, emitting…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement audio decode in `packages/engine/src/sources/audio.ts` using `AudioSampleSink`, emitting….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T059 [US2] Implement audio decode in `packages/engine/src/sources/audio.ts` using `AudioSampleSink`, emitting `audio-pcm` messages with transferred `Float32Array`s ahead of the Playhead (research R3) — **done**: each Clip whose Source has sound decodes through an `AudioSampleSink` over `getAttachedSource(id).audio`; a Source without sound sends nothing, which is valid silence. **Protocol change**: `audio-pcm` is `{ sourceId, clipId, sampleRate, channels, startSample }`, with `startSample` on the **Timeline's** sample grid — Source sample `j` becomes `j − sourceTimeToTicks(sr, inPoint) + frameToSampleIndex(startFrame)`, both in the model — trimmed to the Clip and to `fromFrame`, so the main thread maps nothing, and the same `(clipId, startSample)` always carries the same sound, so PCM from a run a seek replaced is still correct where it lands. No end-of-stream marker: the Scene already says where a Clip ends. Chunks are 2048 samples first and 16384 after, `Float32Array`s transferred, running up to exactly 2 s ahead of the newest clock Frame; clock Frames reach the decode before the Render, so sound never waits for picture. Decoding starts 1/10 s early (`sourceTimeBefore`) and trims the run-up, because AAC fades in from a cold start — without it the click after a seek arrived 192 samples late. A Scene change during playback restarts sound only for Clips that moved; a Source detached mid-decode goes silent, not `fatal`. Checked in a real worker: from Frame 300, PCM arrived 4 ms after `transport` and before the Frame, starting at sample 480000; chunks contiguous, clicks exactly on 48000-sample boundaries; a 29.97 Source started at 1602; `silent-720p24` sent no PCM
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T059, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

### AC-19 — happy

> **Given** a Source with no audio
> **When** the user plays it
> **Then** the picture plays normally, and the silence is treated as valid rather than as an error
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement audio decode in `packages/engine/src/sources/audio.ts` using `AudioSampleSink`, emitting `audio-pcm` messages with transferred `Float32Array`s ahead of the Playhead (research R3)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
