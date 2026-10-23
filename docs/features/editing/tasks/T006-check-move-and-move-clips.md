---
id: T006
title: "Add the checkMove placement rule and the move-clips command"
layer: "domain"
deps: ["T005"]
blocks: ["T007"]
acs: ["AC-06", "AC-07", "AC-08", "AC-09"]
files_hint: ["packages/model/src/editing/placement.ts", "packages/model/src/editing/index.ts", "packages/model/src/commands/index.ts", "packages/model/src/commands/apply.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---
# T006 — Add the checkMove placement rule and the move-clips command

## Place in the sequence

- **Blocked by:** T005 — Add the splitTargets rule and the split-clips command · **Blocks:** T007 — Add the rippleShifts rule and the delete-clips command, plain and ripple · **Wave:** 4.
- **Lane:** shares files with T002, T003, T004, T005, T007, T008, T009, T010 — serialized.

## Why (user story)

> **As a** User
> **I want** to drag one Clip, or several selected Clips together, to another place on the same Track or onto the other Track
> **So that** my shots play in the order I want
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The model moves one or several Clips together, within a Track or onto the other, all or none, and the drag preview asks the same rule.

## Inlined context

> checkMove(project, clipIds: string[], delta: integer, toTrackId: string | null): Verdict
> Verdict { ok: true } | { ok: false, reason: RefusalReason }
> `checkMove` | Every Clip lands at or after Frame 0, overlapping nothing that is not itself moving. With `toTrackId`, every Clip must start on one Track
> The functions are pure and total over a parsed Project. An unknown id is not an exception: `checkMove` answers `{ ok: false, reason: "unknown-clip" }`
>
> — `contracts/public-api.md` §Editing rules, abridged · full text: [public-api.md](../contracts/public-api.md)

> MoveClipsCommand { type: "move-clips", at, clipIds: string[], delta: integer, toTrackId: string | null }
> `move-clips` | `delta` in Frames, which may be negative. `toTrackId` is `null` to keep each Clip on its own Track, or a Track id when every Clip is on one Track | Each Clip keeps its id, so the engine's per-Clip state survives the move. All or none
>
> — `contracts/public-api.md` §Reducer, abridged · full text: [public-api.md](../contracts/public-api.md)

> `invalid` — [...] a two-Track move given a toTrackId
>
> — `contracts/public-api.md` §Refusals, abridged · full text: [public-api.md](../contracts/public-api.md)

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
| `Clip.startFrame` | integer | `≥ 0`, no overlap | written by a move |
| `Track.clips` | Clip[] | ordered by `startFrame` | a Clip moved to the other Track leaves one array for the other |

— `data-model.md` §Clip, which command writes which field, abridged · full text: [data-model.md](../data-model.md)

## API contract

`move-clips` refusals: `overlap`, `before-timeline-start`, `unknown-clip`, `unknown-track`, `invalid`.

— `contracts/public-api.md` §Refusals, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-06 — happy

> **Given** a Track holding Clips A, B and C in that order
> **When** the User drags C into a Gap before A large enough to hold it, and releases
> **Then** the Track plays C, A, B; C starts on the whole Frame where it was dropped; and one undo puts C back where it was
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a drag of one or more Clips in progress
> **When** the dragged Clips would overlap a Clip already on the Track under the pointer, or would start before the Timeline's first Frame
> **Then** while the pointer is there the Timeline shows that the Clips cannot be placed there; releasing there puts every dragged Clip back where it started and records no undo step, because Clips never overlap on a Track
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — happy

> **Given** two video Tracks and a Clip on the lower one
> **When** the User drags it onto the upper Track to a place that is free, and releases
> **Then** the Clip is on the upper Track at that Frame, and the Preview shows it covering whatever the lower Track has there
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — happy

> **Given** several selected Clips, possibly on both Tracks
> **When** the User drags one of them
> **Then** all selected Clips move by the same number of Frames and keep their positions relative to each other; if any one of them cannot be placed, none of them moves (AC-07). A Selection holding Clips on both Tracks moves only along the Tracks, never onto another Track. Dragging a Clip that is not selected makes it the only selected Clip and moves it alone
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `checkMove` — `packages/model/src/editing/placement.ts`, exported
- [ ] Add `MoveClipsCommand` — `commands/index.ts`
- [ ] Implement `move-clips` in `apply.ts`: refuse via `checkMove`; delta 0 and same Track is a no-op; re-sort target Tracks; keep ids
- [ ] Tests: AC-06 reorder into a Gap, AC-07 overlap and before-Frame-0, AC-08 onto the upper Track, AC-09 two-Track Selection along Tracks and refused with `toTrackId`

## Edge cases

| Case | Behaviour |
|---|---|
| Moving Clips overlap only each other's old places | Allowed: moving Clips are excluded from the overlap check |
| Two-Track Selection with `toTrackId` | Refused `invalid` |
| delta 0, `toTrackId` null | No patches (AC-32) |

## Definition of Done

- [ ] Unit tests for `checkMove` and `move-clips` cover AC-06–AC-09
- [ ] Moved Clips keep their ids
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
