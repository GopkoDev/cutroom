---
id: T090
title: "Audit resource lifetimes across `packages/engine`"
layer: "tests"
deps: []
blocks: []
acs: []
files_hint: ["packages/engine/", "docs/features/import-play-export/_evidence/memory-trace.md"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T090 — Audit resource lifetimes across `packages/engine`

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 6 — Polish & Cross-Cutting Concerns (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 6 (Polish & Cross-Cutting Concerns) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T090 Audit resource lifetimes across `packages/engine`: every `VideoFrame` closed, every pooled canvas released, decoders torn down on `detach-source`, and a long-export memory trace recorded in `specs/001-import-play-export/` as evidence — **done**: every acquire site in `packages/engine/src` audited against what Mediabunny 1.52.2 and PixiJS 8.19 actually close (table in `memory-trace.md`), and five lifetime bugs fixed: a pooled canvas stranded on loan when one Clip's fetch failed under `Promise.all` (`settleAll` now waits for every fetch); an export torn down under a Frame still rendering; the encoder-delay probe's `AudioEncoder` left open on failure; **two `Promise`s per exported Frame held until the export ended** (`unlessHalted` raced one long-lived halt signal — worker heap 19.7 → 24.9 MB over ten minutes, ≈25 600 Promises in a snapshot diff; now 18.9 → 20.5 MB and none); and **an export cancelled at once leaking its `Output`, `VideoEncoder` and renderer** through a Mediabunny race (the encoder is created inside the first `add()` and `cancel()` does not wait for it — 5 encoders and 6 renderers left after 20 cancels; the tidy-up now waits for in-flight `add()`s). The last two were found only by measuring. Measured in Chrome through the real app with live WebCodecs counters in the worker, its heap via CDP after forced GC, heap snapshots by class and process footprint: a 10-minute 1080p export (18 000 Frames, 88.8 s) creates and closes 54 001 `VideoFrame`s, holds 10–14 live, ends with no open codec, and its heap returns to 15.9 MB once finalized; 20 cancels, 200 play/seek/stop cycles and 50 (also 100) detach/re-attach cycles are flat after warm-up, with exactly one `Input`, demuxer and sink retained. The `export-failed` reason for a lost Source now names it a Source
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T090, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

None — infrastructure, measurement or documentation task; no spec §5 criterion is satisfied by it alone (the Spec Kit breakdown tied it to no FR or acceptance scenario).

## Checklist

- [x] Audit resource lifetimes across `packages/engine`: every `VideoFrame` closed, every pooled canvas released, decoders torn down on `detach-source`, and a long-export memory trace recorded in `specs/001-import-play-export/` as evidence

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 6, commits a49c7f8).
- [x] Delivered in Spec Kit Phase 6 (Polish & Cross-Cutting Concerns), commits a49c7f8
