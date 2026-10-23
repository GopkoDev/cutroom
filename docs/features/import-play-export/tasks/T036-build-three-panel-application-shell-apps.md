---
id: T036
title: "Build the three-panel application shell in `apps/editor/src/ui/EditorLayout.tsx` (Source list, Preview,…"
layer: "ui"
deps: []
blocks: ["T038", "T048"]
acs: []
files_hint: ["apps/editor/src/ui/EditorLayout.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T036 — Build the three-panel application shell in `apps/editor/src/ui/EditorLayout.tsx` (Source list, Preview,…

## Place in the sequence

- **Blocked by:** — · **Blocks:** T038, T048 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T036 Build the three-panel application shell in `apps/editor/src/ui/EditorLayout.tsx` (Source list, Preview, Timeline) with the Preview's canvas transferred to the worker on mount — **done**, with the double-transfer handled rather than discovered. `transferControlToOffscreen()` may be called on an element exactly once, ever, and React's development double-mount runs every effect twice against the same element — so a shell that transferred on mount and terminated on cleanup would work in production and throw `InvalidStateError` on the second mount in development. The engine session is therefore keyed on the **element**, in a `WeakMap`, and teardown is reference-counted and deferred by one task: StrictMode's release is immediately followed by a retain which cancels it, a real unmount is not, and nothing is left running. The element is created at 1920×1080 when there is no Project yet, which is legitimate rather than a guess — `init.timebase` and `init.frameSize` are a convenience for the first Render only and every Scene carries its own (invariant 6) — and the e2e proves the worker resizes the raster to 640×360 when the first Scene arrives, so invariant 6 is exercised rather than merely cited. Posting the Scene and asking for the Frame are one step, because a Scene nobody rendered afterwards leaves the Preview showing the previous one, which is indistinguishable from an edit that did nothing. A `fatal` is shown in the Preview's place: the raster belongs to the worker, so from out here a dead engine and a still picture are the same thing (ADR 0003). One defect found by running it — the client documented posting `init` and did not actually post it, which is invisible until something waits for `ready`
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T036, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Build the three-panel application shell in `apps/editor/src/ui/EditorLayout.tsx` (Source list, Preview, Timeline) with the Preview's canvas transferred to the worker on mount

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
