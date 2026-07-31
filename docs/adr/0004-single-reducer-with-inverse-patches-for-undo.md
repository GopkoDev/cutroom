# Every edit goes through one reducer; undo is inverse patches

All Project mutations flow through a single pure reducer over immutable state (Zustand + Immer), and undo/redo is the stack of inverse patches Immer produces — not hand-written reverse operations. A user gesture that spans many patches (a drag, a ripple delete) is wrapped in one transaction so it undoes as a unit.

The alternative, a command object per operation with its own `undo()`, reads better in the history list but requires every new feature to remember to implement its reverse. OpenReel took that path and now carries three parallel undo stacks plus a `redoJournal` whose own comment says it exists to fix "redo asymmetry" across them. With inverse patches, a feature cannot forget to be undoable.

## Consequences

- Project state must stay plain serializable data: no class instances, `Map`s or live handles inside it. Anything non-serializable (decoders, GPU resources, file handles) lives outside the store, keyed by id.
- History entries are patches, so naming an action for the UI ("Undo Trim") is extra metadata we attach to a transaction, not something we get for free.
