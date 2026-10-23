---
id: T062
title: "Drive the Preview from the clock in `apps/editor/src/audio/transport.ts`"
layer: "app"
deps: ["T060", "T061"]
blocks: []
acs: ["AC-13", "AC-17"]
files_hint: ["apps/editor/src/audio/transport.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T062 — Drive the Preview from the clock in `apps/editor/src/audio/transport.ts`

## Place in the sequence

- **Blocked by:** T060, T061 · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Drive the Preview from the clock in `apps/editor/src/audio/transport.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T062 [US2] Drive the Preview from the clock in `apps/editor/src/audio/transport.ts`: on each animation frame, post `render-frame` with `reason: "clock"` for the Frame the clock reports — **done**: `createTransport` makes the `AudioContext` lazily on the first press, inside the gesture, and resumes it on every play. Play sends `transport: playing` from the Playhead and sets the store's `transport`; each animation frame then posts `render-frame` with `clock` for the clock's Frame, only when it changes, so a 60 Hz display over 30 fps asks for each Frame once and a stalled display skips ahead rather than catching up Frame by Frame. **Scrub and clock never compete**: while playing, the shell's one Frame-requesting effect stands aside (`scrubFrame = playing ? null : playheadFrame`), so there is one requester at a time and the client's latest-wins guard covers both. The Playhead follows `frame-rendered`, not the clock, because the Playhead is the Frame showing; Frames from before the press are filtered out. Closing the Project or the last Clip disappearing stops playback. A Playhead moved during playback currently restarts playback from there, a placeholder for T066's gapless re-anchor. Playback in a hidden tab stalls, since rAF stops — outside this slice. 16 unit tests with the real store
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T062, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

### AC-17 — domain invariant

> **Given** a machine too slow to produce every Frame in time
> **When** playback runs
> **Then** sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Drive the Preview from the clock in `apps/editor/src/audio/transport.ts`: on each animation frame, post `render-frame` with `reason: "clock"` for the Frame the clock reports

## Edge cases

| Case | Behaviour |
|---|---|
| playback runs | sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
