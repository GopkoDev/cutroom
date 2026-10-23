# The worker counts the Frames playback skips

`frame-rendered` carries a required `skipped` count: the Frames playback passed over to reach this one, measured from the previous Frame of the same run, or from `fromFrame` for the first. It is always 0 for a scrub. `frames-dropped` keeps a narrower meaning — a request that got no picture because a newer one displaced it.

The engine client keeps one `render-frame` in flight and treats each `frame-rendered` or `frames-dropped` as the answer to it. With that guard in place the worker almost never displaces a request, so `frames-dropped` stays near zero even while the picture stutters, and reporting skipped Frames as extra `frames-dropped` events would break the one-answer-per-request pairing. Only the worker knows where a run starts, so only it can tell a skip under load from a seek.

## Consequences

- Picture degradation under load (FR-012) and sustained rate (SC-004) are measured as `sum(frame-rendered.skipped)`, not as a count of `frames-dropped` — T070 and T072 assert on that.
- Every `render-frame` still gets exactly one answer, which the client's latest-wins guard depends on.
- Recorded after the fact: this was settled while building T064 and landed with the code; T094 records the lapse.
