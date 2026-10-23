# An Export has its own renderer, and its file is committed once

An Export runs in the same worker and through the same drawing code as the Preview (`renderScene`, the same streaming path), but on its **own** `OffscreenCanvas`, its own PixiJS renderer and its own set of decoders. This narrows ADR 0003's "the same thread and the same GPU context": the thread and the code are shared, the canvas and the decoders are not.

An Export runs while the user keeps editing (FR-019), so the Preview must keep scrubbing and playing during it. Borrowing the Preview's canvas would put exported Frames on screen and the user's scrubs into the file; sharing decoders would let a scrub seek the decoder an Export is walking. One drawing path, two sets of state, is what keeps "the Preview is what you get" (Principle III) without the two interfering.

The destination is committed in exactly one place. Chrome will not transfer a `FileSystemWritableFileStream` to a worker, so the main thread keeps the file stream and the worker writes through a forwarding `WritableStream` (`forwardingWritable`). Closing a file stream commits it, and Mediabunny's cancel closes its target, so the worker's wrapper commits only on the close inside `finalize` and aborts on every other ending. A file is finished only when the worker has said `export-done` **and** the main thread's commit has resolved — a write or commit can fail on the main thread after the worker has finished, and has been measured doing so.

## Consequences

- An Export costs a second GPU context and a second set of decoders while it runs; a machine that cannot afford both shows it as a slower Export, not a broken Preview.
- "Done" in the interface waits for the commit; a cancelled or failed Export never has a committed file behind it.
- Recorded after the fact (T094, audit A1/A2): both were settled while building T078–T084 and landed with the code.
