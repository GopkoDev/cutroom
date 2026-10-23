---
id: T008
title: "Add the duplicateDelta rule and the duplicate-clips command"
layer: "domain"
deps: ["T007"]
blocks: ["T009"]
acs: ["AC-12", "AC-13"]
files_hint: ["packages/model/src/editing/placement.ts", "packages/model/src/editing/index.ts", "packages/model/src/commands/index.ts", "packages/model/src/commands/apply.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "done"
step: "COMMIT"
---
# T008 — Add the duplicateDelta rule and the duplicate-clips command

## Place in the sequence

- **Blocked by:** T007 — Add the rippleShifts rule and the delete-clips command, plain and ripple · **Blocks:** T009 — Add the add-track and remove-track commands with the two-Track limit · **Wave:** 6.
- **Lane:** shares files with T002, T003, T004, T005, T006, T007, T009, T010 — serialized.

## Why (user story)

> **As a** User
> **I want** to duplicate the selected Clips
> **So that** I can reuse a shot without bringing its Source in again
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

The model copies the selected Clips as one block, directly after them when there is room and after the last Clip otherwise, never over a Clip.

## Inlined context

> duplicateDelta(project, clipIds: string[]): integer   // the Frame offset of the block of copies
> `duplicateDelta` | It returns `end of the Selection − start of the Selection` when every Track the Selection spans has room there. Otherwise it returns the offset that places the block after the last Clip on those Tracks
>
> — `contracts/public-api.md` §Editing rules, abridged · full text: [public-api.md](../contracts/public-api.md)

> DuplicateClipsCommand { type: "duplicate-clips", at, delta: integer, copies: { clipId, newClipId }[] }
> `duplicate-clips` | `delta` is the Frame offset of the block from the originals. Each copy has the same Track, Source, In-point and length as its original | All copies are placed, or the command is refused
>
> — `contracts/public-api.md` §Reducer, abridged · full text: [public-api.md](../contracts/public-api.md)

> **Whole or refused.** A command either applies in full, in one `produceWithPatches`, or throws `CommandError` before anything is written. A move, Duplicate or Split of several Clips never applies to some of them.
> **No change, no patches.** A command that would change nothing returns the Project unchanged, with empty `patches` and `inversePatches`. [...] The store records no history entry and no save for it (AC-32). This is not a refusal.
> **The target is exact.** The reducer refuses a target that breaks a rule rather than moving it to the nearest valid one.
> **No Source is read.** Every bound comes from `Source.duration` as recorded at import, so every command works the same on an Offline Source (AC-25).
>
> — `contracts/public-api.md` §Reducer, Contract, abridged · full text: [public-api.md](../contracts/public-api.md)

> `applyCommand` refuses exactly when the matching function says no. A command built from a `trimRange` Frame, a `checkMove` verdict of `ok`, a `duplicateDelta` or a `splitTargets` cut is never refused for an editing rule. Property tests pin this pairing.
>
> — `contracts/public-api.md` §Editing rules, Contract, verbatim · full text: [public-api.md](../contracts/public-api.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Clip` (copy) | Clip | new id, same `sourceId`, `sourceInPoint`, `durationFrames` | created |

— `data-model.md` §Clip, which command writes which field, abridged · full text: [data-model.md](../data-model.md)

## API contract

`duplicate-clips` refusals: `overlap`, `unknown-clip`, `duplicate-id`, `invalid`.

— `contracts/public-api.md` §Refusals, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-12 — happy

> **Given** a selected Clip with a Gap after it at least as long as the Clip
> **When** the User duplicates it
> **Then** a copy showing the same part of the same Source is placed directly after the original, and the copy becomes the Selection. With several Clips selected, the copies keep their positions relative to each other and are placed as one block directly after the end of the Selection, in one Gesture
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — domain invariant

> **Given** a selected Clip with no room directly after it
> **When** the User duplicates it
> **Then** the copy is placed after the last Clip on that Track instead of over the next Clip, because Clips never overlap on a Track. A block of several copies goes after the last Clip on the Tracks it spans when any one of those Tracks lacks room directly after the Selection
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `duplicateDelta` beside `checkMove` — `packages/model/src/editing/placement.ts`
- [ ] Add `DuplicateClipsCommand` — `commands/index.ts`
- [ ] Implement `duplicate-clips` in `apply.ts`, all copies or refused
- [ ] Tests: AC-12 one Clip and a block, AC-13 no room on one Track of a two-Track block, empty list no-op

## Edge cases

| Case | Behaviour |
|---|---|
| Room on one Track, not the other | Block goes after the last Clip on both Tracks (AC-13) |
| Selection with a Gap inside it | Copies keep the Gap (relative positions kept) |

## Definition of Done

- [ ] Unit tests for `duplicateDelta` and `duplicate-clips` cover AC-12 and AC-13
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
