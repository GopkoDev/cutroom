---
id: T030
title: "Implement the worker entry in `packages/engine/src/worker.ts`"
layer: "ports"
deps: ["T029"]
blocks: []
acs: []
files_hint: ["packages/engine/src/worker.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T030 — Implement the worker entry in `packages/engine/src/worker.ts`

## Place in the sequence

- **Blocked by:** T029 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T030 Implement the worker entry in `packages/engine/src/worker.ts`: a single message switch, and a top-level handler that converts any thrown error into a `fatal` message rather than a silent death (worker-protocol invariant 5) — **done**: one `send`, one `handle`, and three pieces of state (a renderer, the newest Scene, its revision). **Three nets, and the third turned out to be load-bearing.** Every path out of `handle` — synchronous throw or rejected promise — is funnelled through `.catch(fail)`; a `scope.addEventListener("error")` catches what a callback or timer throws outside it; and `unhandledrejection` catches a promise the module dropped. Deleting `.catch(fail)` as a mutation left **all seven specs still passing**, because every `fatal` arrived through the rejection handler instead — so the global net is proven, not decorative. `fail` cannot fail on its own account: `describe` never calls `String(value)` (a Symbol makes it throw, and an exception raised while reporting an exception is exactly the silence invariant 5 is about), and the `fatal` payload is strings only, so it always survives `postMessage`. A `fatal` **leaves the worker running** — whether to terminate it belongs to the side that can tell the user and would have to spawn the replacement. **Stale Scenes** are ignored at `revision <= held`, equal included: `revision` identifies a Scene, so an equal one is the same Scene arriving twice, and treating it as new would mean the number identifies nothing. **A `render-frame` that cannot be answered is `frames-dropped`, not an error and not silence** — invariant 3 explicitly permits an unanswered request, a Frame asked for before `init` or before the first Scene is the ordinary shape of startup, and `frames-dropped` is the protocol's own channel for saying so. **The six messages this build has not written (`attach-source`, `detach-source`, `transport`, `export-*`) throw, and so become `fatal`** — the protocol has no "recognised but unsupported" reply, and every substitute lies: `source-failed` would blame the user's file for a decoder nobody has written, a silent no-op leaves the main thread waiting forever. They are real `case` labels, so the `never` in the default arm is a genuine exhaustiveness check that will stop compiling the day the protocol grows a message — and at runtime the same arm catches what the types cannot, since anything at all can be posted at a worker (`42` and `null` both produce a `fatal`, tested). **No coalescing yet, deliberately**: FR-012's rule only has something to displace once a Render can be in flight across an `await`, which is T046; compositing an empty stage returns inside one task, so a latch now would be a branch that could never be taken or tested. The global scope is reached as `globalThis as unknown as DedicatedWorkerGlobalScope`, because `packages/engine` compiles with the DOM **and** WebWorker libraries — it has to, since a `File`, an `OffscreenCanvas` and a `FileSystemWritableFileStream` all cross this boundary — and `postMessage` otherwise resolves to `Window`'s overload and demands a target origin
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T030, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Implement the worker entry in `packages/engine/src/worker.ts`: a single message switch, and a top-level handler that converts any thrown error into a `fatal` message rather than a silent death (worker-protocol invariant 5)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
