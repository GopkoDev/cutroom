---
id: T017
title: "Define the Project document types in `packages/model/src/document/types.ts` per data-model.md (Project,…"
layer: "domain"
deps: ["T015"]
blocks: []
acs: ["AC-06"]
files_hint: ["packages/model/src/document/types.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T017 — Define the Project document types in `packages/model/src/document/types.ts` per data-model.md (Project,…

## Place in the sequence

- **Blocked by:** T015 · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Define the Project document types in `packages/model/src/document/types.ts` per data-model.md (Project,….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T017 Define the Project document types in `packages/model/src/document/types.ts` per data-model.md (Project, Source, Timeline, Track, Clip), with Frame values typed as integers and no browser types anywhere — **done**. `Timebase` and `Rational` are imported from `src/timebase.ts` rather than redeclared. TypeScript cannot express "integer", so `Frame` is an alias over `number` documenting the intent, and the guarantee is `parseProject`'s: every value typed `Frame` in a `Project` has been checked. `Project.schemaVersion` is typed `typeof CURRENT_SCHEMA_VERSION`, so the type means "the shape this build understands" rather than "a document of some version". `frameSize` and `dimensions` share one `PixelSize` type — separate identical interfaces would give no extra safety under structural typing, and the field names carry the distinction. `CURRENT_SCHEMA_VERSION` is declared here, beside the shape it describes, and re-exported from `migrate.ts`: it is what stops the document modules importing each other in a circle (see T019)
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T017, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Define the Project document types in `packages/model/src/document/types.ts` per data-model.md (Project, Source, Timeline, Track, Clip), with Frame values typed as integers and no browser types anywhere

## Edge cases

| Case | Behaviour |
|---|---|
| the user places or moves the Playhead, or the system stores a position on the Timeline | the position is a whole Frame; the system never presents or stores a position between two Frames |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
