---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0013 — The worker counts the Frames playback skips

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `90b0009`

## Context

The engine client keeps one `render-frame` in flight and treats each `frame-rendered` or `frames-dropped` as the answer to it. With that guard in place the worker almost never displaces a request, so `frames-dropped` stays near zero even while the picture stutters. Only the worker knows where a run starts, so only it can tell a skip under load from a seek.

## Decision drivers

- Every `render-frame` must still get exactly one answer, which the client's latest-wins guard depends on.
- FR-012 and SC-004 need picture degradation to be measurable.

## Considered options

1. **A required `skipped` count on `frame-rendered`.**
2. **Reporting skipped Frames as extra `frames-dropped` events** — rejected: it would break the one-answer-per-request pairing.

## Decision outcome

**Chosen:** Option 1, `frame-rendered.skipped`.

`frame-rendered` carries a required `skipped` count: the Frames playback passed over to reach this one, measured from the previous Frame of the same run, or from `fromFrame` for the first. It is always 0 for a scrub. `frames-dropped` keeps a narrower meaning — a request that got no picture because a newer one displaced it.

## Consequences

**Positive**
- Every `render-frame` still gets exactly one answer, which the client's latest-wins guard depends on.

**Negative**
- None recorded in the original ADR.

**Neutral**
- Picture degradation under load (FR-012) and sustained rate (SC-004) are measured as `sum(frame-rendered.skipped)`, not as a count of `frames-dropped` — T070 and T072 assert on that.
- Recorded after the fact: this was settled while building T064 and landed with the code; T094 records the lapse.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §6
- Related ADR: [0012](./0012-playback-sound-is-placed-on-the-timeline-by-the-worker.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 90b0009:docs/adr/0013-the-worker-counts-skipped-frames.md`
