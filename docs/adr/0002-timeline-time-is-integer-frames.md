---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0002 — Timeline time is measured in integer frames

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

Every position and length on the Timeline — clip placement, trims, markers, keyframes, the playhead — needs one unit. The editor's output is a frame grid regardless of the unit chosen.

## Decision drivers

- With float seconds, "round this to a frame" has to be re-decided at every layer. OpenReel — a mature client-side editor built on float seconds — ends up repeating `Math.round(time * frameRate) / frameRate` in its frame cache, its render bridge and its motion timing independently, and its snapping never lands on the frame grid at all.
- Clip adjacency (butt joins) must be exact.

## Considered options

1. **Integer frames in a rational Timebase** — positions are integer frame numbers in the Project's timebase, stored as a rational frame rate (e.g. 30000/1001).
2. **Float seconds** — rejected for the rounding reason above.

## Decision outcome

**Chosen:** Option 1, integer frames.

Every position and length on the Timeline — clip placement, trims, markers, keyframes, the playhead — is an integer frame number in the Project's timebase, which is stored as a rational frame rate (e.g. 30000/1001) rather than a float. Seconds and sample indices exist only at the boundary where we talk to a decoder, to WebAudio, or to the muxer, and the conversion lives in a single module.

## Consequences

**Positive**
- Clip adjacency is integer equality, so butt-joined clips cannot develop sub-millisecond gaps.

**Negative**
- Changing a Project's frame rate is a migration of every stored number, not a setting toggle.

**Neutral**
- Audio is placed and trimmed on frame boundaries; sample-accurate work (fades, volume envelopes) lives *inside* a Clip and is rendered by WebAudio automation. Sub-frame audio trimming, if we ever want it, is an optional sample offset on the Clip — it does not change the timeline's unit.
- A Source's own time — how long it is, and where in it a Clip begins — stays in the Source's timescale as an exact rational of seconds, and is stored that way in the Project document. That media time is not ours to renumber into a timebase the Source has never heard of, and rounding it to the Project's frame grid at import would bake a conversion into the document that we could never undo. It is an address, not a position: nothing on the Timeline is expressed in it, no editing operation computes with it, and turning it into a Frame happens in the conversion module like every other boundary crossing. This is the exception Principle II names, and the only one.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §4
- Related ADR: [0016](./0016-the-source-timebase-is-measured.md); [constitution](../constitution.md) Principle II
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0002-timeline-time-is-integer-frames.md`
