---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0016 — The Source Timebase is measured, not read

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `a49c7f8`

## Context

No container stores a frame rate a player is obliged to honour — MP4 stores a clock and per-sample durations, Matroska a millisecond clock — so reading a "frame rate" field would be reading a guess someone else made.

## Decision drivers

- The first Source imported sets the Project's Timebase (FR-005), so the value must be exact.
- The NTSC rates (24000/1001, 30000/1001, 60000/1001) must stay exact even on a millisecond clock.

## Considered options

1. **Measure from the packets on attach.**
2. **Read the container's frame-rate field** — a guess someone else made.

## Decision outcome

**Chosen:** Option 1, measure.

A Source's Timebase is measured from its packets when it is attached: Frames × the track's clock rate over the clock span of its first 120 Frames in presentation order, reduced to an exact ratio. 120 Frames keeps the NTSC rates (24000/1001, 30000/1001, 60000/1001) exact even on a millisecond clock, and 16 extra packets are read so B-frame reordering cannot cut the sample short. A variable-rate file gets the exact average of its opening Frames.

## Consequences

**Positive**
- None recorded in the original ADR.

**Negative**
- A file whose rate changes after its first 120 Frames is mapped at the opening rate; this slice accepts that.

**Neutral**
- The first Source imported sets the Project's Timebase (FR-005), and the measured value is stored in the Project Document. Changing the measuring rule later changes what new Projects get but not what old ones hold; re-measuring an existing Project's Sources would be a migration (ADR 0007).
- Recorded after the fact (T094, audit A3): settled while building T039 and landed with the code.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §8
- Related ADR: [0002](./0002-timeline-time-is-integer-frames.md), [0007](./0007-project-document-is-portable-versioned-json.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show a49c7f8:docs/adr/0016-the-source-timebase-is-measured.md`
