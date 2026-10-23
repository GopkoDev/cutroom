---
id: T016
title: "Rebuild the Timeline as Track rows of selectable Clip views with Track headers"
layer: "ui"
deps: ["T014", "T001"]
blocks: ["T017"]
acs: ["AC-08", "AC-14", "AC-20", "AC-21", "AC-22", "AC-30"]
files_hint: ["apps/editor/src/ui/timeline/", "apps/editor/src/ui/Timeline.tsx", "apps/editor/src/ui/EditorLayout.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---
# T016 — Rebuild the Timeline as Track rows of selectable Clip views with Track headers

## Place in the sequence

- **Blocked by:** T014 — Write one store function per Gesture, stopping Playback first, with refusal wording, T001 — Diagnose and fix the flaky engine-worker e2e check before any feature work · **Blocks:** T017 — Drive Trim and move drags from Clip handles and bodies through the drag slice · **Wave:** 11.
- **Lane:** shares files with T017, T018 — serialized.

## Why (user story)

> **As a** User
> **I want** to select one Clip by clicking it, add or remove Clips with a modifier key, select every Clip at once and clear the Selection
> **So that** I choose exactly which Clips the next edit acts on
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to add a second video Track whose Clips cover the Track below, and remove a Track I no longer need
> **So that** I can put one shot over another, such as a cutaway over a continuous shot
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

The User sees both Tracks, selects Clips by click, modifier-click and select-all, and adds or removes a Track from its header.

## Inlined context

> The Timeline lives in `apps/editor/src/ui/timeline/`. A Track renders its Clips as elements positioned in Frames times the zoom (fixed in this step [...]). The drag preview is held in its own small slice of the store (ADR 0020). Clip elements subscribe only to their own Clip and to whether they are part of the open drag, so a pointer move re-renders the dragged Clips and nothing else. Every Clip carries `data-testid` and an `aria-label` naming its Source and position.
>
> — `ADR 0021` §Decision outcome, verbatim · full text: [ADR 0021](../../../adr/0021-the-timeline-is-dom-and-a-drag-re-renders-only-the-dragged-clips.md)

> **Structure (default).** [...] At the bottom is the Timeline panel: a header row with the title, the duration line and `EditToolbar`; a column of `TrackHeader`s with Add Track; then the ruler and the `TrackRow`s, with the upper Track drawn on top, which is `tracks[1]` (data-model.md). Each Clip is a `ClipView` with a head handle and a tail handle. The panel grows from `h-40` to fit two Tracks.
> default | A Project with Clips on one or two Tracks, nothing selected
> empty | The Project has one Track and no Clips. [...] Split, Duplicate and Ripple delete are disabled, and Add Track stays available
> selection | One or more Clips are selected by a click, Shift- or ⌘-click, or ⌘A. Each shows a primary ring and `aria-selected="true"`. A click on an empty part of a Track, or Escape, clears the Selection.
> offline clip | A Clip whose Source is Offline. It has the step-1 dashed look and stays editable in every state above, with no permission prompt.
> error (edit refused) | [...] `edit-refusal` [...] `track-limit` [...] `last-track`
>
> — `screens.md` SCR-02, abridged · full text: [screens.md](../screens.md)

> `TrackHeader` | [...] A header now carries the Track's name and its Remove Track button, and the column carries Add Track
> `TrackRow` | It takes over the inline Track `div` in `Timeline.tsx` so that each Track subscribes only to its own Clips
> `ClipView` | It replaces `ClipBlock` [...]. It adds the selected ring, the head and tail handles, the limit mark and the ghost with `data-drop`.
>
> — `screens.md` §New components, abridged · full text: [screens.md](../screens.md)

> Reuses: `Button` (`src/components/ui/button.tsx`), `Notice` (`src/ui/Notice.tsx`, tone `attention`), the step-1 ruler, Playhead and `timeline-scale.ts`; Tailwind tokens and `cn`.
>
> — `screens.md` §Source, component inventory, abridged · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-08 — happy

> **Given** two video Tracks and a Clip on the lower one
> **When** the User drags it onto the upper Track to a place that is free, and releases
> **Then** the Clip is on the upper Track at that Frame, and the Preview shows it covering whatever the lower Track has there
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy

> **Given** Clips on two Tracks
> **When** the User clicks one Clip, then adds another with the modifier key, then selects every Clip, then clears the Selection
> **Then** the Timeline marks the selected Clips at each step; and none of these changes is an undo step or makes the Project be saved, because the Selection belongs to the session
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — happy

> **Given** a Project with one video Track
> **When** the User adds a video Track
> **Then** a second, empty Track appears above the first; Clips placed on it cover the lower Track's picture wherever the upper Track has a Clip; where it has a Gap the lower Track shows through
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — happy

> **Given** a Project with two video Tracks, one of which holds Clips
> **When** the User removes that Track
> **Then** the Track and its Clips are gone in one Gesture, which one undo restores in full
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — domain invariant

> **Given** a Project with only one video Track
> **When** the User tries to remove it
> **Then** removal is refused and the User is told a Project always keeps at least one Track
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

### AC-30 — domain invariant

> **Given** a Project that already has two video Tracks
> **When** the User tries to add another Track
> **Then** adding is refused and the User is told a Project has at most two video Tracks for now
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Move the Timeline into `apps/editor/src/ui/timeline/` (`Timeline`, `TrackRow`, `TrackHeader`, `ClipView`); keep step-1 test ids (`timeline-clip`, `timeline-track`, `timeline-body`, `timeline-playhead`)
- [ ] Per-Clip subscriptions only (ADR 0021); `aria-label` naming Source and position
- [ ] Click / Shift-click / ⌘-click select; empty-Track click clears; `data-selected` + `aria-selected`
- [ ] TrackHeader: name, Remove Track; Add Track above the column; wired to `addTrack` / `removeTrack`
- [ ] Show the `edit-refusal` Notice above the Tracks with Dismiss
- [ ] Component tests where cheap; e2e for selection and Tracks (AC-14, AC-20–AC-22, AC-30)

## Edge cases

| Case | Behaviour |
|---|---|
| Click on a Clip while playing | Selection changes, Playback continues (AC-14) |
| Add Track at two Tracks | `edit-refusal` with `data-reason="track-limit"` |
| Offline Clip | Dashed, selectable, no permission prompt |

## Definition of Done

- [ ] E2E: selection steps of AC-14 mark the right Clips and save nothing; AC-20, AC-21, AC-22, AC-30 through the UI
- [ ] Step-1 e2e specs that read the Timeline still pass
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
