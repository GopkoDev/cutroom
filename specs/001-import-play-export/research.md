# Phase 0 Research: Import, Play, Export

All findings below were checked against current Mediabunny and PixiJS documentation rather than
recalled. Architectural decisions already settled in `docs/adr/` are not re-litigated
here; this document resolves the unknowns those decisions leave open.

## R1. Getting a Clip's picture to the compositor

**Decision**: Per active Clip, hold a Mediabunny `CanvasSink` over the Source's video track. During
playback, pull from `sink.canvasesAtTimestamps(...)` driven by the Frames the clock asks for;
while scrubbing, drop the iterator and call `sink.getCanvas(t)`. Wrap the returned canvas in a
PixiJS texture whose source is updated each Frame.

**Rationale**: `CanvasSink` already does the decode-and-draw step and hands back an
`OffscreenCanvas`, which PixiJS can adopt as a texture source directly. Going through
`VideoSampleSink` and uploading a `VideoFrame` to a texture is likely faster but depends on PixiJS
accepting a `VideoFrame` as an image source, which is not documented as supported and would need
proving first. Correctness before throughput on the first slice.

**Alternatives considered**: `VideoSampleSink` + `sample.draw(ctx)` into our own canvas (one more
copy than `CanvasSink`, no benefit); `VideoSampleSink` + direct `VideoFrame` texture upload (the
optimisation to try once the slice works end to end).

**Caveat to respect**: `CanvasSink` pools its canvases. A canvas handed to us may be reused for a
later Frame, so it must be drawn into the scene before the next pull, never retained across
Frames.

## R2. Seeking versus streaming

**Decision**: Two modes, one owner. Playback keeps a live async iterator per active Clip and
never seeks. Scrubbing and stepping abandon the iterator and use random access. Entering playback
opens a fresh iterator at the target Frame.

**Rationale**: Random access per Frame risks a seek to the previous keyframe plus a re-decode of
everything between, which is the difference between smooth playback and none. A live iterator is
exactly what a decoder is good at. Mediabunny exposes both shapes (`sink.samples(start, end)` /
`canvasesAtTimestamps(...)` for sequential, `getCanvas(t)` / `getSample(t)` for random), so no
custom machinery is needed.

**Open risk**: the cost of the first Frame after a scrub is bounded by keyframe spacing in the
Source, which we do not control. If SC-003 (300 ms) is missed on long-GOP material, the fallback
is a scrub-quality path (lower resolution decode), not a change to the model.

## R3. Audio playback and the clock

**Decision**: Decode audio in the worker with `AudioSampleSink`, transfer the PCM to the main
thread, and schedule it on the main thread as `AudioBufferSourceNode`s a fixed lookahead ahead of
`audioContext.currentTime`. The clock is `audioContext.currentTime`, converted to a Frame index
and posted to the worker as the Frame to render.

**Rationale**: `AudioContext` is exposed to Window only (ADR 0008), so scheduling cannot move into
the worker. Decoding can, and should, because it is the expensive part. Deriving the Frame from
the audio clock — rather than from a timer — is what makes drift structurally impossible rather
than merely small.

**Alternatives considered**: `AudioWorklet` fed by a ring buffer from the worker (more control over
underruns, considerably more machinery; revisit if scheduling proves lumpy under load).

## R4. Export pipeline

**Decision**: `Output` with `Mp4OutputFormat`, writing through `StreamTarget` wrapped around the
`FileSystemWritableFileStream` from `showSaveFilePicker()`. Video comes from a `CanvasSource` over
the renderer's `OffscreenCanvas`, advanced Frame by Frame with
`add(frameToSeconds(timebase, frame), frameToSeconds(timebase, 1))` — through the conversion
module, never by dividing by a rate at the call site (Principle II). Audio
is mixed on the main thread into PCM by `OfflineAudioContext`, transferred to the worker as
`Float32Array`s, and added as `AudioSample`s through an `AudioSampleSource`. `output.finalize()`
closes the stream.

**Rationale**: `StreamTarget` over a file handle gives constant memory for arbitrarily long
exports — the file is never assembled in RAM. Audio cannot use `AudioBufferSource`, because
`AudioBuffer` is Window-only and the muxer lives in the worker; `AudioSample` accepts raw bytes
(`AudioSampleInit { data, format, numberOfChannels, sampleRate, timestamp }`), which is exactly the
worker-safe path.

**Backpressure**: both `videoSource.add()` and `audioSource.add()` return promises that resolve
when the encoder and writer are ready for more. They must be awaited, not fired and forgotten, or
memory grows without bound.

## R5. Choosing export settings

**Decision**: Build the offered settings at the moment the export dialog opens, from
`canEncode('avc')` / `canEncodeVideo('avc', { width, height, bitrate })` and the audio equivalent.
Nothing is hardcoded (Principle I). If AAC is unavailable, the product says so rather than
failing at finalize.

**Rationale**: WebCodecs codec availability varies by browser and machine, and Mediabunny's own
docs treat it as a runtime question with polyfill extensions for the gaps.

## R6. PixiJS inside the worker

**Decision**: Call `DOMAdapter.set(WebWorkerAdapter)` before constructing anything, then init the
renderer against the transferred `OffscreenCanvas`. One scene graph, rendered on demand: for
Preview when the clock asks, for Export once per Frame.

**Rationale**: This is the documented way to run PixiJS in a worker, and it keeps a single render
path for both Preview and Export (Principle III).

**Constraint it imposes**: nothing in the scene may depend on DOM measurement or events. Overlays
that need the DOM (selection handles, guides) belong in the React layer above the canvas, not in
the scene.

## R7. Where Frames and time convert

**Decision**: One module in `packages/model` owns the Timebase: `frameToSeconds`,
`secondsToFrame`, `frameToSampleIndex`, `framesForDuration`, `frameToSourceTime`, and the rational
rate itself. Every call into Mediabunny or Web Audio passes through it, including the one that maps
a Project Frame into a Source whose own Timebase differs — that is where the temptation to
improvise is strongest and where drift would be hardest to see. Lint rule or review check: no rate
arithmetic outside that module.

**Rationale**: Principle II says rounding outside this module is a defect. OpenReel demonstrates
the failure mode — `Math.round(time * frameRate) / frameRate` reimplemented independently in its
frame cache, render bridge and motion timing.

## R8. Testing strategy

**Decision**: Two tiers.

- **Vitest, node environment** — everything in `packages/model`: Timebase conversions, the reducer
  and its inverse patches, Project document migrations, Scene projection. No media, no browser.
- **Playwright against Chromium** — everything that touches WebCodecs, OPFS, file handles and
  audio: import a fixture file, assert a Frame renders, assert export produces a playable file,
  assert A/V sync using a fixture with a known sync mark.

**Rationale**: WebCodecs cannot be meaningfully faked; a unit test that mocks the decoder proves
nothing about the risky part. Conversely the arithmetic that must never drift is pure and
deserves fast tests. Fixtures are generated by `pnpm fixtures` and gitignored rather than
committed — `make-fixtures.ts` is deterministic, and the ten-minute fixture SC-002 needs has no
business in git history. They include one whose Source Timebase differs from the Project's (edge
case in the spec), one with no audio track, one audio-only and one image (both must be refused),
and one long enough to prove that import does not read the whole file.

## R9. Storage in this slice

**Decision**: IndexedDB only — one store for Project documents, one for the Source link table
(`sourceId → FileSystemFileHandle`). OPFS is not used yet; it arrives with thumbnails, waveforms
and proxies, none of which are in this slice.

**Rationale**: ADR 0005 reserves OPFS for derived data. This slice derives nothing worth keeping.
