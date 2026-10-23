---
id: T012
title: "Cap history at 200 named steps and add the Selection, pruned after undo and redo"
layer: "app"
deps: []
blocks: ["T013"]
acs: ["AC-14", "AC-15", "AC-16", "AC-28"]
files_hint: ["apps/editor/src/store/index.ts", "apps/editor/src/store/selection.ts", "apps/editor/src/store/index.test.ts", "apps/editor/src/store/selection.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---
# T012 — Cap history at 200 named steps and add the Selection, pruned after undo and redo

## Place in the sequence

- **Blocked by:** nothing · **Blocks:** T013 — Add the drag-preview slice and retire the open-Gesture save debounce · **Wave:** 1.
- **Lane:** shares files with T013, T014 — serialized.

## Why (user story)

> **As a** User
> **I want** to select one Clip by clicking it, add or remove Clips with a modifier key, select every Clip at once and clear the Selection
> **So that** I choose exactly which Clips the next edit acts on
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to undo and redo each thing I did, by key and by button, and see what the next undo or redo will take back
> **So that** I can try an edit without being afraid of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Undo and redo name what they act on, history stays bounded, and the next edit never acts on a Clip that is not there.

## Inlined context

> Selection. It is runtime state in the store: never in the Project, never in history. After every undo and redo it is pruned to Clips that exist (AC-15).
>
> — `sad.md` §4, Tactical rules, verbatim · full text: [sad.md](../sad.md)

> History. It keeps 200 entries and drops the oldest. Each entry's label names the Gesture ("Trim", "Ripple delete", "Move 3 Clips"), and the controls show it (AC-16).
>
> — `sad.md` §4, Tactical rules, verbatim · full text: [sad.md](../sad.md)

> Selection | ordered set of Clip ids | Pruned after every undo and redo to Clip ids that exist. Commands never read it; they receive ids
> History | at most 200 entries of `{ label, patches, inversePatches }` | The oldest entry is dropped beyond 200. A Gesture that produces no patches adds no entry. History is empty after every load
>
> — `data-model.md` §Runtime only, abridged · full text: [data-model.md](../data-model.md)

> Undo depth | The last 200 undo steps are kept in a session (the oldest is dropped beyond that), and undo or redo of any single step completes within 100 ms p95 on a heavy Project | Unit test on the store; Playwright timing
>
> — `spec.md` §6, verbatim · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Selection and history are runtime state, never saved (`data-model.md` §Runtime only).

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-14 — happy

> **Given** Clips on two Tracks
> **When** the User clicks one Clip, then adds another with the modifier key, then selects every Clip, then clears the Selection
> **Then** the Timeline marks the selected Clips at each step; and none of these changes is an undo step or makes the Project be saved, because the Selection belongs to the session
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — domain invariant

> **Given** a Selection of several Clips
> **When** the User undoes a Split, a Duplicate or the placing of a Source that created a selected Clip, or redoes a delete of a selected Clip
> **Then** the Selection never names a Clip that is not on the Timeline; edit commands act only on selected Clips that exist
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — happy

> **Given** a Project after a Trim, a move and a Ripple delete
> **When** the User undoes three times, then redoes three times, by key or by button
> **Then** each undo takes back exactly one of those Gestures in reverse order, each redo puts one back, and the interface names the Gesture the next undo and the next redo will act on
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-28 — cross-context

> **Given** a Project after several edits, with undo history
> **When** the User reloads the page, or leaves and comes back
> **Then** the Timeline is exactly as the last Gesture left it, and the undo history is empty, because history belongs to the session while the Project is saved
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Cap `past` at 200, dropping the oldest — `apps/editor/src/store/index.ts`
- [ ] Expose selectors for the next undo and redo labels
- [ ] Write the Selection slice: select one, toggle with modifier, select all, clear, prune — `apps/editor/src/store/selection.ts`; none of these runs a command or saves
- [ ] Prune the Selection after every undo and redo; reset it with the Project on open and close
- [ ] Tests: cap and order, labels, AC-14 (no history, no save), AC-15 prune, AC-28 empty history after open

## Edge cases

| Case | Behaviour |
|---|---|
| 201st Gesture | Oldest entry dropped; undo still works 200 times |
| Undo removes a selected Clip | It leaves the Selection; others stay |
| Select all on two Tracks | Every Clip id on every Track, Timeline order |

## Definition of Done

- [ ] Store unit tests cover the cap, labels, AC-14, AC-15, AC-28
- [ ] Selection changes never call the saver
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
