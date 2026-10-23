---
id: T010
title: "Add placeSourceCommand and make importCommands reuse it"
layer: "domain"
deps: ["T009"]
blocks: ["T011", "T013"]
acs: ["AC-24", "AC-25"]
files_hint: ["packages/model/src/commands/import.ts", "packages/model/src/commands/apply.ts", "packages/model/src/index.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
step: ""
---
# T010 — Add placeSourceCommand and make importCommands reuse it

## Place in the sequence

- **Blocked by:** T009 — Add the add-track and remove-track commands with the two-Track limit · **Blocks:** T011 — Pin Frame accuracy and rule-command pairing with model property tests, T013 — Add the drag-preview slice and retire the open-Gesture save debounce · **Wave:** 8.
- **Lane:** shares files with T002, T003, T004, T005, T006, T007, T008, T009 — serialized.

## Why (user story)

> **As a** User
> **I want** to place an already imported Source on a Track again from the Source list
> **So that** I can bring back a shot I deleted, or use the same Source twice, without importing the file again
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

The model places any Source from the Source list again, at its recorded length, exactly where an import would have put it.

## Inlined context

> placeSourceCommand(project: Project, request: PlaceRequest): AddClipCommand
> PlaceRequest { at, sourceId, clipId }
> Builds the `add-clip` that places the whole Source at the length recorded at import (`framesForDuration(timebase, Source.duration)`, In-point `0`). It goes after the last Clip on `tracks[0]`, the bottom Track (AC-24). It reads nothing from the file, so it works for an Offline Source.
> `importCommands` builds its own `add-clip` with it, so an import and a place cannot disagree on where a whole Source lands.
> It throws `CommandError` with `unknown-source` for an id not in the Project, and `too-short` for a Source shorter than one Frame.
>
> — `contracts/public-api.md` §Place a Source, abridged · full text: [public-api.md](../contracts/public-api.md)

> `add-clip` (step 1) | unchanged | Also refuses a Clip outside its Source now (`source-bounds`)
>
> — `contracts/public-api.md` §Reducer, verbatim · full text: [public-api.md](../contracts/public-api.md)

> SAD §11 notes that `packages/model/src/commands/import.ts` (`placeSourceCommand` reused by `importCommands`) is missing from the §5 changed-paths tree.
>
> — owner's delegation brief, 2026-10-23, abridged

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Clip` | Clip | `sourceInPoint = 0`, after the last Clip on `tracks[0]` | created by `add-clip` |

— `data-model.md` §Clip, which command writes which field, abridged · full text: [data-model.md](../data-model.md)

## API contract

`placeSourceCommand` as quoted above; `add-clip` gains the `source-bounds` refusal.

— `contracts/public-api.md` §Place a Source, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-24 — happy

> **Given** a Source in the Source list, whether or not any Clip still uses it, and whether it is Linked or Offline
> **When** the User places it from the Source list
> **Then** a new Clip showing the whole Source, at the length recorded at import, is added after the last Clip on the bottom Track and becomes the Selection, without reading or importing the file again
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

### AC-25 — authorization

> **Given** a Clip whose Source is Offline because the browser no longer has the User's permission to read it
> **When** the User trims, splits, moves, duplicates or deletes that Clip
> **Then** the edit is made within what was recorded about the Source at import, no permission prompt appears because of it, and the Clip's picture returns only after the User grants access again by their own action
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `placeSourceCommand` and `PlaceRequest` — `packages/model/src/commands/import.ts`; export from the barrel
- [ ] Make `importCommands` build its `add-clip` through it (place on `tracks[0]`, not the first video Track found)
- [ ] Add the Source-bounds refusal to `add-clip` — `apply.ts`
- [ ] Tests: AC-24 on a Project with two Tracks (lands on the bottom one), unused Source, existing import tests unchanged

## Edge cases

| Case | Behaviour |
|---|---|
| Bottom Track empty, upper Track has Clips | Lands at Frame 0 of the bottom Track |
| Source id not in the Project | `unknown-source` |

## Definition of Done

- [ ] Unit tests cover AC-24 and the Offline case (AC-25)
- [ ] All step-1 import tests still pass
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
