---
id: T055
title: "Write `apps/editor/e2e/long-source-imports-promptly.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-12"]
files_hint: ["apps/editor/e2e/long-source-imports-promptly.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T055 — Write `apps/editor/e2e/long-source-imports-promptly.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/long-source-imports-promptly.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T055 [P] [US1] Write `apps/editor/e2e/long-source-imports-promptly.spec.ts`: import `long-1080p30-70min.mp4`, assert the Clip appears within the same budget as the short fixture and that bytes read during import are a small fraction of the file, so importing an hour of footage cannot quietly become reading an hour of footage (spec edge case) — **done**: the 30 s and 70 min fixtures are held to one budget, 2 s, timed in the page from the click on Import to the Clip in the DOM and to a fresh Frame 0 in the Preview, with the copy into OPFS done before the clock starts. Measured: Clip in about 24 ms for the short file and 29 ms for the long one, Frame 0 in 77 ms and 41 ms. Bytes are counted in the engine's Worker by the picker stand-in, reset after the copy, and include the Frame 0 render. The long file reads 3.9–4.2 MB of 32 MB (12–13 %, mostly the 126 000-sample `moov` and the GOP that decodes Frame 0), pinned at under 25 %; the 30 s file is read whole (175 KB), which is fine at that size. Time alone cannot tell a whole-file read from a lazy one, because reading 32 MB from disk is fast, so the byte fraction is the assertion that guards the edge case
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T055, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-12 — happy

> **Given** a Source over an hour long
> **When** the user imports it
> **Then** the Timeline shows its Clip about as promptly as for a short Source, because importing does not require reading the whole file
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/long-source-imports-promptly.spec.ts`: import `long-1080p30-70min.mp4`, assert the Clip appears within the same budget as the short fixture and that bytes read during import are a small fraction of the file, so importing an hour of footage cannot quietly become reading an hour of footage (spec edge case)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `long-source-imports-promptly.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
