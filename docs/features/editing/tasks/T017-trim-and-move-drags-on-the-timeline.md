---
id: T017
title: "Drive Trim and move drags from Clip handles and bodies through the drag slice"
layer: "ui"
deps: ["T016"]
blocks: ["T018"]
acs: ["AC-01", "AC-02", "AC-03", "AC-06", "AC-07", "AC-08", "AC-09", "AC-17", "AC-19", "AC-25", "AC-31"]
files_hint: ["apps/editor/src/ui/timeline/", "apps/editor/e2e/editing-drag.spec.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---
# T017 — Drive Trim and move drags from Clip handles and bodies through the drag slice

## Place in the sequence

- **Blocked by:** T016 — Rebuild the Timeline as Track rows of selectable Clip views with Track headers · **Blocks:** T018 — Add the edit toolbar, named Undo and Redo, keyboard shortcuts and the Place action · **Wave:** 12.
- **Lane:** shares files with T016, T018 — serialized.

## Why (user story)

> **As a** User
> **I want** to drag either end of a Clip to show less of its Source, or more of it, up to the Source's own beginning and end
> **So that** I can remove the part I don't want at the start or the end of a shot, to the exact Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to drag one Clip, or several selected Clips together, to another place on the same Track or onto the other Track
> **So that** my shots play in the order I want
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

The User trims and moves Clips by dragging, sees refusals while the pointer is still there, and Escape undoes the drag.

## Inlined context

> **Start.** A press on a Clip becomes a drag once the pointer moves past a few pixels. The editor then stops Playback if it is running (AC-31) and opens a drag preview. It does not open a transaction. [...]
> **Pointer moves.** These update only the preview, which asks the model's rule functions (ADR 0019) where the Clips can land or where the edge stops. The Project, the Scene and the engine are untouched [...].
> **Release.** If the preview can land and differs from the start, one `transact(label, …)` applies one command. That is one history entry and one save, written at once under ADR 0011's finished-Gesture rule. Escape, a refused release or an unchanged release drops the preview and touches nothing.
> While a drag preview is open, undo and redo are unavailable (AC-18) [...].
> The open-Gesture debounce in `apps/editor/src/storage/projects.ts` is removed with this change.
>
> — `ADR 0020` §Decision outcome, abridged · full text: [ADR 0020](../../../adr/0020-a-drag-is-a-preview-and-the-project-changes-once-on-release.md)

> The Timeline lives in `apps/editor/src/ui/timeline/`. A Track renders its Clips as elements positioned in Frames times the zoom (fixed in this step [...]). The drag preview is held in its own small slice of the store (ADR 0020). Clip elements subscribe only to their own Clip and to whether they are part of the open drag, so a pointer move re-renders the dragged Clips and nothing else. Every Clip carries `data-testid` and an `aria-label` naming its Source and position.
>
> — `ADR 0021` §Decision outcome, verbatim · full text: [ADR 0021](../../../adr/0021-the-timeline-is-dom-and-a-drag-re-renders-only-the-dragged-clips.md)

> trim-drag | A head or tail handle is pressed and moved. The edge follows the pointer on whole Frames (AC-01). Playback stops first (AC-31)
> trim-held | The edge reaches a limit from `trimRange` [...]. It stays there, and the held edge shows a limit mark (AC-02, AC-03)
> move-drag (allowed) | [...] Every dragged Clip shows a ghost at its target on this Track or the other, on whole Frames, and the originals are dimmed [...]
> validation (move refused) | [...] The ghosts get a destructive outline and the cursor shows not-allowed while the pointer is there (AC-07, AC-09)
> drag-cancelled | Escape, a release while refused, or a release where nothing moved. Every Clip is back where it started, with no undo step and no save
>
> — `screens.md` SCR-02, abridged · full text: [screens.md](../screens.md)

> Drag feedback | During a move or Trim drag on a heavy Project, the Clip follows the pointer within one display frame (≤ 16.7 ms p95 per pointer move)
>
> — `spec.md` §6, verbatim · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. One save on release, none during the drag (ADR 0020).

## API contract

Internal — no API surface.

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

### AC-17 — domain invariant

> **Given** a drag that passed through many positions before it was released
> **When** the User undoes once
> **Then** the Clip is back where the drag began, not at an intermediate position, because a Gesture is one undo step. Before the undo, the saved Project held only the drag's end position and never an intermediate one; after the undo, it holds the position where the drag began
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy

> **Given** a drag in progress
> **When** the User presses Escape before releasing
> **Then** the dragged Clips return to where they started, no undo step is recorded, and the saved Project is as it was before the drag
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-25 — authorization

> **Given** a Clip whose Source is Offline because the browser no longer has the User's permission to read it
> **When** the User trims, splits, moves, duplicates or deletes that Clip
> **Then** the edit is made within what was recorded about the Source at import, no permission prompt appears because of it, and the Clip's picture returns only after the User grants access again by their own action
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

### AC-31 — cross-context

> **Given** Playback in progress
> **When** the User starts any Gesture, such as a drag, a Split or a delete
> **Then** Playback stops first, on the Frame it had reached, and the Gesture then acts on the Timeline as it stands; a Split cuts at that Frame
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Head and tail handles (`clip-head-handle`, `clip-tail-handle`) open a Trim drag past a few pixels; the body opens a move drag
- [ ] Pointer moves call the drag slice; render only the dragged Clips via a CSS transform (ADR 0021)
- [ ] Ghost with `data-drop="ok"|"refused"` and `data-reason`; limit mark `data-at-limit` on a held edge
- [ ] Escape cancels; release commits through the slice
- [ ] E2E `apps/editor/e2e/editing-drag.spec.ts`: AC-01–AC-03, AC-06–AC-09, AC-17 (read IndexedDB during and after), AC-19, AC-25 (Offline Clip), AC-31

## Edge cases

| Case | Behaviour |
|---|---|
| Press on an unselected Clip then drag | It becomes the only selected Clip and moves alone (AC-09) |
| Drag past Frame 0 | Refused ghost; release puts the Clips back |
| Drag across to the other Track with a two-Track Selection | Refused |
| Trim during Playback | Playback stops on the Frame reached first |

## Definition of Done

- [ ] The e2e spec passes in Chrome for every AC listed
- [ ] IndexedDB holds only the end position after a drag (AC-17)
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
