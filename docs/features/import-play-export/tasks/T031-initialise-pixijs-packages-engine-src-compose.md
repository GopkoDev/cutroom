---
id: T031
title: "Initialise PixiJS in `packages/engine/src/compose/renderer.ts`"
layer: "app"
deps: ["T029"]
blocks: ["T046", "T047", "T079"]
acs: []
files_hint: ["packages/engine/src/compose/renderer.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T031 — Initialise PixiJS in `packages/engine/src/compose/renderer.ts`

## Place in the sequence

- **Blocked by:** T029 · **Blocks:** T046, T047, T079 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T031 Initialise PixiJS in `packages/engine/src/compose/renderer.ts`: `DOMAdapter.set(WebWorkerAdapter)` before anything else, renderer bound to the transferred `OffscreenCanvas`, and a `renderScene(scene, frame)` that clears and draws (research R6) — **done**, and **R6's documented path works exactly as written on PixiJS 8.19 — no fallback, no patch, no classic worker**. `DOMAdapter.set(WebWorkerAdapter)` is a **module side effect**, not the first line of the factory: Pixi routes a dozen DOM reaches through the adapter and its default is the browser one, so a mistake surfaces deep inside Pixi as a stack trace about text metrics rather than about the environment — setting it at import time means it is set before anything in this module, or in any module importing it, can construct a thing. Verified against the installed version rather than assumed: `autoDetectRenderer` against the transferred `OffscreenCanvas` returns a renderer reporting `webgl` in Chrome, and the e2e asserts that name, which is the assertion this whole task exists for. Vite needed **no configuration at all** — the dev server serves `worker.ts` over its `/@fs/` path, bare specifiers and Pixi's dynamic renderer import and all, straight into `new Worker(url, { type: "module" })`. `resolution: 1` and `autoDensity: false` are the point rather than defaults accepted quietly: Preview and Export are one path (Principle III), so the backing store must be exactly the Project's frame size, one canvas pixel per picture pixel, on a retina display as anywhere else. `antialias: false` because rectangular pictures at whole-pixel positions have nothing to antialias. The background is **opaque black, not transparent**: an empty Scene has to *be* something, and what an exported Frame with no Clips contains is black — a transparent Preview would show whatever the page put behind the canvas and quietly stop being a picture of what the Export would write. The stage is built once and kept, because rebuilding per Frame would discard the per-Clip render state `SceneClip.clipId` exists to preserve. **The Scene is authoritative about the frame size and `init` is not** — `renderScene` resizes when they differ, since an export carries its own frozen Scene (FR-019) and the Project's frame size can move while the worker runs. That last rule is the one mutation testing caught: deleting the resize left every spec green, because the canvas had already been sized correctly at `init`, so a spec was added that sends a *newer* Scene at 480×270 and reads the pixels back — and deleting the resize now fails it. Nothing is added to the stage yet and that is the correct picture rather than a gap: data-model.md has a Clip whose Source is unreachable stay in the Scene and render empty, and a worker sent no `attach-source` has no reachable Source for any Clip
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T031, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Initialise PixiJS in `packages/engine/src/compose/renderer.ts`: `DOMAdapter.set(WebWorkerAdapter)` before anything else, renderer bound to the transferred `OffscreenCanvas`, and a `renderScene(scene, frame)` that clears and draws (research R6)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
