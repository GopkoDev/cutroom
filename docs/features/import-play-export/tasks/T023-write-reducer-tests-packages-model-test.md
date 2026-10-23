---
id: T023
title: "Write reducer tests in `packages/model/test/commands.test.ts` asserting that every command's inverse patches…"
layer: "tests"
deps: ["T015"]
blocks: []
acs: []
files_hint: ["packages/model/test/commands.test.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T023 — Write reducer tests in `packages/model/test/commands.test.ts` asserting that every command's inverse patches…

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T023 [P] Write reducer tests in `packages/model/test/commands.test.ts` asserting that every command's inverse patches restore the exact prior document, including the Clip-overlap guard — **done**: 92 tests, taking the suite to 191. Seven command-and-Project pairs run the same six-way check — undo is exact, redo is exact, the answer is identical on a second run, the output passes `parseProject` unchanged, it survives `structuredClone`, and the input Project is untouched — and the hard cases are the structural ones rather than the scalar ones: a Clip inserted into the *middle* of a Track, whose inverse is a `replace` and a `remove` that only work in the order Immer emits them, and a Source modified at the head of a list of three, whose neighbours must come back in order and not merely with the same contents. Purity is asserted rather than assumed: `Date.now`, `Math.random` and `crypto.randomUUID` are spied on and proved never called
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T023, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Write reducer tests in `packages/model/test/commands.test.ts` asserting that every command's inverse patches restore the exact prior document, including the Clip-overlap guard

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `commands.test.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
