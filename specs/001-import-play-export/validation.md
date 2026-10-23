# Validation: Import, Play, Export (T096)

The manual list in [quickstart.md](./quickstart.md), walked end to end on 2026-10-23, with each
step done in real Google Chrome through the editor's own UI wherever a machine could do it. This
file says what was done for each step, how, what it measured, and whether it passed. What only a
person can do is at the end, under **Needs a human**.

## Verdict

| Gate | Result | Numbers |
|---|---|---|
| CPU-throttled playback: picture degrades, sound does not (FR-012) | **Pass**, with a caveat on the literal 6× | 6× (quickstart's literal step): 0 Frames skipped, sound perfect, so 6× does not exercise FR-012 on this machine. 20× on the page: 77 of 900 skipped, sound one unbroken 30.000 s run. Engine worker ≈90 % busy: 300 of 900 skipped, sound one unbroken 30.000 s run |
| SC-001: page load → Frame 0 on screen, picker excluded, < 15 s | **Pass** | 652, 486 and 483 ms in three fresh browser contexts |
| SC-006: exported file plays in QuickTime, VLC and Chrome | **Not closed.** Chrome passes. QuickTime passes by proxy (AVFoundation). VLC **needs a human** | Chrome `<video>`: 30.000 s, counters 000000 / 000899, clicks on every second at the end. AVFoundation: 30 s, 900 Frames, `AVPlayer` `readyToPlay` and plays to the end, clicks on the sample. ffmpeg (VLC's decoder library, not VLC): 30.000 s, 900 Frames, clicks on the sample |

SC-006 says two players out of three is a failure, so T096 cannot report SC-006 as passed until a
person opens the file in VLC and in QuickTime Player itself. Every check a machine can make on the
file passed. The rest of the manual list passed. One unrelated e2e test failed once in the full
run and passed on five reruns (see [Other findings](#other-findings)).

## Machine

| | |
|---|---|
| Machine | MacBook Air, `Mac16,12` (Apple M4) |
| CPU / RAM | Apple M4, 10 cores, 16 GB |
| OS | macOS 26.6.2 (25G83). quickstart.md named 26.5.2 (25F84) in T014; the machine has been updated since |
| Browser | Google Chrome 156.0.8078.47, launched by Playwright with `channel: "chrome"` (the repo's config), headless |
| Renderer | PixiJS `webgl` |
| QuickTime Player | installed (`/System/Applications/QuickTime Player.app`), not opened. See SC-006 |
| VLC | not installed, and not installed for this walk |
| ffmpeg / ffprobe | Homebrew `/opt/homebrew/bin` |

The tests run headless. Headless Chrome uses the same decoders and encoders as a visible window
(T012 notes and the T089 measurements). Visible-window behaviour, the native pickers and
permission prompts are under **Needs a human**.

**Wrong browser version in a test annotation.** `export-throughput.spec.ts` reports the browser as
"Chrome 151.0.7922.34". That number comes from the user agent of Playwright's `Desktop Chrome`
device profile, which the config applies. The browser that actually runs is 156.0.8078.47
(`browser.version()`). T089's "Chrome 151" note has the same cause. Nothing was changed.

## Method

- **Automated**: done in Chrome through the editor's own buttons, keyboard and mouse, and checked
  on the picture, the sound or the file. A throwaway Playwright spec walked the list in order on
  a fresh dev server (`CUTROOM_E2E_PORT=5192`). Its numbers are below. It was deleted afterwards.
  The SC-001 measurement is kept as `apps/editor/e2e/page-load-to-frame-0.spec.ts`, because SC-001
  had no test before this.
- **Stand-in pickers**: Playwright cannot drive the native file dialogs. Every pick and save went
  through `apps/editor/e2e/file-picker.ts`, which answers with real `FileSystemFileHandle`s over
  OPFS. That makes the app's code path real but the dialog not real. It is the reason for some of
  the **Needs a human** items.
- **Proxy**: QuickTime Player can't be driven from a script. AVFoundation, the framework it plays
  through, can. A small Swift tool (`AVURLAsset`, `AVAssetReader`, `AVAssetImageGenerator`,
  `AVPlayer`) decoded every video Frame and all the sound, made exact-time images of the first and
  last Frame, and played the end of the file through `AVPlayer`. `qlmanage -t` made a Quick Look
  thumbnail. VLC decodes MP4/H.264/AAC through libavcodec, so the host's ffmpeg tests **VLC's
  decoder library, not VLC**: not VLC's demuxer choices, edit-list handling or output.
- **Existing specs**: where a permanent e2e spec already does a step exactly, the step points to
  it. Its result comes from this session's runs of `pnpm test:e2e` and `pnpm test:e2e:slow` on the
  same server port.

The burned-in counter was read off pictures with the e2e reader (`burned-in-counter.ts`): off the
Preview canvas, off Frames drawn from Chrome's `<video>`, off AVFoundation's decoded pixel
buffers, and off ffmpeg's raw RGBA.

## US1 — bring a video in and see it

| Step | Method | Result | |
|---|---|---|---|
| 1–3. New Project, pick `sync-1080p30.mp4` | Automated | Source list: `sync-1080p30.mp4`, `00:00:30:00 · 900 Frames`. One Clip, start Frame 0, 900 Frames. Preview shows Frame 0 and the counter reads `000000`. Clip on the Timeline 75 ms after the Import click | Pass |
| 3. **SC-001 gate** | Automated (`page-load-to-frame-0.spec.ts`) | From the `load` event to "showing Frame 0" plus two animation frames, picker time excluded (13–14 ms, the stand-in's). **652 / 486 / 483 ms** in three fresh browser contexts on a warm dev server. Budget 15 000 ms | **Pass** |
| 4–5. Drag the Playhead to the 7-second mark | Automated: a real mouse drag across the Timeline body | Landed on Frame 210. Counter `000210` (weakest margin 127 of 127). Timecode `00:00:07:00` | Pass |
| 6–7. Drag past the end of the Clip | Automated: mouse drag | Frame 960 (the Clip ends at 900). Preview is 2 073 600 of 2 073 600 pixels opaque black, nothing bright. Not the last Frame | Pass |
| 8–9. `broken.mp4`, `audio-only.m4a`, `still.png` | Automated | Each refused, in its own words: "it describes no tracks at all, so it is probably damaged or incomplete" / "has no video track — it contains only sound (mp4a.40.2)" / "is an image (image/png), not a video file". Each also says "Nothing was added to the Project." The Timeline kept one Clip of 900 Frames after all three | Pass |
| 10–11. `long-1080p30-70min.mp4` | Automated | Clip (126 000 Frames) appeared 50 ms after the click. The 30 s file took 75 ms. 4 MiB read of the 32 MB file (`long-source-imports-promptly.spec.ts` asserts the fraction too) | Pass |

## US2 — playback with sound in sync

| Step | Method | Result | |
|---|---|---|---|
| 1–2. Play from Frame 0, counter against clicks at the start and near 30 s | Automated: the playback probe (`playback-probe.ts`) records every scheduled sound node and every Frame drawn on the transport's own `AudioContext` clock | 900 Frames shown, 0 skipped, 0 dropped. Sound is one run of exactly 30 s, no overlaps, no late nodes. All 30 clicks (second 0 included) at the same sample of their second (+7, as ffmpeg decodes the fixture). Picture lag behind sound p50 0.22 Frames in the first 5 s and 0.14 in the last 5 s, worst 0.30. Stopped on Frame 899, counter `000899` | Pass |
| 3–4. Stop mid-playback | Automated | Stopped after about 3 s: last Frame showing 88, Playhead 88, Preview still 88, counter `000088` | Pass |
| 5–6. Drag the Playhead while playing | Existing spec `seek-during-playback.spec.ts` (forward seek, and Home backwards) | Sound handed over with no gap and no repeat, and the new position shown | Pass |
| 7–8. Play `silent-720p24.mp4` | Existing spec `silent-source-plays.spec.ts` | Picture plays against a silent clock, no error | Pass |
| 9–10. **CPU-throttle gate**, quickstart's literal 6× | Automated: CDP `Emulation.setCPUThrottlingRate` 6, the same mechanism DevTools uses | Sound one unbroken 30 s run, 0 overlaps, 0 late, every click on the same sample. Picture: **0 skipped** (worst drift 0.86 Frames). At 6× this machine keeps up, so the step does not exercise FR-012. The quickstart text already says so | Pass for sound; the throttle is too weak to test the picture |
| 9–10. **CPU-throttle gate**, strong enough to bite | Existing spec `degrades-picture-not-sound.spec.ts`, run twice this session | **20× on the page**: 823 shown, 77 skipped (8.6 %), longest skip 3, 0 dropped. Sound: 773 nodes in **one run of 30 000.000 ms**, 0 overlaps, 0 late (least lead 39.3 ms), 30 clicks all at +7 samples. **Engine worker ≈90 % busy**: 599 shown, 300 skipped (33 %), sound one run of 30 000.000 ms, 0 overlaps, 0 late, 30 clicks all at +7. The picture only ever moved forwards and never ran ahead of the sound | **Pass** |

## US3 — export

| Step | Method | Result | |
|---|---|---|---|
| 1–2. Export, choose a destination, progress | Automated, stand-in save picker | All three qualities were offered (High 16, Standard 8, Draft 4 Mbps), with sound "AAC, 192 kbps, stereo, 48 kHz". Progress moved from "57 of 900 Frames (6%) · 0:00 elapsed · about 0:00 left" to "201 of 900 Frames (22%) · 0:01 elapsed · about 0:02 left" in 0.6 s. It also tells the user they can keep editing | Pass |
| 3–4. Cancel a running export | Automated | `export-cancelled` 6.6 ms after the Cancel click (SC-009 allows 2 s). "Export cancelled. No file was left at walk-cancel.mp4." The file is gone | Pass |
| 5. Export to completion | Automated | 30 s of 1080p30 with sound in 4.4 s. "Exported walk-export.mp4 (0.2 MB) in 0:04". 165 857 bytes, equal to `data-bytes` | Pass |
| 5–6. **SC-006 gate — Chrome** | Automated: the exported file in a plain `<video>` element, played in real time with its sound routed through a Web Audio analyser | `duration` 30.000 s, 1920×1080, `ended` at 30.000 s after 30.06 s of wall time, 0 dropped Frames, sound decoded (41 578 bytes). Counter on the first Frame `000000` and the last `000899`. 88 Frames in the first and last 1.5 s read through `requestVideoFrameCallback`: every counter equals `mediaTime × 30`. Clicks were heard at seconds 1–29, each 0–5 ms after its whole second by `currentTime` (12 ms on the last, inside the ~2 ms polling and the 24 ms output latency). Second 0 is not in that list because the detector needs silence before a click; the file's own decode puts it on the sample (`export-duration.spec.ts`: Web Audio click lag 0 samples at all 30) | **Pass** |
| 5–6. **SC-006 gate — QuickTime** | Proxy: AVFoundation, QuickTime Player's engine. QuickTime Player itself was **not opened** | `isPlayable` true. Asset 30 s, video and audio time ranges 0–30 s, 1920×1080 at 30 fps. All **900** video Frames decoded, PTS 0 to 29.967. First and last decoded Frames read `000000` and `000899`, and so do `AVAssetImageGenerator`'s exact-time images. Audio: 1 440 000 samples (the Timeline's exact count), first PTS 0, 30 clicks, every one at +1 sample of its second at a 0.05 threshold, second 0 and second 29 included. So the edit list and the `roll` group are honoured (ADR 0014). `AVPlayer` reached `readyToPlay` (duration 30 s), played from 28 s and stopped at 30 s. Quick Look's thumbnail shows the counter `000300` | Pass by proxy; **QuickTime Player itself needs a human** |
| 5–6. **SC-006 gate — VLC** | Proxy for VLC's decoder only: host ffmpeg/ffprobe (libavcodec). VLC is not installed | ffprobe: format 30.000 s, H.264 High 1920×1080 30/1 with 900 Frames read, AAC-LC 48 kHz stereo 30.000 s, both starting at 0. Frames 0 and 899 read `000000` and `000899`. Audio 1 440 704 samples (+704, under one AAC packet, as T086 recorded). 30 clicks all at +1 sample of their second | Decoder library passes. **VLC itself needs a human** |
| 5–6. The same, two Sources at 30 and 29.97 fps, 60 s | Existing spec `export-duration.spec.ts` | `mvhd`, `tkhd`s, `mdhd` and `elst` exactly 60 s. ffprobe 60 s. All 60 clicks at lag 0 in Web Audio and in ffmpeg | Pass |
| 7–8. No audio encoder (FR-024) | Automated: `AudioEncoder.isConfigSupported` forced to answer "unsupported" before the app loads | Dialog: "The Timeline has sound, and this machine has no encoder that can write it. The file can only be made without sound." Export was disabled until "Export without sound" was ticked. The finished file has one stream, `video` | Pass |

## Persistence

| Step | Method | Result | |
|---|---|---|---|
| 1–2. Reload | Automated: permission set back to `prompt`, which is what a real browser does to a restored handle (ADR 0005) | Lands on the Project list. Row "sync-1080p30 · Last modified Oct 23, 2026, 9:07 AM". Reopened: the same Clip id, start and length. Source Offline, reason `needs-permission`: "The browser needs your permission to read it again. Its Clips stay on the Timeline and show nothing until it is back." | Pass |
| 3–4. Re-grant | Automated: "Allow access" | Linked again, Preview shows a picture, the Clip is unchanged (same id, not rebuilt) | Pass, but the real permission prompt **needs a human** |
| 5–6. Rename on disk, reload, reopen | Automated: renamed in the stand-in disk | Offline, reason `unreachable`, "Find the file…" offered. Picking the renamed file relinked it: Linked, the same Clip id, start and length, Preview back. The walk had one Clip. `import-smoke.spec.ts` covers the same relink | Pass |
| 7–8. Rename while open, move the Playhead | Automated | One → keypress: Offline right away. Preview "showing Frame 1" and every pixel opaque black. No stale picture | Pass |

## Automated suites in this session

| Command | Result |
|---|---|
| `pnpm test` | 305 passed (model) and 246 passed (editor) |
| `pnpm test:e2e` (port 5192) | 103 passed, **1 failed**: `engine-worker.spec.ts` "a Scene older than the one the worker holds is ignored". It passed on 5 of 5 reruns |
| `pnpm test:e2e:slow` (port 5192) | 2 passed. A/V sync (SC-002): worst drift 0.62 Frames over 18 000 Frames, sound one run of 600.000000 s, all 600 clicks at +7 samples. Full rate (SC-004): 18 000 shown, 0 skipped, 0 dropped, Frame interval p50 33.3 ms every minute |

## Other findings

- **Intermittent e2e failure, not in the manual list.** `engine-worker.spec.ts:296` failed once in
  the full run. It read the canvas as 16×9 where it expected 640×360. It passed 5 of 5 times on
  its own. The test drives the worker directly, not the UI. Either a race in how the test reads
  pixels, or the worker briefly showing a canvas size from a Scene it should have ignored. Not
  diagnosed, and recorded here for a decision. It keeps `pnpm test:e2e` from being reliably green,
  which is part of the slice's definition of done.
- **The 6× throttle in quickstart step US2-9 does not bite on this machine** (0 Frames skipped).
  The quickstart text already says so and points to 20× and the worker-load spec. Those are what
  closed the gate.
- **A test annotation shows the wrong browser version** (see Machine). A test-only problem.

## Needs a human

Each item needs a person at this Mac with a visible Chrome 156 window, because no script here can
do it.

- [ ] **VLC (SC-006).** Install VLC from videolan.org. Export the 30 s fixture Project from the
  editor (or use any file `export-duration.spec.ts` writes), open it in VLC and check: it plays
  from start to end with no error; the duration VLC shows is 0:30 (0:00:30); the first Frame reads
  `000000` and the last, after pausing at the end, `000899`; the click is heard as the counter
  turns over on each whole second, at the start and again at 0:28–0:30. Check the same with the
  60 s two-Source export. Write the result here. A failure here fails SC-006.
- [ ] **QuickTime Player itself (SC-006).** Open the same file in QuickTime Player. Check: it opens
  with no conversion prompt; the duration is 0:30; the click and the counter change together at
  the start and at the end; stepping to the last Frame (End, then ←) shows `000899`. AVFoundation
  passed all of this by proxy, but the player itself was not opened.
- [ ] **Chrome's real save picker on an existing file (decisions.md open risk).** In the visible
  Chrome, import `sync-1080p30.mp4` from a real folder, open Export, and in the native save dialog
  choose **that same file** and confirm the overwrite. Then, before doing anything else, check the
  file's size in Finder or with `ls -l`. If it is already 0 bytes, Chrome empties the file when it
  is picked. The overwrite guard (T075, `isSameEntry`) then runs too late, and the fix decisions.md
  names is needed (warn by name before the picker can be accepted). If the size is unchanged, the
  dialog should say "refused" and the file must stay byte for byte as it was. Do it a second time
  with an unrelated existing `.mp4` and Cancel the export. T083 says that file stays as it was if
  unchanged.
- [ ] **Real open picker and permission prompts.** Import through the native open dialog. Reload,
  reopen the Project, press "Allow access" and answer Chrome's own permission prompt. Do it once
  more and answer "Don't allow": the Source must stay Offline and say so. The stand-in follows
  Chrome's rules, but it is not Chrome's prompt.
- [ ] **Rename on the real disk.** Rename the fixture in Finder with the Project open and move the
  Playhead: the Source goes Offline at once and the Preview empties. Then reload, reopen, use
  "Find the file…" on the renamed file: every Clip comes back. The stand-in renames inside OPFS,
  and a Finder rename has not been tested.
- [ ] **Hear it.** Play the 30 s fixture in the visible editor with speakers or headphones, and
  listen at the start and near 0:30: click and counter together, no stutter. Do the same with
  DevTools → Performance → CPU 20×: the sound stays clean while the picture skips. The machine
  measured the scheduled sound, not what came out of the speaker.
- [ ] **SC-001 with a person.** Time it by hand once: page load to Frame 0 with a real pick,
  leaving out the time spent in the dialog. The automated number was under 1 s, so this only
  confirms nothing in a visible, cold, non-automated Chrome adds seconds.
