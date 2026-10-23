---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0015 — An Export has its own renderer, and its file is committed once

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `a49c7f8`

## Context

An Export runs while the user keeps editing (FR-019), so the Preview must keep scrubbing and playing during it. Chrome will not transfer a `FileSystemWritableFileStream` to a worker. Closing a file stream commits it, and Mediabunny's cancel closes its target.

## Decision drivers

- Principle III: "the Preview is what you get" — one drawing path.
- FR-019: editing continues during an Export without affecting it or being affected by it.
- FR-018: no partial file is ever presented as finished.

## Considered options

1. **Same worker and drawing code, but the Export's own canvas, renderer and decoders; commit only on the close inside `finalize`.**
2. **Borrow the Preview's canvas** — would put exported Frames on screen and the user's scrubs into the file.
3. **Share decoders** — would let a scrub seek the decoder an Export is walking.
4. **Let Mediabunny's cancel close the target** — closing commits, so a cancelled export would commit a truncated file.

## Decision outcome

**Chosen:** Option 1.

An Export runs in the same worker and through the same drawing code as the Preview (`renderScene`, the same streaming path), but on its **own** `OffscreenCanvas`, its own PixiJS renderer and its own set of decoders. This narrows ADR 0003's "the same thread and the same GPU context": the thread and the code are shared, the canvas and the decoders are not. One drawing path, two sets of state, is what keeps "the Preview is what you get" (Principle III) without the two interfering.

The destination is committed in exactly one place. The main thread keeps the file stream and the worker writes through a forwarding `WritableStream` (`forwardingWritable`). The worker's wrapper commits only on the close inside `finalize` and aborts on every other ending. A file is finished only when the worker has said `export-done` **and** the main thread's commit has resolved — a write or commit can fail on the main thread after the worker has finished, and has been measured doing so.

## Consequences

**Positive**
- "Done" in the interface waits for the commit; a cancelled or failed Export never has a committed file behind it.

**Negative**
- An Export costs a second GPU context and a second set of decoders while it runs; a machine that cannot afford both shows it as a slower Export, not a broken Preview.

**Neutral**
- Recorded after the fact (T094, audit A1/A2): both were settled while building T078–T084 and landed with the code.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §5
- Related ADR: narrows [0003](./0003-engine-runs-in-a-worker.md); [0014](./0014-exported-aac-carries-an-edit-list.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show a49c7f8:docs/adr/0015-export-has-its-own-renderer-and-commits-once.md`
