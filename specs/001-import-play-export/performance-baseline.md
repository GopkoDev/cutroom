# Performance baseline: compose budget (T091) and long-GOP seek latency (T092)

Measured 2026-10-23. Two items from the plan.md risk table: "PixiJS texture upload per Frame" and
"Scrub latency on long-GOP footage".

## Machine and method

- Apple M4 (10 cores), 16 GB, macOS 26.6.2 (25G83). This is the quickstart.md reference machine.
- Google Chrome 156.0.8078.47 (Playwright `channel: "chrome"`, headless, the repo's config).
  quickstart.md names Chrome 150. The numbers belong to this version.
- PixiJS reported `webgl` (WebGL 2.0, OpenGL ES 3.0 Chromium).
- Each run had a fresh Vite server on `CUTROOM_E2E_PORT=5188`. A watcher sampled
  `ps aux | grep "cli.js test"` every 2 s during each run. **None of the recorded runs overlapped
  another Playwright run.** One idle process from another agent (`probe-lifetimes`, about 0 % CPU)
  was alive the whole time. An earlier T091 run did overlap another agent's run. It was thrown
  away and repeated.
- Probes were throwaway Playwright specs and have been deleted. No `src/` file was changed.
  - **T091**: a probe module worker imported the real `packages/engine/src/compose/renderer.ts`
    (`createSceneRenderer` → `renderScene` → `scene-clip.ts`) and drove it on a 1920×1080
    OffscreenCanvas transferred from the page. It built Scenes and `ClipPicture`s directly as
    data. Decoding used Mediabunny `CanvasSink` (1920×1080, `fit: "fill"`, `poolSize: 1` in the
    pipeline mode), configured the way `sources/canvas-sink.ts` does it.
  - **T092**: the real engine worker (`packages/engine/src/worker.ts`) received `init` (1920×1080
    Project, 30 fps), `attach-source` (a `File`), and a one-Clip `scene`. After that it got
    `render-frame { reason: "scrub" }`. Each time runs from `postMessage` on the main thread to
    the `frame-rendered` **for that Frame** arriving on the main thread. "Paint" adds the next
    `requestAnimationFrame`. React and the input event are not in the number. T071 measured them
    at a few ms on top. The file is read into a `Blob` first, so disk I/O is not in the number
    either. With a warm OS cache that matches a picked file.

## T091: compose step at 1080p

### How the time is split

- **submit**: CPU time inside `renderScene`. This covers stage rebuild, `CanvasSource.update()`,
  and PixiJS issuing GL calls, including `texImage2D` from the sink's canvas.
- **gpu**: time for a 1×1 `gl.readPixels` straight after `renderScene`. This works as a fence: it
  returns only when the GPU has finished the upload(s) and the composite. The empty-stage floor
  (clear + fence, no Clips) is **1.6 ms p50 / 3.1 ms p99**. That is the fence round trip, not
  work. Real Frames do not fence, so this column is an upper bound on GPU time that would block.
- **decode**: wait for the Clips' next pictures from `canvasesAtTimestamps` iterators, one
  independent `Input` + `CanvasSink` per Clip, as with stacked Clips.
- Present goes to the display through Chrome's compositor at vsync and is not in the worker's
  per-Frame budget. The worker's job is done once the GPU has the Frame. That point is what
  "gpu" marks.

Every Clip is a full-frame opaque 1920×1080 picture (worst-case overdraw). Two runs were made. The
tables show run 2. Run 1 agreed within about 1 ms everywhere except the 8-Clip pipeline p99
(31–34 ms in run 1, 23–27 ms in run 2).

### A. Compose only (pictures already decoded; each canvas dirtied by a 1-px 2D write per Frame so the re-upload is real), 600 Frames after 60 warm-up

p50 / p95 / p99 in ms:

| Clips | submit        | gpu (incl. fence) | compose total  | left of 33.3 ms (p99) | left of 16.7 ms (p99) |
| ----- | ------------- | ----------------- | -------------- | --------------------- | --------------------- |
| 1     | 0.3/0.5/0.5   | 3.0/3.6/4.0       | 3.3/3.9/4.4    | 28.9                  | 12.3                  |
| 2     | 0.3/0.5/0.5   | 3.8/4.6/5.0       | 4.1/5.0/5.4    | 27.9                  | 11.3                  |
| 4     | 0.3/0.5/0.5   | 5.5/6.6/7.0       | 5.9/7.0/7.5    | 25.8                  | 9.2                   |
| 8     | 0.4/0.6/0.6   | 8.8/10.1/10.6     | 9.2/10.6/11.2  | 22.1                  | 5.5                   |

### B. Playback pipeline (decode → compose → GPU, serialised; 300 Frames after 30 warm-up)

`sync-1080p30.mp4` (T071 fixture, synthetic, cheap to decode):

| Clips | decode         | submit        | gpu            | whole Frame     | left of 33.3 (p99) | left of 16.7 (p99) |
| ----- | -------------- | ------------- | -------------- | --------------- | ------------------ | ------------------ |
| 1     | 0.2/0.5/2.8    | 0.0/0.2/0.2   | 2.6/5.1/6.4    | 2.8/5.6/7.2     | 26.1               | 9.5                |
| 2     | 0.3/0.8/3.4    | 0.1/0.2/0.4   | 6.0/7.3/8.0    | 6.3/8.2/9.6     | 23.7               | 7.1                |
| 4     | 0.5/1.3/6.0    | 0.1/0.2/0.4   | 10.2/11.5/11.9 | 11.0/12.3/12.7  | 20.6               | 4.0                |
| 8     | 1.8/3.8/15.0   | 0.3/0.6/0.7   | 14.6/18.3/20.4 | 16.8/21.5/23.4  | 9.9                | −6.7               |

`h264-1080p30-g300.mp4` (23 Mbps long-GOP, below):

| Clips | decode         | submit        | gpu            | whole Frame     | left of 33.3 (p99) | left of 16.7 (p99) |
| ----- | -------------- | ------------- | -------------- | --------------- | ------------------ | ------------------ |
| 1     | 0.1/0.4/0.7    | 0.0/0.1/0.1   | 2.6/3.7/4.7    | 2.8/4.0/5.1     | 28.2               | 11.6               |
| 2     | 0.4/1.1/2.9    | 0.1/0.2/0.3   | 6.2/7.2/7.8    | 6.6/8.2/9.3     | 24.0               | 7.4                |
| 4     | 0.7/1.8/4.5    | 0.1/0.3/0.4   | 9.8/10.9/11.5  | 10.8/12.0/13.1  | 20.2               | 3.6                |
| 8     | 2.9/7.8/13.8   | 0.3/0.6/0.7   | 14.5/19.2/22.7 | 18.0/22.7/27.3  | 6.0                | −10.6              |

### T091 conclusions

- **CPU-side compose is negligible**: `renderScene` returns in under 0.7 ms at p99 even with 8
  Clips. PixiJS scene-graph work is not where the budget goes.
- **The cost is GPU-side and grows with Clip count.** Compose only: about 1 ms per 1080p layer
  above the about 3 ms fence floor. In the real pipeline the cost is about 1.5–2 ms per layer.
  There, uploading a sink canvas also waits for the 2D draw (VideoFrame → canvas scale/convert)
  that Mediabunny just issued, so part of "gpu" is really decode-side colour conversion landing
  on the same GPU.
- **Baseline for Effects work at 30 fps:** one Clip leaves about 26–28 ms, four leave about 20 ms,
  eight leave about 6–10 ms (p99, serialised, fence included). **At 60 fps:** one Clip leaves
  about 10–12 ms, four leave about 4 ms, and eight are already over budget. That agrees with
  T064, where 8 stacked 1080p Clips at 30 fps showed 747 of 750 Frames.
- Not measured here: Effects themselves, non-full-frame placements, 4K Project frame sizes. A
  per-Clip shader pass at 1080p should be costed against the "left of" columns above.

## T092: first Frame after seek on long-GOP material

### Material (generated on the host; gitignored under `packages/engine/test/fixtures/longgop/`, about 1 GB total)

40 s at 30 fps (1200 Frames) of `testsrc2` with temporal + uniform grain (`noise=alls=22:allf=t+u`),
so it does not compress trivially. Constant bitrate, closed GOP, no scene-cut keyframes. ffprobe
confirmed keyframes at exactly 0, G, 2G, … and `has_b_frames=2`.

| File                | Codec / profile  | GOP | Bitrate  |
| ------------------- | ---------------- | --- | -------- |
| h264-1080p30-g250   | H.264 High, bf 3 | 250 | 23 Mbps  |
| h264-1080p30-g300   | H.264 High, bf 3 | 300 | 23 Mbps  |
| h264-4k30-g250      | H.264 High 5.1   | 250 | 46 Mbps  |
| h264-4k30-g300      | H.264 High 5.1   | 300 | 46 Mbps  |
| hevc-1080p30-g300   | HEVC Main, bf 4  | 300 | 20 Mbps  |
| hevc-4k30-g300      | HEVC Main, bf 4  | 300 | 38 Mbps  |

```sh
SRC="testsrc2=s=1920x1080:r=30:d=40,noise=alls=22:allf=t+u,format=yuv420p"   # 3840x2160 for 4K
ffmpeg -f lavfi -i "$SRC" -c:v libx264 -profile:v high -preset medium -bf 3 -g 300 -keyint_min 300 \
  -sc_threshold 0 -b:v 25M -maxrate 25M -bufsize 25M -movflags +faststart h264-1080p30-g300.mp4
ffmpeg -f lavfi -i "$SRC" -c:v libx265 -tag:v hvc1 -preset fast \
  -x265-params keyint=300:min-keyint=300:scenecut=0:bframes=4:open-gop=0 \
  -b:v 20M -maxrate 20M -bufsize 20M -movflags +faststart hevc-1080p30-g300.mp4
```

Chrome 156 decodes HEVC here (`VideoDecoder.isConfigSupported` is true, and `attach-source`
succeeded).

### Moves (each repeated 3 times, sequential, never more than one request in flight)

- **K−1 from far**: the Frame just before each keyframe, reached from the far end of the file
  (from the last Frame for targets in the first half, from Frame 0 otherwise). This is T071's
  worst case.
- **keyframe from far** and **mid-GOP from far**: same, but the target is the keyframe itself or
  the middle of its GOP.
- **±1 steps near GOP end**: K−5 … K−1 forward, then K−2 … K−5 back, one Frame at a time. This is
  slow scrubbing.
- **seek while playing**: `transport: playing` at K−1 followed by the clock request for K−1. This
  is the stream path (stream.ts).

No request was dropped in any run.

### Results (ms, `render-frame` → `frame-rendered`; SC-003 budget 300 ms)

| Source                     | keyframe, worst | mid-GOP, worst | **K−1 from far** median / worst | **±1 step** median / worst | seek while playing, worst | SC-003 |
| -------------------------- | --------------- | -------------- | ------------------------------- | -------------------------- | ------------------------- | ------ |
| sync-1080p30 (T071, GOP 60) | 10              | 24             | 29 / 31                         | 29–30 / 34                 | 43                        | holds (10×) |
| H.264 1080p GOP 250        | 21              | 137            | 248 / 252                       | 241–243 / 255              | 260                       | holds, 15 % margin |
| **H.264 1080p GOP 300**    | 25              | 163            | 290 / 293                       | 294–296 / **307**          | **304**                   | **fails** (at the edge) |
| HEVC 1080p GOP 300         | 18              | 107            | 190 / 195                       | 190 / 198                  | 198                       | holds, 34 % margin |
| **H.264 4K GOP 250**       | 69              | **329**        | 563 / **576**                   | 559–561 / **583**          | **630**                   | **fails, ~1.9×** |
| **H.264 4K GOP 300**       | 67              | **370**        | 671 / **692**                   | 654–655 / **667**          | **729**                   | **fails, ~2.3×** |
| **HEVC 4K GOP 300**        | 52              | 279            | 500 / **514**                   | 506–508 / **520**          | **545**                   | **fails, ~1.7×** |

(A 4K Source in a 1080p Project: the sink decodes 4K and scales to 1080p, as the editor would.)

### What the numbers say

- **Latency grows linearly with how far the target is past its keyframe.** The slope is about
  0.97 ms per Frame for H.264 1080p, 0.63 for HEVC 1080p, 2.2 for H.264 4K and 1.66 for HEVC 4K.
  Where the Frame sits in the file does not matter (every GOP of a file gave the same number), and
  the keyframe itself is always cheap (10–70 ms). The worst case is about
  `GOP length × per-Frame decode cost`.
- **A single-Frame step costs a full decode from the keyframe.** Scrubbing slowly forward from
  K−5 to K−1 cost 290–307 ms *per step* on 1080p GOP-300 H.264. The previous Frame's decoder
  state is not reused (T071 suspected this, and it is confirmed here). On long-GOP footage the
  ordinary act of nudging the Playhead late in a GOP gives about 3 pictures per second at 1080p
  and under 2 at 4K.
- The stream path after a seek is not a way out. It too decodes from the keyframe, and it was
  slightly slower (304 ms at 1080p, 729 ms at 4K).
- The material is synthetic but not cheap: 23 Mbps at 1080p and 46 Mbps at 4K, with grain on every
  Frame. Real camera footage at 50–100 Mbps 4K would, if anything, decode slower per Frame.

### T092 conclusion: SC-003 does not hold without a scrub-quality path

- **1080p**: holds at GOP 250 (worst 255 ms) and for HEVC GOP 300 (198 ms). It **fails at GOP 300
  H.264**: worst 307 ms on a ±1 step and 304 ms on a seek during playback, with a 290–296 ms
  median. That is right on the line with no margin, so any slower disk, busier machine, older
  hardware, or real higher-bitrate footage puts it over.
- **4K** (common camera material): **fails clearly**, 514–692 ms worst, 1.7–2.3× the budget. Even
  the middle of a GOP is over budget for H.264 4K.

**This is the stop-and-reconsider signal tasks.md names.** Scrub latency is far outside SC-003 on
ordinary long-GOP 4K footage, and at the limit on 1080p. It is a finding about the design: the
random-access scrub path (`getCanvas` per request, decode from the keyframe every time) is
structurally bounded by GOP length, not by our code. It belongs in an ADR before more is built on
it. Nothing was loosened, and SC-003 stays as written.

### Options (proposed, not built)

1. **Reuse decoder position for nearby forward moves (no quality change).** Keep a scrub-side
   decode cursor. When the new Frame is in the same GOP and ahead of the last decoded one, decode
   forward from there instead of from the keyframe. stream.ts already walks short gaps this way
   (`STEP_LIMIT`). Fixes forward ±1/±10 steps (cost becomes about 1–2 ms per Frame walked). Does
   nothing for backward steps or far jumps, so on its own it cannot make 4K pass.
2. **Nearest-keyframe preview while scrubbing, exact Frame on rest.** During a drag, show the
   preceding keyframe at once (10–70 ms measured), then decode the exact Frame when the pointer
   stops or a request goes stale. Needs a decision on SC-003's wording, because the picture
   during motion would not be "that Frame". The Viewer would also need an honest "approximate"
   indicator. Cheapest way to make scrubbing feel attached.
3. **Small decoded-Frame cache around the Playhead** (for backward steps). Keep N recently decoded
   pictures, or decode the current GOP once into a reduced-size ring when a scrub settles in it.
   Memory is the limit: a full 1080p RGBA Frame is about 8 MB, so a whole GOP at full size is not
   affordable. A scrub-size (e.g. 480p) ring is.
4. **Proxy / scrub-quality intermediate.** Transcode in the background to an all-intra or
   short-GOP (e.g. GOP 1–15), lower-resolution proxy kept in OPFS. Scrubbing uses the proxy, and
   playback and Export use the Source. This is the only option that bounds latency on any input
   (4K, 8K, GOP 600). Costs: background transcode time and storage. It also reverses this slice's
   "no OPFS / nothing derived is kept" stance, and it must be reconciled with ADR 0005 (Source
   bytes never copied; a proxy is a derived artefact, not a copy). "Decode at lower quality" is
   not available as a lighter variant: hardware H.264/HEVC decoders do the same work whatever the
   output size, so a scrub-quality path *is* a proxy.

A plausible combination is 1 + 2 now, with 4 as the long-term answer for 4K. The choice is left
to the ADR.

## After ADR 0017: scrubs walk forward from the decoder's position

Measured 2026-10-23, same machine and Chrome as above, after the change described in ADR 0017.
Each run had a fresh Vite server on `CUTROOM_E2E_PORT=5190` with HMR and file watching off (a
config in `/tmp`), and no other Playwright run alive. The probe was the T092 one rebuilt as a
throwaway spec and then deleted: the real engine worker, `init` (1920×1080, 30/1), `attach-source`
(a `File` read into a `Blob` first), a one-Clip `scene` of 1200 Frames, then `render-frame`
messages. The time runs from `postMessage` to that Frame's `frame-rendered` on the main thread,
with one request in flight. No request was dropped in any run.

### What changed

Every Frame, scrub or clock, is rendered from a per-Clip `samplesAtTimestamps` iterator under one
walk rule (`playback/stream.ts`). The iterator is walked forward when the Frame is at most
`STEP_LIMIT` (30) Frames ahead of it, or further ahead within the same GOP (the container's
keyframe index says so, `EncodedPacketSink.getKeyPacket`). Otherwise it is reopened at the Frame.
A scrub leaves its iterator parked for the next step, and a stopped Preview closes parked
iterators after `PARK_MS` (3 s) idle. `transport: playing` keeps an iterator that can walk to
`fromFrame`. The sink now draws only the Frame it lends: Frames walked past are closed undrawn,
and an abandoned iterator stops at once. `CanvasSink` was replaced by `VideoSampleSink` plus one
canvas per sink.

### Moves (each GOP of the file; 3 GOPs for GOP 300, 4 for GOP 250)

- **far jump K−1**, **far jump K−12**: from the far end of the file (cold).
- **step −1**: K−2 … K−5, one at a time backward.
- **step +1**: K−11 … K−1, one at a time forward, after a cold seek to K−12.
- **step +10**: K−50 … K−10 in tens, after a cold seek to K−60.
- **far forward, same GOP**: a cold seek to K−G+10, then a jump to K−1 (289 Frames ahead in the
  same GOP for G = 300).
- **slow forward drag**: K−99 … K−1, one Frame every 33 ms, with the client's latest-wins guard
  emulated (one request in flight, newest waiting).
- **seek while playing, cold**: `transport: playing` at K−1 from far away, then `clock` K−1.
- **seek forward in the GOP while playing**: playback from K−100 through K−91, then
  `transport: playing` at K−1 and `clock` K−1.

### H.264 1080p GOP 300 (the acceptance case), ms, median / worst

| Move | Before (random access) | After |
| --- | --- | --- |
| step +1 | 296 / 316 | **1 / 25** (second run 0 / 28) |
| step +10 | 276 / 298 | **8 / 19** |
| slow forward drag | 248 / 303, 46 of 99 Frames shown | **1 / 9**, every Frame shown |
| far forward, same GOP | ≈ 290 (a cold seek) | **268 / 269** |
| seek forward in the GOP while playing | 305 / 305 | **54 / 55** |
| step −1 | 295 / 302 | 301 / 313 (second run 302 / 311) |
| far jump K−1 | 295 / 308 | 296 / 297 (second run 298 / 302) |
| far jump K−12 | 279 / 291 | 293 / 297 |
| seek while playing, cold | 297 / 299 | 296 / 306 |

"Before" is the pre-change code measured the same day in the same way.

**Forward steps and drags are now about one Frame's decode**, since the next Frame is usually
already decoded. The worst forward step is 28 ms against SC-003's 300 ms.

**Backward steps and far jumps still decode from the keyframe**, as ADR 0017 says. Their worst is
297–313 ms against 299–308 before. An A/B in one session put the cold path about 5–10 ms above the
old `getSample` random access (step −1 292 / 299 with random access, 302 / 311 walking). That is
the cost of opening an iterator, not a one-picture decode, for a cold request. It buys the
positioned decoder that every following forward step uses. The decode is the whole of it: inside
the Render, the walk-rule check and the reopen take under 0.2 ms.

### The other files, after (ms, median / worst)

| Source | step +1 | step +10 | slow drag | far fwd same GOP | seek fwd in GOP while playing | step −1 | far jump K−1 | seek while playing, cold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H.264 1080p GOP 250 | 0 / 15 | 6 / 15 | 1 / 9 | 218 / 223 | 55 / 59 | 253 / 262 | 257 / 263 | 252 / 261 |
| HEVC 1080p GOP 300 | 0 / 20 | 4 / 15 | 1 / 5 | 164 / 173 | 38 / 38 | 195 / 201 | 192 / 196 | 194 / 194 |
| H.264 4K GOP 250 | 1 / 13 | 20 / 31 | 1 / 13 | 500 / 511 | 116 / 116 | 572 / 602 | 592 / 597 | 601 / 605 |
| H.264 4K GOP 300 | 1 / 23 | 18 / 34 | 1 / 16 | 579 / 624 | 101 / 108 | 671 / 696 | 674 / 704 | 670 / 703 |
| HEVC 4K GOP 300 | 1 / 16 | 15 / 24 | 1 / 11 | 452 / 478 | 89 / 90 | 516 / 535 | 505 / 527 | 514 / 524 |

For the record at 4K: forward gestures are now inside SC-003 on every file, but backward steps and
far jumps are unchanged (505–704 ms). Those are items (1) and (2) of ADR 0017's "Next".

### Cost: parked decoders

A parked iterator holds what its decoder raced ahead to before Mediabunny's backpressure caught
up. In a worker with WebCodecs counters, about **45 decoded Frames** per parked Clip (the same on
1080p and 4K long-GOP H.264). That is roughly 140 MB for a 1080p Source and 560 MB for a 4K one,
as NV12. During playback the consumer drains this to about 13. Hence `PARK_MS`: 3 s after the
last job, a stopped Preview closes them. The counter went from 45 to 0 live Frames, and
`detach-source` frees them at once. Over 30 cycles of forward and backward steps, jumps across
two Clips, play, seek within the GOP while playing, stop and scrub, the counters were flat:
75 live Frames and 2 open decoders at cycles 10, 20 and 30 (two visible Clips parked), and 0 and
0 after the detach.

### Correctness

Walking never shows a different Frame from a seek. The iterator is fed every Frame's Source time,
and the picture drawn for Frame n is the one it yields for n's time, which is Mediabunny's
packet-at-time answer, the same as a seek's. `scrub-latency.spec.ts` now also checks this on the
picture: five GOP-end Frames reached once cold and once by a one-Frame step, plus a +10 and five
+1 steps, each read off the burned-in counter. The one-Frame step must cost under half the cold
seek. Measured: cold 29.7 ms median, step 1.0 ms engine time on `sync-1080p30.mp4` (GOP 60).
With the walk rule disabled the counter still reads correctly, but the timing assertion fails
(31.3 vs 29.6 ms).
