---
id: T022
title: "Define the commands this slice needs in `packages/model/src/commands/index.ts`"
layer: "domain"
deps: ["T015"]
blocks: ["T041"]
acs: []
files_hint: ["packages/model/src/commands/index.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T022 — Define the commands this slice needs in `packages/model/src/commands/index.ts`

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** T041 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T022 Define the commands this slice needs in `packages/model/src/commands/index.ts`: `create-project`, `import-source`, `add-clip`, `relink-source`. Source link status is deliberately **not** a command — it is runtime state outside the document (data-model.md), so undo must never toggle a Source between Linked and Offline — **done**. Every id and the timestamp are fields on the command, so the reducer needs no clock and no generator. `create-project` carries the first Track, because this slice has exactly one video Track and there is no `add-track` to make one. `relink-source` records only the document's half of a Relink — the name the Source now goes by and the fingerprint the next Relink will check against — while the handle, the fingerprint verification and the move from Offline to Linked stay outside the document entirely; a Relink that finds the document already correct returns *no patches at all*, so it cannot even reach the undo stack
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T022, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Define the commands this slice needs in `packages/model/src/commands/index.ts`: `create-project`, `import-source`, `add-clip`, `relink-source`. Source link status is deliberately **not** a command — it is runtime state outside the document (data-model.md), so undo must never toggle a Source between Linked and Offline

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
