---
id: T020
title: "Write document tests in `packages/model/test/document.test.ts`"
layer: "tests"
deps: ["T015"]
blocks: []
acs: []
files_hint: ["packages/model/test/document.test.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T020 — Write document tests in `packages/model/test/document.test.ts`

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T020 [P] Write document tests in `packages/model/test/document.test.ts`: valid round-trip through `structuredClone`, each rejection rule, and a migration from a hand-written version-0 fixture — **done**: 57 tests, taking the suite to 99. The documents under test are plain literals, not typed fixtures, because the input is untrusted by definition and a fixture only TypeScript could have produced would not exercise the parser. Every rejection asserts the *message*, not just the throw — an error that does not name its field is barely better than a crash. Clone-safety is pinned three ways: `structuredClone` deep-equality, a JSON round trip, and parsing one input twice to show the two results share no object. The version-0 fixture is written out in full rather than derived from the version-1 one, so that a later schema change which makes it unmigratable fails here and says so
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T020, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Write document tests in `packages/model/test/document.test.ts`: valid round-trip through `structuredClone`, each rejection rule, and a migration from a hand-written version-0 fixture

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `document.test.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
