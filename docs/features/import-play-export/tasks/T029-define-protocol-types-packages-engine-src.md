---
id: T029
title: "Define the protocol types in `packages/engine/src/protocol.ts` exactly as specified in…"
layer: "ports"
deps: []
blocks: ["T030", "T031", "T032", "T033"]
acs: []
files_hint: ["packages/engine/src/protocol.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T029 — Define the protocol types in `packages/engine/src/protocol.ts` exactly as specified in…

## Place in the sequence

- **Blocked by:** — · **Blocks:** T030, T031, T032, T033 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T029 Define the protocol types in `packages/engine/src/protocol.ts` exactly as specified in contracts/worker-protocol.md, exported for both sides so a message shape cannot drift — **done**: every message in the contract, in both directions, as a discriminated union per direction — `ToEngine` and `EngineEvent`, named after the direction rather than after a role, because `Command` is taken by the model's reducer and half of these are neither requests nor replies. The module is **types only**: it has no runtime export at all, so `import type` erases it completely and there is no chance of behaviour accumulating in the one file both halves of the system depend on. The domain types are imported from `@cutroom/model` and deliberately **not** re-exported — `Scene`, `SceneClip`, `Timebase`, `Rational`, `Frame` and `PixelSize` have exactly one declaration and one import path, and a second way to name a `Scene` is how two ideas of what crosses the boundary start. The one shape the contract leaves open is `ready`'s `capabilities`, and it is settled here: `{ renderer, video[], audio[], frameSize }`, where a video entry answers **twice** (`canEncode`, and `canEncodeVideo` at the Project's frame size, since hardware encoders decline sizes rather than codecs) and an audio entry once, because sample rate and channel count are export settings that do not exist at `init` and probing at an invented rate would answer a question nobody asked. Unsupported codecs are kept in the list with `encodable: false` rather than filtered out: "we asked and it said no" and "we never asked" are different facts, and only the first lets the export dialog say why something is missing. Two additions beyond the letter of the contract, both stated rather than smuggled: `capabilities.renderer` carries the PixiJS backend, which is the one fact about the engine the main thread cannot observe for itself once the canvas has been transferred (ADR 0003 — a worker compositing on the GPU and one that silently failed to look identical from outside); and `fatal` carries an optional `stack`, since a reason without one is a sentence and a reason with one is a place to look. Proved shared rather than asserted: `apps/editor/e2e/engine-worker.spec.ts` types its Scene and its capabilities against these declarations through the engine's own `exports` map, so a renamed field stops the editor side compiling
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T029, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

None — infrastructure, measurement or documentation task; no spec §5 criterion is satisfied by it alone (the Spec Kit breakdown tied it to no FR or acceptance scenario).

## Checklist

- [x] Define the protocol types in `packages/engine/src/protocol.ts` exactly as specified in contracts/worker-protocol.md, exported for both sides so a message shape cannot drift

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
