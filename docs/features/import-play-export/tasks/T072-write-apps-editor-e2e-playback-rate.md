---
id: T072
title: "Write `apps/editor/e2e/playback-rate.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-17"]
files_hint: ["apps/editor/e2e/playback-rate.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T072 — Write `apps/editor/e2e/playback-rate.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/playback-rate.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T072 [P] [US2] Write `apps/editor/e2e/playback-rate.spec.ts`: play `sync-1080p30-10min.mp4` unthrottled from end to end, count `frame-rendered` against `frames-dropped`, and assert sustained full rate on the reference machine. Ten minutes because that is the length SC-004 claims — a minute of full rate says nothing about whether the ninth minute still holds, which is exactly where a leaking decoder or a growing queue would show (SC-004) — **done**: full rate defined before the first run as ≤ 1 skipped Frame in any minute, never 2 in a row, 0 `frames-dropped`, shown + skipped covering exactly Frames 0–17 999, and no audio interruption. The first two runs failed (7 and 2 skipped, the latter never requested by the transport). **Cause: the main thread, not the worker.** Where the audio clock's Frame boundaries line up with vsync, one missed display frame is one skipped Frame — the transport reads the clock just before Frame k and, a display frame late, just after k+1. Display frames were missed because every `frame-rendered` re-rendered the whole editor: `setPlayhead` re-rendered `EditorLayout` (whose `setShown` re-rendered it again), `SourcesPanel`, the Timeline with its ruler and Clips, and `TopBar` — 56 % of main-thread busy time during playback (CPU profile, 4× throttle). GC (largest pause 8.5 ms in ten minutes, no heap growth), Zustand, `verifyLinked` (about 1 s of IndexedDB callbacks per ten minutes) and the probe (under 1 %) were measured and ruled out. The Playhead's readouts are now their own components — `PlayheadLabel`, `ShownLabel`, `Timecode`, `TimelineBody` — and the shell reads `scrubFrame` through a selector that stands still while playing; `playback-renders-only-the-playhead.spec.ts` counts renders through the DevTools hook and fails if any of `EditorLayout`, `TopBar`, `Timeline`, `SourcesPanel` or `RelinkPrompt` renders while the picture runs (86 over 86 Frames before the fix). At 4× throttle, main-thread busy time fell from 20.7 to 12.2 s and skips from 1–2 to 0. Measured on an M4 on a fresh server: two ten-minute runs with 18 000 shown, **0 skipped**, 0 dropped, sound one unbroken run of 600.000000 s, Frame interval p50 33.3 ms in every minute and p99 34–51 ms (the 50 ms minutes are the phase alignment, without skips). The reused dev server hot-reloads CSS and modules into the page under test while files change (about 17 CSS reloads in one ten-minute run), so `@slow` runs now always start a fresh server of their own (`playwright.config.ts`). Remaining risk: a compositor-side stall with the main thread idle can still miss a display frame (one such 50 ms gap was seen before the fix); see decisions.md. Tagged `@slow`
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T072, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Write `apps/editor/e2e/playback-rate.spec.ts`: play `sync-1080p30-10min.mp4` unthrottled from end to end, count `frame-rendered` against `frames-dropped`, and assert sustained full rate on the reference machine. Ten minutes because that is the length SC-004 claims — a minute of full rate says nothing about whether the ninth minute still holds, which is exactly where a leaking decoder or a growing queue would show (SC-004)

## Edge cases

| Case | Behaviour |
|---|---|
| playback runs | sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture |

## Definition of Done

- [x] Done as recorded: `playback-rate.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
