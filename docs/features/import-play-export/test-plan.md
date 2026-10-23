---
status: Approved
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
---

# Test plan — import-play-export

The slice must prove properties that cannot be judged by looking at the screen:

- A/V drift over ten minutes;
- an Export that matches the Preview;
- sound surviving CPU starvation.

Every spec §5 acceptance criterion maps to at least one test below. This plan was migrated, not
written before the tests: it is derived from the Spec Kit testing strategy (research R8, now in
[sad.md](./sad.md) §4), the test tasks, and the automated-validation table in
[_evidence/quickstart.md](./_evidence/quickstart.md). The "Test name" column names the test file
that exists at `53f38c4`. The suites and their commands are in
[architecture-map.md](../../architecture-map.md) §Conventions.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic in `packages/model` (Timebase arithmetic, the document parser and migrations, the reducer and its inverse patches, the Scene projection) and in `apps/editor` (store, engine client against a stand-in worker, audio graph and clock, export mix and settings, wording). | Node environment with no DOM shims, so a browser API used in the model fails loudly. Inputs are plain literals run through the parser. The arithmetic that must never drift is tested exactly, in integers, and mutation-checked. |
| Integration | The editor's storage against a real IndexedDB, and real file handles. | Runs in the real target browser, because the node environment has no IndexedDB and no structured clone of a file handle. Handles come from origin-private storage only as a way to get real handles without a native picker. |
| Contract | The main thread ↔ worker protocol ([contracts/events.md](./contracts/events.md)), driven directly. | The real engine worker in the real browser. Messages are typed against the engine's own exported protocol types, so a renamed field stops the test compiling. |
| E2E | — | Covered by the E2E-through-UI row. Every flow is driven through the real interface. |
| Load | The numeric §6 NFRs (SC-001 to SC-005, SC-009). | Timed in the page on the reference machine, against generated fixtures with a burned-in Frame counter and a click on every whole second. Ten-minute runs are tagged slow and always run on a fresh dev server. |
| Component *(UI surface only)* | <!-- N/A: no isolated component tests exist; the UI is exercised through E2E-through-UI and its pure helpers (timeline scale, timecode, export settings, failure wording) by unit tests. --> | — |
| Visual-regression *(web UI only)* | <!-- N/A: no visual baselines are kept; the Preview's pixels are asserted by reading the burned-in counter off the canvas instead. --> | — |
| E2E-through-UI *(UI surface only)* | Each user story, through the real editor in the real target browser. | The native file and save pickers are replaced by stand-ins over the generated fixtures, because they cannot be automated. That makes the app's code path real but not the dialog itself (see Edge cases). The specs run one at a time, because they are measurements against one machine. |

WebCodecs cannot be meaningfully faked: a unit test that mocks the decoder proves nothing about
the risky part. So everything that decodes, composites, plays or encodes is tested in the real
browser, and nothing about media is mocked.

## AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 import shows Source and whole Clip | `import-and-scrub.spec.ts`, `import-smoke.spec.ts`, `page-load-to-frame-0.spec.ts`; `import.test.ts`, `store/import-source.test.ts` | e2e-through-UI + unit | Source listed with name and duration, one Clip from Frame 0 covering the Source, Frame 0 shown |
| AC-02 Project adopts the first Source's Timebase and size | `import.test.ts` | unit | The Project takes the Source's Timebase and picture size, and no configuration is asked for |
| AC-03 a second import butt-joins a Clip | `import.test.ts`; `export-fidelity.spec.ts` (two Sources, one join) | unit + e2e-through-UI | Second Clip starts exactly where the Track ended |
| AC-04 a scrubbed Frame shows its picture | `import-and-scrub.spec.ts`, `scrub-latency.spec.ts`, `engine-worker.spec.ts` | e2e-through-UI + contract | Counter read off the Preview equals the Frame asked for |
| AC-05 nothing shown past the end | `import-and-scrub.spec.ts` (T053: past the end), `ui/timeline-scale.test.ts` | e2e-through-UI + unit | Preview opaque black, not the last Frame |
| AC-06 positions are whole Frames | `timebase.test.ts`, `document.test.ts` (non-integer Frames refused), `commands.test.ts`, `ui/timeline-scale.test.ts`, `ui/timecode.test.ts` | unit | No position between Frames can be stored or shown |
| AC-07 picture at the Project's frame size | `engine-worker.spec.ts` (worker resizes to the Scene's frame size), `shell.spec.ts` | contract + e2e-through-UI | Raster equals the Project frame size |
| AC-08 Sources never copied | `document.test.ts` / `project-store.spec.ts` (no handles in the document; structured-clone round trip), `source-links.spec.ts` | unit + integration | Document holds no handle, and storage holds no Source bytes |
| AC-09 undecodable file refused | `refuses-unusable-files.spec.ts`, `failures-are-legible.spec.ts` | e2e-through-UI | Plain reason shown, Project unchanged |
| AC-10 audio-only or image refused | `refuses-unusable-files.spec.ts` | e2e-through-UI | Each refused in its own words, Timeline unchanged |
| AC-11 different Source Timebase still correct | `import-and-scrub.spec.ts` (the 29.97 fixture in a 30 fps Project), `timebase.test.ts` (`frameToSourceTime` without drift), `export-fidelity.spec.ts` | e2e-through-UI + unit | Every Frame shows the mapped Source Frame |
| AC-12 a long Source imports promptly | `long-source-imports-promptly.spec.ts` | e2e-through-UI | Clip appears within the short-file budget, and only a small fraction of the file is read |
| AC-13 Play starts at the Playhead, picture and sound together | `av-sync.spec.ts`, `audio/transport.test.ts`, `audio/clock.test.ts`, `playback-clock.test.ts` | load + unit | Frames follow the audio clock from the start Frame |
| AC-14 Play at the end restarts from Frame 0 | `playback-stops-at-the-end.spec.ts`, `audio/transport.test.ts` | e2e-through-UI + unit | Play from the last Frame starts at 0 |
| AC-15 Stop leaves the Playhead on the shown Frame | `audio/transport.test.ts`; validation walk US2 3–4 | unit + e2e-through-UI | Playhead equals the last Frame shown |
| AC-16 seek while playing, no gap or repeat | `seek-during-playback.spec.ts`, `audio/graph.test.ts` | e2e-through-UI + unit | Sound handed over at one instant, no sample scheduled twice |
| AC-17 picture yields, sound never does | `degrades-picture-not-sound.spec.ts`, `playback-rate.spec.ts`, `playback-renders-only-the-playhead.spec.ts` | load + e2e-through-UI | Skipped Frames above 0 while sound is one unbroken run |
| AC-18 no cumulative drift | `av-sync.spec.ts` (slow), `timebase.test.ts` (no accumulated error over 10 minutes) | load + unit | Worst drift under one Frame over 18 000 Frames |
| AC-19 silent Source plays | `silent-source-plays.spec.ts` | e2e-through-UI | Picture plays against a silent clock, no error |
| AC-20 playback stops at the Timeline's end | `playback-stops-at-the-end.spec.ts` | e2e-through-UI | Stops on the last Frame |
| AC-21 the export contains every Frame and its sound | `export-fidelity.spec.ts`, `export-smoke.spec.ts`, `export-throughput.spec.ts` | e2e-through-UI + load | Sampled exported Frames equal the Preview's, and the file is complete |
| AC-22 three qualities, Standard preselected | `ui/export-settings.test.ts`, `export-smoke.spec.ts` | unit + e2e-through-UI | High, Standard and Draft scaled to frame size; Standard selected; 192 kbps stereo sound |
| AC-23 only producible settings offered | `ui/export-settings.test.ts` | unit | A setting the probe refuses is not offered |
| AC-24 actionable progress | `export-smoke.spec.ts`, `store/export.test.ts` | e2e-through-UI + unit | Frames done, elapsed and time left shown |
| AC-25 cancel leaves no finished file | `export-cancel.spec.ts` | e2e-through-UI + load | Stopped within 2 s, file absent or untouched |
| AC-26 a failure never presents a partial file | `failures-are-legible.spec.ts`, `store/export.test.ts`, `ui/failure-wording.test.ts` | e2e-through-UI + unit | Plain failure stated, nothing committed |
| AC-27 no sound encoder needs an explicit choice | `ui/export-settings.test.ts`; validation walk US3 7–8 (encoder forced to "unsupported") | unit + e2e-through-UI | Export disabled until "without sound" is chosen; file has video only |
| AC-28 no sound means no sound track, no question | `ui/export-settings.test.ts`, `store/export.test.ts` | unit | No question asked, no audio track written |
| AC-29 exporting over a Source is refused | `export-refuses-a-source.spec.ts`, `store/export.test.ts` | e2e-through-UI + unit | Refused with the Source named, the file byte-identical |
| AC-30 the export ignores later edits | `export-ignores-later-edits.spec.ts` | e2e-through-UI | Output equals the Timeline at the start |
| AC-31 plays in ordinary players, in sync | `export-duration.spec.ts`; manual SC-006 check ([_evidence/validation.md](./_evidence/validation.md)) | e2e-through-UI + manual | Box durations exact, clicks at lag 0; QuickTime, VLC and Chrome all play it |
| AC-32 kept without saving and listed | `edits-survive-a-reload.spec.ts`, `project-list.spec.ts`, `project-store.spec.ts`, `reopen-and-relink.spec.ts`, `undo-and-transactions.spec.ts` (real unloads) | e2e-through-UI + integration | Reload and tab close keep the edit, and the Project is listed with name and time |
| AC-33 permission re-grant by the user only | `reopen-and-relink.spec.ts`, `source-links.spec.ts` (no request on load), `store/source-status.test.ts` | e2e-through-UI + integration + unit | Offline "needs permission" until Allow access |
| AC-34 an unreachable file is Offline and relinkable | `reopen-and-relink.spec.ts`, `import-smoke.spec.ts`, `store/relink.test.ts` | e2e-through-UI + unit | Offline with reason; picking the renamed file restores every Clip |
| AC-35 a wrong file is refused at Relink | `source-links.spec.ts`, `store/relink.test.ts` | integration + unit | Size mismatch refused, the old link kept |
| AC-36 a Clip survives Offline | `reopen-and-relink.spec.ts`, `scene.test.ts` (Offline Clip stays in the Scene) | e2e-through-UI + unit | Clip unchanged (same id), empty while Offline |
| AC-37 a vanished Source goes Offline at once | `source-vanishes-mid-session.spec.ts` | e2e-through-UI | Offline on the next Frame, Preview black |
| AC-38 undo leaves link status alone | `undo-does-not-touch-status.spec.ts`, `store/index.test.ts` | e2e-through-UI + unit | Linked or Offline unchanged by undo and redo |
| AC-39 unsupported browser told on arrival | `capability-gate.spec.ts`, `ui/capability-check.test.ts` | e2e-through-UI + unit | Gate names what is missing; editor not rendered |

## Edge cases / error paths

- Undecodable, audio-only or image file → expected: refused, each in its own words, with "Nothing
  was added to the Project" (AC-09, AC-10).
- Permission lapsed after a reload → expected: Offline "needs permission", no prompt on load
  (AC-33).
- File renamed while open → expected: Offline on the next Frame, Preview empty (AC-37).
- Relink to a different file → expected: refused, the old link kept (AC-35).
- Export cancelled at once, mid-run, or over an existing file → expected: stopped within 2 s, no
  committed file, an existing file byte-identical (AC-25).
- Export destination fails or the encoder errors → expected: failure stated plainly, the stream
  aborted (AC-26).
- Export onto a Source's own file → expected: refused before anything is written (AC-29).
- No sound encoder → expected: an explicit "export without sound" choice (AC-27).
- Worker throws → expected: `fatal` is surfaced in the Preview's place, and pending requests are
  rejected (`store/engine-fatal.test.ts`, `engine-worker.spec.ts`).
- Storage cannot be opened, is blocked by another tab, or a save fails → expected: the
  [_evidence/failures.md](./_evidence/failures.md) wording and actions (`failures-are-legible.spec.ts`,
  `storage/db.test.ts`).
- What a script cannot reach (the native pickers, real permission prompts, a Finder rename,
  hearing the sound, VLC and QuickTime Player) → expected: checked by a person, per the "Needs a
  human" list in [_evidence/validation.md](./_evidence/validation.md). Still open (spec §8).

## Test data

- Seed strategy: model tests use plain-literal Projects run through `parseProject`, including a
  hand-written version-0 document. Media fixtures are generated deterministically by the fixture
  script into `packages/engine/test/fixtures/` (gitignored):
  - `sync-1080p30.mp4`, `sync-1080p2997.mp4` and `sync-1080p30-10min.mp4`;
  - `silent-720p24.mp4` and `long-1080p30-70min.mp4`;
  - `audio-only.m4a`, `still.png` and `broken.mp4`.

  Each moving fixture has a burned-in Frame counter and a click on every whole second.
- Integration dependency: the real browser's IndexedDB and origin-private storage in a fresh
  browser context per test. Nothing about storage or media is mocked.
- Cleanup boundary: per test. Each test gets a fresh browser context, and exported files are
  written to the stand-in disk and checked there.

## NFR validation (load)

- SC-001 (< 15 s page load → Frame 0, picker excluded) → `page-load-to-frame-0.spec.ts`. Measured
  652 / 486 / 483 ms.
- SC-002 (within one Frame over 10 minutes, 1080p) → `av-sync.spec.ts` plays the ten-minute fixture
  from Frame 0 to the end. Measured worst drift 0.62 Frames.
- SC-003 (≤ 300 ms scrub at 1080p) → `scrub-latency.spec.ts`, asserting the worst move rather
  than the mean. Long-GOP material is measured separately in
  [_evidence/performance-baseline.md](./_evidence/performance-baseline.md). Forward gestures pass;
  backward steps and far jumps measure 301–313 ms (accepted, spec §8).
- SC-004 (full rate for 10 minutes of 1080p30, no audio interruption) → `playback-rate.spec.ts`.
  Full rate is ≤ 1 skipped Frame in any minute, never 2 in a row, 0 dropped. Measured 18 000
  shown, 0 skipped.
- SC-005 (< 2 min to export 1 minute of 1080p30) → `export-throughput.spec.ts`. Measured
  7.81–7.84 s.
- SC-009 (cancel ≤ 2 s) → `export-cancel.spec.ts`. Measured 15–24 ms.
- FR-012 under starvation → `degrades-picture-not-sound.spec.ts`: 20× CPU throttle on the page,
  and a busy loop holding the engine worker at about 90 %.

## CI placement

- On every PR: the unit suites (`pnpm test`), typecheck and lint.
- The default e2e run (`pnpm test:e2e`): one spec at a time, against one machine. It cannot be
  meaningfully parallelised.
- Before a release, on the reference machine: the slow suite (`pnpm test:e2e:slow`, about twenty
  minutes, on its own fresh server) and the manual list in [_evidence/quickstart.md](./_evidence/quickstart.md).
- There is no CI configuration in this repository. This placement is advice only.
