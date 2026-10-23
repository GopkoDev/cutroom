---
id: T013
title: "Add the drag-preview slice and retire the open-Gesture save debounce"
layer: "app"
deps: ["T012", "T010"]
blocks: ["T014"]
acs: ["AC-07", "AC-17", "AC-18", "AC-19"]
files_hint: ["apps/editor/src/store/drag.ts", "apps/editor/src/store/drag.test.ts", "apps/editor/src/store/index.ts", "apps/editor/src/storage/projects.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---
# T013 — Add the drag-preview slice and retire the open-Gesture save debounce

## Place in the sequence

- **Blocked by:** T012 — Cap history at 200 named steps and add the Selection, pruned after undo and redo, T010 — Add placeSourceCommand and make importCommands reuse it · **Blocks:** T014 — Write one store function per Gesture, stopping Playback first, with refusal wording · **Wave:** 9.
- **Lane:** shares files with T012, T014 — serialized.

## Why (user story)

> **As a** User
> **I want** to drag one Clip, or several selected Clips together, to another place on the same Track or onto the other Track
> **So that** my shots play in the order I want
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to undo and redo each thing I did, by key and by button, and see what the next undo or redo will take back
> **So that** I can try an edit without being afraid of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

A drag shows where Clips would land, or that they cannot, without touching the Project, and the Project changes once on release.

## Inlined context

> **Start.** A press on a Clip becomes a drag once the pointer moves past a few pixels. The editor then stops Playback if it is running (AC-31) and opens a drag preview. It does not open a transaction. [...]
> **Pointer moves.** These update only the preview, which asks the model's rule functions (ADR 0019) where the Clips can land or where the edge stops. The Project, the Scene and the engine are untouched [...].
> **Release.** If the preview can land and differs from the start, one `transact(label, …)` applies one command. That is one history entry and one save, written at once under ADR 0011's finished-Gesture rule. Escape, a refused release or an unchanged release drops the preview and touches nothing.
> While a drag preview is open, undo and redo are unavailable (AC-18) [...].
> The open-Gesture debounce in `apps/editor/src/storage/projects.ts` is removed with this change.
>
> — `ADR 0020` §Decision outcome, abridged · full text: [ADR 0020](../../../adr/0020-a-drag-is-a-preview-and-the-project-changes-once-on-release.md)

> Drag preview | the dragged Clip ids, the edge or body grip, the Frame delta, the target Track, and the rule's verdict (can land / reason) | Exists only while a drag is open. Escape or a refused release discards it. While it is open, undo and redo are unavailable
>
> — `data-model.md` §Runtime only, verbatim · full text: [data-model.md](../data-model.md)

> Drag preview (*new*) | Runtime state beside the Project. Never saved, never in history, never posted to the engine. Undo and redo are unavailable while one is open
>
> — `sad.md` §8, verbatim · full text: [sad.md](../sad.md)

> The drag budget depends on subscription discipline (ADR 0021): one Clip element subscribing to the whole Project re-renders every Clip
>
> — `sad.md` §11, verbatim · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. The save path changes: no write while a drag is open, one write on release (ADR 0020).

## API contract

Calls `trimRange` and `checkMove` from `@cutroom/model` on every pointer move; sends one `trim-clip` or `move-clips` on release.

— `contracts/public-api.md` §Editing rules, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-07 — domain invariant

> **Given** a drag of one or more Clips in progress
> **When** the dragged Clips would overlap a Clip already on the Track under the pointer, or would start before the Timeline's first Frame
> **Then** while the pointer is there the Timeline shows that the Clips cannot be placed there; releasing there puts every dragged Clip back where it started and records no undo step, because Clips never overlap on a Track
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — domain invariant

> **Given** a drag that passed through many positions before it was released
> **When** the User undoes once
> **Then** the Clip is back where the drag began, not at an intermediate position, because a Gesture is one undo step. Before the undo, the saved Project held only the drag's end position and never an intermediate one; after the undo, it holds the position where the drag began
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — error

> **Given** a drag still in progress, or nothing left to undo or redo
> **When** the User asks for undo or redo
> **Then** nothing changes; the undo and redo controls show that they are not available, rather than taking back half a Gesture or failing silently
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy

> **Given** a drag in progress
> **When** the User presses Escape before releasing
> **Then** the dragged Clips return to where they started, no undo step is recorded, and the saved Project is as it was before the drag
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write the slice: `openTrim`, `openMove`, `moveTo(frameDelta, trackId)`, `release()`, `cancel()` — `apps/editor/src/store/drag.ts`
- [ ] Trim: clamp the edge into `trimRange`; move: store the `checkMove` verdict and reason
- [ ] Release: if allowed and changed, one `transact(label, command)`; else nothing
- [ ] Make `canUndo`/`canRedo` false while a drag is open — `store/index.ts`
- [ ] Remove the open-Gesture debounce — `apps/editor/src/storage/projects.ts`; finished Gestures still write at once
- [ ] Tests: AC-07 refused verdict and refused release, AC-17 one entry and one save, AC-18, AC-19 Escape

## Edge cases

| Case | Behaviour |
|---|---|
| Release at the start position | No command, no history, no save (AC-32) |
| Undo pressed mid-drag | Unavailable, nothing changes (AC-18) |
| Reload mid-drag | Stored Project is the one before the drag |

## Definition of Done

- [ ] Unit tests cover AC-07, AC-17, AC-18, AC-19
- [ ] No save happens during an open drag (saver spy)
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
