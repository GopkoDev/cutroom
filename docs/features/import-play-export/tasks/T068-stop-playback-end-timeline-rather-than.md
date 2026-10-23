---
id: T068
title: "Stop playback at the end of the Timeline rather than running into empty space (US2 scenario 6)"
layer: "app"
deps: []
blocks: []
acs: ["AC-14", "AC-20"]
files_hint: ["apps/editor/src/audio/transport.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T068 — Stop playback at the end of the Timeline rather than running into empty space (US2 scenario 6)

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Stop playback at the end of the Timeline rather than running into empty space (US2 scenario 6).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T068 [US2] Stop playback at the end of the Timeline rather than running into empty space (US2 scenario 6) — **done**: in `tick`, where the clock's Frame and the Timeline are both at hand. With `durationFrames` as E, playback stops when the clock reaches E — when Frame E−1 has had its whole duration and the last of its sound has played. The Playhead is left on E−1 and the shell scrubs it, so the Preview shows the Timeline's last Frame even if the engine dropped it: FR-014's "Frame that was showing" for a run that reaches the end. No clock request goes past E−1. Play does nothing with the Playhead at or past E — FR-010 kept strict, so Play never jumps back to 0 — and Play on E−1 plays that one Frame and stops on it again. 4 transport tests; e2e `playback-stops-at-the-end.spec.ts` plays `sync-1080p30.mp4` from Frame 870 and asserts the transport releases by itself, the Playhead is 899, the counter reads 000899 and the scheduled sound spans exactly 1 s, plus Play on 899 and Play from 905. Removing the end check fails both **Amended**: Play with the Playhead on or past the last Frame now starts again from Frame 0 (FR-010 as amended); the Playhead is set to 0 before playback begins, so it is not mistaken for a seek. Unit tests cover Frames 299/300/340 → 0 and 298 playing as usual; the e2e covers Play on 899 and 905 — picture from 0, counter matching, sound from 0
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T068, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-14 — happy

> **Given** the Playhead is on or past the Timeline's last Frame
> **When** the user starts playback
> **Then** playback starts again from Frame 0, as in common editors and players
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — domain invariant

> **Given** playback reaches the end of the Timeline
> **When** the last Frame has been shown
> **Then** playback stops there rather than continuing into empty space
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Stop playback at the end of the Timeline rather than running into empty space (US2 scenario 6)

## Edge cases

| Case | Behaviour |
|---|---|
| the last Frame has been shown | playback stops there rather than continuing into empty space |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
