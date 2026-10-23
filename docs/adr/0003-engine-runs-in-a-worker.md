---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0003 — The engine runs in a Worker, the UI never renders

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

Decoding, compositing and encoding have to run somewhere, and Preview and Export must come from the same code. Moving the engine off the main thread later would mean rewriting every render call site, so this is cheaper to decide now than to retrofit.

## Decision drivers

- A single expensive Frame must not stall the interface, and an Export must not freeze the tab.
- Preview and Export share the same code.
- The main thread stays the single owner of the Project.

## Considered options

1. **Engine in a Web Worker on an `OffscreenCanvas`**, fed snapshots.
2. **Rendering on the main thread** — materially easier to write and debug, but a single expensive Frame stalls the interface, and an Export freezes the tab outright.
3. **A command stream across the boundary** instead of a snapshot — the worker would hold editing logic and could drift out of sync.

## Decision outcome

**Chosen:** Option 1, the engine in a Worker, fed snapshots.

Decoding, compositing (PixiJS) and encoding all run inside a Web Worker drawing into an `OffscreenCanvas`; the main thread owns React and the Project state and nothing else. Preview and Export therefore share not just the same code but the same thread and the same GPU context.

What crosses the boundary is a snapshot, not a command stream: the main thread stays the single owner of the Project and posts a flat description of everything that affects the picture whenever it changes, then posts only a Frame number to ask for a Render. The worker holds no editing logic and cannot drift out of sync — the cost being that a snapshot is cloned per change, so continuous gestures like dragging need throttling.

## Consequences

**Positive**
- The worker holds no editing logic and cannot drift out of sync.

**Negative**
- Debugging spans two threads, and errors in the worker need explicit forwarding to be visible at all.
- A snapshot is cloned per change, so continuous gestures like dragging need throttling.

**Neutral**
- Everything the engine needs must survive `postMessage`; the message protocol is a real interface that has to be designed, not an implementation detail.
- Narrowed by ADR 0015: an Export shares this thread and the drawing code with the Preview, but has its own canvas, renderer and decoders.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §4
- Related ADR: [0008](./0008-audio-stays-on-the-main-thread.md), narrowed by [0015](./0015-export-has-its-own-renderer-and-commits-once.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0003-engine-runs-in-a-worker.md`
