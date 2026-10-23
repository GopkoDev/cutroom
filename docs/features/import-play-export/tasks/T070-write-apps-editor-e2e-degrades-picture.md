---
id: T070
title: "Write `apps/editor/e2e/degrades-picture-not-sound.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-17"]
files_hint: ["apps/editor/e2e/degrades-picture-not-sound.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T070 — Write `apps/editor/e2e/degrades-picture-not-sound.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/degrades-picture-not-sound.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T070 [P] [US2] Write `apps/editor/e2e/degrades-picture-not-sound.spec.ts`: apply CPU throttling through the CDP session, play, and assert audio continuity while `frames-dropped` is non-zero (FR-012, quickstart gate) — **done**: each test first proves the picture degraded (`sum(frame-rendered.skipped) > 0`), then asserts the sound is one unbroken 30 s run, no overlaps, no late nodes, every node on the grid, every click (second 0 included) at the same sample of its second, and the picture only moving forward, never ahead of sound. **Engine-thread load** (a busy loop in a bootstrap worker around the real engine, ≈90 % of the worker): 288 of 900 skipped, sound perfect. **Main-thread load** (CDP 20× on the page) first failed 2 of 7 runs: the 0.1 s `START_DELAY_SECONDS` was a bet that the engine's first PCM would reach a starved main thread in time, and under load the worker posted PCM 4 ms after the press but the main thread handled it 150–200 ms later (at 50×: 6/6 red, least lead −16 to −42 ms). **Start rule changed** (ADR 0012 amended): the transport holds the clock on the start Frame and anchors only once `start-gate.ts` reports contiguous PCM for 0.5 s — the graph's lookahead — for every Clip whose Source has audio and is not Offline, at `currentTime + START_MARGIN_SECONDS` (0.05 s); buffers are made on arrival and `graph.prepare` copies before the clock is read, so the margin covers only the `start()` calls; `START_WAIT_LIMIT_MS` (1 s) is the valve for sound that never comes. Seeks follow the same rule, the old position sounding until the hand-over. To make readiness decidable, `audio-pcm` is now **unbroken** — silence where a track has none (protocol meaning, not shape). Results: 50× 10/10 with least lead ≥ 18 ms; 20× 30/30 runs, 0 late nodes; unloaded start latency fell from 100 to about 50 ms. The main-thread test allows the stop to be noticed up to 3 Frames late (`STOP_SLACK_FRAMES`), because the end check runs on an animation frame the throttle delays (measured 1.22 Frames) — the sound itself always spans 30.000 s; the engine-load test keeps 1 Frame. CDP refuses to throttle workers, and 6×/10× on the page skips 0 Frames on this machine, so quickstart's manual 6× gate does not exercise FR-012 here
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T070, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-17 — domain invariant

> **Given** a machine too slow to produce every Frame in time
> **When** playback runs
> **Then** sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/degrades-picture-not-sound.spec.ts`: apply CPU throttling through the CDP session, play, and assert audio continuity while `frames-dropped` is non-zero (FR-012, quickstart gate)

## Edge cases

| Case | Behaviour |
|---|---|
| playback runs | sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture |

## Definition of Done

- [x] Done as recorded: `degrades-picture-not-sound.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
