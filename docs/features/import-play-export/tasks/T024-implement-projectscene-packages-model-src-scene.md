---
id: T024
title: "Implement `projectScene` in `packages/model/src/scene.ts` producing `SceneClip[]` — not `SceneLayer` and not…"
layer: "domain"
deps: ["T015"]
blocks: []
acs: []
files_hint: ["packages/model/src/scene.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T024 — Implement `projectScene` in `packages/model/src/scene.ts` producing `SceneClip[]` — not `SceneLayer` and not…

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T024 Implement `projectScene` in `packages/model/src/scene.ts` producing `SceneClip[]` — not `SceneLayer` and not `SceneItem`, because CONTEXT.md lists "Layer" under the words to avoid for a Track and "Item" under the words to avoid for a Clip, and each of these is a Clip: deterministic back-to-front order, only picture-affecting fields, byte-identical output for identical Projects — **done**, with three decisions worth naming. A `SceneClip` is `{ clipId, sourceId, startFrame, durationFrames, sourceInPoint }` and **carries no `transform`**, though data-model.md lists one: schema version 1 has no `Clip.transform` to feed it, `docs/future.md` puts that field in a later slice with its own schema change, and projecting a constant identity transform now would put a value in the protocol that no Project can vary and no renderer can trust. `sourceId` is deliberately **not** resolved into its `Source` — the worker reads dimensions, duration and Source Timebase from the file itself (`source-attached`), so copying them into the Scene would make a second version of facts a Relink to a re-encoded file can change. **Back to front is `timeline.tracks` in array order**, `tracks[0]` backmost, each later Track drawing over the ones before it — the convention neither data-model.md nor CONTEXT.md states, and undetectable while there is one Track, which is exactly why it is fixed and tested now. Nothing is sorted: `parseProject` already guarantees Clips ascend by `startFrame` without overlap, and re-sorting here would hide a parser bug rather than fix one. Only video Tracks contribute. Totality is structural rather than defensive — no join, no conversion, no rounding, so there is no `Project` this throws on. The memoisation the contract asks for is **both strengths, stated apart**: deep equality (and byte-identical JSON, key order included) always, and reference equality via a `WeakMap` keyed on `project.timeline` when Immer's structural sharing survives, with `timebase` and `frameSize` compared by value on every hit because they live outside the key. A caller may use `===` to skip a repost, never `!==` to conclude the picture moved
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T024, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Implement `projectScene` in `packages/model/src/scene.ts` producing `SceneClip[]` — not `SceneLayer` and not `SceneItem`, because CONTEXT.md lists "Layer" under the words to avoid for a Track and "Item" under the words to avoid for a Clip, and each of these is a Clip: deterministic back-to-front order, only picture-affecting fields, byte-identical output for identical Projects

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
