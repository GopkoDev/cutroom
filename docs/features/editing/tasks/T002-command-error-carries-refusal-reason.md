---
id: T002
title: "Give CommandError a machine-readable refusal reason across every existing refusal"
layer: "domain"
deps: []
blocks: ["T004"]
acs: ["AC-15"]
files_hint: ["packages/model/src/commands/apply.ts", "packages/model/src/commands/import.ts", "packages/model/src/commands/index.ts", "packages/model/src/index.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "done"
step: "COMMIT"
---
# T002 — Give CommandError a machine-readable refusal reason across every existing refusal

## Place in the sequence

- **Blocked by:** nothing · **Blocks:** T004 — Add wholeFramesIn, the trimRange rule and the trim-clip command · **Wave:** 1.
- **Lane:** shares files with T003, T004, T005, T006, T007, T008, T009, T010 — serialized.

## Why (user story)

> **As a** User
> **I want** to undo and redo each thing I did, by key and by button, and see what the next undo or redo will take back
> **So that** I can try an edit without being afraid of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Every edit refusal later in this feature names its reason, so the interface can say why and the agent can act on it.

## Inlined context

> type RefusalReason =
>   | "overlap" | "before-timeline-start" | "too-short" | "source-bounds"
>   | "track-limit" | "last-track" | "nothing-to-split" | "unknown-clip"
>   | "unknown-track" | "unknown-source" | "duplicate-id" | "no-project" | "invalid"
> When a command breaks more than one rule, the reason is the first one checked, in this order: `no-project`, `invalid`, then `unknown-*`, `duplicate-id`, then the editing rules in the order listed.
>
> — `contracts/public-api.md` §Refusals, abridged · full text: [public-api.md](../contracts/public-api.md)

> Every `CommandError` carries a `reason`, including those from step-1 commands and from `importCommands`. The editor maps `reason` to the notice wording (`ui/failure-wording.ts`), and never parses `message`.
>
> — `contracts/public-api.md` §Refusals, Contract, verbatim · full text: [public-api.md](../contracts/public-api.md)

> **Reasons in refusals.** A refusal is a `CommandError` with a machine-readable `reason` [...]. The editor turns the reason into the notice wording. The agent will get the same reasons.
>
> — `ADR 0019` §Decision outcome, abridged · full text: [ADR 0019](../../../adr/0019-edits-are-intent-commands-that-share-their-rules-with-the-preview.md)

> An id that is not on the Timeline is refused with `unknown-clip`. The same id twice in one command is refused with `invalid`.
>
> — `contracts/public-api.md` §Reducer, Contract, verbatim · full text: [public-api.md](../contracts/public-api.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Schema version 1 and IndexedDB version 1 stay as they are (`data-model.md` §intro, verbatim: "No schema change.").

## API contract

```
class CommandError extends Error   // name "CommandError"; message "applyCommand: <type>: <problem>"
  readonly reason: RefusalReason   // NEW — machine-readable; the message stays for people
MAX_VIDEO_TRACKS = 2
```

— `contracts/public-api.md` §Refusals + §Types, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-15 — domain invariant

> **Given** a Selection of several Clips
> **When** the User undoes a Split, a Duplicate or the placing of a Source that created a selected Clip, or redoes a delete of a selected Clip
> **Then** the Selection never names a Clip that is not on the Timeline; edit commands act only on selected Clips that exist
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `RefusalReason` and `MAX_VIDEO_TRACKS` and export them from the barrel — `packages/model/src/commands/index.ts`, `packages/model/src/index.ts`
- [ ] Make `CommandError` take `(reason, message)`; `refuse()` takes the reason — `packages/model/src/commands/apply.ts`
- [ ] Tag every existing refusal: `no-project`, `invalid` (malformed field, bad timestamp, empty id), `unknown-source`, `unknown-track`, `duplicate-id`, `overlap` — `apply.ts`
- [ ] Tag `importCommands` refusals (`too-short`, `invalid`, `unknown-track`) — `packages/model/src/commands/import.ts`
- [ ] Unit tests: one per existing refusal asserting its `reason`; the message format is unchanged

## Edge cases

| Case | Behaviour |
|---|---|
| A command breaks two rules | The reason is the first in the order `no-project`, `invalid`, `unknown-*`, `duplicate-id`, editing rules |
| Existing callers that check `instanceof CommandError` | Still work; `name` stays "CommandError" |

## Definition of Done

- [ ] Every refusal path in `apply.ts` and `import.ts` has a test asserting its `reason`
- [ ] Existing model and editor tests still pass unchanged
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
