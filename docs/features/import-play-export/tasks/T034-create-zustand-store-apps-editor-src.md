---
id: T034
title: "Create the Zustand store in `apps/editor/src/store/index.ts` wrapping `applyCommand`, with a transaction API…"
layer: "app"
deps: []
blocks: ["T038", "T051", "T076"]
acs: []
files_hint: ["apps/editor/src/store/index.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T034 — Create the Zustand store in `apps/editor/src/store/index.ts` wrapping `applyCommand`, with a transaction API…

## Place in the sequence

- **Blocked by:** — · **Blocks:** T038, T051, T076 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T034 Create the Zustand store in `apps/editor/src/store/index.ts` wrapping `applyCommand`, with a transaction API for grouping a gesture and an undo/redo stack of inverse patches (Principle IV) — **done**. The transaction API is two functions and the difference between them is who guarantees the close: `transact(label, body)` cannot leak (it commits on the way out, aborts if `body` throws) and is deliberately synchronous, because an `await` inside a transaction is a window in which an unrelated edit joins the gesture; `beginTransaction(label)` returns the handle, for the drag that genuinely spans `pointerdown` to `pointerup`. Four rules were chosen rather than fallen into. **Transactions join, they do not nest** — a `transact` inside an open gesture becomes part of it and only the outermost close commits, which is what lets T041's import sequence be called both on its own and from inside a larger gesture. **Abort restores the Project the store was already holding**, exactly, rather than replaying patches that could themselves fail halfway. **A gesture that changed nothing is not a history entry** and does not clear the redo stack — some commands legitimately produce no patches, and a step that undoes nothing is worse than no step. **A transaction left open is visible**: nothing auto-commits, `openTransaction` names it, and `canUndo` is false while it is open, so a leak is a stuck undo button rather than a history in which yesterday and today are one entry. Undo writes `project` and nothing else, so the Playhead, the transport and every Source's Linked/Offline status survive it by construction, and the Playhead is deliberately **not** clamped afterwards — an empty Preview past the end is correct (FR-008), a Playhead that jumped would not be. Mutation-checked twice: flattening the inverses in command order instead of reverse fails 7 of the 10 specs, because `create-project`'s inverse is a root replacement to `null` and anything after it is then applied to nothing. `createProjectSaver.flush()` finally has its caller, on `pagehide`; without it the write lands at 516 ms instead of inside 400, which is the whole debounce interval a closing tab would have taken with it **Fixed in Phase 3**: a reload right after an edit lost it — the `pagehide` flush started the IndexedDB write but left it to auto-commit, which needs the `put`'s success event to come back to the page first, and an unloading page is gone before that, so the browser aborted it (the synthetic-`pagehide` test could not see this). `saveProject` now calls `transaction.commit()` right after the `put`. The store also writes a finished gesture at once (standalone command, outermost commit or abort, undo, redo), keeps the debounce only for edits inside an open gesture (500 ms quiet / 2 s max), and flushes on `visibilitychange: hidden` as well as `pagehide`. What can still be lost: a write queued behind one in flight when the page goes away (a few ms), and, on a browser or OS crash, the few ms a finished gesture's write takes, or up to 2 s of an open gesture. Covered by `e2e/edits-survive-a-reload.spec.ts` (real reload and navigation after a UI import, and after undo), two real-unload tests in `e2e/undo-and-transactions.spec.ts` (reload and tab close mid-gesture), and four store unit tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T034, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

None — infrastructure, measurement or documentation task; no spec §5 criterion is satisfied by it alone (the Spec Kit breakdown tied it to no FR or acceptance scenario).

## Checklist

- [x] Create the Zustand store in `apps/editor/src/store/index.ts` wrapping `applyCommand`, with a transaction API for grouping a gesture and an undo/redo stack of inverse patches (Principle IV)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
