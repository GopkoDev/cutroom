---
id: T009
title: "Configure ESLint and Prettier at the root, including a rule that forbids importing from outside the…"
layer: "wiring"
deps: []
blocks: []
acs: []
files_hint: ["eslint.config.js", ".prettierrc", "eslint-rules/no-import-outside-repo.js"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T009 — Configure ESLint and Prettier at the root, including a rule that forbids importing from outside the…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 1 — Setup (Shared Infrastructure) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 1 (Setup (Shared Infrastructure)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T009 [P] Configure ESLint and Prettier at the root, including a rule that forbids importing from outside the repository root anywhere in `apps/` and `packages/` — the Lovable prototype now lives outside it, so the thing to block is the climb out, not a named folder (ADR 0010) — **done**: one `eslint.config.js` and one `.prettierrc` at the root, with the Vite scaffold's own config in `apps/editor` folded into them rather than left to drift, so `pnpm lint` is a single `eslint .` instead of `pnpm -r lint`. The climb-out rule is a local rule in `eslint-rules/no-import-outside-repo.js`: it resolves each relative or absolute specifier and fails if the result leaves the root, which catches static imports, re-exports, `import()` and `require()` alike and names no folder
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T009, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Configure ESLint and Prettier at the root, including a rule that forbids importing from outside the repository root anywhere in `apps/` and `packages/` — the Lovable prototype now lives outside it, so the thing to block is the climb out, not a named folder (ADR 0010)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 1, commits 35a3596, f554804, 78604a6, d8af2fe, 565b695).
- [x] Delivered in Spec Kit Phase 1 (Setup (Shared Infrastructure)), commits 35a3596, f554804, 78604a6, d8af2fe, 565b695
