---
id: T071
title: "Write `apps/editor/e2e/scrub-latency.spec.ts` measuring time from Playhead move to `frame-rendered` on the…"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-04"]
files_hint: ["apps/editor/e2e/scrub-latency.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T071 — Write `apps/editor/e2e/scrub-latency.spec.ts` measuring time from Playhead move to `frame-rendered` on the…

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/scrub-latency.spec.ts` measuring time from Playhead move to `frame-rendered` on the….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T071 [P] [US2] Write `apps/editor/e2e/scrub-latency.spec.ts` measuring time from Playhead move to `frame-rendered` on the 1080p fixture, asserting under 300 ms (SC-003) — **done**: timed in the page, from the `timeStamp` of the `keydown` or `pointerdown` on the Timeline (capture phase) to the engine's `frame-rendered` **for that exact Frame** as it reaches the main thread, stamped by a listener an init-script wrapper adds to the engine's Worker before the client's own, so React is not in the number; the next animation frame is recorded too. Every move is confirmed on the picture: Playhead `data-frame`, "showing Frame N", and the burned-in counter read off the canvas with T053's reader (copied, not imported). The assertion is on the **worst** move, not the mean, and every number is an annotation. Both fixtures keep a keyframe every 60 Frames (ffprobe: all on multiples of 60, with B-frames), so the worst case is Frame 60k−1 reached from far away; clicks land fractionally on the target Frame's centre, which is how Frame 16 259 is reachable at 0.06 px per Frame. Moves: ±1 and ±10 steps, a far jump each way, and 60k−1 targets plus End, on `sync-1080p30.mp4` and in minute 9 of `sync-1080p30-10min.mp4`. Measured over 3 repeats: steps 8–18 ms median, far jumps 10–22 ms, GOP worst 26.5 ms median and **29.3 ms worst** (about 43 ms to the next paint), with no `frames-dropped`. Position in the file does not matter; position within the GOP does — about 10 ms mid-GOP rising to about 27 ms at 60k−1, which suggests each random-access request decodes from its keyframe with no reuse from the neighbouring Frame. The fixtures are synthetic and cheap to decode (175 KB for 30 s), so this tenfold margin is the fixture's; real long-GOP camera footage is the plan.md risk this test does not close (T092). Mutation-checked: a 20 ms budget fails with "worst move … took 27.5 ms"
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T071, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-04 — happy

> **Given** a Clip on the Timeline
> **When** the user moves the Playhead to any Frame within it
> **Then** the Preview shows the picture of that Frame
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/scrub-latency.spec.ts` measuring time from Playhead move to `frame-rendered` on the 1080p fixture, asserting under 300 ms (SC-003)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `scrub-latency.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
