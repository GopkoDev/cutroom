---
id: T005
title: "Create `tsconfig.base.json` at the root with ES2023, `moduleResolution"
layer: "wiring"
deps: []
blocks: []
acs: []
files_hint: ["tsconfig.base.json", "tsconfig.json"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T005 — Create `tsconfig.base.json` at the root with ES2023, `moduleResolution

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 1 — Setup (Shared Infrastructure) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 1 (Setup (Shared Infrastructure)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T005 Create `tsconfig.base.json` at the root with ES2023, `moduleResolution: bundler`, `strict`, `noUncheckedIndexedAccess`, and project references for `packages/model`, `packages/engine`, `apps/editor` — **done**; `packages/model` deliberately has no DOM lib, `packages/engine` has DOM and WebWorker
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T005, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Create `tsconfig.base.json` at the root with ES2023, `moduleResolution: bundler`, `strict`, `noUncheckedIndexedAccess`, and project references for `packages/model`, `packages/engine`, `apps/editor`

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 1, commits 35a3596, f554804, 78604a6, d8af2fe, 565b695).
- [x] Delivered in Spec Kit Phase 1 (Setup (Shared Infrastructure)), commits 35a3596, f554804, 78604a6, d8af2fe, 565b695
