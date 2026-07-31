# The engine runs in a Worker, the UI never renders

Decoding, compositing (PixiJS) and encoding all run inside a Web Worker drawing into an `OffscreenCanvas`; the main thread owns React and the Project state and nothing else. Preview and Export therefore share not just the same code but the same thread and the same GPU context.

The alternative — rendering on the main thread — is materially easier to write and debug, but a single expensive Frame stalls the interface, and an Export freezes the tab outright. Moving the engine off the main thread later would mean rewriting every render call site, so this is cheaper to decide now than to retrofit.

What crosses the boundary is a snapshot, not a command stream: the main thread stays the single owner of the Project and posts a flat description of everything that affects the picture whenever it changes, then posts only a Frame number to ask for a Render. The worker holds no editing logic and cannot drift out of sync — the cost being that a snapshot is cloned per change, so continuous gestures like dragging need throttling.

## Consequences

- Everything the engine needs must survive `postMessage`; the message protocol is a real interface that has to be designed, not an implementation detail.
- Debugging spans two threads, and errors in the worker need explicit forwarding to be visible at all.
