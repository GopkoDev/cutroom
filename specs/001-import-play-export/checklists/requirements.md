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
  Source's frame rate and frame size.
- **Constitution check**: no requirement contradicts `.specify/memory/constitution.md`. FR-011/012
  match Principle III (audio is the clock, picture drops), FR-004/021/022 match Principle V
  (Sources addressed, Offline and reattachment are normal states), FR-006 matches Principle II,
  FR-017 and FR-024 match Principle I (capabilities discovered, not assumed).

### Re-validation after `/speckit-analyze` (2026-07-31)

Eleven findings were raised across spec, plan, tasks and contracts; all are closed.

- **C1 (CRITICAL, constitution)**: `SceneLayer` used "Layer", an `_Avoid_` term. Renamed to
  `SceneItem` / `items` everywhere, with the reason recorded in data-model.md so it is not undone.
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
  `T001…T091` exactly, with no suffixes and no dangling references.
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
