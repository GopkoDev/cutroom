---
id: T066
title: "Handle seeking during playback"
layer: "app"
deps: ["T060", "T061"]
blocks: []
acs: ["AC-16"]
files_hint: ["apps/editor/src/audio/transport.ts", "packages/engine/src/playback/stream.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T066 — Handle seeking during playback

## Place in the sequence

- **Blocked by:** T060, T061 · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Handle seeking during playback.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T066 [US2] Handle seeking during playback: reschedule audio from the new position without a gap or repeated sound, and reopen the worker's iterators (US2 scenario 3) — **done**: a Playhead moved while playing is a seek, not a stop and a start. The transport sees it as a write it did not make, re-anchors the clock on the new Frame `START_DELAY_SECONDS` (0.1 s) ahead, and calls the graph's new `seek(anchor)`. Nodes already started keep playing the old position up to that instant and are cut exactly there (`stop(when)`), and the new position sounds from the same instant, so the hand-over is sample-exact on the audio clock — no gap, no overlap. No decoded sound is thrown away: queued chunks and the chunks of cut nodes are placed again against the new anchor, which is safe because a chunk's address is its Timeline position (ADR 0012). The samples already dealt with are forgotten, so a seek backwards plays them again, and the graph trims anything before the session's start Frame, so stale PCM from the replaced run cannot sound ahead of the hand-over; a second seek never moves an earlier cut later. The engine gets a second `transport: playing` with no `stopped` between, so it reopens its iterators and audio decode at the new Frame with no engine change. Frames the old run draws after the seek do not move the Playhead; a seek to or past the end ends playback with the Playhead where it was put. Known window: chunks kept across a seek are positioned by the Scene they were decoded under, so a Clip moved during playback can briefly have queued sound at its old place. 6 graph and 5 transport tests; e2e `seek-during-playback.spec.ts` logs every `AudioBufferSourceNode` start and stop through an init-script wrap and asserts, for a seek forwards and one backwards, one cut 0.1 s after the seek, the new first node within a sample of it, one unbroken run of sound with no instant sounded twice, and the burned-in counter matching the Playhead after stop. Putting back the restart fails both specs
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T066, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-16 — happy

> **Given** playback is running
> **When** the user moves the Playhead elsewhere
> **Then** playback continues from the new position without an audible gap or repeated sound
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Handle seeking during playback: reschedule audio from the new position without a gap or repeated sound, and reopen the worker's iterators (US2 scenario 3)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
