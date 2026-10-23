---
id: T049
title: "Wire the Playhead to `render-frame` with `reason"
layer: "ports"
deps: []
blocks: []
acs: ["AC-04"]
files_hint: ["apps/editor/src/engine-client/index.ts", "apps/editor/src/ui/Timeline.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T049 — Wire the Playhead to `render-frame` with `reason

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Wire the Playhead to `render-frame` with `reason.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T049 [US1] Wire the Playhead to `render-frame` with `reason: "scrub"` through the engine client, with a latest-wins guard in the client so only the newest request is in flight. This is the client-side half only; the worker-side scheduler that also drops Frames under load arrives in T064 and supersedes nothing here — **done**: the Playhead reaches the engine through the one effect in `EditorLayout` that already posts the Scene and asks for the Frame; `playheadFrame` is in its deps, so there is still one path that requests Frames, and the Timeline only ever calls `setPlayhead`. The guard lives in the engine client: one `render-frame` in flight and one waiting slot, so a newer request overwrites the waiting one and is posted when the answer comes. With one request in flight, either `frame-rendered` or `frames-dropped` is its answer, and it settles before listeners run, so a listener asking for the next Frame is not held. Repeats of the Frame in flight are kept, because a repeat is how a Source status change re-renders with no new Scene. The worker latch (T044) is complemented, not duplicated: this one keeps the channel to one message, the worker's keeps its decoders to one Render whatever gets through. Requests the client supersedes are not reported as `frames-dropped`, because that event is the worker's word for Frames it was asked for. Invariant 3 allows an unanswered request, so after `UNANSWERED_FRAME_MS` (2 s) the client stops waiting — a safety valve, harmless because the worker latch absorbs the extra request. A `fatal` or `terminate` forgets the waiting request and the timer. Checked in a real browser: dragging over `sync-1080p30.mp4` moved the burned-in counter from 000000 to 000407 with the Playhead, and 200 Playhead moves, one per task, became 70 posts and ended on Frame 200. 7 unit tests; mutation-checked by bypassing the guard (3 fail) and by not settling on answers (6 fail)
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T049, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Wire the Playhead to `render-frame` with `reason: "scrub"` through the engine client, with a latest-wins guard in the client so only the newest request is in flight. This is the client-side half only; the worker-side scheduler that also drops Frames under load arrives in T064 and supersedes nothing here

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
