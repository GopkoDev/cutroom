---
id: T001
title: "Initialise the git repository at the Cutroom root so `specs/`, `docs/`, `.specify/`, `.claude/`, `packages/`…"
layer: "wiring"
deps: []
blocks: []
acs: []
files_hint: ["."]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T001 — Initialise the git repository at the Cutroom root so `specs/`, `docs/`, `.specify/`, `.claude/`, `packages/`…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 1 — Setup (Shared Infrastructure) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 1 (Setup (Shared Infrastructure)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T001 Initialise the git repository at the Cutroom root so `specs/`, `docs/`, `.specify/`, `.claude/`, `packages/` and `apps/` are all tracked — **done**. Started fresh rather than carrying over the scaffold's single commit; the old `videoEditor/` folder stays outside the repository
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T001, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Initialise the git repository at the Cutroom root so `specs/`, `docs/`, `.specify/`, `.claude/`, `packages/` and `apps/` are all tracked

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 1, commits 35a3596, f554804, 78604a6, d8af2fe, 565b695).
- [x] Delivered in Spec Kit Phase 1 (Setup (Shared Infrastructure)), commits 35a3596, f554804, 78604a6, d8af2fe, 565b695
