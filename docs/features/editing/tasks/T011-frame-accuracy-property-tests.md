---
id: T011
title: "Pin Frame accuracy and rule-command pairing with model property tests"
layer: "tests"
deps: ["T010", "T003"]
blocks: []
acs: ["AC-01", "AC-04", "AC-06", "AC-32"]
files_hint: ["packages/model/test/editing.property.test.ts", "packages/model/package.json"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---
# T011 — Pin Frame accuracy and rule-command pairing with model property tests

## Place in the sequence

- **Blocked by:** T010 — Add placeSourceCommand and make importCommands reuse it, T003 — Refuse Clips outside their Source and a Timeline with no Track when a Project loads · **Blocks:** nothing · **Wave:** 9.
- **Lane:** own lane.

## Why (user story)

> **As a** User
> **I want** to drag either end of a Clip to show less of its Source, or more of it, up to the Source's own beginning and end
> **So that** I can remove the part I don't want at the start or the end of a shot, to the exact Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to split a Clip into two at the Playhead
> **So that** I can remove or move a part in the middle of a shot
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to drag one Clip, or several selected Clips together, to another place on the same Track or onto the other Track
> **So that** my shots play in the order I want
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

Zero one-Frame errors at Edit points is proven over random Timebases, not only for hand-picked cases.

## Inlined context

> *1a — edits land on the exact Frame.* When: a head Trim by N Frames, a Split, or a move, over random Timebases and Source Timebases. Then: "Zero one-Frame errors [...] in 100% of model test cases." How verify: model property tests (Vitest) over random Timebases, Source Timebases, In-points and offsets. They assert `frameToSourceTime` equality before and after each command, and that every result passes `parseProject`.
>
> — `sad.md` §10, QG-1a, abridged · full text: [sad.md](../sad.md)

> `applyCommand` refuses exactly when the matching function says no. A command built from a `trimRange` Frame, a `checkMove` verdict of `ok`, a `duplicateDelta` or a `splitTargets` cut is never refused for an editing rule. Property tests pin this pairing.
>
> — `contracts/public-api.md` §Editing rules, Contract, verbatim · full text: [public-api.md](../contracts/public-api.md)

> Generators for random Project Timebases, Source Timebases, In-points and Frame offsets. They assert that a head Trim by N, a Split and a move land on the same Source time through `frameToSourceTime`, and that every result passes `parseProject` (QG-1a).
>
> — `data-model.md` §Test fixtures, verbatim · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Schema version 1 and IndexedDB version 1 stay as they are (`data-model.md` §intro, verbatim: "No schema change.").

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy

> **Given** a Clip on a Track with Gaps on both sides and more of its Source available before and after it
> **When** the User drags its tail end to the left by some Frames, and then its head end to the right by some Frames
> **Then** the Clip ends that many Frames earlier and starts that many Frames later; the Preview shows, at the Clip's new first Frame, exactly the Source Frame that was that many Frames into the Clip before; and no other Clip on any Track has moved
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — happy

> **Given** a selected Clip with the Playhead strictly inside it, not on its first Frame
> **When** the User splits
> **Then** the Clip becomes two Clips that meet at the Playhead; playing across the new Edit point shows and sounds exactly as before the Split, with no Frame repeated or lost; and the second Clip is selected
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy

> **Given** a Track holding Clips A, B and C in that order
> **When** the User drags C into a Gap before A large enough to hold it, and releases
> **Then** the Track plays C, A, B; C starts on the whole Frame where it was dropped; and one undo puts C back where it was
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-32 — domain invariant

> **Given** a Gesture that would leave the Project unchanged, such as a Clip dropped where it started, a Trim already at its limit, or a delete or Duplicate with nothing selected
> **When** the User completes it
> **Then** no undo step is recorded and nothing is saved, and the undo control still names the Gesture before it
>
> — `spec.md §5, AC-32, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add a property-testing dev dependency if none exists (e.g. `fast-check`) — `packages/model/package.json`
- [ ] Generators: Timebases (incl. 30000/1001), Source Timebases, In-points, offsets, small two-Track Projects
- [ ] Properties: head Trim by N, Split at k, move by d land on the same Source time; results parse; rule-approved commands are never refused; no-op commands give empty patches
- [ ] Keep the run under a few seconds in `pnpm test`

## Edge cases

| Case | Behaviour |
|---|---|
| Non-integer frame ratios | Covered by the generator |
| No-op Gesture | Empty patches (AC-32) |

## Definition of Done

- [ ] Property tests pass at default run count in `pnpm test`
- [ ] A deliberately off-by-one head Trim makes them fail (checked once locally)
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
