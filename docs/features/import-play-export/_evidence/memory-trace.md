# Resource lifetimes and memory trace (T090)

> **Migrated record.** This is the Spec Kit file `specs/001-import-play-export/memory-trace.md`, moved unchanged into SDD's feature folder as supporting evidence (T090). References inside it to other Spec Kit files mean those files as they stood at `a49c7f8`. Where its content lives now: Spec Kit `spec.md` FR-/SC- ids → [spec.md](../spec.md) §5 traceability table and §6; `plan.md` and `research.md` → [sad.md](../sad.md); `decisions.md` → spec §1 and sad.md §4/§8/§11; `tasks.md` → [tasks/](../tasks/_epic.md) (task ids unchanged); `quickstart.md` and `validation.md` → [_evidence/](../_evidence/quickstart.md); `.specify/memory/constitution.md` → [docs/constitution.md](../../../constitution.md).

Evidence for T090: every decoded picture and sample the engine touches is closed, every pooled
canvas is released, and every Mediabunny `Input`, sink, iterator, decoder and encoder is torn down
on the paths that should end it. The method is a static audit of `packages/engine/src` against
what Mediabunny 1.52.2 actually does (read from `node_modules`, not assumed), five fixes (two of them found only by the measurement), and a
measurement in Chrome of the real app over a long export and three repeated cycles.

Measured 2026-10-23 on the reference machine (MacBook Air, Apple M4), Google Chrome via
Playwright (`channel: "chrome"`), the editor's own Vite dev server on a private port with file
watching and HMR off.

## 1. What Mediabunny closes for us

Read from `mediabunny/src/media-sink.ts`, `media-source.ts`, `output.ts`, `input.ts` (1.52.2):

| Mediabunny object | Who closes what |
| --- | --- |
| `CanvasSink.getCanvas` / `canvasesAtTimestamps` | Draws each `VideoSample` into the pooled canvas and **closes the sample itself** (`_videoSampleToWrappedCanvas`). We never hold a `VideoFrame` from a sink — only the canvas, which is a loan (R1). |
| `getCanvas(t)` (random access) | Runs a one-timestamp `samplesAtTimestamps` walk to completion: its own `VideoDecoder`, flushed and **closed in the pump's `finally`**. An idle sink holds no decoder. |
| `samplesAtTimestamps` / `samples` iterator `return()` | Sets `terminated`, wakes the pump (which then skips the flush and closes the decoder in its `finally`), and closes every queued sample. Samples decoded after termination are closed on arrival. |
| The same iterator on a disposed `Input` | `next()` closes the queued samples and throws `InputDisposedError`; the pump stops at its next disposed check and closes its decoder. One narrow gap: a pump parked on a full queue is only woken by `next()`/`return()`, and `CanvasSink`'s `async*` wrapper does not forward `return()` once the inner `next()` has thrown. Our sinks call `return()` before that can happen (`sinkForClip` drops the sink of a detached Source at the next Frame), and the measurements below show no decoder outliving it. |
| `Input.dispose()` | Frees the source's readers and disposes the demuxer; ongoing sink operations end with `InputDisposedError`. Does **not** reach into iterators we hold — closing those is ours. |
| `CanvasSource.add` | Wraps the canvas in a `VideoSample` (a `VideoFrame`) and passes `shouldClose = true`: the encoder wrapper closes it after `encode`. |
| `AudioSampleSource.add(sample)` | Does **not** close the caller's `AudioSample` — ours are closed in a `finally` (export/run.ts, encoder-delay.ts). |
| `Output.finalize` / `Output.cancel` | Flush (or force-close) every source's encoder; the encoder wrapper's `finally` closes the `VideoEncoder`/`AudioEncoder` and any queued frames even when flushing threw. `cancel()` during `finalizing` does nothing — `finalize`'s own `finally` closes the targets. **Race:** an encoder is created lazily inside a source's first `add()`, and `cancel()` does not wait for that — cancelled mid-configure, the encoder created afterwards is never closed (see 3.5). |
| `EncodedVideoChunk` / `EncodedAudioChunk` | Have no `close()` in WebCodecs; they are plain GC'd buffers. Mediabunny creates them inside the muxer pipeline and the engine never holds one. Nothing to close. |

PixiJS 8.19: `Texture.destroy(true)` destroys the `CanvasSource` and its GPU texture, leaving the
canvas; `Renderer.destroy()` calls `WEBGL_lose_context.loseContext()`, so an export's WebGL context
is given back rather than left for the browser's context limit to evict.

## 2. Static audit: every acquire site and its release

| Acquired | Where | Released | On which endings |
| --- | --- | --- | --- |
| `Input` over a `BlobSource` (per Source) | `sources/attach.ts` `attachSource` | `input.dispose()` in `releaseSource` (detach, or a Relink replacing it) or in the `catch` of a refused file | detach-source; Relink; refusal; worker terminate |
| `EncodedPacketSink` + `packets()` iterator (Timebase measurement) | `attach.ts` `readTimebase` | `for await … break` calls `return()`; packet-only, no decoder | always, inside the attach |
| `CanvasSink` + one pooled `OffscreenCanvas` (per visible Clip, per consumer) | `sources/canvas-sink.ts` `sinkForClipIn` | dropped from its `SinkSet` by `retainSinks` (Clip not visible in the Frame being rendered), by `sinkForClip` (Source detached or relinked, frame size changed), and by the export's `retainSinks(new Set())` | Scene change removing a Clip: at the next Frame rendered; detach: at the next Frame; export end/cancel/failure: in its tidy-up. Bounded by the Clips visible in the last Frame. |
| Pooled-canvas **loan** (`onLoan`) | `ClipSink.pull` / `pullStreamed` | `ClipSink.release()` in the Render's `finally` (scrub.ts, stream.ts); a `null` answer or a throw ends the loan at once | every Render, including one where a fetch fails — **fixed, see 3.1** |
| `canvasesAtTimestamps` iterator + its `VideoDecoder` (per streaming Clip) | `ClipSink.openStream` | `abandonStream()` → `iterator.return()`; also on reopening, on the iterator finishing, and on error | transport `stopped` and every `playing` (`abandonStreams`); scrub (`abandonStream` per Clip); Clip leaving the Frame or its sink dropped; export tidy-up |
| `AudioSampleSink.samples()` iterator + `AudioDecoder` (per Clip with sound, per run) | `sources/audio.ts` `decodeClip` | `decode.close()` → `samples.return()` in the decode's `finally`, and from `cancel(decode)` | transport stop / new run (`end()`); Scene change moving or removing the Clip (`replaceScene`); detach (`InputDisposedError` on the next pull → `finally`); export tidy-up (`sourceSound.stop()`) |
| Decoded `AudioSample`s (`AudioData`) | `audio.ts` loop | `sample.close()` in a `finally` per sample; a sample that arrives after the run stopped is closed before returning | always |
| PCM `Float32Array`s | `audio.ts` `flush` | transferred (`postMessage` transfer list), never copied | always |
| `Sprite` + `Texture` + Pixi `CanvasSource` (per drawn Clip) | `compose/renderer.ts` / `scene-clip.ts` | `sprite.destroy()` → `texture.destroy(true)` when the Clip is not in the Frame drawn; a new sink canvas replaces the texture | each Render; `renderer.destroy()` |
| Export `OffscreenCanvas` + Pixi renderer (WebGL context) | `export/run.ts` `build` | `renderer.destroy()` in the run's `finally` (loses the context), awaited from its creation promise so one still being created is destroyed too | done, cancelled, failed — **after the in-flight Frame settles, see 3.2** |
| Export `Output` + `CanvasSource` / `AudioSampleSource` encoders | `run.ts` `build` | `video.close()` / `audio.close()` + `finalize()` on success; otherwise `output.cancel()` in the `finally`, **after every in-flight `add()` has settled (see 3.5)** | all endings |
| `VideoFrame` per exported Frame | Mediabunny `CanvasSource.add` | closed by Mediabunny after encode (`shouldClose`) | always |
| Export `AudioSample` per mixed chunk | `run.ts` `encodeAudio` | `sample.close()` when its `add()` settles | always |
| Each halt-able wait (`unlessHalted`) | `run.ts` | removed from the wait set when it settles; `halt` cuts every one still waiting (**see 3.4**) | always |
| Export's own sound decode (`createAudioPlayback`) | `run.ts` | `sourceSound.stop()` in the run's `finally` | all endings |
| The destination stream (`WritableStream` writer) | `run.ts` `createDestination` | `writer.close()` only after `commit()`; `writer.abort()` on every other ending | all endings (T082–T084) |
| Encoder-delay probe: `Output` + `BufferTarget` + `AudioSampleSource`, `AudioSample` impulse, `Input` + `AudioSampleSink` over the result | `export/encoder-delay.ts` | `impulse.close()`; `source.close()` + `finalize()`; `input.dispose()` in a `finally`; decoded samples closed per sample — and now `output.cancel()` if anything before `finalize` threw (**see 3.3**) | every export with sound |
| Capability probe | `capabilities.ts` | `isConfigSupported` only — nothing constructed | — |
| Everything above | the Worker | `worker.terminate()` (engine client, editor unmount) ends the isolate; the browser closes its codecs and GPU contexts | worker terminate |

**Detach timing.** `detach-source` disposes the `Input` immediately. A stopped Preview holds no
decoder at all (random access closes its decoder per Frame; `stopped` closes every stream), so
nothing is left open. During playback the Clip's stream is closed at the next Frame and its sound
decode at the next Playhead move — both within one Frame interval. The one canvas the sink pooled
is dropped at the next Render.

## 3. Leaks found and fixed

### 3.1 A pooled canvas left on loan forever when one Clip's fetch failed

`renderByRandomAccess` and `renderByStreaming` fetched every visible Clip's picture with
`Promise.all` and released the recorded loans in a `finally`. If one Clip's pull threw (a decoder
error), `Promise.all` rejected at once and the `finally` ran while the other Clips were still
decoding; their loans were recorded *after* the release and never released. Those sinks then
refused every later pull ("pulled again before the last picture was drawn") — a stranded pooled
canvas and a stream that never decoded ahead again. Fix: `settleAll` (sources/canvas-sink.ts)
waits for every fetch to settle, then rethrows the first failure, so the `finally` sees every
loan. Used by both render paths.

### 3.2 An export torn down under a Frame still rendering

Every wait in the export loop races the halt signal, so on cancel or failure the loop stops
*waiting* for `renderByStreaming` but the Render itself keeps going. The tidy-up then ran
`sinks.retainSinks(new Set())` and `renderer.destroy()` under it; a Render that was still building
its sink could open a stream after the last `retainSinks` and start a `VideoDecoder` that nothing
would ever `return()` — a decoder and up to eight queued 1080p frames, closed only by GC. Fix:
`run.ts` keeps the in-flight Frame (`rendering`) and the tidy-up awaits it before dropping sinks
and destroying the renderer. The cancel answer still goes out first (SC-009 is unaffected: the
answer is sent before the tidy-up, as before).

### 3.3 The encoder-delay probe's encoder left open on failure

`measureEncoderDelay` built an `Output` and only `finalize()` closed its `AudioEncoder`. If
`start`, `add` or `finalize` threw (an encoder that refuses the settings), the encoder was left
open with nothing holding the `Output`. Fix: the probe cancels its `Output` on any failure before
rethrowing.

### 3.4 Every exported Frame kept two `Promise`s alive until the export ended

Found by the measurement, not the audit: during the ten-minute export the worker's heap grew
linearly, 19.7 → 24.9 MB over 15 500 Frames, and dropped back only at the end. A heap-snapshot
diff between Frame ~2 100 and Frame ~15 000 put almost all of it in `Promise` (+25 566), closures
(+51 132) and their contexts (+25 565): two per Frame. The cause was `unlessHalted`, which raced
each wait against one halt signal that stays pending for the whole export — and every
`Promise.race` leaves a reaction on that signal. Fix: each wait registers its own rejecter in a set
that `halt` empties, and takes itself out when it settles (export/run.ts). After the fix the
same export grows 18.9 → 20.5 MB, and the snapshot diff no longer shows `Promise`s or closures
(see 4.2).

### 3.5 An export cancelled at once leaked its whole pipeline (a race in Mediabunny)

Found by the measurement: after 20 exports cancelled alternately at once and part-way, 5
`VideoEncoder`s were still open and the worker held 5 `Output`s and 5 extra `WebGLRenderer`s — one
more for about every second "at once" cancel. Mediabunny 1.52 creates a source's encoder lazily
inside its first `add()` (`ensureEncoder`, async), and `Output.cancel()` → `flushAndClose(true)`
does not wait for it: cancelled while that first `add()` is still configuring, it closes nothing,
and the `VideoEncoder` constructed a moment later is never closed. An open encoder is a GC root,
and its output callback reaches the muxer, the `Output` and through them the export's renderer and
canvas. Fix (export/run.ts): every `add()` handed to an encoder is tracked until it settles, and
the tidy-up waits for those before cancelling the `Output`, so `cancel()` always finds the encoder
it has to close. Two neighbours fixed with it: the export's renderer is held as a promise, so a
halt while it is still being created destroys it once it exists; and a mixed-sound `AudioSample`
is closed when the encoder has finished with it rather than when the wait for it is cut short.

Also changed while here (not a leak): the `export-failed` reason for a Source lost mid-export said
"the media of Clip …"; it now says "the Source of Clip … went Offline or was relinked during the
export", in CONTEXT.md's terms. The editor's failure wording still matches it (it keys on "went
offline or was relinked", case-insensitive).

## 4. Measurement

### 4.1 Method

A throwaway Playwright spec drove the real editor (import through the stubbed file picker,
Export dialog, transport button, Relink prompt) in Chrome launched with `--js-flags=--expose-gc`,
against a fresh Vite server with file watching and HMR off (other agents were editing the tree;
a hot reload had sent the first attempt back to the Project list). At each sample it recorded:

- **Live WebCodecs objects in the engine's Worker.** The `Worker` constructor was wrapped (as
  `playback-probe.ts` does for `workerLoad`) so the engine's module ran behind a bootstrap module
  that first proxies `VideoFrame`, `AudioData`, `OffscreenCanvas` and the four codec
  constructors, wraps `close()`/`clone()`, and wraps each decoder's `output` callback so frames
  the decoder hands out are counted too. *Live* = created − closed; *GC-unclosed* counts frames a
  `FinalizationRegistry` saw collected without `close()`; *open coders* are codec objects whose
  `state` is not `"closed"`. Read with Playwright's `worker.evaluate`.
- **Worker JS heap after a forced GC**: CDP on the Worker's own target (a non-flat child session
  from `Target.setAutoAttach`), `HeapProfiler.collectGarbage` then `Runtime.getHeapUsage`.
  `measureUserAgentSpecificMemory()` was not available: the dev server sends no COOP/COEP, so the
  page is not cross-origin isolated.
- **Retained objects by class**: a full heap snapshot of the Worker at chosen points, counting
  Mediabunny's and PixiJS's classes (`Input`, `IsobmffDemuxer`, `CanvasSink`, `Output`,
  `CanvasSource`, `WebGLRenderer`, `Texture`, …) and diffing every constructor's count and size.
- **Process memory**: macOS physical footprint (`footprint -p`) of this run's Chrome renderer,
  GPU and browser processes.

Nothing else was running Playwright during the measured runs. Numbers are from the final code.

### 4.2 Long export — `sync-1080p30-10min.mp4`, 18 000 Frames, 1080p30 with sound

Exported through the dialog at its default quality in 88.8 s.

| Point | Frames done | Worker heap | Live `VideoFrame`s | Open coders (VD/AD/VE/AE) | GPU proc. | Renderer proc. |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| before export | — | 13.6 MB | 0 | 0/0/0/0 | 272 MB | 210 MB |
| t = 10 s | 2 115 | 18.9 MB | 10 | 1/0/1/1 | 347 MB | 251 MB |
| t = 22 s | 4 766 | 19.5 MB | 14 | 1/0/1/1 | 343 MB | 266 MB |
| t = 33 s | 7 321 | 19.5 MB | 14 | 1/0/1/1 | 346 MB | 256 MB |
| t = 44 s | 9 859 | 19.7 MB | 10 | 1/0/1/1 | 344 MB | 258 MB |
| t = 55 s | 12 439 | 20.0 MB | 13 | 1/0/1/1 | 344 MB | 259 MB |
| t = 66 s | 14 966 | 20.2 MB | 12 | 1/0/1/1 | 345 MB | 243 MB |
| t = 78 s | 17 664 | 20.5 MB | 14 | 1/0/1/1 | 343 MB | 247 MB |
| done | 18 000 | 15.9 MB | 0 | 0/0/0/0 | 179 MB | 234 MB |
| dismissed + 2 s | — | 15.9 MB | 0 | 0/0/0/0 | 142 MB | 231 MB |

54 001 `VideoFrame`s were created over the export (decoder output, the sink's draw, the encoder's
input) and 54 001 closed; none was collected unclosed. Live frames stay between 10 and 14 — the
decoder's queue, the frame being drawn and the encoder's queue — with no trend. GPU and renderer
memory are flat while the export runs and fall back when it ends.

The worker heap's remaining slope, +1.6 MB over 15 500 Frames (about 100 bytes a Frame), is the
MP4 index: the snapshot diff between Frame 2 115 and Frame 14 966 is +13 713 plain `Object`s,
+40 321 heap numbers and +857 arrays, and nothing else of note — the per-sample records Mediabunny
keeps to write the `moov` at the end (`fastStart: false`, which the edit list needs, ADR 0014). It
is freed when the file is finalized: 15.9 MB after, against 13.6 MB before, the difference being
compiled code (snapshot category `(code)`), which also stays after the cycles below. Before fix
3.4 the same export went 19.7 → 24.9 MB.

After the export, the snapshot holds exactly what the Preview holds: one `Input`, one
`IsobmffDemuxer`, one `CanvasSink`, one `WebGLRenderer`, no `Output`, no `AudioSampleSink`.

### 4.3 20 exports cancelled, then one finished — `sync-1080p30.mp4`, 900 Frames

Odd cycles cancel the moment Cancel is enabled; even ones once 200 Frames are done.

| After | Worker heap | Live `VideoFrame`s | Open coders (VD/AD/VE/AE) | Live canvases | GPU proc. |
| --- | ---: | ---: | --- | ---: | ---: |
| before | 12.4 MB | 0 | 0/0/0/0 | 2 | 246 MB |
| cancel 1 (at once) | 13.1 MB | 0 | 0/0/0/0 | 3 | 298 MB |
| cancel 2 (mid-run) | 13.8 MB | 0 | 0/0/0/0 | 3 | 298 MB |
| cancel 5 (at once) | 14.2 MB | 0 | 0/0/0/0 | 3 | 260 MB |
| cancel 10 (mid-run) | 14.8 MB | 0 | 0/0/0/0 | 3 | 294 MB |
| cancel 15 (at once) | 14.9 MB | 0 | 0/0/0/0 | 3 | 258 MB |
| cancel 20 (mid-run) | 15.0 MB | 0 | 0/0/0/0 | 3 | 292 MB |
| + one finished export | 15.1 MB | 0 | 0/0/0/0 | 3 | 291 MB |

21 export pipelines built and torn down (21 `VideoEncoder`s, 32 `AudioEncoder`s including the
encoder-delay probes); after cycle 2, after cycle 20 and after the finished export the snapshot
holds no `Output`, no `AudioSampleSource` and one `WebGLRenderer` (the Preview's). The heap's rise
flattens (14.8 → 15.0 MB over the last ten cycles) and is compiled code. Before fix 3.5, the same
run ended with 5 open `VideoEncoder`s, 5 `Output`s, 6 `WebGLRenderer`s and 8 live canvases.

### 4.4 200 play / seek / stop cycles — `sync-1080p30-10min.mp4`

Each cycle: Playhead to a random Frame, play for 150–450 ms, on even cycles seek during playback,
stop. 701 `VideoDecoder`s and 300 `AudioDecoder`s were opened and closed; 31 991 `VideoFrame`s and
about 42 000 `AudioData` decoded.

| After cycle | 0 | 20 | 40 | 60 | 100 | 140 | 200 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Worker heap (MB) | 13.6 | 15.2 | 15.3 | 15.5 | 15.5 | 15.5 | 15.6 |
| Live `VideoFrame`s / `AudioData` | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| Open coders | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Live canvases | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| GPU proc. (MB) | 254 | 220 | 218 | 219 | 221 | 219 | 218 |
| Renderer proc. (MB) | 210 | 220 | 240 | 232 | 234 | 223 | 224 |

Snapshots after cycle 20 and cycle 200 hold the same Mediabunny and PixiJS objects (one `Input`,
one `CanvasSink`, two `Sprite`s, five `Texture`s, one `WebGLRenderer`).

### 4.5 50 detach / re-attach cycles — `sync-1080p30.mp4`

Each cycle: play 300 ms and stop; rename the file away and move the Playhead, so the app finds it
gone and sends `detach-source`; rename it back and relink through the prompt (`attach-source` on a
fresh `File`); render a Frame. A 100-cycle run gave the same picture.

| After cycle | 0 | 5 | 10 | 20 | 30 | 40 | 50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Worker heap (MB) | 12.4 | 13.3 | 13.5 | 13.6 | 13.7 | 13.7 | 13.9 |
| Live `VideoFrame`s / `AudioData` | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| Live canvases (of created) | 2/3 | 2/8 | 2/13 | 2/23 | 2/33 | 2/43 | 2/52 |
| GPU proc. (MB) | 242 | 273 | 261 | 273 | 267 | 267 | 291 |

Each cycle's sink canvas is collected (2 live of 52 created). The snapshot after 10, 50 (and, in
the 100-cycle run, 100) cycles holds **one** `Input`, one `IsobmffDemuxer`, one `InputVideoTrack`,
one `CanvasSink` — every superseded Source's `Input` is gone. In the 100-cycle run the heap was
13.5 MB at cycle 10, 13.9 at 50 and 14.0 at 100, and the snapshot diff from 10 to 100 was
+385 KB of `(code)` and +45 KB `(native)` with no object growth. One decoder shows open in the
cycle-50 sample: the random-access decode of the Frame just requested, still in flight (it was 0 at
cycle 100 of the longer run).

### 4.6 Verdict

After the fixes, every trace is flat once warmed up: no live `VideoFrame` or `AudioData` between
operations, no codec left open, no retained `Input`, `Output`, sink or renderer beyond what the
Preview is using, and no process-memory trend. The remaining slow heap rise in every run is
compiled code, and the one in-export slope is the MP4 index, freed at finalize.

The probe spec and its helper were throwaway and have been deleted; the method above is enough to
rebuild them.

## 5. Addendum: ADR 0017 (2026-10-23)

ADR 0017 changed three rows of the tables above.

- **The picture sink is a `VideoSampleSink` plus one canvas per Clip**, not a `CanvasSink`.
  Every `VideoSample` it receives is closed on every path: drawn and closed, walked past and
  closed, or, when it was decoded ahead of a stream that is then abandoned, closed when it
  arrives. Samples still queued inside Mediabunny are closed by the iterator's `return()`, which
  for the plain sample iterator takes effect at once. The `CanvasSink` `async*` wrapper gap in
  section 1 no longer applies.
- **Scrubs no longer use `getCanvas`.** Every Frame comes from a per-Clip iterator under the walk
  rule, so a stopped Preview can hold a decoder. A scrub leaves one parked, holding about 45
  decoded Frames. It is closed after `PARK_MS` (3 s) with no job (`playback/scheduler.ts`), at
  once on `detach-source` (`SinkSet.forgetSource`), on `transport` (stopped: all of them; playing:
  every one that cannot walk to `fromFrame`), and when its Clip leaves the Frame. "A stopped
  Preview holds no decoder" is therefore true 3 s after the last Render rather than at once.
- Measured with WebCodecs counters in the worker: 30 cycles of steps, jumps, play, seek and stop
  over two Clips were flat (75 live Frames / 2 decoders at cycles 10, 20 and 30, both parked). It
  fell to 0 / 0 on detach with no Render after it, and a parked stream fell from 45 to 0 live
  Frames after the timeout. Evidence: `performance-baseline.md`, "After ADR 0017".
