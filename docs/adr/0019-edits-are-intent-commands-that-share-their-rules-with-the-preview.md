---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0019 — Edits are intent commands that share their rules with the preview

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Dmytro Hopko, with the agent during `/sdd:design editing`

## Context

Step 1 has four commands, none of which edits a Clip already on the Timeline. The editing step
adds Trim, Split, move, Duplicate, delete, Ripple delete and adding and removing a Track. The
Timeline issues these commands now, and the agent will issue the same ones in roadmap steps
10–11, so their shape is set here (spec §1). A drag also has to show, while it is still open,
whether its Clips can land where the pointer is (AC-07). That answer has to match what the reducer
does on release.

## Decision drivers

- Principle IV and ADR 0004: every Project change goes through the one reducer, which refuses
  before it writes.
- Spec AC-07, AC-09: the refusal shows during the drag, and a move of several Clips is all or
  none.
- Spec AC-02, AC-03, AC-11, AC-13: the stop rules for Trim, the per-Track Ripple and the
  Duplicate placement are domain rules, not interface choices.
- Spec §6.1: the same invariants are checked when a Project is loaded.
- The agent will need commands that are plain data and refusals that say why.

## Considered options

1. **Intent commands plus shared rule functions.** There is one command per kind of edit. Each
   names its Clips by id, the reducer applies it whole or refuses it with a reason, and the model
   exports the pure functions the reducer uses so the drag preview can call them too.
2. **Low-level primitives.** The model has `set-clip`, `remove-clip`, `add-clip`, `add-track` and
   `remove-track`. The editor works out Trims, Ripples and Duplicate placement and sends a batch
   of primitives in one transaction.

## Decision outcome

**Chosen:** Option 1.

The new commands in `packages/model/src/commands/index.ts` are `trim-clip`, `split-clips`,
`move-clips`, `delete-clips` (with `ripple: boolean`), `duplicate-clips`, `add-track` and
`remove-track`. Placing a Source from the Source list reuses `add-clip`. The commands follow four
rules:

- **Explicit ids.** Every command names the Clips it acts on by id and never refers to "the
  Selection". The Selection is session state that the reducer cannot see (glossary).
- **Ids and time from the caller.** Every new id (the second half of a Split, a copy, a Track) and
  the `at` timestamp come from the caller, as today.
- **Exact targets.** A command carries a resolved target: the edge Frame for a Trim, a Frame delta
  and a Track for a move, the Frame for a Split. The reducer refuses a target that breaks a rule
  instead of moving it. Stopping a dragged end at a limit (AC-02, AC-03) is the preview's job,
  done with the same rule functions, so the command it sends on release is already valid.
- **Reasons in refusals.** A refusal is a `CommandError` with a machine-readable `reason`:
  `overlap`, `source-bounds`, `before-timeline-start`, `too-short`, `track-limit`, `last-track`,
  `nothing-to-split`, or `unknown-clip`. The editor turns the reason into the notice wording.
  The agent will get the same reasons.

The rules live once, as pure functions in `packages/model/src/editing/`: the limits of a Trim,
whether a set of Clips can be placed at a delta, where a Duplicate block goes, which Clips a Split
at a Frame cuts, and how far each Clip shifts in a Ripple. `applyCommand` calls them to decide and
to refuse. The Timeline calls them on each pointer move to draw the preview. `parseProject` calls
the invariant subset (no overlap, no Clip before Frame 0, no Clip outside its Source, at least
one Frame long) on load.

A command that would change nothing returns no patches. The store already records no history
entry and no save for that (AC-32).

## Consequences

**Positive**
- The preview cannot disagree with the release: both ask the same function on the same Project.
- The agent gets a small vocabulary of validated, explainable commands, not a toolkit from which
  it must rebuild Ripple and Duplicate placement itself.
- Every editing Gesture is exactly one command, including a Split across both Tracks and a Ripple
  delete across both, so its patches come from one `produceWithPatches` and make one history
  entry.

**Negative**
- More code in `packages/model`: seven commands and their rule functions, each with property
  tests.
- A new kind of edit later (roll, slip) needs a new command, not just a new combination of
  primitives.

**Neutral**
- A move keeps each Clip's id, including onto the other Track, so the engine's per-Clip state
  (keyed by `clipId`) survives the move.
- The product limit of two video Tracks is a refusal of `add-track` (`track-limit`), not a
  document invariant. `parseProject` accepts any number of Tracks, so lifting the limit later
  needs no migration.

## Links

- Spec: [spec.md](../features/editing/spec.md) §1, US-01–US-08, AC-02, AC-03, AC-07, AC-09, AC-11, AC-13, AC-32, §6.1
- SAD: [sad.md](../features/editing/sad.md) §4, §5
- Related ADR: [0004](./0004-single-reducer-with-inverse-patches-for-undo.md), [0018](./0018-the-in-point-stays-in-container-presentation-time.md), [0020](./0020-a-drag-is-a-preview-and-the-project-changes-once-on-release.md)
