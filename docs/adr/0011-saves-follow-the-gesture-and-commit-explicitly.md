---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0011 — Saves follow the gesture, and every write commits explicitly

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `7f5efea`

## Context

IndexedDB's auto-commit waits for the request's success event to come back to the page, and a page that is reloading or navigating is gone before it does, so the browser aborts the transaction. A flush on `pagehide` that relies on auto-commit starts a write and loses it every time — which is what the first store did, and what a test dispatching a synthetic `pagehide` without unloading could not see.

## Decision drivers

- FR-020: the Project is kept between sessions without the user being asked to save.
- The save boundary should be the undo boundary (ADR 0004).

## Considered options

1. **Write when a gesture ends, and call `transaction.commit()` straight after every `put`.**
2. **Timer-debounced saves relying on IndexedDB auto-commit** — what the first store did; it lost the write on reload.

## Decision outcome

**Chosen:** Option 1.

A Project is written to IndexedDB when a gesture ends, not on a timer. A standalone command, the outermost commit or abort of a transaction, an undo and a redo each write at once — one write per thing the user did. Only edits inside a gesture that is still open (a drag) are debounced, 500 ms quiet and 2 s at most, and whatever is outstanding is flushed on `visibilitychange: hidden` and on `pagehide`. Every write calls `transaction.commit()` straight after its `put`, in the same turn.

## Consequences

**Positive**
- FR-020's "saved without asking" holds across a reload, a navigation and a closed tab, proved by tests that really unload the page rather than simulate it.

**Negative**
- What can still be lost is bounded and stated: a write queued behind one still in flight when the page goes away (a few ms), and on a browser or OS crash, where no event fires, the few ms a finished gesture's write takes or up to 2 s of an open one.

**Neutral**
- The save boundary is the undo boundary (ADR 0004). A change that cannot say where its gesture ends cannot say when it is saved, which is one more reason every edit goes through `transact`.
- Recorded after the fact. This decision was made while fixing a lost-Project bug in Phase 3 and landed with the code rather than before it, which the constitution does not allow; T094 records the lapse.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §8
- Related ADR: [0004](./0004-single-reducer-with-inverse-patches-for-undo.md), [0007](./0007-project-document-is-portable-versioned-json.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 7f5efea:docs/adr/0011-saves-follow-the-gesture-and-commit-explicitly.md`
