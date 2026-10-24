# Editing performance — measured against spec §6

Written by `apps/editor/e2e/editing-performance.spec.ts` (T020). The bars are spec §6 verbatim;
a miss is recorded as a miss and the threshold is not adjusted.

> **Caveat: this is not the reference machine.** Spec §6 names a MacBook Air M4 with Chrome.
> The machine below is whatever ran the suite, with the load it was under when each run began.
> The owner re-runs this on the reference machine; these numbers are not a verdict on it.

## Machine (last run)

- cpu: Apple M4
- cores: 10
- memoryGB: 16
- platform: Darwin 25.6.0 (arm64)
- chrome: 156.0.8078.47
- loadAverageAtStart: 4.70 / 11.67 / 14.31

## Results

| Budget | Target | Result | Load (1 / 5 / 15 min) |
|---|---|---|---|
| Drag feedback — move drag | p95 per pointer move ≤ 16.7 ms; no long task (> 50 ms) during the drag | pass | 4.35 / 14.07 / 15.37 |
| Drag feedback — trim drag | p95 per pointer move ≤ 16.7 ms; no long task (> 50 ms) during the drag | pass | 4.56 / 13.95 / 15.32 |
| Undo and redo — 20 of each | p95 key press → settled Timeline ≤ 100 ms | pass | 4.19 / 13.72 / 15.23 |
| Preview after an edit — 20 Gestures | p95 from release / key press to the edited Frame in the Preview ≤ 300 ms | pass | 4.19 / 13.72 / 15.23 |
| Playback across Edit points — 2 min, Edit point every 2 s | skipped Frames ≤ 1%; picture and sound within one Frame (SC-002) | pass | 2.77 / 8.73 / 12.80 |
| Two Tracks at full rate — 60 s | skipped Frames ≤ 1%; zero audio underruns; both Tracks' sound heard (AC-23) | pass | 4.90 / 11.95 / 14.44 |

### Drag feedback — move drag

Target: p95 per pointer move ≤ 16.7 ms; no long task (> 50 ms) during the drag. Result: pass.

| Measure | Value |
|---|---|
| samples | 60 |
| p50 | 12.6 ms |
| p95 | 14.2 ms |
| max | 15.1 ms |
| first move | 12.2 ms |
| pointer moves over 16.7 ms | 0 |
| long tasks | none |

Run: 2026-10-24T03:56:50.416Z, load 4.35 / 14.07 / 15.37

Pointermove (event timeStamp) → first animation frame at which the dragged Clip's ghost start Frame shows the Frame that pointer position means. 100 Clips on two Tracks, 2560×1200 window.

### Drag feedback — trim drag

Target: p95 per pointer move ≤ 16.7 ms; no long task (> 50 ms) during the drag. Result: pass.

| Measure | Value |
|---|---|
| samples | 60 |
| p50 | 12.4 ms |
| p95 | 14.1 ms |
| max | 15.9 ms |
| first move | 15.9 ms |
| pointer moves over 16.7 ms | 0 |
| long tasks | none |

Run: 2026-10-24T03:56:52.771Z, load 4.56 / 13.95 / 15.32

Pointermove (event timeStamp) → first animation frame at which the dragged Clip's live edge shows the Frame that pointer position means. 100 Clips on two Tracks, 2560×1200 window.

### Undo and redo — 20 of each

Target: p95 key press → settled Timeline ≤ 100 ms. Result: pass.

| Measure | Value |
|---|---|
| undo p50 | 12.6 ms |
| undo p95 | 24.0 ms |
| undo max | 29.7 ms |
| redo p50 | 11.0 ms |
| redo p95 | 29.6 ms |
| redo max | 30.0 ms |
| all 40 p95 | 29.6 ms |

Run: 2026-10-24T03:56:59.645Z, load 4.19 / 13.72 / 15.23

Meta+Z / Shift+Meta+Z keydown (event timeStamp) → first animation frame at which the affected Clip's `data-start-frame` is the one the step restores or re-applies.

### Preview after an edit — 20 Gestures

Target: p95 from release / key press to the edited Frame in the Preview ≤ 300 ms. Result: pass.

| Measure | Value |
|---|---|
| samples | 20 |
| p50 | 27.2 ms |
| p95 | 61.0 ms |
| max | 62.8 ms |
| moves p95 (8) | 37.9 ms |
| trims p95 (6) | 16.2 ms |
| splits p95 (6) | 62.8 ms |
| all samples | 26 38 31 24 37 27 24 37 16 16 14 14 14 15 41 47 61 34 49 63 |

Run: 2026-10-24T03:56:57.328Z, load 4.19 / 13.72 / 15.23

Release (pointerup) or key press (S) → the `preview-shown` text naming the Playhead's Frame of a Scene newer than before the edit. Keyframe-every-2 s fixture; long-GOP not measured here.

### Playback across Edit points — 2 min, Edit point every 2 s

Target: skipped Frames ≤ 1%; picture and sound within one Frame (SC-002). Result: pass.

| Measure | Value |
|---|---|
| Timeline Frames | 3600 |
| Edit points | 59 |
| Frames shown | 3600 |
| skipped Frames (all) | 0 (0.00 %) |
| skipped within 15 Frames after an Edit point | 0 of 885 (0.00 %) |
| worst A/V drift | 0.460 Frames (bar: < 1) |
| Frames out of sync by a Frame or more | 0 |
| first out-of-sync Frames |  |
| sound runs / overlaps / late nodes | 1 / 0 / 0 |
| frames-dropped | 0 |

Run: 2026-10-24T04:00:14.782Z, load 2.77 / 8.73 / 12.80

Gated on the whole run (stricter than 'at the Edit points') and on the 15 Frames after each Edit point; A/V as av-sync.spec.ts measures it (picture against the sound's own anchor).

### Two Tracks at full rate — 60 s

Target: skipped Frames ≤ 1%; zero audio underruns; both Tracks' sound heard (AC-23). Result: pass.

| Measure | Value |
|---|---|
| Timeline Frames | 1800 |
| Frames shown | 1800 |
| skipped Frames | 0 (0.00 %) |
| audio underruns (gaps between node runs) | 0 |
| late nodes | 0 |
| seconds with both Tracks' sound scheduled | 60.000 of 60 |
| worst A/V drift | 0.900 Frames |
| frames-dropped | 0 |

Run: 2026-10-24T03:58:02.231Z, load 4.90 / 11.95 / 14.44

An underrun is a gap in the audio clock between consecutive scheduled nodes, as degrades-picture-not-sound.spec.ts reads it (both Tracks' sound overlaps by design).

## History

Playback across Edit points first missed SC-002's bar: the first Frame of each next Clip
arrived 1.1–1.6 Frames late at most cuts (3 of 3 runs, no Frame skipped, sound unbroken).
The sad §11 mitigation followed: the engine now prepares the Clips starting within half a
second — sink built, stream opened at their first Frame — while playing
(`packages/engine/src/playback/stream.ts`, `PREPARE_AHEAD_FRAMES`). It has passed since.
The picture/sound comparisons measure against the sound as heard: the anchor plus the
limiter's measured delay (ADR 0022).

On 2026-10-24 one run of Playback across Edit points under a load of 32.74 / 21.21 / 17.96
(a background spike that began during the run) missed on its last Frame only: 3597 of 3600
Frames drawn, Frame 3596 held 3.42 Frames past its interval until the stop at the end, no
Frame skipped before it. Re-run at load 5.74 → 2.48 it passed (3600 drawn, worst drift 0.42
Frames). Treated as provisional, caused by the load, not as a failure of the bar.

The same day, inside the full e2e suite at load 22.30 / 16.15 / 16.11, the move drag missed
with p95 17.2 ms (5 of 60 moves over 16.7 ms, no long task). Re-run at load 6.16 it passed
(p95 13.9 ms). Also treated as provisional, caused by the load.

## Inherited: the ten-minute specs (open item, not this feature's)

T020 re-ran the two `@slow` ten-minute specs its fixes touched (the picture is now measured
against the sound as heard, ADR 0022). av-sync.spec.ts (SC-002) failed once with the load
unrecorded, then passed at load 2.5 rising to 24.6. playback-rate.spec.ts (SC-004: at most one
Frame skipped per minute) failed on every run: 2 Frames skipped in minute 1 (Frames 3597–3598,
at load 2.9) and 2 in minute 5 (Frames 9019–9020, at load 20) on this branch. The same spec
on `main` (69d805d), at load 2.5–5.5 through minute 1, failed the same way: Frames 3597–3599
skipped. In both, the transport never requested those Frames, so the main thread stalled
about 120 ms near the two-minute mark. The stall predates editing. It is recorded as an open
item against import-play-export's SC-004 and was not fixed here; the bar was not changed.
Decided by the agent on the owner's delegation, 2026-10-24.

## Long-GOP (SC-003)

Not measured here. Per sad §10 QG-3b the long-GOP backward jumps (301–313 ms, ADR 0017) are
accepted and do not gate merge; this closes spec §8's SC-003 item for this feature.
