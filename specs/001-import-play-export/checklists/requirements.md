# Specification Quality Checklist: Import, Play, Export

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-31
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

### Validation record (2026-07-31)

- **Implementation leakage**: checked. The spec names no library, API or thread model. Terms used
  (Project, Source, Clip, Timeline, Track, Frame, Playhead, Export, Offline) are the project's
  domain language from `CONTEXT.md`, not implementation.
- **Frame-based positions (FR-006)**: kept as a requirement rather than an implementation note,
  because it is user-observable — positions snap to whole Frames and no in-between position can
  be expressed.
- **"MP4 / H.264 / AAC"** appears only in the Assumptions section as a scope boundary, and in
  FR-015 as the user-visible output format. Judged as product scope, not implementation.
- **Clarifications**: none raised. Three candidates were resolved by informed default and
  recorded in Assumptions — no trimming in this slice, video files only, Project adopts the first
  Source's Timebase and frame size.
- **Constitution check**: no requirement contradicts `.specify/memory/constitution.md`. FR-011/012
  match Principle III (audio is the clock, picture drops), FR-004/021/022 match Principle V
  (Sources addressed, Offline and reattachment are normal states), FR-006 matches Principle II,
  FR-017 and FR-024 match Principle I (capabilities discovered, not assumed).

### Re-validation after `/speckit-analyze` (2026-07-31)

Eleven findings were raised across spec, plan, tasks and contracts; all are closed.

- **C1 (CRITICAL, constitution)**: `SceneLayer` used "Layer", an `_Avoid_` term. Renamed to
  `SceneItem` / `items` everywhere, with the reason recorded in data-model.md so it is not undone.
  *(Half-superseded in the third pass: `SceneItem` traded one `_Avoid_` term for another.)*
  `Project.canvas` renamed to `frameSize` for the same reason, and "canvas size" wording removed
  from spec, plan and tasks except where it means the literal `OffscreenCanvas` object.
- **I1 (HIGH)**: `set-source-status` removed from the reducer's commands — Source link status is
  runtime state and must not be undoable. T049 rewritten as a plain store action; T054 added to
  hold the rule in place.
- **G1 (HIGH)**: SC-004 and SC-005 had no measuring task. T068 (sustained playback rate) and
  T084 (export throughput) added, plus T013 to name the reference machine both assert against.
- **U1**: `Source.duration` is now an exact ratio in the Source's timescale, not a union.
- **U2**: FR-024 added — no silent export without an explicit choice; covered by T070 and a
  quickstart step.
- **I2**: `export-audio-ack` added to the worker → main message table.
- **I3**: the import command sequence moved to `packages/model`, matching where its test lives.
- **I5**: T047 now states it is the client-side latest-wins guard, with T060 the worker-side
  scheduler.
- **I6**: `scripts/` added to the plan's structure tree.
- **A1**: "mainstream laptop" replaced by the reference machine table in quickstart.md.

**Post-remediation coverage**: 24 functional requirements, all with tasks; 9 success criteria, 8
with a measuring task, SC-001 covered by the manual walkthrough (T091). 91 tasks.

### Second `/speckit-analyze` pass (2026-07-31)

The eleven original findings did not reappear. Four new ones were raised, three of them created by
the first round of remediation itself; all are closed except the one that needs hardware.

- **F1 (MEDIUM, format)**: tasks added during remediation carried letter suffixes (`T012a`,
  `T052a`, `T065a`, `T066a`, `T079a`), breaking sequential numbering. The whole list was
  renumbered T001–T091 and every cross-reference — dependencies, parallel examples, MVP scope,
  quickstart, this checklist — rewritten with it. Verified programmatically: the IDs now equal
  `T001…T091` exactly, with no suffixes and no dangling references. *(Policy reversed in the third
  pass — see below.)*
- **F2 (MEDIUM)**: the dependency graph still claimed the store blocked the import sequence, which
  stopped being true when I3 moved that sequence into `packages/model`. The edge is now
  "T020–T021 (reducer and commands) block T039".
- **F4 (LOW)**: T013 (name the reference machine) was marked parallel and then completed outright
  in the same pass, so the `[P]` marker and its slot in the Phase 1 parallel set were dropped
  again — there is nothing left to run in parallel with.
- **F3 (MEDIUM)**: closed. The reference machine is named in quickstart.md — MacBook Air with an
  Apple M4 (10 CPU cores, 8 GPU cores), 16 GB unified memory, macOS 26.5.2, Chrome 150 — together
  with the two consequences that change how a failure should be read there: H.264 is
  hardware-accelerated on this silicon, so a missed SC-005 is a real defect rather than slow
  hardware; and unified memory means an export leak surfaces as system pressure, not a tab crash.
  T013 is marked done.
- **F5 (LOW, accepted)**: T004 stays marked complete. The docs were moved ahead of the code on
  purpose and the reason is recorded in the task itself.

### Third `/speckit-analyze` pass (2026-07-31)

Nineteen findings, two of them CRITICAL. All are closed. Two decisions here overturn decisions
recorded above, and both are deliberate.

**Constitution**

- **C1 (CRITICAL)**: Principle II forbade seconds in the Project document, but `Source.duration`
  and `Clip.sourceInPoint` are exact rationals of seconds in the Source's own timescale, and the
  plan's gate table said PASS without noticing. Resolved by amending the constitution to **1.1.0**
  rather than by changing the data model: a Source's media time is not the Project's to renumber,
  and rounding it to the Project's frame grid at import would bake in a conversion nothing could
  later undo. The exception is bounded and named — Source-native time only, addresses and not
  Timeline positions, no editing logic permitted to compute with them. Recorded in the constitution,
  in ADR 0002's consequences, in data-model.md on both fields, in the worker protocol's invariant 2,
  and in the plan's gate table.
- **C2 (CRITICAL)**: T089 batched "write the ADRs" and "update CONTEXT.md" into Phase 6, against a
  workflow rule that requires both *before* the dependent code lands. T089 is now an audit, and the
  obligation is a standing rule in the Implementation strategy.
- **T1 (CRITICAL, found in this pass)**: two more `_Avoid_` violations. `SceneItem` traded "Layer"
  for "Item", which `CONTEXT.md` lists as a wrong name for a Clip — now `SceneClip`, which is what
  each one actually is. `MediaPanel` used "Media", listed for Source — now `SourcesPanel`, and
  "media list" is "Source list" throughout. Two concepts the design had introduced without adding
  them to the language — the Source's own rate, and the Scene — are now defined in `CONTEXT.md` as
  **Source Timebase** and **Scene**, and `Source.frameRate` is `Source.timebase` accordingly.

**Coverage**

- **G1 (HIGH)**: SC-002's ten-minute drift test could not be built. T065 planned to loop a 30 s
  fixture, but this slice has neither looping nor multiple Clips. A `sync-1080p30-10min.mp4`
  fixture was added and T065 now plays it straight through; T068 uses it too, since SC-004 also
  claims ten minutes and a single minute proves nothing about the ninth.
- **G2 (HIGH)**: FR-020 requires listing Projects so one can be reopened, and only the storage
  layer had a task. T035a builds the Project list the app lands on.
- **G3 (HIGH)**: T012 blocks all eleven Playwright tasks and appeared in no dependency edge. The
  edge is recorded and generating the fixtures is now part of the Phase 1 checkpoint. Three more
  missing edges added: T031→T069/T070, T034–T035→T036/T046, T026→T035a, T072→T083a.
- **U1**: fixtures added for the refusal cases the spec names but nothing tested (`audio-only.m4a`,
  `still.png`) and for the over-an-hour import case (`long-1080p30-70min.mp4`); T038, T052 and the
  new T052a cover them.
- **U2**: T049 now names when Source status is checked — on open, on window focus, and on any
  failed read — so a file deleted mid-session goes Offline at the next Frame rather than the next
  reload. T053a tests it.
- **U3**: SC-006's "three common players" is now three named players, and two of three is a failure.
- **U4**: export quality was "sensible default". Now three named tiers with bitrates, one audio
  setting, Standard preselected, each offered only if the machine says it can produce it.
- **U5**: FR-019 had an implementation (T072) and no test. T083a edits the Timeline mid-export.
- **U6**: FR-002's "show the duration" had no rendering task; folded into T036.
- **A1**: SC-001's 15 seconds now states what is measured — page load to Frame 0, picker time
  excluded.

**Consistency**

- **A2** SC-004's corrupted phrase fixed. **I1** TypeScript stated once as `~6`, matching the repo.
  **I2** the plan's "moved from X to X" annotations say something. **I4** tasks.md frontmatter
  parses. **D1** the no-partial-file rule is stated once in FR-018 and referenced from the edge
  case. **I5** FR-024 keeps its number, with the reason written down.
- **F1 reversed**: task ids are append-only again — T035a, T052a, T053a, T083a. The second pass
  renumbered to remove suffixes; that was cheap when ids appeared in three places and is not now
  that dependencies, parallel sets, the MVP scope, quickstart and this checklist all cite them.
  Stable ids beat tidy ones, and the rule is written at the top of tasks.md so it stops being
  re-litigated every pass.
- **`frameToSourceTime` added to `packages/model`**: T043 was going to do Source-Timebase
  arithmetic inside `packages/engine`, which R7 calls a defect. The engine now calls the model.
  `contracts/model-api.md` also listed a `set-playhead` command that its own text says is not
  undoable and that T021 does not define; the command list now matches T021 exactly.

**Post-remediation coverage**: 24 functional requirements and 9 success criteria, each with at
least one task and no partial coverage remaining. 95 tasks. Constitution at 1.1.0.
