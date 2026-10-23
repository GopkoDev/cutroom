# Tracker — import-play-export

> Status of every task in the epic. `implement` updates **Status** and **Step** after every
> subagent it runs (and commits them with the task), so this table shows where the run is right now.
> Status: `todo` · `in_progress` · `blocked` · `review` · `done`.
> Step: `SELECT` · `RED` · `GREEN` · `REFACTOR` · `GATE` · `REVIEW` · `COMMIT` (`—` before the task starts).
> A `blocked` row carries its reason in Step, e.g. `GATE — lint red after 3 retries`.
>
> Migrated from Spec Kit: the slice was built before SDD, so no SDD TDD steps were recorded and every finished task shows Step `—`. Task ids are the Spec Kit ids, unchanged.

| # | Task | Layer | Owner | Estimate | Blocked by | Status | Step |
|---|---|---|---|---|---|---|---|
| T001 | [Initialise the git repository at the Cutroom root so `specs/`, `docs/`, `.specify/`, `.claude/`, `packages/`…](./T001-initialise-git-repository-cutroom-root-specs.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T002 | [Create the pnpm workspace at the root](./T002-create-pnpm-workspace-root.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T003 | [Bring the existing Vite app in as `apps/editor`, keeping its Vite, Tailwind and shadcn configuration](./T003-bring-existing-vite-app-apps-editor.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T004 | [Move `CONTEXT.md` and the ADRs out of the app and up to the repository root, since they describe the whole…](./T004-move-context-md-adrs-out-app.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T005 | [Create `tsconfig.base.json` at the root with ES2023, `moduleResolution](./T005-create-tsconfig-base-json-root-es2023.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T006 | [Create the `packages/model` package skeleton (`package.json`, `tsconfig.json`, `src/index.ts`) with no…](./T006-create-packages-model-package-skeleton-package.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T007 | [Create the `packages/engine` package skeleton with `mediabunny` and `pixi.js` as its only runtime dependencies](./T007-create-packages-engine-package-skeleton-mediabunny.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T008 | [Add `zustand`, `immer` and `idb` to `apps/editor`, and wire it to `@cutroom/model` and `@cutroom/engine` via…](./T008-add-zustand-immer-idb-apps-editor.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T009 | [Configure ESLint and Prettier at the root, including a rule that forbids importing from outside the…](./T009-configure-eslint-prettier-root-including-rule.md) | wiring | Dmytro Hopko | n/a | — | done | — |
| T010 | [Add `scripts/check-docs.mjs` and wire it into `pnpm lint` — machine-checks the invariants that kept…](./T010-add-scripts-check-docs-mjs-wire.md) | docs | Dmytro Hopko | n/a | — | done | — |
| T011 | [Configure Vitest for `packages/model` with a node environment and no DOM shims, so a browser API used there…](./T011-configure-vitest-packages-model-node-environment.md) | tests | Dmytro Hopko | n/a | — | done | — |
| T012 | [Configure Playwright in `apps/editor/e2e/` to run against Chromium only, with permissions for the File System…](./T012-configure-playwright-apps-editor-e2e-run.md) | tests | Dmytro Hopko | n/a | — | done | — |
| T013 | [Write `scripts/make-fixtures.ts` producing the fixtures listed in quickstart.md (`sync-1080p30.mp4`,…](./T013-write-scripts-make-fixtures-ts-producing.md) | tests | Dmytro Hopko | n/a | — | done | — |
| T014 | [Name the reference machine in quickstart.md — the exact CPU, GPU, RAM and OS that SC-004 and SC-005 are…](./T014-name-reference-machine-quickstart-md-exact.md) | docs | Dmytro Hopko | n/a | — | done | — |
| T015 | [Implement the Timebase module in `packages/model/src/timebase.ts`](./T015-implement-timebase-module-packages-model-src.md) | domain | Dmytro Hopko | n/a | — | done | — |
| T016 | [Write Timebase unit tests in `packages/model/test/timebase.test.ts` covering exact-Frame, half-Frame either…](./T016-write-timebase-unit-tests-packages-model.md) | tests | Dmytro Hopko | n/a | — | done | — |
| T017 | [Define the Project document types in `packages/model/src/document/types.ts` per data-model.md (Project,…](./T017-define-project-document-types-packages-model.md) | domain | Dmytro Hopko | n/a | T015 | done | — |
| T018 | [Implement `parseProject` in `packages/model/src/document/parse.ts` rejecting non-integer Frames, overlapping…](./T018-implement-parseproject-packages-model-src-document.md) | domain | Dmytro Hopko | n/a | T015 | done | — |
| T019 | [Implement the migration chain in `packages/model/src/document/migrate.ts` with `CURRENT_SCHEMA_VERSION = 1`,…](./T019-implement-migration-chain-packages-model-src.md) | domain | Dmytro Hopko | n/a | T015 | done | — |
| T020 | [Write document tests in `packages/model/test/document.test.ts`](./T020-write-document-tests-packages-model-test.md) | tests | Dmytro Hopko | n/a | T015 | done | — |
| T021 | [Implement the command reducer in `packages/model/src/commands/apply.ts` returning `{ project, patches,…](./T021-implement-command-reducer-packages-model-src.md) | domain | Dmytro Hopko | n/a | T015 | done | — |
| T022 | [Define the commands this slice needs in `packages/model/src/commands/index.ts`](./T022-define-commands-this-slice-needs-packages.md) | domain | Dmytro Hopko | n/a | T015 | done | — |
| T023 | [Write reducer tests in `packages/model/test/commands.test.ts` asserting that every command's inverse patches…](./T023-write-reducer-tests-packages-model-test.md) | tests | Dmytro Hopko | n/a | T015 | done | — |
| T024 | [Implement `projectScene` in `packages/model/src/scene.ts` producing `SceneClip[]` — not `SceneLayer` and not…](./T024-implement-projectscene-packages-model-src-scene.md) | domain | Dmytro Hopko | n/a | T015 | done | — |
| T025 | [Write Scene tests in `packages/model/test/scene.test.ts` asserting determinism and that a non-visual edit…](./T025-write-scene-tests-packages-model-test.md) | tests | Dmytro Hopko | n/a | T015 | done | — |
| T026 | [Implement the IndexedDB schema in `apps/editor/src/storage/db.ts`](./T026-implement-indexeddb-schema-apps-editor-src.md) | infra | Dmytro Hopko | n/a | — | done | — |
| T027 | [Implement the Project store in `apps/editor/src/storage/projects.ts`](./T027-implement-project-store-apps-editor-src.md) | infra | Dmytro Hopko | n/a | — | done | — |
| T028 | [Implement the Source link table in `apps/editor/src/storage/source-links.ts`](./T028-implement-source-link-table-apps-editor.md) | infra | Dmytro Hopko | n/a | — | done | — |
| T029 | [Define the protocol types in `packages/engine/src/protocol.ts` exactly as specified in…](./T029-define-protocol-types-packages-engine-src.md) | ports | Dmytro Hopko | n/a | — | done | — |
| T030 | [Implement the worker entry in `packages/engine/src/worker.ts`](./T030-implement-worker-entry-packages-engine-src.md) | ports | Dmytro Hopko | n/a | T029 | done | — |
| T031 | [Initialise PixiJS in `packages/engine/src/compose/renderer.ts`](./T031-initialise-pixijs-packages-engine-src-compose.md) | app | Dmytro Hopko | n/a | T029 | done | — |
| T032 | [Implement the runtime capability probe in `packages/engine/src/capabilities.ts` using `canEncode` /…](./T032-implement-runtime-capability-probe-packages-engine.md) | app | Dmytro Hopko | n/a | T029 | done | — |
| T033 | [Implement the typed client in `apps/editor/src/engine-client/index.ts`](./T033-implement-typed-client-apps-editor-src.md) | ports | Dmytro Hopko | n/a | T029 | done | — |
| T034 | [Create the Zustand store in `apps/editor/src/store/index.ts` wrapping `applyCommand`, with a transaction API…](./T034-create-zustand-store-apps-editor-src.md) | app | Dmytro Hopko | n/a | — | done | — |
| T035 | [Implement the unsupported-browser gate in `apps/editor/src/ui/CapabilityGate.tsx`](./T035-implement-unsupported-browser-gate-apps-editor.md) | ui | Dmytro Hopko | n/a | — | done | — |
| T036 | [Build the three-panel application shell in `apps/editor/src/ui/EditorLayout.tsx` (Source list, Preview,…](./T036-build-three-panel-application-shell-apps.md) | ui | Dmytro Hopko | n/a | — | done | — |
| T037 | [Build the Project list in `apps/editor/src/ui/ProjectList.tsx`](./T037-build-project-list-apps-editor-src.md) | ui | Dmytro Hopko | n/a | T027 | done | — |
| T038 | [Implement the Source list in `apps/editor/src/ui/SourcesPanel.tsx` — named for what it holds, since…](./T038-implement-source-list-apps-editor-src.md) | ui | Dmytro Hopko | n/a | T034, T035, T036 | done | — |
| T039 | [Implement `attach-source` in `packages/engine/src/sources/attach.ts`](./T039-implement-attach-source-packages-engine-src.md) | app | Dmytro Hopko | n/a | — | done | — |
| T040 | [Implement refusal in the same module](./T040-implement-refusal-same-module.md) | app | Dmytro Hopko | n/a | — | done | — |
| T041 | [Implement Project creation on first import as a pure command sequence in…](./T041-implement-project-creation-first-import-pure.md) | domain | Dmytro Hopko | n/a | T021, T022 | done | — |
| T042 | [Write a unit test in `packages/model/test/import.test.ts` for the adopt-Timebase-and-add-Clip command…](./T042-write-unit-test-packages-model-test.md) | tests | Dmytro Hopko | n/a | — | done | — |
| T043 | [Implement per-Source `CanvasSink` management in `packages/engine/src/sources/canvas-sink.ts`, sized to the…](./T043-implement-per-source-canvassink-management-packages.md) | app | Dmytro Hopko | n/a | — | done | — |
| T044 | [Implement the scrub render path in `packages/engine/src/playback/scrub.ts`](./T044-implement-scrub-render-path-packages-engine.md) | app | Dmytro Hopko | n/a | T015, T043 | done | — |
| T045 | [Implement Frame-to-Source-time mapping in `packages/engine/src/playback/mapping.ts` as a thin call into…](./T045-implement-frame-source-time-mapping-packages.md) | app | Dmytro Hopko | n/a | T015 | done | — |
| T046 | [Draw one `SceneClip` in `packages/engine/src/compose/scene-clip.ts`](./T046-draw-one-sceneclip-packages-engine-src.md) | app | Dmytro Hopko | n/a | T031 | done | — |
| T047 | [Render nothing where no Clip covers the Frame, so the Preview goes empty past the end of the Clip instead of…](./T047-render-nothing-where-no-clip-covers.md) | app | Dmytro Hopko | n/a | T031 | done | — |
| T048 | [Build the Timeline in `apps/editor/src/ui/Timeline.tsx`](./T048-build-timeline-apps-editor-src-ui.md) | ui | Dmytro Hopko | n/a | T035, T036 | done | — |
| T049 | [Wire the Playhead to `render-frame` with `reason](./T049-wire-playhead-render-frame-reason.md) | ports | Dmytro Hopko | n/a | — | done | — |
| T050 | [Display the timecode in `apps/editor/src/ui/TopBar.tsx`, derived from the Frame through the Timebase module…](./T050-display-timecode-apps-editor-src-ui.md) | ui | Dmytro Hopko | n/a | — | done | — |
| T051 | [Implement Source status as a plain store action outside the undo history in…](./T051-implement-source-status-plain-store-action.md) | app | Dmytro Hopko | n/a | T034 | done | — |
| T052 | [Build the Relink flow in `apps/editor/src/ui/RelinkPrompt.tsx`](./T052-build-relink-flow-apps-editor-src.md) | ui | Dmytro Hopko | n/a | — | done | — |
| T053 | [Write the Playwright test `apps/editor/e2e/import-and-scrub.spec.ts`](./T053-write-playwright-test-apps-editor-e2e.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T054 | [Write `apps/editor/e2e/refuses-unusable-files.spec.ts` covering all three refusals the spec names —…](./T054-write-apps-editor-e2e-refuses-unusable.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T055 | [Write `apps/editor/e2e/long-source-imports-promptly.spec.ts`](./T055-write-apps-editor-e2e-long-source.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T056 | [Write `apps/editor/e2e/reopen-and-relink.spec.ts`](./T056-write-apps-editor-e2e-reopen-relink.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T057 | [Write `apps/editor/e2e/source-vanishes-mid-session.spec.ts`](./T057-write-apps-editor-e2e-source-vanishes.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T058 | [Assert in `apps/editor/e2e/undo-does-not-touch-status.spec.ts` that undo after an import restores the…](./T058-assert-apps-editor-e2e-undo-does.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T059 | [Implement audio decode in `packages/engine/src/sources/audio.ts` using `AudioSampleSink`, emitting…](./T059-implement-audio-decode-packages-engine-src.md) | app | Dmytro Hopko | n/a | — | done | — |
| T060 | [Implement the Web Audio graph in `apps/editor/src/audio/graph.ts`](./T060-implement-web-audio-graph-apps-editor.md) | app | Dmytro Hopko | n/a | — | done | — |
| T061 | [Implement the master clock in `apps/editor/src/audio/clock.ts`](./T061-implement-master-clock-apps-editor-src.md) | app | Dmytro Hopko | n/a | T015 | done | — |
| T062 | [Drive the Preview from the clock in `apps/editor/src/audio/transport.ts`](./T062-drive-preview-clock-apps-editor-src.md) | app | Dmytro Hopko | n/a | T060, T061 | done | — |
| T063 | [Implement streaming playback in `packages/engine/src/playback/stream.ts`](./T063-implement-streaming-playback-packages-engine-src.md) | app | Dmytro Hopko | n/a | T043 | done | — |
| T064 | [Implement request coalescing and Frame dropping in `packages/engine/src/playback/scheduler.ts`](./T064-implement-request-coalescing-frame-dropping-packages.md) | app | Dmytro Hopko | n/a | — | done | — |
| T065 | [Implement transport controls in `apps/editor/src/ui/TopBar.tsx` (play/stop button and spacebar), starting…](./T065-implement-transport-controls-apps-editor-src.md) | ui | Dmytro Hopko | n/a | — | done | — |
| T066 | [Handle seeking during playback](./T066-handle-seeking-during-playback.md) | app | Dmytro Hopko | n/a | T060, T061 | done | — |
| T067 | [Handle a Source with no audio track](./T067-handle-source-no-audio-track.md) | app | Dmytro Hopko | n/a | — | done | — |
| T068 | [Stop playback at the end of the Timeline rather than running into empty space (US2 scenario 6)](./T068-stop-playback-end-timeline-rather-than.md) | app | Dmytro Hopko | n/a | — | done | — |
| T069 | [Write `apps/editor/e2e/av-sync.spec.ts`](./T069-write-apps-editor-e2e-av-sync.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T070 | [Write `apps/editor/e2e/degrades-picture-not-sound.spec.ts`](./T070-write-apps-editor-e2e-degrades-picture.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T071 | [Write `apps/editor/e2e/scrub-latency.spec.ts` measuring time from Playhead move to `frame-rendered` on the…](./T071-write-apps-editor-e2e-scrub-latency.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T072 | [Write `apps/editor/e2e/playback-rate.spec.ts`](./T072-write-apps-editor-e2e-playback-rate.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T073 | [Build the export dialog in `apps/editor/src/ui/ExportDialog.tsx`](./T073-build-export-dialog-apps-editor-src.md) | ui | Dmytro Hopko | n/a | T032 | done | — |
| T074 | [Handle the no-audio-encoder case in the same dialog](./T074-handle-no-audio-encoder-case-same.md) | ui | Dmytro Hopko | n/a | T032 | done | — |
| T075 | [Implement destination selection](./T075-implement-destination-selection.md) | app | Dmytro Hopko | n/a | — | done | — |
| T076 | [Freeze the Scene at export start in `apps/editor/src/store/export.ts` and send it inside `export-start`, so…](./T076-freeze-scene-export-start-apps-editor.md) | app | Dmytro Hopko | n/a | T034 | done | — |
| T077 | [Mix the audio on the main thread in `apps/editor/src/audio/offline-mix.ts` with `OfflineAudioContext`, using…](./T077-mix-audio-main-thread-apps-editor.md) | app | Dmytro Hopko | n/a | T060, T061 | done | — |
| T078 | [Implement the export pipeline in `packages/engine/src/export/run.ts`](./T078-implement-export-pipeline-packages-engine-src.md) | app | Dmytro Hopko | n/a | — | done | — |
| T079 | [Step the Frame loop from `fromFrame` to `toFrame`, rendering each Frame through the same `renderScene` used…](./T079-step-frame-loop-fromframe-toframe-rendering.md) | app | Dmytro Hopko | n/a | T015, T031, T078 | done | — |
| T080 | [Await backpressure on every `videoSource.add()` and `audioSource.add()`, and acknowledge audio chunks with…](./T080-await-backpressure-every-videosource-add-audiosource.md) | app | Dmytro Hopko | n/a | T078 | done | — |
| T081 | [Report progress as `export-progress` and render it in the dialog with elapsed and estimated remaining time…](./T081-report-progress-export-progress-render-it.md) | ui | Dmytro Hopko | n/a | T078 | done | — |
| T082 | [Implement cancellation](./T082-implement-cancellation.md) | app | Dmytro Hopko | n/a | T078 | done | — |
| T083 | [Handle export failure — the destination becoming unwritable or the encoder erroring — by reporting…](./T083-handle-export-failure-destination-becoming-unwritable.md) | app | Dmytro Hopko | n/a | T078 | done | — |
| T084 | [Finalize with `output.finalize()`, which closes the stream, and report `export-done` with the byte count](./T084-finalize-output-finalize-which-closes-stream.md) | app | Dmytro Hopko | n/a | T078 | done | — |
| T085 | [Write `apps/editor/e2e/export-fidelity.spec.ts`](./T085-write-apps-editor-e2e-export-fidelity.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T086 | [Write `apps/editor/e2e/export-duration.spec.ts` asserting the exported duration equals…](./T086-write-apps-editor-e2e-export-duration.md) | tests | Dmytro Hopko | n/a | T013, T015 | done | — |
| T087 | [Write `apps/editor/e2e/export-cancel.spec.ts` asserting cancellation within two seconds and no complete file…](./T087-write-apps-editor-e2e-export-cancel.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T088 | [Write `apps/editor/e2e/export-ignores-later-edits.spec.ts`](./T088-write-apps-editor-e2e-export-ignores.md) | tests | Dmytro Hopko | n/a | T013, T076 | done | — |
| T089 | [Write `apps/editor/e2e/export-throughput.spec.ts`](./T089-write-apps-editor-e2e-export-throughput.md) | tests | Dmytro Hopko | n/a | T013 | done | — |
| T090 | [Audit resource lifetimes across `packages/engine`](./T090-audit-resource-lifetimes-across-packages-engine.md) | tests | Dmytro Hopko | n/a | — | done | — |
| T091 | [Profile the compose step in isolation at 1080p and record the per-Frame budget, so later Effects work has a…](./T091-profile-compose-step-isolation-1080p-record.md) | tests | Dmytro Hopko | n/a | — | done | — |
| T092 | [Measure first-Frame-after-seek on long-GOP material and record whether SC-003 holds without a scrub-quality…](./T092-measure-first-frame-after-seek-long.md) | tests | Dmytro Hopko | n/a | — | done | — |
| T093 | [Make every failure the user can hit legible](./T093-make-every-failure-user-can-hit.md) | ui | Dmytro Hopko | n/a | — | done | — |
| T094 | [Audit that the standing rule below held](./T094-audit-that-standing-rule-below-held.md) | docs | Dmytro Hopko | n/a | — | done | — |
| T095 | [Write `README.md` at the root](./T095-write-readme-md-root.md) | docs | Dmytro Hopko | n/a | — | done | — |
| T096 | [Walk the manual validation list in quickstart.md end to end in Chrome and record the result](./T096-walk-manual-validation-list-quickstart-md.md) | tests | Dmytro Hopko | n/a | — | blocked | awaits a person — SC-006 (VLC, QuickTime Player) and validation.md §Needs a human |

**Total:** 96 tasks — 95 done, 1 blocked; no estimates were recorded (person-days n/a).
