---
id: T027
title: "Implement the Project store in `apps/editor/src/storage/projects.ts`"
layer: "infra"
deps: []
blocks: ["T037"]
acs: ["AC-32"]
files_hint: ["apps/editor/src/storage/projects.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T027 — Implement the Project store in `apps/editor/src/storage/projects.ts`

## Place in the sequence

- **Blocked by:** — · **Blocks:** T037 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** my Project kept between sessions without being asked to save, listed so I can reopen it, and its Sources reattached — or shown as Offline with a way to Relink them
> **So that** closing the tab, reloading or moving a file never costs me the Timeline I built
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the Project store in `apps/editor/src/storage/projects.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T027 Implement the Project store in `apps/editor/src/storage/projects.ts`: list, load (through `migrateProject`), and save-on-transaction with debouncing (FR-020) — **done**, with four decisions. **Saving writes `parseProject(project)`, not the object handed in**: the model's own rebuild is what lands in IndexedDB, which makes it structurally impossible for a `FileSystemFileHandle`, a `Date` or a `Map` to reach the store — every one of them is structured-cloneable, so IndexedDB would have taken them without complaint and the document would have quietly stopped being portable JSON (ADR 0005, 0007). It also fails a document that would not survive its next load *now*, while the Project the caller holds is still intact, and it states no validation rule of its own: the check is the model's, in the model, once. **Listing is generous where opening is strict** — a summary is read field by field from an untrusted record, so a document this build cannot open is still listed (`openable: false`) and only `loadProject` refuses it; the list is where a user goes to recover, and one bad row that made `listProjects` throw would hide every Project they have. For the same reason there is **no IndexedDB index on `modifiedAt`**: an index silently omits records lacking its key path, so a Project whose timestamp went missing would vanish from the list rather than appear as one needing attention. Ordering is by `Date.parse`, not by string comparison, because `parseProject` accepts an explicit UTC offset and `09:00+02:00` sorts after `08:00Z` as text and before it as an instant. A migrated document is **not** written back on load: a load is not an edit, and rewriting would reorder a Project the user only looked at. The debounced saver's one hard property is that **the last Project handed to `save` is the last one written** — the loop re-reads what is outstanding *after* each write rather than before, so an edit whose debounce elapses while a write is in flight is picked up by that write when it finishes. Mutation testing earned its keep twice here: the first version of that test called `flush()`, which loops until the queue is empty and so passed against a deliberately broken saver, and the second still passed because the second edit's timer happened to fire after the write had finished — only holding the write open across both timers exposes the loss. `draining` is cleared by a `finally` on the promise rather than inside the async function, because with nothing outstanding that function completes synchronously and would clear the flag before the assignment that sets it, stranding a settled promise that `flush` would then await forever. A failed write is reported (`onFailure`, defaulting to the console) and not retried: every write carries the whole document, so the next save subsumes the lost one, while retrying spins forever on a document that will never be writable
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T027, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

Touches the persisted shapes: the Project Document and/or the IndexedDB stores (`projects`, `source-links`). No SQL, no staged migrations (this repository has none).

— `data-model.md §Entities, §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-32 — happy

> **Given** a user who has worked on a Project
> **When** they leave and come back in a later session, including after a reload or a browser restart
> **Then** the Project was kept without them being asked to save; the Project list shows it with its name and when it was last modified; and opening it shows the same Timeline
>
> — `spec.md §5, AC-32, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the Project store in `apps/editor/src/storage/projects.ts`: list, load (through `migrateProject`), and save-on-transaction with debouncing (FR-020)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
