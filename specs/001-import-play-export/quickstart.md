# Quickstart: validating Import, Play, Export

How to run the slice and prove it does what the spec claims. Written to be executable by someone
who has not read the plan.

## Prerequisites

- Node 20+ and pnpm
- Google Chrome or Edge (the only supported browser — see ADR 0006)
- Test fixtures in `packages/engine/test/fixtures/`. They are **not committed** — run
  `pnpm fixtures` once after `pnpm install` and they appear:
  - `sync-1080p30.mp4` — 30 s, 1080p, 30 fps, with a visible counter and an audible click on
    every whole second
  - `sync-1080p2997.mp4` — the same content at 30000/1001, for the mismatched-Timebase case
  - `sync-1080p30-10min.mp4` — the same content at ten minutes. SC-002 and SC-004 both claim ten
    minutes, and this slice allows exactly one Clip, so this file is the only way either claim can
    actually be played
  - `silent-720p24.mp4` — no audio track
  - `long-1080p30-70min.mp4` — over an hour, for the import-must-not-read-the-whole-file case
  - `audio-only.m4a` and `still.png` — must both be refused
  - `broken.mp4` — truncated, must be refused

## Reference machine

SC-004 (full-rate 1080p30 playback) and SC-005 (one minute of 1080p30 exported in under two
minutes) describe this machine and no other. Results from different hardware are informative, not
a verdict — if they disagree with the criteria, re-measure here before concluding anything.

| | |
|---|---|
| Machine | MacBook Air (Apple M4) |
| CPU | Apple M4, 10 cores — 4 performance, 6 efficiency |
| GPU | Apple M4, 8 cores |
| RAM | 16 GB unified |
| OS | macOS 26.5.2 (25F84) |
| Browser | Google Chrome 150 |

Two things follow from this machine in particular, and both matter when reading a failure:

- H.264 encode and decode are hardware-accelerated on Apple silicon, so SC-005 is measured on a
  favourable path. An export that misses two minutes here is a real problem, not a slow laptop.
- Unified memory means the compositor and the decoders draw on the same 16 GB. A long-export
  memory leak (T090) will show up as system-wide pressure rather than a tidy tab crash.

## Run

```bash
pnpm install
pnpm dev            # serves apps/editor
```

Open the printed URL in Chrome.

## Manual validation

### US1 — bring a video in and see it

1. Note the clock, load the page, and create a new Project.
2. Pick `sync-1080p30.mp4`.
3. **Expect**: it appears in the Source list with its name and a 30 s duration; one Clip appears on
   the Timeline starting at Frame 0; the Preview shows the first Frame. **Under 15 seconds** from
   the page finishing load to Frame 0 on screen, not counting time spent in the file picker
   (SC-001) — this is a gate, so write the number down.
4. Drag the Playhead to the counter's 7-second mark.
5. **Expect**: the Preview shows the Frame whose counter reads 7, and the timecode agrees.
6. Drag the Playhead past the end of the Clip.
7. **Expect**: the Preview shows nothing, not the last Frame.
8. Pick `broken.mp4`, then `audio-only.m4a`, then `still.png`.
9. **Expect**: each time, a plain statement of what is wrong with that particular file; the
   Timeline is unchanged after all three.
10. Pick `long-1080p30-70min.mp4`.
11. **Expect**: the Clip appears about as quickly as the 30 s one did — importing an hour of
    footage must not mean reading an hour of footage.

### US2 — playback with sound in sync

1. Play from Frame 0 and watch the counter against the clicks.
2. **Expect**: click and counter change together, at the start and again near 30 s.
3. Stop mid-playback.
4. **Expect**: the Playhead stays on the Frame that was showing.
5. Play, then drag the Playhead elsewhere while playing.
6. **Expect**: sound continues from the new position with no gap and no repeated audio.
7. Play `silent-720p24.mp4`.
8. **Expect**: picture plays, silence is normal, no error.
9. Throttle the CPU (DevTools → Performance → 6× slowdown) and play.
10. **Expect**: sound stays continuous and correct; picture skips. This is the visible form of
    FR-012 — if audio stutters instead, the slice has failed its most important property.

### US3 — export

1. Export, choose a destination.
2. **Expect**: progress advances and reports something actionable.
3. Cancel a running export.
4. **Expect**: it stops within a couple of seconds and no finished file is presented.
5. Export again, let it complete, then open the file in all three named players — QuickTime, VLC
   and Chrome.
6. **Expect**: it plays in every one of them, duration matches the Timeline, and counter and clicks
   are still in sync at the end. Two out of three is a failure, not a pass with a caveat (SC-006).
7. In a browser build without an audio encoder (or with the probe forced to report none), open
   export.
8. **Expect**: the product says sound cannot be encoded and requires an explicit choice to
   continue without it — never a silent file produced quietly (FR-024).

### Persistence

1. Reload the tab.
2. **Expect**: the app lands on the Project list, the Project is there with its name and when it
   was last touched, and opening it shows the same Timeline; its Source is Offline until access is
   re-granted, and says so.
3. Re-grant access.
4. **Expect**: the Preview works again with no rebuilding of the Timeline.
5. Rename the fixture on disk, reload, reopen.
6. **Expect**: the Source is Offline and Relink is offered; picking the renamed file restores
   every Clip at once.
7. With the Project open and a Frame showing, rename the fixture again and move the Playhead.
8. **Expect**: the Source goes Offline there and then and the Preview empties. A Preview still
   showing pictures from a file that no longer exists is the failure this step is looking for.

## Automated validation

```bash
pnpm test          # Vitest — packages/model only: timebase, reducer, migrations, scene
pnpm test:e2e      # Playwright against Chromium — import, render, export, sync
```

The end-to-end suite covers what cannot be faked:

| Check | Method | Criterion |
|---|---|---|
| A Frame renders correctly | Import fixture, request Frame 210, read back the canvas, OCR/compare the counter region | SC-003, FR-007 |
| Timebase mismatch | Same with `sync-1080p2997.mp4` in a 30 fps Project | Edge case |
| A/V sync | Play `sync-1080p30-10min.mp4` end to end, sample reported Frame against `audioContext.currentTime` | SC-002 |
| Unusable files refused | Import `broken.mp4`, `audio-only.m4a`, `still.png`; assert a reason each time and an unchanged Timeline | FR-003, edge case |
| Long Source imports promptly | Import `long-1080p30-70min.mp4`, assert the Clip appears fast and little of the file was read | Edge case |
| Export fidelity | Export, re-open the output with Mediabunny, compare sampled Frames against Preview renders of the same Frames | SC-007 |
| Export duration | Re-open output, compare duration to `frameToSeconds(timebase, durationFrames)` | SC-006 |
| Export ignores later edits | Start export, edit the Timeline mid-run, assert the output matches the Timeline as it was at the start | FR-019 |
| Cancel | Start export, cancel, assert no complete file and prompt teardown | SC-009 |
| Sustained playback rate | Play the ten-minute fixture unthrottled, count rendered Frames against dropped ones | SC-004 |
| Export throughput | Export 60 s of 1080p30, measure wall-clock time | SC-005 |
| Reopen and relink | Reload, assert the Project is listed, the Timeline is identical and the Source reads Offline | SC-008, FR-020 |
| Source vanishes mid-session | Rename the file with the Project open, move the Playhead, assert Offline and an empty Preview | Edge case |
| Undo leaves link status alone | Import, undo, assert Linked/Offline unchanged | Principle IV |
| No handles in the document | Structured-clone round-trip of a saved Project | ADR 0004/0005 |

## Definition of done for the slice

Every box in the manual list behaves as described in Chrome, `pnpm test` and `pnpm test:e2e` are
green, and three checks in particular have passed rather than been approximated: the CPU-throttled
playback degrades picture and not sound, the time from page load to Frame 0 was measured and came
in under 15 seconds, and the exported file opened in QuickTime, VLC and Chrome alike.
