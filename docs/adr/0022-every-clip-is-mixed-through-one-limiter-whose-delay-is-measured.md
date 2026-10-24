---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0022 — Every Clip is mixed through one limiter, and its delay is measured

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Dmytro Hopko, with the agent during `/sdd:design editing`

## Context

With a second video Track, two Clips can sound at once (US-09). Today every Clip's gain node
connects straight to the context's destination (`apps/editor/src/audio/graph.ts`). Where two loud
Clips sum past full scale, the live output clips hard. In the Export, the floats above full scale
reach the encoder and are clipped there. The spec sets the rule (§1, AC-23):

- each Clip plays at its own full level and the signals are added;
- a limiter softens only the peaks that would go past full scale;
- a single Clip sounds exactly as it did in step 1.

One graph construction serves Playback and Export (ADR 0008, `offline-mix.ts`), so the limiter is
added there once.

## Decision drivers

- Spec AC-23: both sounds heard at full level and in sync, with no distortion where their sum would
  go past full scale.
- Spec §6 Playback across Edit points: picture and sound within one Frame.
- Principle III: Playback and Export are mixed by the same graph.
- ADR 0008: Web Audio was chosen so that Cutroom does not write its own signal processing.

## Considered options

1. **A `DynamicsCompressorNode` set up as a limiter on one master bus, with its delay measured
   and compensated.** The settings are threshold 0 dBFS, knee 0, ratio 20, attack about 1 ms and
   release about 100 ms.
2. **An AudioWorklet limiter of our own**, with a lookahead we know exactly. It means
   signal-processing code to write and maintain, loaded into the live context and into every
   export segment's `OfflineAudioContext`. ADR 0008 prefers Web Audio's own nodes over our own signal
   processing but does not forbid an AudioWorklet, so this is a live alternative.
3. **A `WaveShaperNode` soft clipper.** It adds no delay and leaves anything under full scale
   untouched. But it reshapes the waveform instead of lowering the level, so two loud Clips summed
   past full scale for seconds come out audibly distorted, which AC-23 forbids. Recorded as the
   obvious zero-delay alternative, not a live option: spec §1 and AC-23 exclude it.

## Decision outcome

**Chosen:** Option 1.

`createAudioGraph` gains a master bus: every Clip's gain node feeds one limiter, and the limiter
feeds the destination. This holds for the live `AudioContext` and for each export segment's
`OfflineAudioContext` alike, because both go through the same construction. Below full scale the
limiter changes no level, so one Clip alone comes out at the level it had in step 1.

Chrome's compressor delays its whole output by its lookahead, about 6 ms, even when it reduces no
gain. Left alone, that would move every sound 6 ms late against its picture. The graph therefore
measures the delay instead of assuming it, the way ADR 0014 measures the AAC priming:

- once per context sample rate, it renders an impulse through the same limiter settings in a
  short `OfflineAudioContext` and reads where the impulse lands;
- it then schedules every chunk that many samples earlier, in Playback and in Export alike.

A limiter has state (how far it is currently holding the level down), and a linear sum does not.
The export mix renders in 10 s segments, each in a fresh context (`offline-mix.ts`). Each segment
therefore starts rendering a pre-roll earlier than its first output sample, longer than the
limiter's release, and discards the pre-roll. The limiter's state at each seam is then what one
continuous render would have had, and the seams stay sample-exact and inaudible.

## Consequences

**Positive**
- A real limiter: it rides the level down over a few milliseconds instead of reshaping the wave, so
  two loud Clips do not distort.
- No signal-processing code of ours. The browser's compressor does the work in both Playback and
  Export.
- Sound stays in sync with its picture, because the measured delay is compensated in both paths.

**Negative**
- The compensation depends on behaviour the platform does not specify. If a Chrome release
  changed the lookahead, the measurement would follow it. If the compressor stopped delaying
  linearly, the measurement would show it, and the A/V sync fixture is the test that would
  fail.
- A single Clip goes through the compressor too. It changes no level below full scale, but the
  output is its arithmetic, not a bit-identical copy of step 1's. The spec's "sounds exactly as it
  did" is held at the level and timing the A/V and level fixtures measure.

- Each export segment renders a little more than its share (the pre-roll), which is a few percent
  more mixing work for the Export.
- A ratio-20 compressor is not a brickwall. On a transient it lets about 1% above full scale
  through, and AAC overshoots a signal held at full scale when it is decoded. Two loud Clips
  summed to 1.336 measured 1.069 in the decoded export, with no flat-topped (clipped) run. AC-23's
  "no distortion" is checked as exactly that: no clipped run, and the peak held within 1.1. A
  threshold below 0 dBFS was tried and rejected. Web Audio's compressor then applies makeup gain
  (about +0.57 dB at −1 dBFS), which would change a single Clip's level, against spec §1. And the
  peak still measured 1.016. (Agent on the owner's delegation, 2026-10-24, during
  `/sdd:implement`; for the owner's review.)

**Neutral**
- Per-Clip volume, fades and pan (roadmap step 7) go before the master bus, on each Clip's gain
  node, and inherit the limiter.

## Links

- Spec: [spec.md](../features/editing/spec.md) §1, US-09, AC-23, §6 Two Tracks at full rate
- SAD: [sad.md](../features/editing/sad.md) §4, §6
- Related ADR: [0008](./0008-audio-stays-on-the-main-thread.md), [0012](./0012-playback-sound-is-placed-on-the-timeline-by-the-worker.md), [0014](./0014-exported-aac-carries-an-edit-list.md), [0015](./0015-export-has-its-own-renderer-and-commits-once.md)
