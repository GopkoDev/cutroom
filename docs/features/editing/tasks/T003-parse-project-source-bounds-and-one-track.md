---
id: T003
title: "Refuse Clips outside their Source and a Timeline with no Track when a Project loads"
layer: "domain"
deps: []
blocks: ["T011"]
acs: ["AC-02", "AC-22"]
files_hint: ["packages/model/src/document/parse.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
step: ""
---
# T003 — Refuse Clips outside their Source and a Timeline with no Track when a Project loads

## Place in the sequence

- **Blocked by:** nothing · **Blocks:** T011 — Pin Frame accuracy and rule-command pairing with model property tests · **Wave:** 1.
- **Lane:** shares files with T002, T004, T005, T006, T007, T008, T009, T010 — serialized.

## Why (user story)

> **As a** User
> **I want** to drag either end of a Clip to show less of its Source, or more of it, up to the Source's own beginning and end
> **So that** I can remove the part I don't want at the start or the end of a shot, to the exact Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to add a second video Track whose Clips cover the Track below, and remove a Track I no longer need
> **So that** I can put one shot over another, such as a cutaway over a continuous shot
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

A crafted or corrupted Project can never make the Preview or the Export ask for a part of a Source that is not there, and a Project always has a Track to edit.

## Inlined context

> *new* — a Clip stays within its Source: `durationFrames ≤ framesForDuration(timebase, Source.duration − sourceInPoint)` and `sourceInPoint ≤ Source.duration` | Parse + `trim-clip`, `split-clips` (through `editing/limits.ts`) | AC-02, spec §6.1 abuse case
> *new* — a Timeline has at least one Track | Parse + `remove-track` | AC-22
>
> — `data-model.md` §Validation summary, verbatim · full text: [data-model.md](../data-model.md)

> Neither new load check can refuse a Project that step 1 saved: Step 1 sized every Clip with the same `framesForDuration` ceiling at In-point `0`, so it meets the Source-bounds rule exactly (sad §11 risk; pinned by a test that loads step-1 Projects). `create-project` always creates one Track, and step 1 had no way to remove one.
>
> — `data-model.md` §Validation summary, abridged · full text: [data-model.md](../data-model.md)

> Documents saved by the step-1 import of each media fixture (`sync-1080p30.mp4`, `sync-1080p2997.mp4`, `silent-720p24.mp4`) are kept as literals. They must still pass `parseProject` with the new Source-bounds check.
>
> — `data-model.md` §Test fixtures, verbatim · full text: [data-model.md](../data-model.md)

> The new Source-bounds check on load could refuse a step-1 Project if its rule differs from the import's rounding | Medium | The check uses `framesForDuration`, the same ceiling the import used (ADR 0018). Add a test that loads Projects saved by step-1 fixtures
>
> — `sad.md` §11, verbatim · full text: [sad.md](../sad.md)

> A crafted Project Document with overlapping Clips, negative positions or a Clip longer than its Source: refused when the Project is read, as every invariant is checked on load, not only on edit.
>
> — `spec.md` §6.1, abuse cases, verbatim · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Clip.durationFrames` | integer | `≥ 1`; **within its Source** | new load check |
| `Clip.sourceInPoint` | Rational | `≤ Source.duration` | new load check |
| `Timeline.tracks` | `Track[]` | **at least one** | new load check |

— `data-model.md` §Entities, Timeline + Clip, abridged · full text: [data-model.md](../data-model.md)

## API contract

`parseProject` signatures are unchanged. It now also refuses a Clip outside its Source and a Timeline with no Track.

— `contracts/public-api.md` §Document, verbatim · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-02 — domain invariant

> **Given** a Clip that already shows its Source from the Source's first Frame, or up to its last
> **When** the User drags that end further out
> **Then** the end stops at the Source's own beginning or end and goes no further, because a Clip can show only what its Source holds. The Source's beginning is its container time 0 and its end is the duration recorded at import (ADR 0018). For a file whose first picture is stamped later than 0, a head Trim can reach that short stretch before it, where the first picture shows (owner, 2026-10-23)
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — domain invariant

> **Given** a Project with only one video Track
> **When** the User tries to remove it
> **Then** removal is refused and the User is told a Project always keeps at least one Track
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add the Source-bounds check per Clip, using `framesForDuration` and `sourceTimeBefore` from `timebase.ts` only — `packages/model/src/document/parse.ts`
- [ ] Add the at-least-one-Track check — `parse.ts`
- [ ] Messages name the field path and the rule, like every other parse failure
- [ ] Tests: refused documents (Clip past Source end, In-point past duration, zero Tracks); accepted step-1 literals for the three fixtures — `packages/model/test/`

## Edge cases

| Case | Behaviour |
|---|---|
| Clip exactly at the ceiling | Accepted (the import's own rounding) |
| `sourceInPoint` equal to `Source.duration` | Refused: no Frame can start there, so `durationFrames ≥ 1` cannot fit |
| Source with a non-integer frame ratio (29.97) | Same ceiling as the import; step-1 2997 literal still loads |

## Definition of Done

- [ ] Refusal tests for each new rule pass
- [ ] Step-1 fixture Projects still parse
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
