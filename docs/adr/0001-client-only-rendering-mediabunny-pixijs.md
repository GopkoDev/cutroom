---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0001 — All rendering happens in the browser, on Mediabunny + PixiJS

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

We are building a real, full multi-track video editor (video/audio/text/effect tracks, colour grading, transitions), and every frame it produces — both preview and final export — has to be rendered somewhere.

## Decision drivers

- Not uploading tens of gigabytes of source media to render it.
- One implementation of every effect: a second renderer would have to match the PixiJS output pixel-for-pixel.

## Considered options

1. **Client-side rendering** — Mediabunny for demuxing, decoding and muxing via WebCodecs, PixiJS for compositing on the GPU.
2. **A server-side ffmpeg render path** — rejected: it would require uploading tens of gigabytes of source media and, worse, a second implementation of every effect that must match the PixiJS output pixel-for-pixel.

## Decision outcome

**Chosen:** Option 1, client-side rendering.

Every frame the editor produces — both preview and final export — is rendered client-side: Mediabunny for demuxing, decoding and muxing via WebCodecs, PixiJS for compositing on the GPU.

## Consequences

**Positive**
- One renderer, so Preview and Export cannot disagree about an effect.

**Negative**
- Exporting long or 4K projects is bounded by browser memory and by the encoders the browser exposes; codec support (notably in Safari) is a runtime capability we must detect, not assume.
- There is no headless/API rendering: a render only exists while a tab is open.

**Neutral**
- None recorded in the original ADR.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §4
- Related ADR: [0003](./0003-engine-runs-in-a-worker.md), [0006](./0006-chromium-first-cross-browser-comes-from-the-cloud.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0001-client-only-rendering-mediabunny-pixijs.md`
