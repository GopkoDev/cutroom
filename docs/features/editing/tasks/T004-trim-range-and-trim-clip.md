---
id: T004
title: "Add wholeFramesIn, the trimRange rule and the trim-clip command"
layer: "domain"
deps: ["T002"]
blocks: ["T005"]
acs: ["AC-01", "AC-02", "AC-03", "AC-25"]
files_hint: ["packages/model/src/timebase.ts", "packages/model/src/editing/limits.ts", "packages/model/src/editing/index.ts", "packages/model/src/commands/index.ts", "packages/model/src/commands/apply.ts", "packages/model/src/index.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---
# T004 — Add wholeFramesIn, the trimRange rule and the trim-clip command

## Place in the sequence

- **Blocked by:** T002 — Give CommandError a machine-readable refusal reason across every existing refusal · **Blocks:** T005 — Add the splitTargets rule and the split-clips command · **Wave:** 2.
- **Lane:** shares files with T002, T003, T005, T006, T007, T008, T009, T010 — serialized.

## Why (user story)

> **As a** User
> **I want** to drag either end of a Clip to show less of its Source, or more of it, up to the Source's own beginning and end
> **So that** I can remove the part I don't want at the start or the end of a shot, to the exact Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

The model can trim a Clip from either end to the exact Frame, and tells the Timeline where each edge must stop.

## Inlined context

> wholeFramesIn(timebase, duration: Rational): integer   // whole Frames that fit in `duration`: rounds DOWN, the opposite of framesForDuration
> It throws a `RangeError` on invalid input, like every other Timebase function.
> | Head Trim later by `n` | `frameToSourceTime(timebase, inPoint, n)` |
> | Head Trim earlier by `n` | `sourceTimeBefore(inPoint, frameToSourceTime(timebase, {0,1}, n))` |
>
> — `contracts/public-api.md` §Timebase, abridged · full text: [public-api.md](../contracts/public-api.md)

> `trimRange` | `head`: no earlier than Frame 0, the end of the Clip before it on the Track, or `startFrame − wholeFramesIn(timebase, inPoint)`, whichever is latest; no later than one Frame before the Clip's end. `tail`: no earlier than one Frame after `startFrame`; no later than the next Clip's start, or `startFrame + framesForDuration(timebase, sourceTimeBefore(Source.duration, inPoint))`, whichever is earliest
>
> — `contracts/public-api.md` §Editing rules, verbatim · full text: [public-api.md](../contracts/public-api.md)

> TrimClipCommand { type: "trim-clip", at, clipId, edge: "head" | "tail", frame: Frame }
> `trim-clip` | `frame` is where the edge goes: for `head`, the new `startFrame`; for `tail`, the new end, `startFrame + durationFrames` (exclusive) | A head Trim moves the In-point by the same number of Frames (§Timebase). A tail Trim changes only `durationFrames`
>
> — `contracts/public-api.md` §Reducer, abridged · full text: [public-api.md](../contracts/public-api.md)

> The In-point changes only through `frameToSourceTime`. A head Trim by `n` Frames sets the In-point to `frameToSourceTime(timebase, inPoint, n)`. [...] Both are exact ratios, so "the first Frame after a head Trim by N is the Frame that was N Frames in" holds by construction rather than by rounding.
>
> — `ADR 0018` §Decision outcome, abridged · full text: [ADR 0018](../../../adr/0018-the-in-point-stays-in-container-presentation-time.md)

> **Whole or refused.** A command either applies in full, in one `produceWithPatches`, or throws `CommandError` before anything is written. A move, Duplicate or Split of several Clips never applies to some of them.
> **No change, no patches.** A command that would change nothing returns the Project unchanged, with empty `patches` and `inversePatches`. [...] The store records no history entry and no save for it (AC-32). This is not a refusal.
> **The target is exact.** The reducer refuses a target that breaks a rule rather than moving it to the nearest valid one.
> **No Source is read.** Every bound comes from `Source.duration` as recorded at import, so every command works the same on an Offline Source (AC-25).
>
> — `contracts/public-api.md` §Reducer, Contract, abridged · full text: [public-api.md](../contracts/public-api.md)

> `applyCommand` refuses exactly when the matching function says no. A command built from a `trimRange` Frame, a `checkMove` verdict of `ok`, a `duplicateDelta` or a `splitTargets` cut is never refused for an editing rule. Property tests pin this pairing.
>
> — `contracts/public-api.md` §Editing rules, Contract, verbatim · full text: [public-api.md](../contracts/public-api.md)

> Frame accuracy | Zero one-Frame errors: a head Trim by N Frames, a Split and a move each land on exactly the expected Source Frame in 100% of model test cases | Model property tests over random Timebases and Source Timebases
>
> — `spec.md` §6, verbatim · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Clip.startFrame` | integer | `≥ 0` | written by a head Trim |
| `Clip.durationFrames` | integer | `≥ 1`, within its Source | written by both Trims |
| `Clip.sourceInPoint` | Rational | container time (ADR 0018) | written by a head Trim only |

— `data-model.md` §Clip, which command writes which field, abridged · full text: [data-model.md](../data-model.md)

## API contract

`trimRange(project, clipId, edge): TrimRange { earliest, latest }` (inclusive, current Frame always inside); `trim-clip` refusals: `unknown-clip`, `invalid`, `overlap`, `before-timeline-start`, `too-short`, `source-bounds`.

— `contracts/public-api.md` §Editing rules + §Refusals, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-01 — happy

> **Given** a Clip on a Track with Gaps on both sides and more of its Source available before and after it
> **When** the User drags its tail end to the left by some Frames, and then its head end to the right by some Frames
> **Then** the Clip ends that many Frames earlier and starts that many Frames later; the Preview shows, at the Clip's new first Frame, exactly the Source Frame that was that many Frames into the Clip before; and no other Clip on any Track has moved
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — domain invariant

> **Given** a Clip that already shows its Source from the Source's first Frame, or up to its last
> **When** the User drags that end further out
> **Then** the end stops at the Source's own beginning or end and goes no further, because a Clip can show only what its Source holds. The Source's beginning is its container time 0 and its end is the duration recorded at import (ADR 0018). For a file whose first picture is stamped later than 0, a head Trim can reach that short stretch before it, where the first picture shows (owner, 2026-10-23)
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — domain invariant

> **Given** a Clip with another Clip directly against one end, a Clip that starts on the Timeline's first Frame, or a Clip being trimmed to almost nothing
> **When** the User drags that end into the neighbour, its head before the Timeline's first Frame, or past the Clip's other end
> **Then** the end stops at the neighbour's edge, at the Timeline's first Frame, or one Frame short of the other end; Clips never overlap on a Track, nothing starts before the Timeline's first Frame, and a Clip is never shorter than one Frame
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-25 — authorization

> **Given** a Clip whose Source is Offline because the browser no longer has the User's permission to read it
> **When** the User trims, splits, moves, duplicates or deletes that Clip
> **Then** the edit is made within what was recorded about the Source at import, no permission prompt appears because of it, and the Clip's picture returns only after the User grants access again by their own action
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `wholeFramesIn` beside `framesForDuration`, with unit tests for exact and non-exact durations — `packages/model/src/timebase.ts`
- [ ] Write `trimRange` — `packages/model/src/editing/limits.ts`; export via `editing/index.ts` and the barrel
- [ ] Add `TrimClipCommand` to the union — `commands/index.ts`
- [ ] Implement `trim-clip` in `apply.ts`: refuse via `trimRange` with the matching reason; no-op when the Frame equals the current edge; `retimeTimeline`
- [ ] Tests: AC-01 to AC-03 cases, a Clip of an Offline Source (no handle involved), every result passes `parseProject`

## Edge cases

| Case | Behaviour |
|---|---|
| Head Trim at Frame 0 with In-point > 0 | Edge stops at Frame 0 (`before-timeline-start` if commanded past) |
| Trim to the current Frame | No patches, not a refusal (AC-32) |
| Tail Trim into the next Clip | Refused `overlap`; `trimRange.latest` is the neighbour's start |
| Trim to zero length | Refused `too-short`; range stops one Frame short |
| Source end not on a Frame boundary | Tail limit uses the import's ceiling rule |

## Definition of Done

- [ ] Unit tests for `wholeFramesIn`, `trimRange` and `trim-clip` pass, covering AC-01–AC-03 and AC-25
- [ ] Every `trim-clip` result passes `parseProject`
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
