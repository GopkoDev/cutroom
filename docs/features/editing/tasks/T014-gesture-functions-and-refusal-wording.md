---
id: T014
title: "Write one store function per Gesture, stopping Playback first, with refusal wording"
layer: "app"
deps: ["T013"]
blocks: ["T016"]
acs: ["AC-04", "AC-05", "AC-10", "AC-11", "AC-12", "AC-13", "AC-20", "AC-21", "AC-22", "AC-24", "AC-25", "AC-26", "AC-29", "AC-30", "AC-31", "AC-32"]
files_hint: ["apps/editor/src/store/edit.ts", "apps/editor/src/store/edit.test.ts", "apps/editor/src/ui/failure-wording.ts", "apps/editor/src/store/index.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "L"   # justified: one Gesture layer for sixteen ACs; splitting it would split one file and one wording table across tasks
status: "todo"
step: ""
---
# T014 — Write one store function per Gesture, stopping Playback first, with refusal wording

## Place in the sequence

- **Blocked by:** T013 — Add the drag-preview slice and retire the open-Gesture save debounce · **Blocks:** T016 — Rebuild the Timeline as Track rows of selectable Clip views with Track headers · **Wave:** 10.
- **Lane:** shares files with T012, T013 — serialized.

## Why (user story)

> **As a** User
> **I want** to split a Clip into two at the Playhead
> **So that** I can remove or move a part in the middle of a shot
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to delete the selected Clips either leaving a Gap where they were or with a Ripple delete that pulls everything after them back
> **So that** what I don't want is gone, with or without the empty space it leaves
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to duplicate the selected Clips
> **So that** I can reuse a shot without bringing its Source in again
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to add a second video Track whose Clips cover the Track below, and remove a Track I no longer need
> **So that** I can put one shot over another, such as a cutaway over a continuous shot
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to place an already imported Source on a Track again from the Source list
> **So that** I can bring back a shot I deleted, or use the same Source twice, without importing the file again
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

Every button and key an edit has goes through one function that stops Playback, mints ids, applies one command and names the undo step, or explains a refusal.

## Inlined context

> Playback. Starting any Gesture stops Playback first, on the Frame it reached (AC-31). A drag starts when a press on a Clip moves past a few pixels. A plain click only changes the Selection, which is not a Gesture (AC-14), so Playback continues. Split, delete, Duplicate, a Track button and placing a Source stop Playback at once.
>
> — `sad.md` §4, Tactical rules, verbatim · full text: [sad.md](../sad.md)

> Undo naming (*new*) | Each history entry's label names the Gesture in the interface's words ("Trim", "Split", "Move 2 Clips", "Ripple delete", "Add Track")
> ID strategy | The reducer mints no ids. The editor mints the ids of a Split's second halves, copies and new Tracks with the injected `newId` (`crypto.randomUUID()`). A moved Clip keeps its id
>
> — `sad.md` §8, abridged · full text: [sad.md](../sad.md)

> S1. An edit refusal is shown as one `Notice` in tone `attention` above the Tracks (`edit-refusal`) [...]. The notice names the reason in the User's terms. It closes on the next Gesture, on Escape, or with its Dismiss action.
> error (edit refused) | Split with no qualifying Clip [...]: "No selected Clip is under the Playhead." or "No Clip is under the Playhead." (AC-05). Add Track at two Tracks, `track-limit`: "A Project has at most two video Tracks for now." (AC-30). Remove the only Track, `last-track`: "A Project always keeps at least one Track." (AC-22).
>
> — `screens.md` §Source S1 + SCR-02 error (edit refused), abridged · full text: [screens.md](../screens.md)

> Export. An Export keeps the frozen Scene it started with (FR-019, ADR 0015), so edits during an Export need nothing new (AC-26).
>
> — `sad.md` §4, Tactical rules, verbatim · full text: [sad.md](../sad.md)

> `splitTargets`' `kind: "none"` is not a refusal. The editor shows the notice and sends no command (AC-05).
>
> — `contracts/public-api.md` §Editing rules, Contract, verbatim · full text: [public-api.md](../contracts/public-api.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Each Gesture is one `transact`, one history entry and one save of the Project Document (ADR 0011, ADR 0020).

## API contract

Calls `splitTargets`, `duplicateDelta`, `placeSourceCommand`, `MAX_VIDEO_TRACKS`, and `applyCommand` with `split-clips`, `delete-clips`, `duplicate-clips`, `add-track`, `remove-track`, `add-clip`; maps every `RefusalReason` to wording.

— `contracts/public-api.md` §Editing rules, §Refusals, §Place a Source, abridged · full text: [public-api.md](../contracts/public-api.md)

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

### AC-12 — happy

> **Given** a selected Clip with a Gap after it at least as long as the Clip
> **When** the User duplicates it
> **Then** a copy showing the same part of the same Source is placed directly after the original, and the copy becomes the Selection. With several Clips selected, the copies keep their positions relative to each other and are placed as one block directly after the end of the Selection, in one Gesture
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — domain invariant

> **Given** a selected Clip with no room directly after it
> **When** the User duplicates it
> **Then** the copy is placed after the last Clip on that Track instead of over the next Clip, because Clips never overlap on a Track. A block of several copies goes after the last Clip on the Tracks it spans when any one of those Tracks lacks room directly after the Selection
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

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

### AC-24 — happy

> **Given** a Source in the Source list, whether or not any Clip still uses it, and whether it is Linked or Offline
> **When** the User places it from the Source list
> **Then** a new Clip showing the whole Source, at the length recorded at import, is added after the last Clip on the bottom Track and becomes the Selection, without reading or importing the file again
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

### AC-25 — authorization

> **Given** a Clip whose Source is Offline because the browser no longer has the User's permission to read it
> **When** the User trims, splits, moves, duplicates or deletes that Clip
> **Then** the edit is made within what was recorded about the Source at import, no permission prompt appears because of it, and the Clip's picture returns only after the User grants access again by their own action
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — cross-context

> **Given** an Export in progress
> **When** the User edits the Timeline before it finishes
> **Then** the edit is made and saved as usual, and the exported file is the Timeline as it was when the Export started
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

### AC-29 — happy

> **Given** no Selection, and the Playhead strictly inside a Clip on each of the two Tracks
> **When** the User splits
> **Then** every Clip under the Playhead, on every Track, becomes two Clips meeting at the Playhead, in one Gesture that one undo takes back; the second halves are selected
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

### AC-30 — domain invariant

> **Given** a Project that already has two video Tracks
> **When** the User tries to add another Track
> **Then** adding is refused and the User is told a Project has at most two video Tracks for now
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

### AC-31 — cross-context

> **Given** Playback in progress
> **When** the User starts any Gesture, such as a drag, a Split or a delete
> **Then** Playback stops first, on the Frame it had reached, and the Gesture then acts on the Timeline as it stands; a Split cuts at that Frame
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)

### AC-32 — domain invariant

> **Given** a Gesture that would leave the Project unchanged, such as a Clip dropped where it started, a Trim already at its limit, or a delete or Duplicate with nothing selected
> **When** the User completes it
> **Then** no undo step is recorded and nothing is saved, and the undo control still names the Gesture before it
>
> — `spec.md §5, AC-32, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `split`, `deleteSelected(ripple)`, `duplicateSelected`, `addTrack`, `removeTrack(id)`, `placeSource(id)` — `apps/editor/src/store/edit.ts`
- [ ] Each: stop Playback on the Frame reached, then decide; mint ids with the injected `newId`; one `transact(label, …)`; set the new Selection
- [ ] Add the refusal state `editRefusal: { reason, title, explanation } | null` and clear it on the next Gesture — `store/index.ts`
- [ ] Map every `RefusalReason` and both `splitTargets` `because` values to words — `apps/editor/src/ui/failure-wording.ts`
- [ ] Tests over a fake transport: every AC in this task, labels, no-op Gestures leave history and saver untouched

## Edge cases

| Case | Behaviour |
|---|---|
| Split during Playback | Playback stops first; cut is at the Frame reached (AC-31) |
| Delete with nothing selected | Nothing, no history, no save (AC-32) |
| Edit during an Export | Applied and saved; the Export keeps its frozen Scene (AC-26) |
| Place an Offline Source | Clip added at recorded length, no permission call (AC-25) |
| Unexpected `CommandError` | Nothing changes; general wording with the reason under Details |

## Definition of Done

- [ ] Store unit tests cover each AC listed
- [ ] No Gesture function touches a file handle or permission
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
