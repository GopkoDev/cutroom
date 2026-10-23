---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0008 — Audio stays on the main thread, and owns the clock

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

ADR 0003 puts the engine in a worker, but `AudioContext` is only exposed to Window, so where sound plays and mixes is not entirely a preference.

## Decision drivers

- `AudioContext` is only exposed to Window.
- Not implementing every fade, pan, EQ and compressor ourselves.

## Considered options

1. **Web Audio on the main thread**, with the export mix produced by an `OfflineAudioContext` there too.
2. **Mixing Float32 by hand and pushing it through an AudioWorklet** — means implementing every fade, pan, EQ and compressor ourselves.

## Decision outcome

**Chosen:** Option 1, audio on the main thread.

Despite ADR 0003 putting the engine in a worker, audio playback and mixing run on the main thread through the Web Audio API, and the export mix is produced by an `OfflineAudioContext` there too. The worker decodes audio samples and renders video; it does not play sound.

The audio clock is therefore the master clock: `audioContext.currentTime` on the main thread is converted to a Frame and posted to the worker, which renders that Frame and drops any it cannot reach in time. Video follows audio; audio never waits for video.

## Consequences

**Positive**
- Playback and Export share the same audio graph construction, so the mix cannot diverge between what you hear and what you get.

**Negative**
- A main thread stalled by React work will stutter audio. Heavy UI work has to stay off the critical path, which is a constraint the worker was supposed to buy us and only buys us for video.

**Neutral**
- The engine is split across two threads by domain, not one: video in the worker, audio in the window. "One engine" (ADR 0003) holds for the picture, and separately for the sound.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §4
- Related ADR: [0003](./0003-engine-runs-in-a-worker.md), [0012](./0012-playback-sound-is-placed-on-the-timeline-by-the-worker.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0008-audio-stays-on-the-main-thread.md`
