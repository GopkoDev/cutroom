---
id: T089
title: "Write `apps/editor/e2e/export-throughput.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-21"]
files_hint: ["apps/editor/e2e/export-throughput.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T089 — Write `apps/editor/e2e/export-throughput.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/export-throughput.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T089 [P] [US3] Write `apps/editor/e2e/export-throughput.spec.ts`: export 60 s of 1080p30 material, record wall-clock time, and assert it completes in under two minutes on the reference machine (SC-005) — **done**: builds a 60 s Timeline from `sync-1080p30.mp4` imported twice (1800 Frames, 1080p30, with sound) and exports it through the dialog at Standard, timed on the page's own clock from the Export click to Done, and asserts under two minutes, a file size equal to `data-bytes`, 1800 video packets at 1920×1080, and audio present. Measured with no other Playwright run active, on an Apple M4 with Chrome 156 (an earlier note said 151 — the device descriptor's user agent, not the browser): 7.84, 7.81 and 7.82 s — about 230 Frames/s, 7.7× real time, roughly 15× under the limit. About 10 s in all, so it stays in the default run
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T089, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-21 — happy

> **Given** a Project with one Clip
> **When** the user exports and chooses where the file goes
> **Then** a single MP4 file is written to the chosen location, containing every Frame of the Timeline and its sound, matching what the Preview showed
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/export-throughput.spec.ts`: export 60 s of 1080p30 material, record wall-clock time, and assert it completes in under two minutes on the reference machine (SC-005)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `export-throughput.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
