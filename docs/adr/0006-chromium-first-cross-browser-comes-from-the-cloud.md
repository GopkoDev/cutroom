# Chromium-first; cross-browser arrives with cloud Sources

We target Chrome and Edge only, and say so plainly to anyone arriving in another browser. We do not build fallbacks for missing local-file capabilities.

This is affordable precisely because of how Sources are addressed (ADR 0005). The one capability that is structurally absent elsewhere is the persisted local file handle; everything else we depend on — WebCodecs, OffscreenCanvas in a worker, OPFS, Web Audio — exists in Safari and Firefox too, and codec differences are already runtime-detectable through Mediabunny's `canEncode`/`canDecode`. So when the product gains cloud storage, Sources addressed by URL make other browsers work without touching the engine.

## Consequences

- Export format options must be built from runtime capability checks rather than a hardcoded list, so that this stays true.
- Being Chromium-only is a stated position with an expiry date, not an accident. Code should not accumulate assumptions beyond the one capability we actually rely on.
