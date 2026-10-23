---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0004 — Every edit goes through one reducer; undo is inverse patches

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

Every Project mutation needs undo/redo, and a user gesture can span many changes (a drag, a ripple delete).

## Decision drivers

- A new feature must not be able to forget to be undoable.
- OpenReel took the command-object path and now carries three parallel undo stacks plus a `redoJournal` whose own comment says it exists to fix "redo asymmetry" across them.

## Considered options

1. **One pure reducer over immutable state (Zustand + Immer), undo = Immer's inverse patches.**
2. **A command object per operation with its own `undo()`** — reads better in the history list but requires every new feature to remember to implement its reverse.

## Decision outcome

**Chosen:** Option 1, one reducer with inverse patches.

All Project mutations flow through a single pure reducer over immutable state (Zustand + Immer), and undo/redo is the stack of inverse patches Immer produces — not hand-written reverse operations. A user gesture that spans many patches (a drag, a ripple delete) is wrapped in one transaction so it undoes as a unit. With inverse patches, a feature cannot forget to be undoable.

## Consequences

**Positive**
- A feature cannot forget to be undoable.

**Negative**
- History entries are patches, so naming an action for the UI ("Undo Trim") is extra metadata we attach to a transaction, not something we get for free.

**Neutral**
- Project state must stay plain serializable data: no class instances, `Map`s or live handles inside it. Anything non-serializable (decoders, GPU resources, file handles) lives outside the store, keyed by id.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §8
- Related ADR: [0011](./0011-saves-follow-the-gesture-and-commit-explicitly.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0004-single-reducer-with-inverse-patches-for-undo.md`
