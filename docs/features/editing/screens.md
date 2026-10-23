---
status: draft
feature_size: "L"
tool: "code"
updated_at: "2026-10-23"
---

# Screens — editing

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code. There is no `docs/design-system.md` yet, so the run used `code` mode, as the
  skill does when the canon is absent. Running `/sdd:design-system` before the next UI feature is
  recommended.
- **File:** the wireframes are inline below.
- **Component inventory used:** because there is no canon, the inventory is the components that
  exist in `apps/editor` at `fe40e81`. That is a noted gap, not an invention:
  - `Button`: shadcn, `src/components/ui/button.tsx`.
  - `Notice`: `src/ui/Notice.tsx`, with the tones `failure`, `attention` and `dark`.
  - `TopBar`: `src/ui/TopBar.tsx`. It already has Undo and Redo buttons.
  - `Timeline`: `src/ui/Timeline.tsx`, with `TimelineBody`, `ClipBlock` and the ruler.
  - `SourcesPanel`: `src/ui/SourcesPanel.tsx`, with its source rows.
  - `ExportDialog`: `src/ui/ExportDialog.tsx`.
  - `ProjectList`: `src/ui/ProjectList.tsx`.
  - `RelinkPrompt`: `src/ui/RelinkPrompt.tsx`.
  - `EditorLayout`: `src/ui/EditorLayout.tsx`, with the Preview panel and the `engine-fatal` and
    `save-failure` notices.
- **Posture:** desktop-first, pointer and keyboard (ux-flows §Platform decisions).
- **Decisions taken in this stage.** All three were decided by the agent on the owner's
  delegation, 2026-10-23:
  - **S1.** An edit refusal is shown as one `Notice` in tone `attention` above the Tracks
    (`edit-refusal`), not in tone `failure`. A refusal is a rule the User can act on at once.
    Nothing broke and nothing was lost, so the red tone, which `Notice` keeps for something that
    went wrong, would overstate it. The notice names the reason in the User's terms. It closes on
    the next Gesture, on Escape, or with its Dismiss action. A drag refusal is not a notice: it is
    drawn on the dragged Clips while the pointer is there (AC-07).
  - **S2.** The Undo and Redo buttons stay in the `TopBar`. They become `UndoRedo`, and their
    label names the step they would act on. The SAD §5 path `ui/UndoRedo.tsx` is that component.
  - **S3.** The edit buttons sit in the Timeline panel's header row (`EditToolbar`), beside the
    duration line. That row is the one place every Timeline edit is reachable without leaving the
    Timeline. The Track buttons sit in the Track headers.

## Screens

### SCR-01 — Project list

This feature changes nothing on this screen. It is listed because two flows pass through it:
leaving the Project and opening it again (AC-28), and the load-time checks this feature adds
(data-model.md: Source bounds, at least one Track; sad.md §6 Flow 7, the load-refusal branch).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Projects are listed. Opening one goes to SCR-02 with an empty undo history (AC-28) | `ProjectList`, `Button` | wireframe below |
| loading | The list is being read (step 1, `project-list-loading`) | `ProjectList` | unchanged from step 1 |
| empty | No Projects yet (step 1, `project-list-empty`) | `ProjectList`, `Button` | unchanged from step 1 |
| error | A Project's Document fails a load check. The new causes are a Clip outside its Source, an overlap, a start before Frame 0, or no Track (sad.md §6 Flow 7; spec §6.1). It shows the step-1 `open-failure` notice with the reason, the row shows `project-row-unopenable`, and nothing is written | `Notice` (tone `failure`), `ProjectList` | wireframe below |
| error | The list cannot be read, or storage is blocked (step 1, `project-list-failed`, `storage-blocked`) | `Notice` | unchanged from step 1 |

```text
+----------------------------------------------------------+
| Projects                                   [New Project] |
|----------------------------------------------------------|
| ! This Project can't be opened                (failure)  |  <- open-failure
|   A Clip in it shows more than its Source holds.         |
|   > Details                                              |
|----------------------------------------------------------|
| Holiday cut          edited 2 min ago                    |
| Broken import        can't be opened                     |  <- project-row-unopenable
+----------------------------------------------------------+
```

### SCR-02 — Editor

This is where every edit in the feature happens. The states are grouped by the area of the screen
they change. Every state listed traces to an AC, a sad.md §6 branch or a `RefusalReason` from
contracts/public-api.md.

**Structure (default).** The `TopBar` holds Projects, the name, Play/Stop, the timecode,
Export… and `UndoRedo`. The middle holds `SourcesPanel` on the left and the Preview. At the bottom
is the Timeline panel: a header row with the title, the duration line and `EditToolbar`; a column
of `TrackHeader`s with Add Track; then the ruler and the `TrackRow`s, with the upper Track drawn
on top, which is `tracks[1]` (data-model.md). Each Clip is a `ClipView` with a head handle and a
tail handle. The panel grows from `h-40` to fit two Tracks.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | A Project with Clips on one or two Tracks, nothing selected | `TopBar`, `UndoRedo`, `SourcesPanel`, `Timeline` (`TrackHeader`, `TrackRow`, `ClipView`), `EditToolbar`, `Button` | wireframe "default" |
| empty | The Project has one Track and no Clips. The Timeline says "Empty — no Clips yet." (step 1). Split, Duplicate and Ripple delete are disabled, and Add Track stays available | `Timeline`, `EditToolbar`, `TrackHeader` | wireframe "empty" |
| selection | One or more Clips are selected by a click, Shift- or ⌘-click, or ⌘A. Each shows a primary ring and `aria-selected="true"`. A click on an empty part of a Track, or Escape, clears the Selection. This is no undo step and no save (AC-14). After an undo or redo, Clips that no longer exist leave the Selection (AC-15) | `ClipView` | wireframe "selection" |
| trim-drag | A head or tail handle is pressed and moved. The edge follows the pointer on whole Frames (AC-01). Playback stops first (AC-31) | `ClipView` (handle), `TrackRow` | wireframe "trim-drag" |
| trim-held | The edge reaches a limit from `trimRange`: the Source's own end, the neighbour's edge, Frame 0, or one Frame from the other end. It stays there, and the held edge shows a limit mark (AC-02, AC-03) | `ClipView` (handle, `data-at-limit`) | wireframe "trim-drag" |
| move-drag (allowed) | A Clip body is pressed and moved. Every dragged Clip shows a ghost at its target on this Track or the other, on whole Frames, and the originals are dimmed (AC-06, AC-08, AC-09). Pressing an unselected Clip makes it the only selected Clip first (AC-09) | `ClipView` (ghost, `data-drop="ok"`) | wireframe "move-drag" |
| validation (move refused) | The `checkMove` verdict is not ok: an overlap, a start before Frame 0, or a two-Track Selection leaving its Tracks. The ghosts get a destructive outline and the cursor shows not-allowed while the pointer is there (AC-07, AC-09) | `ClipView` (ghost, `data-drop="refused"`, `data-reason`) | wireframe "move-drag" |
| drag-cancelled | Escape, a release while refused, or a release where nothing moved. Every Clip is back where it started, with no undo step and no save (AC-07, AC-19, AC-32). This looks the same as the state before the drag | `ClipView` | = default / selection |
| success (edit applied) | A Gesture applied: a Trim, Split, move, delete, Ripple delete, Duplicate, a Track added or removed, or a Source placed. The Timeline shows the result and `UndoRedo` names it, for example "Undo Trim". The Preview shows the Frame at the Playhead (AC-01, AC-04, AC-06, AC-08, AC-10–AC-13, AC-20, AC-21, AC-24, AC-29). The new Clips are selected after a Split (the second halves), a Duplicate or a place | `Timeline`, `UndoRedo`, Preview canvas | wireframe "after split" |
| no-op | A Gesture that changes nothing: a delete or Duplicate with nothing selected, a drop where the Clip started, or a Trim at its limit. Nothing visible happens, and the Undo label still names the previous step (AC-32) | `UndoRedo` | = previous state |
| error (edit refused) | Split with no qualifying Clip, where `splitTargets` returns `none`: "No selected Clip is under the Playhead." or "No Clip is under the Playhead." (AC-05). Add Track at two Tracks, `track-limit`: "A Project has at most two video Tracks for now." (AC-30). Remove the only Track, `last-track`: "A Project always keeps at least one Track." (AC-22). Nothing changes and no undo step is recorded | `Notice` (tone `attention`, testId `edit-refusal`, `data-reason`) | wireframe "refusal" |
| error (unexpected refusal) | `applyCommand` throws a `CommandError` that the rule functions should have prevented, such as `unknown-clip` or `invalid`. ADR 0019 says this never happens, and property tests pin it. If it does, nothing changes and the same `edit-refusal` notice shows a general sentence with the reason under Details | `Notice` (tone `attention`, `details`) | wireframe "refusal" |
| undo-unavailable | There is nothing to undo or redo, a drag is open, or the Project was just opened (history empty). The button is disabled with a plain label and a title: "Nothing to undo", "Finish the drag first" (AC-18, AC-28) | `UndoRedo` (`Button` disabled) | wireframe "default" |
| offline clip | A Clip whose Source is Offline. It has the step-1 dashed look and stays editable in every state above, with no permission prompt. Its picture in the Preview stays empty until the User relinks (AC-25). `RelinkPrompt` is unchanged | `ClipView` (`data-offline`), `RelinkPrompt` | wireframe "selection" |
| exporting | An Export is running. The dialog is not modal, and every state above stays reachable. Edits are saved as usual (AC-26) | `ExportDialog` (running), `Timeline` | see SCR-03 |
| loading | N/A: every edit is applied synchronously on the main thread and saved in the background (ADR 0011, ADR 0020). There is no wait state between a Gesture and its result. The Preview's Frame request is step 1's unchanged path | — | — |
| error (save / engine) | A save fails, or the engine stops. These are the step-1 `save-failure` and `engine-fatal` notices, unchanged. A failed save after an edit uses the same path as any step-1 save | `Notice` (`failure`) | unchanged from step 1 |

**Sources panel (part of SCR-02).**

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Every source row gets a **Place** button (`source-place`) beside its name, duration and status, whether or not a Clip uses the Source (AC-24) | `SourcesPanel`, `Button` (size `sm`, variant `outline`) | wireframe "default" |
| offline source | An Offline row keeps Place enabled. Placing it adds a Clip at the length recorded at import, with no prompt (AC-24, AC-25) | `SourcesPanel`, `Button` | wireframe "default" |
| empty | No Sources: the step-1 empty Sources panel, unchanged. There is nothing to place | `SourcesPanel` | unchanged from step 1 |
| error | N/A: placing reads no file and cannot be refused for a Source in the list. `unknown-source` cannot reach the User, because the button exists only for listed Sources. A `too-short` Source was already refused at import | — | — |

**Keyboard.** None of these needs a component of its own. `shortcuts.ts` dispatches each key to
the same function as its button:

- S: Split.
- ⌘D: Duplicate.
- Delete or Backspace: delete, leaving a Gap.
- ⇧Delete: Ripple delete.
- ⌘Z and ⇧⌘Z: undo and redo.
- ⌘A: select every Clip.
- Escape: cancel an open drag. With no drag open, it clears the Selection and closes
  `edit-refusal`.

Keys are ignored while focus is in a text field, as Space already is (`TopBar.typesText`).

```text
wireframe "default"  (two Tracks, nothing selected)
+--------------------------------------------------------------------------------------+
| [Projects] Holiday cut        [Play] 00:00:04:12      [Export…] [Undo Move] [Redo]   |
|--------------------------------------------------------------------------------------|
| Sources                      |                                                       |
|  beach.mp4  0:42  Linked [Place]                 Preview                             |
|  dog.mov    0:10  Offline [Place]                                                    |
|  [Import…]                   |                                                       |
|--------------------------------------------------------------------------------------|
| Timeline  412 Frames across 2 Track(s)       [Split] [Duplicate] [Ripple delete]     |
|           |0        100       200       300       400                                |
| [+ Track] |                                                                          |
| V2    [x] |          [=cut=]                     |                                   |
| V1    [x] |[==beach=====][==beach==]   [==dog (Offline)==]                           |
|                          ^ Playhead                                                  |
+--------------------------------------------------------------------------------------+

wireframe "empty"  (one Track, no Clips)
| Timeline  Empty — no Clips yet.              [Split]° [Duplicate]° [Ripple delete]°  |
| [+ Track] |0        10        20                                                     |
| V1    [x] |                                                                          |
   ° disabled

wireframe "selection"  (A selected, plus the Offline Clip with ⌘-click)
| V1    [x] |[##beach#####][==beach==]   [##dog (Offline)##]                           |
              ## = ring-2 ring-primary, aria-selected=true; Offline keeps its dashed border

wireframe "trim-drag"  (tail of B held at the next Clip's edge)
| V1    [x] |[==beach=====][==beach=======]|[==dog==]                                   |
                                          ^ tail handle held, data-at-limit; cursor ew-resize

wireframe "move-drag"
 allowed:  | V2 |          [::cut::]                    <- ghost data-drop="ok", original dimmed
 refused:  | V1 |[==beach==[!!cut!!]==]                <- ghost destructive outline, cursor not-allowed,
                                                           data-drop="refused" data-reason="overlap"

wireframe "after split"  (Playhead inside A, nothing selected before)
| V1    [x] |[==beach==][##beach##][==beach==]            [Undo Split]                    |
                         ^ second half selected; the halves meet at the Playhead

wireframe "refusal"
| Timeline  412 Frames across 2 Track(s)       [Split] [Duplicate] [Ripple delete]     |
| +----------------------------------------------------------------------------------+ |
| | No Clip is under the Playhead.                                       (attention) | |  <- edit-refusal
| | Move the Playhead onto a Clip, past its first Frame, and split again. [Dismiss]  | |     data-reason="nothing-under-frame"
| +----------------------------------------------------------------------------------+ |
| V1    [x] |[==beach=====]   ^          [==dog==]                                     |
```

### SCR-03 — Export dialog

This feature changes no setting and no control on this screen. Two existing behaviours carry new
ACs: the dialog is not modal while an Export runs (AC-26), and the file matches the Preview at
Edit points and in Gaps, with every Clip's sound mixed (AC-23, AC-27). Both are behaviour of the
step-1 states, not new states.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | The settings are open (step 1). The Export will write the Scene frozen at Start, with every Track and every Clip's sound in one mix | `ExportDialog`, `Button` | unchanged from step 1 |
| loading | Probing what this machine can encode, then the progress state (`export-probing`, `export-progress`). While it runs, the dialog does not block SCR-02, and edits apply and save; the file stays the Timeline at Start (AC-26) | `ExportDialog` | wireframe below |
| success | `export-done`. The file matches the Preview Frame for Frame, with the Edit points, the Gaps and the mixed sound (AC-23, AC-27) | `ExportDialog` | unchanged from step 1 |
| error | `export-refused`, `export-failed` and `export-probe-failed` (step 1), unchanged. Editing during an Export adds no failure, because the Export keeps its frozen Scene (ADR 0015) | `Notice` | unchanged from step 1 |
| empty | N/A: Export… is disabled with no Project (step 1). An empty Timeline is step 1's `export-blocked` | `ExportDialog` | unchanged from step 1 |

```text
wireframe "loading — Export running while the User edits"
+---------------------------------------------- SCR-02 stays usable -------------------+
| Timeline ... [Split] [Duplicate] [Ripple delete]    +--------------- Export --------+ |
| V2    [x] |          [=cut=]                        | Exporting  1 204 / 3 600      | |
| V1    [x] |[##beach##]  (just trimmed, saved)       | 0:41 elapsed · 1:20 left      | |
|                                                     |           [Cancel export]     | |
|                                                     +-------------------------------+ |
+--------------------------------------------------------------------------------------+
```

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| `EditToolbar` | It composes `Button`s. It is new because no existing row holds Timeline edits: `TopBar` is the Project and transport bar. Its home is the SAD §5 path `ui/EditToolbar.tsx` | pending (no `docs/design-system.md` yet) |
| `UndoRedo` | It composes `Button`s and replaces the two unlabelled buttons in `TopBar` with buttons that name their step (AC-16, AC-18). It subscribes only to the history labels | pending |
| `TrackHeader` | Step 1's header column is a plain name with no actions. A header now carries the Track's name and its Remove Track button, and the column carries Add Track (AC-20–AC-22, AC-30) | pending |
| `TrackRow` | It takes over the inline Track `div` in `Timeline.tsx` so that each Track subscribes only to its own Clips (ADR 0021) | pending |
| `ClipView` | It replaces `ClipBlock`, which has no Selection, no handles and no drag ghost. It adds the selected ring, the head and tail handles, the limit mark and the ghost with `data-drop`. It subscribes only to its own Clip and its drag state (ADR 0021) | pending |
