---
id: T011
title: "Configure Vitest for `packages/model` with a node environment and no DOM shims, so a browser API used there…"
layer: "tests"
deps: []
blocks: []
acs: []
files_hint: ["packages/model/vitest.config.ts", "packages/model/test/environment.test.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T011 — Configure Vitest for `packages/model` with a node environment and no DOM shims, so a browser API used there…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 1 — Setup (Shared Infrastructure) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 1 (Setup (Shared Infrastructure)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T011 [P] Configure Vitest for `packages/model` with a node environment and no DOM shims, so a browser API used there fails loudly — **done**: `packages/model/vitest.config.ts` pins `environment: "node"`, and `test/environment.test.ts` asserts the absence itself, so a DOM shim added later fails the suite rather than quietly enabling what the constitution forbids. Verified by writing a test that touches `document`: it fails twice over, `ReferenceError: document is not defined` at run time and TS2584 from `tsc -b`, because the package has no DOM lib either. `rootDir` had to move from `./src` to `.` — T005 set it to `./src` while including `test/**/*`, which meant the first test file added would have broken `pnpm typecheck`
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T011, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Configure Vitest for `packages/model` with a node environment and no DOM shims, so a browser API used there fails loudly

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 1, commits 35a3596, f554804, 78604a6, d8af2fe, 565b695).
- [x] Delivered in Spec Kit Phase 1 (Setup (Shared Infrastructure)), commits 35a3596, f554804, 78604a6, d8af2fe, 565b695
