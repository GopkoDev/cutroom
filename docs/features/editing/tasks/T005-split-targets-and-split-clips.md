---
id: T005
title: "Add the splitTargets rule and the split-clips command"
layer: "domain"
deps: ["T004"]
blocks: ["T006"]
acs: ["AC-04", "AC-05", "AC-29"]
files_hint: ["packages/model/src/editing/split.ts", "packages/model/src/editing/index.ts", "packages/model/src/commands/index.ts", "packages/model/src/commands/apply.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "done"
step: "COMMIT"
---
# T005 — Add the splitTargets rule and the split-clips command

## Place in the sequence

- **Blocked by:** T004 — Add wholeFramesIn, the trimRange rule and the trim-clip command · **Blocks:** T006 — Add the checkMove placement rule and the move-clips command · **Wave:** 3.
- **Lane:** shares files with T002, T003, T004, T006, T007, T008, T009, T010 — serialized.

## Why (user story)

> **As a** User
> **I want** to split a Clip into two at the Playhead
> **So that** I can remove or move a part in the middle of a shot
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

The model cuts the right Clips at the Playhead without losing or repeating a Frame, and says why when there is nothing to cut.

## Inlined context

> splitTargets(project, frame: Frame, selectedClipIds: string[]): SplitTargets
> SplitTargets { kind: "cut", clipIds: string[] } | { kind: "none", because: "selection-not-under-frame" | "nothing-under-frame" }
> `splitTargets` | With a Selection, the selected Clips that `frame` is strictly inside. With none, every Clip strictly under `frame` on every Track. `because` tells the two empty cases apart for the notice
> `splitTargets`' `kind: "none"` is not a refusal. The editor shows the notice and sends no command (AC-05).
>
> — `contracts/public-api.md` §Editing rules, abridged · full text: [public-api.md](../contracts/public-api.md)

> SplitClipsCommand { type: "split-clips", at, frame: Frame, cuts: { clipId, newClipId }[] }
> `split-clips` | `frame` is the Playhead. Each cut names a Clip that `frame` is strictly inside, and the id of its second half | The first half ends at `frame`, and the second half starts there with the In-point advanced by `frame − startFrame`. Both halves keep the Source
> | Split at offset `k` into the Clip (second half) | `frameToSourceTime(timebase, inPoint, k)` |
>
> — `contracts/public-api.md` §Reducer + §Timebase, abridged · full text: [public-api.md](../contracts/public-api.md)

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
| `Clip` (second half) | Clip | new id from the caller | created |
| `Clip.durationFrames` (first half) | integer | `≥ 1` | written |
| `Clip.sourceInPoint` (second half) | Rational | advanced by the offset | written |

— `data-model.md` §Clip, which command writes which field, abridged · full text: [data-model.md](../data-model.md)

## API contract

`split-clips` refusals: `nothing-to-split` (a cut whose Clip `frame` is not strictly inside), `unknown-clip`, `duplicate-id`, `invalid`.

— `contracts/public-api.md` §Refusals, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-04 — happy

> **Given** a selected Clip with the Playhead strictly inside it, not on its first Frame
> **When** the User splits
> **Then** the Clip becomes two Clips that meet at the Playhead; playing across the new Edit point shows and sounds exactly as before the Split, with no Frame repeated or lost; and the second Clip is selected
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — error

> **Given** either a Selection none of whose Clips the Playhead is strictly inside, or no Selection and no Clip on any Track that the Playhead is strictly inside (it is in a Gap or on a Clip's first Frame)
> **When** the User splits
> **Then** nothing changes, no undo step is recorded, and the User is told why: no selected Clip is under the Playhead, or no Clip is under the Playhead at all
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-29 — happy

> **Given** no Selection, and the Playhead strictly inside a Clip on each of the two Tracks
> **When** the User splits
> **Then** every Clip under the Playhead, on every Track, becomes two Clips meeting at the Playhead, in one Gesture that one undo takes back; the second halves are selected
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `splitTargets` — `packages/model/src/editing/split.ts`, exported
- [ ] Add `SplitClipsCommand` — `commands/index.ts`
- [ ] Implement `split-clips` in `apply.ts`, all cuts or none; insert second halves keeping each Track ordered
- [ ] Tests: AC-04, AC-05 (both `because` values), AC-29 (two Tracks), Playhead on a Clip's first Frame, results pass `parseProject`

## Edge cases

| Case | Behaviour |
|---|---|
| Playhead on a Clip's first Frame | Not strictly inside: `nothing-under-frame` with no Selection |
| Selection exists, Playhead inside an unselected Clip only | `selection-not-under-frame` |
| Same Clip twice in `cuts` | Refused `invalid` |

## Definition of Done

- [ ] Unit tests for `splitTargets` and `split-clips` cover AC-04, AC-05, AC-29
- [ ] Each half's Source time is exact (ADR 0018)
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
