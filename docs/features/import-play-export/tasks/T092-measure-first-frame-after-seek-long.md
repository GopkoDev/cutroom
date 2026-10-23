---
id: T092
title: "Measure first-Frame-after-seek on long-GOP material and record whether SC-003 holds without a scrub-quality…"
layer: "tests"
deps: []
blocks: []
acs: ["AC-04"]
files_hint: ["docs/features/import-play-export/_evidence/performance-baseline.md"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T092 — Measure first-Frame-after-seek on long-GOP material and record whether SC-003 holds without a scrub-quality…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 6 — Polish & Cross-Cutting Concerns (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Measure first-Frame-after-seek on long-GOP material and record whether SC-003 holds without a scrub-quality….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T092 [P] Measure first-Frame-after-seek on long-GOP material and record whether SC-003 holds without a scrub-quality path (plan risk table) — **done**: measured on realistic long-GOP material made on the host (40 s, `testsrc2` with temporal grain, closed GOP, B-frames: H.264 High 1080p/4K at GOP 250 and 300, 23/46 Mbps; HEVC GOP 300) through the real worker, worst case the Frame just before the next keyframe. **SC-003 does not hold everywhere**: H.264 1080p GOP 250 worst 255 ms (holds), **H.264 1080p GOP 300 a ±1 step 307 ms and a seek during playback 304 ms (fails, no margin)**, HEVC 1080p GOP 300 198 ms (holds), and every 4K file 514–729 ms (1.7–2.3× — outside SC-003's 1080p scope, but the same mechanism). Latency grows linearly with distance from the keyframe (≈0.97 ms/Frame for H.264 1080p, 2.2 for 4K) and even a ±1 step decodes from the keyframe — nothing from the previous Frame is reused. This is the plan's stop-and-reconsider signal; the decision is ADR 0017. Evidence: `performance-baseline.md` **ADR 0017 implemented**: scrubs and playback share one walk rule (`playback/stream.ts`) — continue the Clip's iterator when the Frame is ahead of it, within 30 Frames or in the same GOP (checked against the packet index, < 0.2 ms), reopen otherwise; `scrub.ts` and `CanvasSink` are gone, replaced by `VideoSampleSink` plus one canvas per sink so Frames walked past are closed without being drawn. A scrub parks its iterator for the next step, and a stopped Preview closes it after 3 s idle (`PARK_MS`), because a parked iterator holds about 45 decoded Frames. On H.264 1080p GOP 300: step +1 296 → 1 ms median (worst 28), +10 276 → 8, a slow drag 248 → 1 ms with every Frame shown, a forward seek within the GOP while playing 305 → 54. Backward steps and far jumps still decode from the keyframe: 301–313 ms worst against 302–308 before — still just over SC-003 on this material (see decisions.md). 4K forward gestures are 1 ms median; backward and far unchanged at 505–704 ms. A new test in `scrub-latency.spec.ts` asserts a one-Frame step costs under half a cold seek (1.0 vs 29.7 ms) and fails with the walk disabled. Evidence: `performance-baseline.md`, "After ADR 0017"
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T092, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Measure first-Frame-after-seek on long-GOP material and record whether SC-003 holds without a scrub-quality path (plan risk table)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 6, commits a49c7f8).
- [x] Delivered in Spec Kit Phase 6 (Polish & Cross-Cutting Concerns), commits a49c7f8
