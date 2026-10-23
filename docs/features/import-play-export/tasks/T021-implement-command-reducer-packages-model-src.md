---
id: T021
title: "Implement the command reducer in `packages/model/src/commands/apply.ts` returning `{ project, patches,…"
layer: "domain"
deps: ["T015"]
blocks: ["T041"]
acs: []
files_hint: ["packages/model/src/commands/apply.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T021 — Implement the command reducer in `packages/model/src/commands/apply.ts` returning `{ project, patches,…

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** T041 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T021 Implement the command reducer in `packages/model/src/commands/apply.ts` returning `{ project, patches, inversePatches }` via Immer, pure with ids and timestamps passed in by the caller (contracts/model-api.md) — **done**, with two decisions worth naming. It **validates by construction, not by re-parsing**: running the result back through `parseProject` would rebuild every object and so destroy the structural sharing Immer had just given us, defeating the memoisation the Scene projection is promised to allow (contracts/model-api.md). The guarantee was moved rather than dropped — every command's output goes through `parseProject` in the tests, which is the same gate the document meets on its next load. And it **refuses before it writes**: every precondition is checked against the Project that came in, so a refused command leaves the caller's Project untouched by construction rather than by rollback. `create-project` takes `null` as its prior state, which is the only reading of `applyCommand(project, command)` under which it can have an inverse; Immer's non-draftable path answers with a root `replace []` forwards and a root `replace []` to `null` back, so even the first command's undo is Immer's patch and not a hand-written one
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T021, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Implement the command reducer in `packages/model/src/commands/apply.ts` returning `{ project, patches, inversePatches }` via Immer, pure with ids and timestamps passed in by the caller (contracts/model-api.md)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
