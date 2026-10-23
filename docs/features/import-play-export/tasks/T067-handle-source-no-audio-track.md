---
id: T067
title: "Handle a Source with no audio track"
layer: "app"
deps: []
blocks: []
acs: ["AC-19"]
files_hint: ["apps/editor/src/audio/transport.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T067 — Handle a Source with no audio track

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Handle a Source with no audio track.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T067 [US2] Handle a Source with no audio track: play the picture against a silent clock, treating silence as valid (US2 scenario 5) — **done**: verified and tested rather than built. The clock reads `currentTime`, which a running context advances with nothing scheduled, the engine sends no PCM for a Source without sound (T059), and the graph then schedules nothing. Unit test: a Source with `hasAudio: false` asks for Frames 0, 30 and 60 as the clock moves, creates no buffer source, and stops with the Playhead on the Frame shown. E2E `silent-source-plays.spec.ts` on `silent-720p24.mp4`: 1.5 s of playback advances the picture at the Source's pace and never ahead of real time, not one `AudioBufferSourceNode` is started, there is no fatal, refusal or page error, and the 1280×720 counter after stop matches the Playhead
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T067, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-19 — happy

> **Given** a Source with no audio
> **When** the user plays it
> **Then** the picture plays normally, and the silence is treated as valid rather than as an error
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Handle a Source with no audio track: play the picture against a silent clock, treating silence as valid (US2 scenario 5)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
