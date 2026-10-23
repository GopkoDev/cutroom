---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0012 — Playback sound is placed on the Timeline by the worker

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `90b0009`

## Context

Decoded sound travels from the worker to the main thread for scheduling (ADR 0008), and someone has to map a Clip's Source time onto the Timeline's sample grid.

## Decision drivers

- Mapping Source time to Timeline time should happen once, through the model's Timebase module (research R7, in sad.md §4), so the audio graph cannot disagree with the compositor about where a Clip's sound belongs.
- A seek should need no session ids or cancellation handshake between the threads.

## Considered options

1. **The worker sends PCM already positioned on the Timeline's sample grid.**
2. TODO(sdd-migration): the original ADR names no alternative for the placement decision. For the amendment it names one: **a fixed 0.1 s start delay** after the press (rejected, see Amendment).

## Decision outcome

**Chosen:** Option 1, Timeline-positioned PCM from the worker.

The worker sends decoded sound already positioned on the Timeline. An `audio-pcm` message carries `{ sourceId, clipId, sampleRate, channels, startSample }`, where `startSample` is an index on the Timeline's sample grid — the one `frameToSampleIndex(timebase, sampleRate, frame)` gives — with the Clip's start and in-point already applied and the samples trimmed to the Frames the Clip covers. The main thread maps nothing; it compares sample indices and schedules.

Because position is the whole identity of a chunk, the same `(clipId, startSample)` always carries the same sound. PCM that arrives late from a run a seek has replaced is still correct where it lands, so the audio graph schedules each sample of a Clip at most once and never needs to know which run a chunk came from. There is no end-of-stream marker: the Scene already says where a Clip ends. A Clip's sound is sent **unbroken** — silence where its Source's track has none (it starts late, has a gap, or ends before the Clip) — so the main thread can tell when the sound for a span is in hand.

### Amendment: playback starts when its sound is in hand

Playback does not start at a fixed delay after the press. The transport holds the clock on the start Frame and anchors only once it holds contiguous PCM covering the graph's lookahead (0.5 s) for every Clip expected to sound, and then at `currentTime` plus a 0.05 s margin; buffers are prepared before the clock is read, so the margin covers only the `start()` calls. A 1 s limit is the valve for sound that never comes. A seek during playback follows the same rule: the old position keeps sounding until the new one's sound is in hand, then both change at one instant.

A fixed 0.1 s delay was a bet that the engine's first PCM reaches the main thread in time, and a starved main thread lost it — the worker posted PCM 4 ms after the press, and the main thread handled it 150–200 ms later, so the first chunks started late. Waiting for the sound costs nothing when the machine is idle (start latency fell from 100 to about 50 ms) and is what makes "sound never yields to picture" hold from the first sample. This amendment, too, was written after the code (T070); T094 records it.

## Consequences

**Positive**
- Mapping Source time to Timeline time happens once, in the worker, through the model's Timebase module (R7). The audio graph cannot disagree with the compositor about where a Clip's sound belongs.
- A seek needs no session ids or cancellation handshake between the threads: stale PCM is either already scheduled (and correct) or dropped as past.

**Negative**
- None recorded in the original ADR.

**Neutral**
- The same graph construction serves Export (ADR 0008) — an `OfflineAudioContext` fed Timeline-positioned PCM mixes what playback plays.
- Recorded after the fact: this was settled while building T059/T060 and landed with the code; T094 records the lapse.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §6
- Related ADR: [0008](./0008-audio-stays-on-the-main-thread.md), [0013](./0013-the-worker-counts-skipped-frames.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 90b0009:docs/adr/0012-playback-sound-is-placed-on-the-timeline-by-the-worker.md`
