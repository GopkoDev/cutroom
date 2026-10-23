---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0006 — Chromium-first; cross-browser arrives with cloud Sources

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

The one capability that is structurally absent outside Chromium is the persisted local file handle; everything else we depend on — WebCodecs, OffscreenCanvas in a worker, OPFS, Web Audio — exists in Safari and Firefox too, and codec differences are already runtime-detectable through Mediabunny's `canEncode`/`canDecode`.

## Decision drivers

- Sources are addressed (ADR 0005), so when the product gains cloud storage, Sources addressed by URL make other browsers work without touching the engine.

## Considered options

1. **Chrome and Edge only, stated plainly, no fallbacks.**
2. **Build fallbacks for missing local-file capabilities** in other browsers — not done.

## Decision outcome

**Chosen:** Option 1, Chromium-first.

We target Chrome and Edge only, and say so plainly to anyone arriving in another browser. We do not build fallbacks for missing local-file capabilities. This is affordable precisely because of how Sources are addressed (ADR 0005).

## Consequences

**Positive**
- None recorded in the original ADR.

**Negative**
- Being Chromium-only is a stated position with an expiry date, not an accident. Code should not accumulate assumptions beyond the one capability we actually rely on.

**Neutral**
- Export format options must be built from runtime capability checks rather than a hardcoded list, so that this stays true.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §2
- Related ADR: [0005](./0005-sources-are-referenced-never-copied.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0006-chromium-first-cross-browser-comes-from-the-cloud.md`
