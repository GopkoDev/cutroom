# All rendering happens in the browser, on Mediabunny + PixiJS

We are building a real, full multi-track video editor (video/audio/text/effect tracks, colour grading, transitions), and every frame it produces — both preview and final export — is rendered client-side: Mediabunny for demuxing, decoding and muxing via WebCodecs, PixiJS for compositing on the GPU. We rejected a server-side ffmpeg render path because it would require uploading tens of gigabytes of source media and, worse, a second implementation of every effect that must match the PixiJS output pixel-for-pixel.

## Consequences

- Exporting long or 4K projects is bounded by browser memory and by the encoders the browser exposes; codec support (notably in Safari) is a runtime capability we must detect, not assume.
- There is no headless/API rendering: a render only exists while a tab is open.
