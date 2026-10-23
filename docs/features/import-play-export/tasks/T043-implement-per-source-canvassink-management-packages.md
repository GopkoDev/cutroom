---
id: T043
title: "Implement per-Source `CanvasSink` management in `packages/engine/src/sources/canvas-sink.ts`, sized to the…"
layer: "app"
deps: []
blocks: ["T044", "T063"]
acs: ["AC-04"]
files_hint: ["packages/engine/src/sources/canvas-sink.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T043 — Implement per-Source `CanvasSink` management in `packages/engine/src/sources/canvas-sink.ts`, sized to the…

## Place in the sequence

- **Blocked by:** — · **Blocks:** T044, T063 · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement per-Source `CanvasSink` management in `packages/engine/src/sources/canvas-sink.ts`, sized to the….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T043 [US1] Implement per-Source `CanvasSink` management in `packages/engine/src/sources/canvas-sink.ts`, sized to the Project's frame size, with an explicit draw-before-next-pull rule and a comment recording the pooling caveat (research R1) — **done**: sinks are kept **per visible SceneClip**, not per Source as this line says, because two Clips of one Source can share a Frame and would otherwise share one recycled canvas, and R1 says "per active Clip". They are built on the track attach vetted (`getAttachedSource`), with no second registry; the track is compared by identity on every request, so a Relink rebuilds the sink and a detached Source renders its Clips empty. The pooling caveat is enforced in code as well as recorded: `poolSize: 1`, and a second `pull` before `release()` throws. That single canvas has a stable identity, so the compositor needs one texture per Clip rather than one per Frame. Each sink decodes to the Source's size fitted inside the Project's frame size, so a 4K Source in a 1080p Project is never held at 4K. A detach during a decode (`InputDisposedError`) renders the Clip empty rather than raising `fatal`
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T043, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-04 — happy

> **Given** a Clip on the Timeline
> **When** the user moves the Playhead to any Frame within it
> **Then** the Preview shows the picture of that Frame
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement per-Source `CanvasSink` management in `packages/engine/src/sources/canvas-sink.ts`, sized to the Project's frame size, with an explicit draw-before-next-pull rule and a comment recording the pooling caveat (research R1)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
