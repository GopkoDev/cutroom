---
id: T054
title: "Write `apps/editor/e2e/refuses-unusable-files.spec.ts` covering all three refusals the spec names —…"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-09", "AC-10"]
files_hint: ["apps/editor/e2e/refuses-unusable-files.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T054 — Write `apps/editor/e2e/refuses-unusable-files.spec.ts` covering all three refusals the spec names —…

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/refuses-unusable-files.spec.ts` covering all three refusals the spec names —….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T054 [P] [US1] Write `apps/editor/e2e/refuses-unusable-files.spec.ts` covering all three refusals the spec names — `broken.mp4`, `audio-only.m4a` and `still.png` — asserting for each that the reason states what was wrong and that the Timeline is left exactly as it was (FR-003, spec edge case) — **done**: all three refusals are picked through the Sources panel's own button into two editors: an empty one, where a refusal must not bring a Project into being, and one with a Project and a Clip, which it must leave byte for byte as it was. Each refusal is asserted to say "<file> cannot be used." followed by the engine's T040 wording for what was wrong. "Exactly as it was" is checked three ways, because each catches what the others miss: the store's document compared whole as JSON, so a stray `modifiedAt` fails it; the past, future and open transaction, so an empty undo step fails it; and the screen — Source rows, the Clip's start and length, the Timeline duration and the Project name. Storage is checked after the save debounce has passed: no Project at all in the empty case, still one Project with one Source in the other. Two follow-ups show the refusal is an answer, not damage: in the empty editor a usable file still imports afterwards, and in the existing Project a single undo takes back the original import and leaves nothing more to undo. 6 tests
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T054, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-09 — error

> **Given** any Project
> **When** the user picks a file the product cannot decode
> **Then** the system states plainly that the file cannot be used and why, and the Project is left unchanged
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — error

> **Given** any Project
> **When** the user picks an audio-only file or an image
> **Then** the system refuses it clearly as outside what this slice supports, rather than half-supporting it, and the Project is left unchanged
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/refuses-unusable-files.spec.ts` covering all three refusals the spec names — `broken.mp4`, `audio-only.m4a` and `still.png` — asserting for each that the reason states what was wrong and that the Timeline is left exactly as it was (FR-003, spec edge case)

## Edge cases

| Case | Behaviour |
|---|---|
| the user picks a file the product cannot decode | the system states plainly that the file cannot be used and why, and the Project is left unchanged |
| the user picks an audio-only file or an image | the system refuses it clearly as outside what this slice supports, rather than half-supporting it, and the Project is left unchanged |

## Definition of Done

- [x] Done as recorded: `refuses-unusable-files.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
