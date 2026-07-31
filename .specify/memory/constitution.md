<!--
Sync Impact Report
Version change: none → 1.0.0 (initial ratification; template placeholders replaced)
Modified principles: none (all six principles are new)
Added sections:
  - Core Principles: I–VI
  - Platform Constraints
  - Development Workflow
  - Governance
Removed sections: none
Templates requiring review: .specify/templates/plan-template.md,
  .specify/templates/spec-template.md, .specify/templates/tasks-template.md
  (these read the constitution at runtime; no edits made here)
Deferred items: none
-->

# Cutroom Constitution

Cutroom is a browser-based multi-track video editor. Decoding, compositing and encoding
happen on the user's machine; media never leaves the browser. These principles derive from the
architecture decisions in `docs/adr/` and the domain language in
`CONTEXT.md`. Where this document and an ADR disagree, the ADR is the detail and
this document is the rule.

## Core Principles

### I. The Browser Is the Whole Machine

Every Frame the product produces MUST be rendered client-side, by Mediabunny for
demuxing/decoding/muxing and PixiJS for compositing. No server-side render path may be
introduced, because a second renderer must reproduce every Effect pixel-for-pixel and will not.
Capabilities that vary between browsers (codecs, encoders) MUST be discovered at runtime through
`canEncode`/`canDecode` and surfaced as available options, never hardcoded into a fixed list.

### II. Frames Are the Unit of Time

Positions and durations on the Timeline MUST be integer Frame indices in the Project's Timebase,
which is stored as an exact ratio. Seconds, microseconds and sample indices MUST NOT appear in
the Project document or in editing logic; they exist only inside the single conversion module
that talks to decoders, Web Audio and the muxer. Any code that rounds a time value outside that
module is a defect.

### III. One Engine for Preview and Export

Preview and Export MUST be produced by the same compositing code from the same Scene. They may
differ only in their source of time: Preview follows the audio clock and drops Frames it cannot
reach; Export steps Frame by Frame and waits. Audio MUST be mixed by one graph construction used
by both playback and `OfflineAudioContext`. What the user sees and hears while editing is what
the exported file contains.

### IV. One Owner of State, One Way to Change It

The main thread MUST be the sole owner of Project state, and every mutation MUST pass through
the single reducer. Undo/redo MUST be inverse patches produced by that reducer, not hand-written
reverse operations, so that a new feature cannot ship without being undoable. Project state MUST
remain plain serializable data — no class instances, `Map`s, file handles or GPU resources.
The worker holds no editing logic; it receives Scene snapshots and Frame requests only.

### V. Sources Are Addressed, Never Copied

A Source MUST be referenced where it already lives — a local file handle today, a cloud object
later — and its bytes MUST NOT be copied into browser storage. Our own storage holds only
regenerable derived data. Offline Sources and Relink are normal product states that MUST be
designed for, not error paths. The Project document MUST stay portable: device-specific handles
live in a separate local link table that is never part of the document.

### VI. Effects Are Data, Not Branches

An Effect MUST be a registry entry describing its parameters and how they are applied; a Clip
stores only which Effects it carries and their values. Inspector controls MUST be generated from
the parameter schema. Any numeric parameter MUST be animatable by Keyframes without the Effect
participating, and interpolation MUST live in one place so easing behaves identically everywhere.
Adding an Effect MUST NOT add a branch to the renderer, the Inspector or a migration.

## Platform Constraints

- **Target**: Chromium (Chrome, Edge) only. Other browsers receive an explicit unsupported
  notice. The single capability this rests on is the persisted `FileSystemFileHandle`; code MUST
  NOT accumulate other Chromium-only assumptions, so that cloud Sources can open the product to
  other browsers without engine changes.
- **Threads**: video decoding, compositing and encoding run in a Worker on an `OffscreenCanvas`.
  Audio playback and mixing run on the main thread, because `AudioContext` is exposed only to
  Window. The audio clock is the master clock.
- **Repository**: a pnpm monorepo — `packages/engine` (no framework dependencies),
  `packages/model` (Project document, validation, migrations; later shared with the backend),
  `apps/editor`, and future `apps/web` / `apps/api`.
- **Documents**: the Project document is versioned JSON. A migration MUST accompany every change
  to its shape, from the first release onward, because users' Projects live in their browser
  storage and cannot be discarded.
- **Prototype**: `lovable_test_ui/` is a visual reference. It MUST NOT import from the app, and
  the app MUST NOT import from it.

## Development Workflow

- **Language first**: terms defined in `CONTEXT.md` are the vocabulary of the code.
  Identifiers MUST use the canonical term and MUST NOT use a term listed under `_Avoid_`. A new
  domain concept is added to `CONTEXT.md` in the same change that introduces it.
- **Decisions are recorded**: a decision that is hard to reverse, surprising without context, and
  the result of a real trade-off MUST get an ADR in `docs/adr/` before the code that
  depends on it lands.
- **Vertical slices**: work is sequenced so that risky layers (decode, sync, mux) are exercised
  end to end early rather than deferred behind UI progress.
- **Review**: changes are checked against these principles. A violation is either fixed or turned
  into an amendment — it is not left as an exception in the code.

## Governance

This constitution supersedes other practices in the repository. Amendments require a change that
states the rationale, updates any affected ADRs, and bumps the version below.

Versioning is semantic: MAJOR for removing or redefining a principle in a backward-incompatible
way, MINOR for adding a principle or materially expanding guidance, PATCH for clarifications and
wording. Compliance is verified at review time; complexity that contradicts a principle must be
justified in writing or removed.

**Version**: 1.0.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-07-31
