---
id: T060
title: "Implement the Web Audio graph in `apps/editor/src/audio/graph.ts`"
layer: "app"
deps: []
blocks: ["T062", "T066", "T077"]
acs: ["AC-13", "AC-16"]
files_hint: ["apps/editor/src/audio/graph.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T060 — Implement the Web Audio graph in `apps/editor/src/audio/graph.ts`

## Place in the sequence

- **Blocked by:** — · **Blocks:** T062, T066, T077 · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the Web Audio graph in `apps/editor/src/audio/graph.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T060 [US2] Implement the Web Audio graph in `apps/editor/src/audio/graph.ts`: an `AudioContext`, a gain node per Clip, and scheduling of `AudioBufferSourceNode`s at a fixed lookahead (ADR 0008) — **done**: `createAudioGraph` keeps a unity gain node per Clip in the Scene, created and disconnected as Clips come and go. It queues `audio-pcm` chunks and starts each one once it begins within `LOOKAHEAD_SECONDS` (0.5 s) of `currentTime`; `pump` runs on every chunk and every animation frame, so a started node plays on the audio thread through any main-thread stall shorter than the lookahead, while a chunk still queued can simply be dropped on stop. Start times come from the model's `timelineSampleToContextTime`, one exact rational per sample against the playback anchor, so a ten-minute run at 30000/1001 stays butted chunk to chunk (tested); the graph only compares sample indices and context-time readings. A late chunk plays only the part still ahead (`start(now, offset, …)`), so sound stays on the clock rather than staying late; a chunk entirely in the past, or for a Clip no longer in the Scene, is dropped; every chunk is trimmed to its Clip. Each sample of a Clip is scheduled once per session, using merged sorted spans, so PCM from a run a seek replaced is never heard twice and any gap it leaves is still filled. Written against a structural slice of `BaseAudioContext` so the export mix can reuse it on an `OfflineAudioContext` (Principle III). 17 unit tests against a fake context with a hand-driven clock; mutation-checked (span dedup off fails 3, not skipping the late part fails 2)
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T060, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-13 — happy

> **Given** the Playhead is inside a Clip
> **When** the user starts playback
> **Then** playback begins from the Playhead's current Frame; picture and sound advance together, and the Playhead moves in step with them
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — happy

> **Given** playback is running
> **When** the user moves the Playhead elsewhere
> **Then** playback continues from the new position without an audible gap or repeated sound
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the Web Audio graph in `apps/editor/src/audio/graph.ts`: an `AudioContext`, a gain node per Clip, and scheduling of `AudioBufferSourceNode`s at a fixed lookahead (ADR 0008)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
