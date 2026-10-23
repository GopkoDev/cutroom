---
id: T033
title: "Implement the typed client in `apps/editor/src/engine-client/index.ts`"
layer: "ports"
deps: ["T029"]
blocks: []
acs: ["AC-17"]
files_hint: ["apps/editor/src/engine-client/index.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T033 — Implement the typed client in `apps/editor/src/engine-client/index.ts`

## Place in the sequence

- **Blocked by:** T029 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the typed client in `apps/editor/src/engine-client/index.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T033 Implement the typed client in `apps/editor/src/engine-client/index.ts`: spawn the worker, transfer the canvas, and surface `fatal` to the UI. Two shapes, not one: `attach-source` and `export-start` are request/response and return promises; `render-frame` is a stream that returns nothing and is observed through `frame-rendered` (worker-protocol.md). A promise per Frame leaks one for every Frame FR-012 drops, which during playback is most of them — **done**. The two shapes are separate in the type, not only in the prose: `attachSource` and `startExport` return promises, `renderFrame` returns `void` and `postScene`, `detachSource`, `setTransport`, `sendExportAudioChunk` and `cancelExport` return nothing either, so there is no shape in the interface a caller could await per Frame. Three decisions worth naming. **A `fatal` settles everything outstanding.** The worker forwards a throw and stays alive, which is right for the worker and wrong for the main thread to copy: an `attachSource` promise pending across a `fatal` never settles and the UI freezes with no error anywhere — invariant 5's failure, reintroduced one layer up. So a `fatal` rejects every pending request, the client enters a failed state, and later requests reject immediately rather than joining a queue nothing will drain; stream posts are dropped rather than thrown from, because `renderFrame` is called from a pointer move and taking the UI down there would report a failure the UI has already been told about. **A worker that dies without saying `fatal`** — a module that fails to load — raises an `error` event and nothing else, so that is turned into the `fatal` it could not send. **`attach-source` correlates by `sourceId` and by nothing else**, so two attaches of one Source in flight would be settled by whichever reply came first, for whichever file; the client refuses the second rather than pretend the protocol can express the question. The worker is reached as `@cutroom/engine/worker?worker` through the engine's own `exports` map, so there is no second spelling of where the engine lives — verified to emit a real worker chunk in a production build, not just in dev
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T033, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-17 — domain invariant

> **Given** a machine too slow to produce every Frame in time
> **When** playback runs
> **Then** sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the typed client in `apps/editor/src/engine-client/index.ts`: spawn the worker, transfer the canvas, and surface `fatal` to the UI. Two shapes, not one: `attach-source` and `export-start` are request/response and return promises; `render-frame` is a stream that returns nothing and is observed through `frame-rendered` (worker-protocol.md). A promise per Frame leaks one for every Frame FR-012 drops, which during playback is most of them

## Edge cases

| Case | Behaviour |
|---|---|
| playback runs | sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
