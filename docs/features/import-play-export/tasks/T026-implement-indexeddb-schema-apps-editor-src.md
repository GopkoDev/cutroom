---
id: T026
title: "Implement the IndexedDB schema in `apps/editor/src/storage/db.ts`"
layer: "infra"
deps: []
blocks: []
acs: []
files_hint: ["apps/editor/src/storage/db.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T026 — Implement the IndexedDB schema in `apps/editor/src/storage/db.ts`

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T026 [P] Implement the IndexedDB schema in `apps/editor/src/storage/db.ts`: a `projects` store keyed by id and a `source-links` store keyed by sourceId, with an upgrade path — **done**: one database, `cutroom`, at version 1, with both stores using **in-line keys** (`keyPath: "id"` and `keyPath: "sourceId"`) so a record cannot be filed under a key that disagrees with its contents. Three decisions worth naming. The database version is deliberately **not** the document's `schemaVersion` and is free to move independently: this number describes the shape of the stores, that one the shape of a document, and conflating them would make adding an index a migration of every Project. The upgrade path is ordered `if (from < n)` blocks rather than a `switch` with fall-through — same effect, and a browser that has never seen the database runs every block in order for free, so version 2 is one more block and nothing else. And the `projects` value is typed as no more than `{ readonly id: string }`: a stored record is *whatever version wrote it*, a document from an older or a newer build is a perfectly valid row, and typing it as `Project` would be a claim only `migrateProject` is entitled to make — `projects.ts` reads a row as untrusted input instead. The connection is a cached promise, not a cached database, so two callers racing on the first call get one connection; a failed open is not cached, and `blocked` / `blocking` / `terminated` are all handled, because the multi-tab deadlock they prevent is otherwise a hang with no error anywhere
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T026, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

Touches the persisted shapes: the Project Document and/or the IndexedDB stores (`projects`, `source-links`). No SQL, no staged migrations (this repository has none).

— `data-model.md §Entities, §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

None — infrastructure, measurement or documentation task; no spec §5 criterion is satisfied by it alone (the Spec Kit breakdown tied it to no FR or acceptance scenario).

## Checklist

- [x] Implement the IndexedDB schema in `apps/editor/src/storage/db.ts`: a `projects` store keyed by id and a `source-links` store keyed by sourceId, with an upgrade path

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
