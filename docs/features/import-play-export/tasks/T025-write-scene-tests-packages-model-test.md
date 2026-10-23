---
id: T025
title: "Write Scene tests in `packages/model/test/scene.test.ts` asserting determinism and that a non-visual edit…"
layer: "tests"
deps: ["T015"]
blocks: []
acs: []
files_hint: ["packages/model/test/scene.test.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T025 — Write Scene tests in `packages/model/test/scene.test.ts` asserting determinism and that a non-visual edit…

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T025 [P] Write Scene tests in `packages/model/test/scene.test.ts` asserting determinism and that a non-visual edit (renaming the Project) produces an unchanged Scene — **done**: 27 tests, taking the suite to 218. Every fixture goes through `parseProject`, so a Scene proved about a Project that could not survive a save and a reload proves nothing. What is pinned rather than spot-checked: the **exact key sets** of `Scene` and `SceneClip`, because a Scene that grew a `name` would satisfy every "does it have what I need" assertion ever written and only "does it have anything else" catches it; and the absence of the Project's name, its id, the Track's id and name, the Source's name and both timestamps from the serialized bytes. Determinism is asserted on the bytes at three removes — the same Project twice, two separately built equal Projects, and a Project round-tripped through `structuredClone` and re-parsed — since key order is part of the claim. The memoisation is tested from both ends: a rename by spread, a rename through Immer and a real `relink-source` through `applyCommand` all return the *same frozen object*, while `add-clip`, a new `frameSize` and a new `timebase` all get through — a memo that never misses is a bug that looks exactly like a memo that works, and the `frameSize` case is the one that would return stale without the value check on a hit. Clone-safety is asserted beyond "it cloned": every reachable object must be a plain object or an array and every leaf a string, number or boolean, and the Scene is proved to share **no object at all** with the Project it came from, which is what makes `export-start`'s frozen Scene frozen in a useful sense (FR-019)
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T025, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

`@cutroom/model` public functions and types.

— `contracts/public-api.md, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

None — infrastructure, measurement or documentation task; no spec §5 criterion is satisfied by it alone (the Spec Kit breakdown tied it to no FR or acceptance scenario).

## Checklist

- [x] Write Scene tests in `packages/model/test/scene.test.ts` asserting determinism and that a non-visual edit (renaming the Project) produces an unchanged Scene

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `scene.test.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
