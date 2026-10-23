---
id: T018
title: "Add the edit toolbar, named Undo and Redo, keyboard shortcuts and the Place action"
layer: "ui"
deps: ["T017"]
blocks: ["T019"]
acs: ["AC-04", "AC-05", "AC-10", "AC-11", "AC-12", "AC-13", "AC-16", "AC-18", "AC-24", "AC-28", "AC-29"]
files_hint: ["apps/editor/src/ui/EditToolbar.tsx", "apps/editor/src/ui/UndoRedo.tsx", "apps/editor/src/ui/shortcuts.ts", "apps/editor/src/ui/TopBar.tsx", "apps/editor/src/ui/SourcesPanel.tsx", "apps/editor/src/ui/timeline/", "apps/editor/e2e/editing-commands.spec.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---
# T018 — Add the edit toolbar, named Undo and Redo, keyboard shortcuts and the Place action

## Place in the sequence

- **Blocked by:** T017 — Drive Trim and move drags from Clip handles and bodies through the drag slice · **Blocks:** T019 — Prove the edited Export matches the Preview at every Edit point, with both sounds mixed · **Wave:** 13.
- **Lane:** shares files with T016, T017 — serialized.

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
> **I want** to undo and redo each thing I did, by key and by button, and see what the next undo or redo will take back
> **So that** I can try an edit without being afraid of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to place an already imported Source on a Track again from the Source list
> **So that** I can bring back a shot I deleted, or use the same Source twice, without importing the file again
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

Every edit is one button or one key away, and the User can always see what the next undo or redo will take back.

## Inlined context

> Split is S or a toolbar button; Duplicate is ⌘D or a toolbar button; Delete or Backspace deletes and leaves a Gap; Shift+Delete or a toolbar button makes a Ripple delete; ⌘Z and ⇧⌘Z undo and redo, next to Undo and Redo buttons that name their step; ⌘A selects every Clip; Shift-click or ⌘-click adds or removes a Clip; Escape cancels an open drag and otherwise clears the Selection
>
> — `ux-flows.md` §Platform decisions, abridged · full text: [ux-flows.md](../ux-flows.md)

> S2. The Undo and Redo buttons stay in the `TopBar`. They become `UndoRedo`, and their label names the step they would act on.
> S3. The edit buttons sit in the Timeline panel's header row (`EditToolbar`), beside the duration line.
> undo-unavailable | [...] The button is disabled with a plain label and a title: "Nothing to undo", "Finish the drag first" (AC-18, AC-28)
> Sources panel default | Every source row gets a **Place** button (`source-place`) [...] whether or not a Clip uses the Source (AC-24)
> Keys are ignored while focus is in a text field, as Space already is (`TopBar.typesText`).
>
> — `screens.md` §Source + SCR-02, abridged · full text: [screens.md](../screens.md)

> Keyboard (*new*) | One shortcut handler on the Editor, ignored while focus is in a text field. The bindings are the ux-flows platform list
>
> — `sad.md` §8, verbatim · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

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

### AC-16 — happy

> **Given** a Project after a Trim, a move and a Ripple delete
> **When** the User undoes three times, then redoes three times, by key or by button
> **Then** each undo takes back exactly one of those Gestures in reverse order, each redo puts one back, and the interface names the Gesture the next undo and the next redo will act on
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — error

> **Given** a drag still in progress, or nothing left to undo or redo
> **When** the User asks for undo or redo
> **Then** nothing changes; the undo and redo controls show that they are not available, rather than taking back half a Gesture or failing silently
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — happy

> **Given** a Source in the Source list, whether or not any Clip still uses it, and whether it is Linked or Offline
> **When** the User places it from the Source list
> **Then** a new Clip showing the whole Source, at the length recorded at import, is added after the last Clip on the bottom Track and becomes the Selection, without reading or importing the file again
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

### AC-28 — cross-context

> **Given** a Project after several edits, with undo history
> **When** the User reloads the page, or leaves and comes back
> **Then** the Timeline is exactly as the last Gesture left it, and the undo history is empty, because history belongs to the session while the Project is saved
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

### AC-29 — happy

> **Given** no Selection, and the Playhead strictly inside a Clip on each of the two Tracks
> **When** the User splits
> **Then** every Clip under the Playhead, on every Track, becomes two Clips meeting at the Playhead, in one Gesture that one undo takes back; the second halves are selected
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `EditToolbar` (Split, Duplicate, Ripple delete; disabled on an empty Timeline) in the Timeline header row — `ui/EditToolbar.tsx`
- [ ] `UndoRedo` replaces the two TopBar buttons; labels from the store's next-step selectors — `ui/UndoRedo.tsx`, `ui/TopBar.tsx`
- [ ] `shortcuts.ts`: one handler on the Editor, same functions as the buttons, ignores text fields — `ui/shortcuts.ts`
- [ ] Place button per source row — `ui/SourcesPanel.tsx`
- [ ] E2E `apps/editor/e2e/editing-commands.spec.ts`: AC-04, AC-05, AC-10–AC-13, AC-16, AC-18, AC-24, AC-28 (reload and Project list), AC-29

## Edge cases

| Case | Behaviour |
|---|---|
| ⌘Z while a drag is open | Unavailable, nothing changes (AC-18) |
| Shortcut while typing in a field | Ignored |
| After reload | Both controls unavailable, Timeline as the last Gesture left it (AC-28) |

## Definition of Done

- [ ] The e2e spec passes in Chrome for every AC listed
- [ ] Step-1 undo e2e specs still pass with the renamed buttons
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
