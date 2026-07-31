# Implementation Plan: Import, Play, Export

**Branch**: `001-import-play-export` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-import-play-export/spec.md`

## Summary

The first vertical slice: a user picks a video file from their machine, sees it as one Clip on the
Timeline, plays it back with sound in sync, and exports the result as an MP4 that matches what
they saw. The point is not the feature set — it is that every risky layer is exercised end to end
before anything is built on top of it: reading a user-chosen file through a persisted handle,
decoding on demand in a worker, compositing on the GPU, driving picture from the audio clock, and
muxing straight to disk.

Technically: a pnpm monorepo with a framework-free `packages/model` (Timebase arithmetic, Project
document, reducer, Scene projection) and `packages/engine` (worker: Mediabunny decode, PixiJS
compose, Mediabunny mux), driven by a React app in `apps/editor` that owns state, sound and the
clock.

## Technical Context

**Language/Version**: TypeScript 5.9+ (repo currently pins `typescript@~6`), ES2023 target,
ESM only

**Primary Dependencies**: Mediabunny (demux/decode/encode/mux over WebCodecs), PixiJS 8
(compositing, `WebWorkerAdapter`), React 19 + Vite 8, Zustand + Immer (single reducer, inverse
patches), Tailwind 4 + shadcn/Radix (UI), `idb` or hand-rolled IndexedDB wrapper

**Storage**: IndexedDB — one store for Project documents, one for the device-local
`sourceId → FileSystemFileHandle` link table. No OPFS in this slice (nothing derived is kept
yet). Source bytes are never copied (ADR 0005).

**Testing**: Vitest (node environment) for `packages/model`; Playwright driving real Chromium for
everything touching WebCodecs, file handles, audio and export. Generated fixture files committed
to the repo.

**Target Platform**: Chromium desktop (Chrome, Edge) — ADR 0006. Other browsers get an explicit
unsupported notice on arrival (FR-023).

**Project Type**: Client-only web application in a monorepo, with a worker-hosted media engine.

**Performance Goals**: 1080p30 playback at full rate on the reference machine named in quickstart.md (SC-004);
a scrubbed Frame on screen within 300 ms (SC-003); export of 1 minute of 1080p30 in under
2 minutes (SC-005); A/V drift under one Frame across 10 minutes (SC-002).

**Constraints**: Sound must never be interrupted by picture (FR-011/012). Export memory must not
grow with output length — writing streams to disk through `StreamTarget`. Every `VideoFrame` and
pooled canvas must be released on a defined path, or a long Timeline exhausts memory.

**Scale/Scope**: One Project open at a time, one video Track, one Clip, one export at a time. The
data model is sized for the multi-track editor that follows, but this slice exercises the smallest
path through it.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status (pre-design) | Status (post-design) |
|---|---|---|---|
| I. The browser is the whole machine | No server-side render path; codec options discovered at runtime | PASS — no backend in this slice | PASS — export settings built from `canEncode` probes (research R5), returned to the UI in the worker's `ready` message |
| II. Frames are the unit of time | Timeline positions are integer Frames; one conversion module | PASS | PASS — `packages/model` Timebase is the single converter (R7); the worker protocol carries integers only |
| III. One engine for Preview and Export | Same compositing code for both | PASS | PASS — one PixiJS scene in the worker; Preview and Export differ only in what advances the Frame (contract `render-frame` vs `export-start`) |
| IV. One owner of state, one way to change it | Main thread owns state; reducer + inverse patches; state stays serializable | PASS | PASS — worker receives Scene snapshots, never a Project, and returns no state (worker-protocol invariant 1) |
| V. Sources are addressed, never copied | No copying into browser storage; Offline and Relink designed for | PASS | PASS — main thread resolves handle and permission, hands a `File` to the worker; link table separate from the document |
| VI. Effects are data, not branches | Registry-driven Effects | N/A — no Effects in this slice | N/A — the `SceneItem` shape leaves room for an `effects` array without restructuring |

**Platform constraints check**: worker + OffscreenCanvas for video, Web Audio on the main thread
(ADR 0008) — reflected in research R3 and the worker protocol. Monorepo layout as mandated.
Document migrations exist from schema version 1 (`packages/model` contract). The Lovable prototype
is not imported (ADR 0010) — the UI in this slice is written from scratch.

**Result**: no violations. Complexity Tracking table omitted.

## Project Structure

### Documentation (this feature)

```text
specs/001-import-play-export/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── worker-protocol.md
│   └── model-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/
├── model/                      # No browser APIs, no framework. Reused by the future backend.
│   ├── src/
│   │   ├── timebase.ts         # The only place Frames become seconds or samples
│   │   ├── document/           # Project types, parse, migrations
│   │   ├── commands/           # Single reducer + command definitions
│   │   └── scene.ts            # Project → Scene projection
│   └── test/                   # Vitest
└── engine/                     # The worker. Mediabunny + PixiJS. No React.
    ├── src/
    │   ├── worker.ts           # Message boundary; every throw becomes `fatal`
    │   ├── sources/            # Attach a File, read metadata, own the sinks
    │   ├── compose/            # PixiJS scene, WebWorkerAdapter init, render one Frame
    │   ├── playback/           # Streaming iterators, scrub path, frame dropping
    │   └── export/             # Output, StreamTarget, backpressure, cancel
    └── test/fixtures/          # Generated media fixtures

apps/
└── editor/                     # React 19 + Vite. Owns state, sound, the clock.
    ├── src/
    │   ├── store/              # Zustand + Immer, transactions, undo stack
    │   ├── audio/              # Web Audio graph, scheduling, master clock
    │   ├── storage/            # IndexedDB: project store + source link table
    │   ├── engine-client/      # Typed wrapper over the worker protocol
    │   └── ui/                 # TopBar, MediaPanel, Preview, Timeline (written fresh)
    └── e2e/                    # Playwright

scripts/
└── make-fixtures.ts            # Generates the media fixtures both test tiers rely on

docs/
└── adr/                        # Moved up from docs/adr
CONTEXT.md                      # Moved up from CONTEXT.md
lovable_test_ui/                # Visual reference only; no imports either way (ADR 0010)
```

**Structure Decision**: pnpm workspace as mandated by the constitution. The split is by
dependency direction, not by feature: `model` knows nothing about the browser, `engine` knows
nothing about React, `apps/editor` knows about everything. This is what lets `model` be lifted
into the backend later without untangling it, and what keeps the worker boundary honest.

**Migration of what exists**: done. Cutroom was created as a fresh repository rather than grown
out of the old scaffold. The previous `videoEditor/` Vite app was copied in as `apps/editor` (it
was a starter page, so nothing of substance moved), `CONTEXT.md`, `docs/adr/`, `specs/` and
`.specify/` came with it, and the original folder stays outside the repository as scratch. The
`packages/model` and `packages/engine` skeletons exist and are wired into the workspace.

## Phases

- **Phase 0 — Research**: complete → [research.md](./research.md). Nine questions resolved
  against current Mediabunny and PixiJS documentation: frame supply (`CanvasSink` with pooling
  caveat), streaming vs seeking, audio decode in the worker with scheduling on the main thread,
  export via `StreamTarget` to a file handle with `AudioSample` for worker-side audio, runtime
  codec probing, PixiJS `WebWorkerAdapter`, the single conversion module, the two-tier testing
  strategy, and IndexedDB-only storage.
- **Phase 1 — Design & Contracts**: complete → [data-model.md](./data-model.md),
  [contracts/](./contracts/), [quickstart.md](./quickstart.md).
- **Phase 2 — Tasks**: not produced here. Run `/speckit-tasks`.

## Risks carried into implementation

| Risk | Why it matters | Early signal to watch |
|---|---|---|
| Scrub latency on long-GOP footage | SC-003 depends on keyframe spacing we do not control | Measure first-Frame-after-seek on the fixtures before building UI polish |
| `CanvasSink` pooling | A retained canvas silently becomes a later Frame | Draw-before-next-pull enforced in the compose layer, asserted in tests |
| PixiJS texture upload per Frame | Could dominate frame time at 1080p | Profile the compose step in isolation before adding effects |
| Audio scheduling gaps under load | Breaks the one property this slice exists to prove | The CPU-throttled playback check in quickstart is a required gate, not an optional one |
| Export backpressure ignored | Memory grows until the tab dies on long exports | Awaiting `add()` is a review checkpoint in the export module |
