# Saves follow the gesture, and every write commits explicitly

A Project is written to IndexedDB when a gesture ends, not on a timer. A standalone command, the outermost commit or abort of a transaction, an undo and a redo each write at once — one write per thing the user did. Only edits inside a gesture that is still open (a drag) are debounced, 500 ms quiet and 2 s at most, and whatever is outstanding is flushed on `visibilitychange: hidden` and on `pagehide`.

Every write calls `transaction.commit()` straight after its `put`, in the same turn. IndexedDB's auto-commit waits for the request's success event to come back to the page, and a page that is reloading or navigating is gone before it does, so the browser aborts the transaction. A flush on `pagehide` that relies on auto-commit starts a write and loses it every time — which is what the first store did, and what a test dispatching a synthetic `pagehide` without unloading could not see.

## Consequences

- FR-020's "saved without asking" holds across a reload, a navigation and a closed tab, proved by tests that really unload the page rather than simulate it.
- What can still be lost is bounded and stated: a write queued behind one still in flight when the page goes away (a few ms), and on a browser or OS crash, where no event fires, the few ms a finished gesture's write takes or up to 2 s of an open one.
- The save boundary is the undo boundary (ADR 0004). A change that cannot say where its gesture ends cannot say when it is saved, which is one more reason every edit goes through `transact`.
- Recorded after the fact. This decision was made while fixing a lost-Project bug in Phase 3 and landed with the code rather than before it, which the constitution does not allow; T094 records the lapse.
