---
id: T001
title: "Diagnose and fix the flaky engine-worker e2e check before any feature work"
layer: "tests"
deps: []
blocks: ["T016"]
acs: []
files_hint: ["apps/editor/e2e/engine-worker.spec.ts", "docs/features/editing/_evidence/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
step: ""
---
# T001 — Diagnose and fix the flaky engine-worker e2e check before any feature work

## Place in the sequence

- **Blocked by:** nothing · **Blocks:** T016 — Rebuild the Timeline as Track rows of selectable Clip views with Track headers · **Wave:** 1.
- **Lane:** shares files with T020 — serialized.

## Why (user story)

> **As a** User
> **I want** to undo and redo each thing I did, by key and by button, and see what the next undo or redo will take back
> **So that** I can try an edit without being afraid of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

It makes `pnpm test:e2e` a trustworthy gate, which every later e2e test in this feature depends on.

## Inlined context

> The flaky `engine-worker.spec.ts` check keeps `pnpm test:e2e` from being reliably green (carried from step 1) | High | Diagnose before `/sdd:implement`, as spec §8 sets. This feature's gate depends on the e2e suite
>
> — `sad.md` §11, verbatim · full text: [sad.md](../sad.md)

> The flaky `engine-worker.spec.ts` check (carried from step 1). Default now: undiagnosed; it keeps `pnpm test:e2e` from being reliably green, which this feature's implement gate depends on. — owner: Tech Lead, due: before this feature's `/sdd:implement`
>
> — `spec.md` §8, verbatim · full text: [spec.md](../spec.md)

> `pnpm test:e2e` (port 5192) | 103 passed, **1 failed**: `engine-worker.spec.ts` "a Scene older than the one the worker holds is ignored". It passed on 5 of 5 reruns
>
> — `docs/features/import-play-export/_evidence/validation.md` line 119, verbatim · full text: that file

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Schema version 1 and IndexedDB version 1 stay as they are (`data-model.md` §intro, verbatim: "No schema change.").

## API contract

Internal — no API surface.

## Acceptance criteria

No spec §5 AC is owned by this task: it is the precondition spec §8 and sad §11 set for `/sdd:implement` (quoted above). Its DoD is the check.

## Checklist

- [ ] Reproduce: run the spec repeatedly (`--repeat-each`) alone and inside the full suite; record the failure rate — `apps/editor/e2e/engine-worker.spec.ts`
- [ ] Find the root cause in the test or the code under test (a race on Scene revisions, a timing assumption, shared state between tests)
- [ ] Fix the cause, not the symptom: no retries, no longer timeouts unless the timeout itself is the defect
- [ ] Write the diagnosis and the evidence (runs before and after) to `docs/features/editing/_evidence/engine-worker-flake.md`
- [ ] If the cause is truly environmental, write the evidence and a quarantine decision there instead, and keep the check running in `@slow`

## Edge cases

| Case | Behaviour |
|---|---|
| Fails only under suite load | Root cause is named (shared worker, port, timing); fix makes it pass under load too |
| Cannot reproduce in 200 runs | Record that, with the runs; quarantine only with an owner and a re-check date |

## Definition of Done

- [ ] `pnpm test:e2e` passes the spec on 50 consecutive `--repeat-each` runs, or a written quarantine decision with evidence exists
- [ ] The diagnosis is recorded in `docs/features/editing/_evidence/engine-worker-flake.md`
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
