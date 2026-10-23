---
id: T069
title: "Write `apps/editor/e2e/av-sync.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-18"]
files_hint: ["apps/editor/e2e/av-sync.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T069 — Write `apps/editor/e2e/av-sync.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/av-sync.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T069 [P] [US2] Write `apps/editor/e2e/av-sync.spec.ts`: import `sync-1080p30-10min.mp4` as one Clip and play it from Frame 0 to the end, sampling the reported Frame against `audioContext.currentTime` throughout and asserting drift stays under one Frame at every sample and at the finish (SC-002). Played straight through, not looped and not stitched from several Clips — this slice supports neither, and a drift test that restarts its own clock every thirty seconds proves nothing about ten minutes — **done**: plays `sync-1080p30-10min.mp4` once from Frame 0 until T068 stops it, one anchor, no restarts. The reference is the sound itself — the origin (`when − offset`) of the first `AudioBufferSourceNode`, read off the transport's own `AudioContext`, captured at its constructor — and that anchor is checked, not trusted: every node on the 48 kHz Timeline grid from it, one unbroken run with nothing scheduled twice and nothing late ending exactly 600 s later, all clicks on their second, the anchor 100 ms after the press. Each `frame-rendered` is stamped with `currentTime` on arrival; drift is how far the sound has moved outside the shown Frame's interval `[f, f+1)` at the worst moment, just before the next Frame replaces it, and must stay under 1 at every sample and at the finish. Measured on an M4 (macOS 26.6.2, Chrome 156): worst drift 0.76 Frames, per-minute lag p50 0.08–0.44 and p99 ≤ 0.60 with no trend, 18 000 shown, 0 skipped, 0 dropped, 17 947 nodes spanning 600.000000 s with grid residual 3.7e-9 samples, clicks 1–599 at +7 samples. **Finding**: the first ~12 ms of sound from Frame 0 is missing (≈450 zero samples, then a fade-in) — the AAC cold start, which T059's 1/10 s run-up cannot cover at the start of a Source; the second-0 click is left out of the timing assertions and recorded as an annotation. Not measured, as constant offsets: compositor present and `outputLatency` (0.024 s). Tagged `@slow`: `pnpm test:e2e:slow`. 10.1 min **Finding fixed**: the missing first ~12 ms was the MP4's AAC priming packet (pts −1024, edit list), which Mediabunny exposes at −0.0213 s and the run-up skipped because `sourceTimeBefore` clamps at 0; a run-up clamped at 0 now starts at the track's first timestamp, the first 1200 samples match ffmpeg's decode to 6e-8, and the second-0 click is asserted with the rest (all 600 at the same sample, within 0.01). Re-measured with the new start rule: worst drift 0.62 Frames, anchor 50.00 ms after the press
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T069, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-18 — domain invariant

> **Given** a Source of any length with sound
> **When** it plays from start to end
> **Then** sound and picture stay in sync for the whole length, without cumulative drift
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/av-sync.spec.ts`: import `sync-1080p30-10min.mp4` as one Clip and play it from Frame 0 to the end, sampling the reported Frame against `audioContext.currentTime` throughout and asserting drift stays under one Frame at every sample and at the finish (SC-002). Played straight through, not looped and not stitched from several Clips — this slice supports neither, and a drift test that restarts its own clock every thirty seconds proves nothing about ten minutes

## Edge cases

| Case | Behaviour |
|---|---|
| it plays from start to end | sound and picture stay in sync for the whole length, without cumulative drift |

## Definition of Done

- [x] Done as recorded: `av-sync.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
