---
id: T007
title: "Add the rippleShifts rule and the delete-clips command, plain and ripple"
layer: "domain"
deps: ["T006"]
blocks: ["T008"]
acs: ["AC-10", "AC-11"]
files_hint: ["packages/model/src/editing/ripple.ts", "packages/model/src/editing/index.ts", "packages/model/src/commands/index.ts", "packages/model/src/commands/apply.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
step: ""
---
# T007 — Add the rippleShifts rule and the delete-clips command, plain and ripple

## Place in the sequence

- **Blocked by:** T006 — Add the checkMove placement rule and the move-clips command · **Blocks:** T008 — Add the duplicateDelta rule and the duplicate-clips command · **Wave:** 5.
- **Lane:** shares files with T002, T003, T004, T005, T006, T008, T009, T010 — serialized.

## Why (user story)

> **As a** User
> **I want** to delete the selected Clips either leaving a Gap where they were or with a Ripple delete that pulls everything after them back
> **So that** what I don't want is gone, with or without the empty space it leaves
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

The model removes the selected Clips, either leaving the Gap or closing it per Track.

## Inlined context

> rippleShifts(project, clipIds: string[]): { clipId, delta: integer }[]   // how far each later Clip moves back
> `rippleShifts` | Per Track, each Clip after a deleted one moves back by the total length deleted before it on its own Track. Clips on other Tracks get no entry
>
> — `contracts/public-api.md` §Editing rules, abridged · full text: [public-api.md](../contracts/public-api.md)

> DeleteClipsCommand { type: "delete-clips", at, clipIds: string[], ripple: boolean }
> `delete-clips` | Without `ripple`, it removes the Clips. With `ripple`, every later Clip on the same Track moves back by the total length deleted before it on that Track. Each Track is closed separately
>
> — `contracts/public-api.md` §Reducer, abridged · full text: [public-api.md](../contracts/public-api.md)

> **Whole or refused.** A command either applies in full, in one `produceWithPatches`, or throws `CommandError` before anything is written. A move, Duplicate or Split of several Clips never applies to some of them.
> **No change, no patches.** A command that would change nothing returns the Project unchanged, with empty `patches` and `inversePatches`. [...] The store records no history entry and no save for it (AC-32). This is not a refusal.
> **The target is exact.** The reducer refuses a target that breaks a rule rather than moving it to the nearest valid one.
> **No Source is read.** Every bound comes from `Source.duration` as recorded at import, so every command works the same on an Offline Source (AC-25).
>
> — `contracts/public-api.md` §Reducer, Contract, abridged · full text: [public-api.md](../contracts/public-api.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Track.clips` | Clip[] | | Clips removed |
| `Clip.startFrame` | integer | `≥ 0` | with `ripple`, every later Clip on the same Track |
| `Timeline.durationFrames` | integer | max Clip end | recomputed (can shorten) |

— `data-model.md` §Clip + §Timeline, abridged · full text: [data-model.md](../data-model.md)

## API contract

`delete-clips` refusals: `unknown-clip`, `invalid` (repeated id). An empty list is a no-op, not a refusal.

— `contracts/public-api.md` §Reducer, Contract, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-10 — happy

> **Given** a Track holding Clips A, B and C, with B selected
> **When** the User deletes B
> **Then** B is gone, A and C stay exactly where they were, and a Gap the length of B is left between them, which plays as black and silent where no other Track has a Clip
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy

> **Given** a Track holding Clips A, B and C, with B selected, and a second Track with Clips of its own
> **When** the User makes a Ripple delete of B
> **Then** B is gone and C, with everything after it on the same Track, moves back by B's length; Clips on the other Track do not move; and one undo restores B and puts every moved Clip back. With several Clips selected, each Track closes its own Gaps: every later Clip moves back by the total length deleted before it on its own Track, in one Gesture
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `rippleShifts` — `packages/model/src/editing/ripple.ts`, exported
- [ ] Add `DeleteClipsCommand` — `commands/index.ts`
- [ ] Implement `delete-clips` in `apply.ts`; `retimeTimeline`
- [ ] Tests: AC-10 Gap left, AC-11 single and several Clips on two Tracks, empty list no-op, last Clip deleted shortens the Timeline

## Edge cases

| Case | Behaviour |
|---|---|
| Several Clips with a Clip between them kept | Kept Clip moves back by what was deleted before it only |
| Ripple on one Track | Other Track's Clips do not move |
| Empty `clipIds` | No patches (AC-32) |

## Definition of Done

- [ ] Unit tests for `rippleShifts` and `delete-clips` cover AC-10 and AC-11
- [ ] One undo (inverse patches) restores every moved Clip
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
