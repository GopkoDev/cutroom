---
id: T019
title: "Implement the migration chain in `packages/model/src/document/migrate.ts` with `CURRENT_SCHEMA_VERSION = 1`,…"
layer: "domain"
deps: ["T015"]
blocks: []
acs: []
files_hint: ["packages/model/src/document/migrate.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T019 — Implement the migration chain in `packages/model/src/document/migrate.ts` with `CURRENT_SCHEMA_VERSION = 1`,…

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T019 Implement the migration chain in `packages/model/src/document/migrate.ts` with `CURRENT_SCHEMA_VERSION = 1`, a registry keyed by version, and refusal (not coercion) of documents from the future — **done**, with one deviation worth naming: the constant is *declared* in `types.ts` and re-exported here, because `parseProject` needs it to say "this document is from the future" and `migrateProject` needs `parseProject`, which would otherwise be a cycle. The registry is keyed by the version each migration reads and the ladder is climbed one rung at a time, so a version 3 means one new function under the key `2`. Migrations take and return anonymous records, never `Project`: a version-1 document is not a `Project` by a future build's definition, and typing it as one is the lie the next schema change turns into a bug. Version 0 had to be defined, since data-model.md starts the numbering at 1 and T020 requires a version-0 fixture: it is the shape from before `schemaVersion` existed, so an unversioned document is version 0 and the 0 → 1 migration adds the field. Small on purpose — the value is a ladder that is climbed and tested from the first release rather than written for the first time under pressure
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T019, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

Touches the persisted shapes: the Project Document and/or the IndexedDB stores (`projects`, `source-links`). No SQL, no staged migrations (this repository has none).

— `data-model.md §Entities, §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`@cutroom/model` public functions and types.

— `contracts/public-api.md, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

None — infrastructure, measurement or documentation task; no spec §5 criterion is satisfied by it alone (the Spec Kit breakdown tied it to no FR or acceptance scenario).

## Checklist

- [x] Implement the migration chain in `packages/model/src/document/migrate.ts` with `CURRENT_SCHEMA_VERSION = 1`, a registry keyed by version, and refusal (not coercion) of documents from the future

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
