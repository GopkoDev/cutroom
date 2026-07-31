---

description: "Task list for Import, Play, Export"
---

# Tasks: Import, Play, Export

**Input**: Design documents from `/specs/001-import-play-export/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Test tasks ARE included. They are not optional here: the slice exists to prove
properties that cannot be judged by looking at the screen (A/V drift over ten minutes, export
matching Preview, sound surviving CPU starvation), and `quickstart.md` names those checks as
gates.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths follow the monorepo layout in plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Turn the current single app into the monorepo the constitution mandates, and get the
repository root right before history accumulates.

- [x] T001 Initialise the git repository at the Cutroom root so `specs/`, `docs/`, `.specify/`, `.claude/`, `packages/` and `apps/` are all tracked — **done**. Started fresh rather than carrying over the scaffold's single commit; the old `videoEditor/` folder stays outside the repository
- [x] T002 Create the pnpm workspace at the root: `pnpm-workspace.yaml` listing `packages/*` and `apps/*`, plus a root `package.json` with the `dev` / `build` / `test` / `test:e2e` / `lint` / `typecheck` / `fixtures` scripts referenced in quickstart.md — **done**
- [x] T003 Bring the existing Vite app in as `apps/editor`, keeping its Vite, Tailwind and shadcn configuration — **done**, renamed to `@cutroom/editor` and given workspace dependencies on `@cutroom/model` and `@cutroom/engine`. Its starter `App.tsx` still needs replacing, which happens in T035
- [x] T004 Move `CONTEXT.md` and the ADRs out of the app and up to the repository root, since they describe the whole monorepo — **done ahead of the others**, so that the constitution and this feature's documents do not point at paths that stop existing at T003
- [x] T005 Create `tsconfig.base.json` at the root with ES2023, `moduleResolution: bundler`, `strict`, `noUncheckedIndexedAccess`, and project references for `packages/model`, `packages/engine`, `apps/editor` — **done**; `packages/model` deliberately has no DOM lib, `packages/engine` has DOM and WebWorker
- [x] T006 Create the `packages/model` package skeleton (`package.json`, `tsconfig.json`, `src/index.ts`) with no dependencies — **done**; the empty `dependencies` field is the constraint, not an oversight
- [x] T007 Create the `packages/engine` package skeleton with `mediabunny` and `pixi.js` as its only runtime dependencies — **done**
- [x] T008 Add `zustand`, `immer` and `idb` to `apps/editor`, and wire it to `@cutroom/model` and `@cutroom/engine` via workspace references — **done** (declared; `pnpm install` still to run)
- [ ] T009 [P] Configure ESLint and Prettier at the root, including a rule or override that forbids importing from `lovable_test_ui/` anywhere in `apps/` and `packages/` (ADR 0010)
- [ ] T010 [P] Configure Vitest for `packages/model` with a node environment and no DOM shims, so a browser API used there fails loudly
- [ ] T011 [P] Configure Playwright in `apps/editor/e2e/` to run against Chromium only, with permissions for the File System Access API pre-granted where possible
- [ ] T012 Write `scripts/make-fixtures.ts` producing the fixtures listed in quickstart.md (`sync-1080p30.mp4`, `sync-1080p2997.mp4`, `silent-720p24.mp4`, `broken.mp4`) into `packages/engine/test/fixtures/`, each with a visible frame counter and a click on every whole second

- [x] T013 Name the reference machine in [quickstart.md](./quickstart.md) — the exact CPU, GPU, RAM and OS that SC-004 and SC-005 are measured against — **done**: MacBook Air (Apple M4, 10 cores / 8 GPU cores, 16 GB), macOS 26.5.2, Chrome 150. T068 and T084 assert against that machine

**Checkpoint**: `pnpm install`, `pnpm typecheck` and `pnpm lint` succeed at the root; the dev server serves an empty `apps/editor`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The model, the storage, and the two ends of the worker boundary. Nothing user-facing
works until this is in place.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### The model (`packages/model`)

- [ ] T014 [P] Implement the Timebase module in `packages/model/src/timebase.ts`: `frameToSeconds`, `secondsToFrame`, `frameToSampleIndex`, `framesForDuration`, with a rational frame rate and total functions that throw on invalid input (contracts/model-api.md)
- [ ] T015 [P] Write Timebase unit tests in `packages/model/test/timebase.test.ts` covering exact-Frame, half-Frame either side, 30000/1001 sample alignment, and accumulated-error absence over 10 minutes of Frames
- [ ] T016 Define the Project document types in `packages/model/src/document/types.ts` per data-model.md (Project, Source, Timeline, Track, Clip), with Frame values typed as integers and no browser types anywhere
- [ ] T017 Implement `parseProject` in `packages/model/src/document/parse.ts` rejecting non-integer Frames, overlapping Clips, non-positive durations, invalid Timebase, and anything not structured-clone-safe
- [ ] T018 Implement the migration chain in `packages/model/src/document/migrate.ts` with `CURRENT_SCHEMA_VERSION = 1`, a registry keyed by version, and refusal (not coercion) of documents from the future
- [ ] T019 [P] Write document tests in `packages/model/test/document.test.ts`: valid round-trip through `structuredClone`, each rejection rule, and a migration from a hand-written version-0 fixture
- [ ] T020 Implement the command reducer in `packages/model/src/commands/apply.ts` returning `{ project, patches, inversePatches }` via Immer, pure with ids and timestamps passed in by the caller (contracts/model-api.md)
- [ ] T021 Define the commands this slice needs in `packages/model/src/commands/index.ts`: `create-project`, `import-source`, `add-clip`, `relink-source`. Source link status is deliberately **not** a command — it is runtime state outside the document (data-model.md), so undo must never toggle a Source between Linked and Offline
- [ ] T022 [P] Write reducer tests in `packages/model/test/commands.test.ts` asserting that every command's inverse patches restore the exact prior document, including the Clip-overlap guard
- [ ] T023 Implement `projectScene` in `packages/model/src/scene.ts` producing `SceneItem[]` (never `SceneLayer` — "Layer" is an `_Avoid_` term in CONTEXT.md): deterministic back-to-front order, only picture-affecting fields, byte-identical output for identical Projects
- [ ] T024 [P] Write Scene tests in `packages/model/test/scene.test.ts` asserting determinism and that a non-visual edit (renaming the Project) produces an unchanged Scene

### Storage (`apps/editor/src/storage`)

- [ ] T025 [P] Implement the IndexedDB schema in `apps/editor/src/storage/db.ts`: a `projects` store keyed by id and a `source-links` store keyed by sourceId, with an upgrade path
- [ ] T026 Implement the Project store in `apps/editor/src/storage/projects.ts`: list, load (through `migrateProject`), and save-on-transaction with debouncing (FR-020)
- [ ] T027 Implement the Source link table in `apps/editor/src/storage/source-links.ts`: put/get a `FileSystemFileHandle` by sourceId, query permission, request permission behind a user gesture, and verify a relinked file against the stored fingerprint (ADR 0005, FR-021)

### The worker boundary

- [ ] T028 Define the protocol types in `packages/engine/src/protocol.ts` exactly as specified in contracts/worker-protocol.md, exported for both sides so a message shape cannot drift
- [ ] T029 Implement the worker entry in `packages/engine/src/worker.ts`: a single message switch, and a top-level handler that converts any thrown error into a `fatal` message rather than a silent death (worker-protocol invariant 5)
- [ ] T030 Initialise PixiJS in `packages/engine/src/compose/renderer.ts`: `DOMAdapter.set(WebWorkerAdapter)` before anything else, renderer bound to the transferred `OffscreenCanvas`, and a `renderScene(scene, frame)` that clears and draws (research R6)
- [ ] T031 Implement the runtime capability probe in `packages/engine/src/capabilities.ts` using `canEncode` / `canEncodeVideo` / `canEncodeAudio`, returned in the `ready` message (research R5, Principle I)
- [ ] T032 Implement the typed client in `apps/editor/src/engine-client/index.ts`: spawn the worker, transfer the canvas, promise-based request/response with correlation, and surfacing of `fatal` to the UI
- [ ] T033 Create the Zustand store in `apps/editor/src/store/index.ts` wrapping `applyCommand`, with a transaction API for grouping a gesture and an undo/redo stack of inverse patches (Principle IV)
- [ ] T034 Implement the unsupported-browser gate in `apps/editor/src/ui/CapabilityGate.tsx`: detect the absence of `showOpenFilePicker`, `OffscreenCanvas` or WebCodecs on arrival and state it plainly (FR-023)
- [ ] T035 Build the three-panel application shell in `apps/editor/src/ui/EditorLayout.tsx` (media list, preview, timeline) with the Preview's canvas transferred to the worker on mount

**Checkpoint**: `pnpm test` is green for `packages/model`; the app boots, spawns the worker, and renders an empty Preview at the Project's frame size.

---

## Phase 3: User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP

**Goal**: A user picks a file and sees it on the Timeline, with the Preview showing the Frame under
the Playhead.

**Independent test**: Choose `sync-1080p30.mp4`, confirm a Clip appears whose length matches the
file, drag the Playhead to several counter marks and confirm the Preview shows the matching
Frames.

- [ ] T036 [US1] Implement the import action in `apps/editor/src/ui/MediaPanel.tsx`: `showOpenFilePicker` behind a user gesture, storing the handle via the link table, then handing the resolved `File` to the engine (FR-001, FR-004)
- [ ] T037 [US1] Implement `attach-source` in `packages/engine/src/sources/attach.ts`: open a Mediabunny `Input` over a `BlobSource`, read duration, dimensions, frame rate, codecs and audio presence, and answer `source-attached` (FR-002)
- [ ] T038 [US1] Implement refusal in the same module: a file with no decodable video track, or one that fails `canDecode`, answers `source-failed` with a reason, and the store leaves the Project untouched (FR-003)
- [ ] T039 [US1] Implement Project creation on first import as a pure command sequence in `packages/model/src/commands/import.ts`: adopt the Source's frame rate as the Timebase and its dimensions as the Project's frame size, then add one Clip covering the whole Source at Frame 0. `apps/editor` only supplies the ids and calls it (FR-005, spec assumption)
- [ ] T040 [P] [US1] Write a unit test in `packages/model/test/import.test.ts` for the adopt-Timebase-and-add-Clip command sequence, including a 30000/1001 Source
- [ ] T041 [US1] Implement per-Source `CanvasSink` management in `packages/engine/src/sources/canvas-sink.ts`, sized to the Project's frame size, with an explicit draw-before-next-pull rule and a comment recording the pooling caveat (research R1)
- [ ] T042 [US1] Implement the scrub render path in `packages/engine/src/playback/scrub.ts`: abandon any iterator, call `sink.getCanvas(t)` for each visible Scene item, convert the Frame to Source time through the Timebase, and hand the canvas to the compositor (research R2)
- [ ] T043 [US1] Implement Frame-to-Source-time mapping in `packages/engine/src/playback/mapping.ts` handling a Source whose frame rate differs from the Project's Timebase (spec edge case)
- [ ] T044 [US1] Draw one Scene item in `packages/engine/src/compose/scene-item.ts`: wrap the sink's canvas as a PixiJS texture source, update it per Frame, and fit the Source's dimensions into the Project's frame size (FR-009)
- [ ] T045 [US1] Render nothing where no Clip covers the Frame, so the Preview goes empty past the end of the Clip instead of holding the last Frame (FR-008, US1 scenario 3)
- [ ] T046 [US1] Build the Timeline in `apps/editor/src/ui/Timeline.tsx`: a ruler in Frames, one video Track, the Clip drawn to scale, and a draggable Playhead that snaps to whole Frames (FR-006, FR-007)
- [ ] T047 [US1] Wire the Playhead to `render-frame` with `reason: "scrub"` through the engine client, with a latest-wins guard in the client so only the newest request is in flight. This is the client-side half only; the worker-side scheduler that also drops Frames under load arrives in T060 and supersedes nothing here
- [ ] T048 [US1] Display the timecode in `apps/editor/src/ui/TopBar.tsx`, derived from the Frame through the Timebase module and never from a float
- [ ] T049 [US1] Implement Source status as a plain store action outside the undo history in `apps/editor/src/store/source-status.ts`: mark a Source Offline when its handle is missing, permission is not granted, or `getFile()` throws, and render its Clips as empty (FR-021, FR-022)
- [ ] T050 [US1] Build the Relink flow in `apps/editor/src/ui/RelinkPrompt.tsx`: offer re-granting permission on reopen, or picking the file again, verifying the fingerprint before rebinding (FR-021)
- [ ] T051 [P] [US1] Write the Playwright test `apps/editor/e2e/import-and-scrub.spec.ts`: import the fixture, request Frame 210, read the canvas back and assert the counter region matches; repeat with `sync-1080p2997.mp4` in a 30 fps Project
- [ ] T052 [P] [US1] Write `apps/editor/e2e/refuses-broken-file.spec.ts` asserting the message and that the Timeline is unchanged
- [ ] T053 [P] [US1] Write `apps/editor/e2e/reopen-and-relink.spec.ts`: reload, assert the Timeline is identical and the Source is marked Offline rather than silently wrong, re-grant, assert the Preview works without rebuilding the Timeline (SC-008)
- [ ] T054 [P] [US1] Assert in `apps/editor/e2e/undo-does-not-touch-status.spec.ts` that undo after an import restores the document without changing any Source's Linked/Offline status

**Checkpoint**: US1 is independently demonstrable — the product is already useful as a Frame-accurate viewer.

---

## Phase 4: User Story 2 — Playback with sound in sync (Priority: P2)

**Goal**: Picture and sound advance together from the Playhead, sound never yields to picture.

**Independent test**: Play a fixture with a click on every whole second and confirm click and
counter land together at the start and after ten minutes.

- [ ] T055 [US2] Implement audio decode in `packages/engine/src/sources/audio.ts` using `AudioSampleSink`, emitting `audio-pcm` messages with transferred `Float32Array`s ahead of the Playhead (research R3)
- [ ] T056 [US2] Implement the Web Audio graph in `apps/editor/src/audio/graph.ts`: an `AudioContext`, a gain node per Clip, and scheduling of `AudioBufferSourceNode`s at a fixed lookahead (ADR 0008)
- [ ] T057 [US2] Implement the master clock in `apps/editor/src/audio/clock.ts`: derive the current Frame from `audioContext.currentTime` through the Timebase, never from a timer (FR-011, FR-013)
- [ ] T058 [US2] Drive the Preview from the clock in `apps/editor/src/audio/transport.ts`: on each animation frame, post `render-frame` with `reason: "clock"` for the Frame the clock reports
- [ ] T059 [US2] Implement streaming playback in `packages/engine/src/playback/stream.ts`: open a `canvasesAtTimestamps` iterator per active Clip on `transport: playing`, close it on stop, and open a fresh one after a seek (research R2)
- [ ] T060 [US2] Implement request coalescing and Frame dropping in `packages/engine/src/playback/scheduler.ts`: newer Frame requests supersede older ones, dropped counts are reported as `frames-dropped` and never surfaced as errors (FR-012)
- [ ] T061 [US2] Implement transport controls in `apps/editor/src/ui/TopBar.tsx` (play/stop button and spacebar), starting from the Playhead and leaving it on the Frame that was showing when stopped (FR-010, FR-014)
- [ ] T062 [US2] Handle seeking during playback: reschedule audio from the new position without a gap or repeated sound, and reopen the worker's iterators (US2 scenario 3)
- [ ] T063 [US2] Handle a Source with no audio track: play the picture against a silent clock, treating silence as valid (US2 scenario 5)
- [ ] T064 [US2] Stop playback at the end of the Timeline rather than running into empty space (US2 scenario 6)
- [ ] T065 [P] [US2] Write `apps/editor/e2e/av-sync.spec.ts`: play looped fixture material for ten minutes of Timeline time, sampling the reported Frame against `audioContext.currentTime`, asserting drift stays under one Frame (SC-002)
- [ ] T066 [P] [US2] Write `apps/editor/e2e/degrades-picture-not-sound.spec.ts`: apply CPU throttling through the CDP session, play, and assert audio continuity while `frames-dropped` is non-zero (FR-012, quickstart gate)
- [ ] T067 [P] [US2] Write `apps/editor/e2e/scrub-latency.spec.ts` measuring time from Playhead move to `frame-rendered` on the 1080p fixture, asserting under 300 ms (SC-003)
- [ ] T068 [P] [US2] Write `apps/editor/e2e/playback-rate.spec.ts`: play 60 s of `sync-1080p30.mp4` unthrottled, count `frame-rendered` against `frames-dropped`, and assert sustained full rate on the reference machine (SC-004)

**Checkpoint**: US2 is independently demonstrable, and the property this slice exists to prove is measurable.

---

## Phase 5: User Story 3 — Export a finished file (Priority: P3)

**Goal**: An MP4 of the whole Timeline whose picture and sound match the Preview, with progress
and cancellation.

**Independent test**: Export a Project with one Clip, open the output in an ordinary player, and
confirm duration, picture and sound match.

- [ ] T069 [US3] Build the export dialog in `apps/editor/src/ui/ExportDialog.tsx`, offering only the format and quality combinations reported by the capability probe, and stating plainly when a codec is unavailable (FR-017)
- [ ] T070 [US3] Handle the no-audio-encoder case in the same dialog: say so before the export starts and require an explicit choice to continue without sound, never producing a silent file by default (FR-024)
- [ ] T071 [US3] Implement destination selection: `showSaveFilePicker`, `createWritable`, and transfer of the `FileSystemWritableFileStream` to the worker (FR-015, research R4)
- [ ] T072 [US3] Freeze the Scene at export start in `apps/editor/src/store/export.ts` and send it inside `export-start`, so later edits cannot affect the running export (FR-019)
- [ ] T073 [US3] Mix the audio on the main thread in `apps/editor/src/audio/offline-mix.ts` with `OfflineAudioContext`, using the same graph construction as playback, and stream the PCM to the worker in chunks (ADR 0008, Principle III)
- [ ] T074 [US3] Implement the export pipeline in `packages/engine/src/export/run.ts`: `Output` + `Mp4OutputFormat` + `StreamTarget`, a `CanvasSource` over the renderer canvas, and an `AudioSampleSource` fed by `AudioSample`s built from the transferred chunks (research R4)
- [ ] T075 [US3] Step the Frame loop from `fromFrame` to `toFrame`, rendering each Frame through the same `renderScene` used by Preview and calling `videoSource.add(frame / fps, 1 / fps)` (Principle III, FR-016)
- [ ] T076 [US3] Await backpressure on every `videoSource.add()` and `audioSource.add()`, and acknowledge audio chunks with `export-audio-ack` so the main thread cannot outrun the encoder (research R4, protocol invariant 4)
- [ ] T077 [US3] Report progress as `export-progress` and render it in the dialog with elapsed and estimated remaining time (FR-018)
- [ ] T078 [US3] Implement cancellation: abort the loop, close the writable stream without finalizing, delete or leave clearly unfinished output, and answer `export-cancelled` within two seconds (FR-018, SC-009)
- [ ] T079 [US3] Handle export failure — the destination becoming unwritable or the encoder erroring — by reporting `export-failed` and never presenting a partial file as complete (spec edge case)
- [ ] T080 [US3] Finalize with `output.finalize()`, which closes the stream, and report `export-done` with the byte count
- [ ] T081 [P] [US3] Write `apps/editor/e2e/export-fidelity.spec.ts`: export, reopen the output with Mediabunny, and compare sampled Frames against Preview renders of the same Frames (SC-007)
- [ ] T082 [P] [US3] Write `apps/editor/e2e/export-duration.spec.ts` asserting the output duration equals `durationFrames / fps` and that audio sync marks still align at the end (SC-006)
- [ ] T083 [P] [US3] Write `apps/editor/e2e/export-cancel.spec.ts` asserting cancellation within two seconds and no complete file left behind (SC-009)
- [ ] T084 [P] [US3] Write `apps/editor/e2e/export-throughput.spec.ts`: export 60 s of 1080p30 material, record wall-clock time, and assert it completes in under two minutes on the reference machine (SC-005)

**Checkpoint**: all three stories work; the slice is complete end to end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T085 Audit resource lifetimes across `packages/engine`: every `VideoFrame` closed, every pooled canvas released, decoders torn down on `detach-source`, and a long-export memory trace recorded in `specs/001-import-play-export/` as evidence
- [ ] T086 [P] Profile the compose step in isolation at 1080p and record the per-Frame budget, so later Effects work has a baseline (plan risk table)
- [ ] T087 [P] Measure first-Frame-after-seek on long-GOP material and record whether SC-003 holds without a scrub-quality path (plan risk table)
- [ ] T088 [P] Make every failure the user can hit legible: undecodable file, permission denied, Source offline, export failed, worker fatal — each with a plain statement and, where applicable, an action
- [ ] T089 [P] Add a `docs/adr/0011-*.md` for any decision this implementation forced that meets the ADR bar, and update `CONTEXT.md` with any domain term the code introduced (constitution, Development Workflow)
- [ ] T090 [P] Write `README.md` at the root: what the product is, the Chromium-only position and why, how to run, and how to run the two test tiers
- [ ] T091 Walk the manual validation list in [quickstart.md](./quickstart.md) end to end in Chrome and record the result, including the CPU-throttled playback gate and the time from opening the product to a Clip on the Timeline (SC-001)

---

## Dependencies

**Phase order**: Phase 1 → Phase 2 → (Phase 3 → Phase 4 → Phase 5) → Phase 6

The three user stories are sequenced rather than parallel, because each depends on the previous
one's machinery: US2 needs the Frame-to-Source mapping and the compose path built in US1; US3
renders through the same path US1 and US2 established and mixes audio with the graph US2 built.
They remain independently *testable* and independently *demonstrable*, which is what the slice
needs.

**Key blocking edges inside phases**:

- T014 (Timebase) blocks T016–T024, T042–T043, T057 — everything that converts time
- T028 (protocol types) blocks T029–T032 and every message-sending task
- T030 (PixiJS init) blocks T044, T045, T075
- T020–T021 (reducer and commands) block T039 — the import sequence is pure model code, not store code
- T033 (store) blocks T036, T049, T072
- T041 (CanvasSink management) blocks T042, T059
- T056–T057 (audio graph and clock) block T058, T062, T073
- T074 (export pipeline) blocks T075–T080

## Parallel execution examples

**Phase 1** — the configuration tasks are independent of each other:
`T005, T006, T007, T008, T009, T010, T011` can run together (T013 is already done).

**Phase 2** — the model, storage and worker skeleton touch different packages:
`T014 + T025 + T028` can run together; then `T015, T019, T022, T024` (all tests, separate files)
can run together.

**Phase 3** — `T040, T051, T052, T053, T054` are separate test files with no shared state.

**Phase 4** — `T065, T066, T067, T068` are separate spec files.

**Phase 5** — `T081, T082, T083, T084` are separate spec files.

**Phase 6** — `T086, T087, T088, T089, T090` touch different areas.

## Implementation strategy

**MVP scope**: Phases 1–3 (T001–T054). That delivers a Frame-accurate viewer of the user's own
footage, which already proves the riskiest half of the architecture: persisted handles, worker
decode, PixiJS compositing in a worker, and the Timebase discipline.

**Increment 2**: Phase 4. This is where the slice earns its keep — playback that degrades picture
rather than sound is the property everything later depends on.

**Increment 3**: Phase 5. Export closes the loop and validates Principle III by comparing exported
Frames against Preview renders.

**Stop-and-reconsider signals**: if T087 shows scrub latency far outside SC-003 on ordinary
footage, or T066 cannot be made to pass without restructuring, that is a finding about the design
and belongs in an ADR before more is built on top.
