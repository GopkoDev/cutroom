---
id: T018
title: "Implement `parseProject` in `packages/model/src/document/parse.ts` rejecting non-integer Frames, overlapping…"
layer: "domain"
deps: ["T015"]
blocks: []
acs: ["AC-06"]
files_hint: ["packages/model/src/document/parse.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T018 — Implement `parseProject` in `packages/model/src/document/parse.ts` rejecting non-integer Frames, overlapping…

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement `parseProject` in `packages/model/src/document/parse.ts` rejecting non-integer Frames, overlapping….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T018 Implement `parseProject` in `packages/model/src/document/parse.ts` rejecting non-integer Frames, overlapping Clips, non-positive durations, invalid Timebase, and anything not structured-clone-safe — **done**, by rebuilding rather than inspecting: every validated value is copied into a fresh literal, so the result shares no object with the input and clone-safety holds by construction — a `Date`, a `Map` or a file handle cannot reach the output because the check for an object position refuses anything carrying a prototype of its own. Unknown fields are refused rather than dropped, since dropping them loses a future version's data on the next save. Beyond the five rules named above it also enforces the invariants data-model.md states but its validation summary omits: `timeline.durationFrames` equal to the greatest Clip end, no dangling `sourceId`, no repeated id. Two things were deliberately **not** enforced, because both are properties of this slice rather than of the document: "exactly one video Track" (a cardinality that a later slice relaxes without a migration) and `sourceInPoint` of zero (which trimming makes false). One finding: `Date.parse` accepts `2026-02-30` and answers with the 2nd of March, so the timestamp check compares the calendar fields against a `Date.UTC` round trip instead of trusting it
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T018, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

Touches the persisted shapes: the Project Document and/or the IndexedDB stores (`projects`, `source-links`). No SQL, no staged migrations (this repository has none).

— `data-model.md §Entities, §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`@cutroom/model` public functions and types.

— `contracts/public-api.md, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-06 — domain invariant

> **Given** any Project
> **When** the user places or moves the Playhead, or the system stores a position on the Timeline
> **Then** the position is a whole Frame; the system never presents or stores a position between two Frames
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement `parseProject` in `packages/model/src/document/parse.ts` rejecting non-integer Frames, overlapping Clips, non-positive durations, invalid Timebase, and anything not structured-clone-safe

## Edge cases

| Case | Behaviour |
|---|---|
| the user places or moves the Playhead, or the system stores a position on the Timeline | the position is a whole Frame; the system never presents or stores a position between two Frames |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
