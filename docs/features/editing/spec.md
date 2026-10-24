---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-23"
feature_size: "L"
---

# Spec — editing

> **Glossary:** [CONTEXT](../../../CONTEXT.md) — the repo-root glossary. This feature added User, Selection, Gap, Trim, Split, Ripple delete and Edit point to it. The feature has no `CONTEXT.md` of its own.
> **Reference module / docs / channels used:** [docs/future.md](../../future.md) §The next slice: editing; [docs/reference/README.md](../../reference/README.md) §Timeline editing and §Not wired at all, checked against the local prototype copy's `Timeline.tsx` (trim, split, duplicate and delete handlers); [docs/roadmap.md](../../roadmap.md) step 2 and D2–D4; `packages/model/src/commands/index.ts` and `packages/model/src/document/types.ts`; `apps/editor/src/store/index.ts` (the Gesture and history rules); [import-play-export spec](../import-play-export/spec.md) §3–§8 and [ADR 0011](../../adr/0011-saves-follow-the-gesture-and-commit-explicitly.md).
> **Original input** (owner, 2026-10-23): "починай через плагін SDD наступну фічу" — the next roadmap step, step 2 "Editing". The story it has to earn, from future.md: *"I can take three clips, cut out what I don't want, put them in the order I want, and export the result."*

## 1. Context

The first slice made Cutroom a viewer. A User can bring their Sources in, see any Frame of it,
play it with sound in sync and export it, but cannot change a single thing about the Timeline:
each imported Source lands whole, end to end, in the order it was picked. Nobody edits video by
importing it in the right order. Until the Timeline can be trimmed, split and rearranged, Cutroom is not
yet something a person would choose to use, and every later step on the roadmap (transitions,
Effects, compositing, text, the agent) decorates or drives a Timeline that cannot yet be edited.

The trigger is sequence, not a deadline. Step 1 is shipped, and the roadmap puts editing first
in wave 2 because ten later steps depend on it. The editing commands are also what the agent
work (steps 10–11) will issue, so their shape is set here.

The committed approach:

- The User edits Clips directly on the Timeline: Trim from either end, Split at the Playhead,
  move by drag (within a Track and onto another), Duplicate, and delete — plainly, leaving a
  Gap, or as a Ripple delete that closes it.
- A Trim never moves a neighbouring Clip; it leaves a Gap (D2). Closing Gaps is an explicit
  action: Ripple delete, or moving the Clips that follow.
- Clips never overlap on a Track. An edit that would make them overlap is refused, and the
  Timeline shows the refusal while the drag is still in progress rather than only on release.
- One Gesture is one undo step and one save, however many positions a drag passes through
  (D3, glossary "Gesture", ADR 0004, ADR 0011). Undo and redo are in the interface, by key and
  by button, and each step is named for what it undoes. A Gesture that leaves the Project
  unchanged records no undo step and no save.
- A drag is a preview until it is released: the Timeline shows where the Clips would land, but
  the Project changes only once, on release. Nothing is saved while a drag is open, so a reload
  in the middle of a drag brings back the Project as it was before the drag. ADR 0011's
  debounced save of an open drag is then never used, and `/sdd:design` records that.
- Editing is allowed during Playback, but starting any Gesture stops Playback on the Frame it
  has reached first, so a Split lands exactly on the Frame the User sees.
- A Project can have a second video Track. The upper Track covers the lower one wherever it has
  a Clip; there is no transform, crop, opacity or blend yet. The sound of every Clip that is
  playing, on every Track, is mixed together in Playback and in Export: each Clip at its own
  full level, the signals added, and a limiter that softens only the peaks that would go past
  full scale, so a single Clip sounds exactly as it did in step 1 and two loud Clips do not
  distort.
- The interface takes its look and behaviour from the Kino reference where the reference covers
  it. Where the reference and Cutroom's document disagree (the reference lets Clips overlap),
  the document wins.

Traceability context:

- D2 "Does a trim ripple?" is closed by this spec: no, a Trim leaves a Gap (owner, 2026-10-23).
- D3 "What is one undo step during a drag?" is closed by this spec: the whole Gesture (owner, 2026-10-23).
- The roadmap's "a second Track, and audio" is scoped by this spec to a second *video* Track
  plus mixing the sound of every Clip. Audio-only Tracks, levels, fades, mute and pan stay in
  step 7; transform, opacity, Track lock and hide stay in step 6 (owner, 2026-10-23).
- D4, the time space of the In-point, stays open for `/sdd:design` (§8). The spec states only
  what the User observes: trimming the head by N Frames shows exactly the Frame N Frames later.
- The interview ran at depth "easy". These assumptions were proposed by the agent and accepted
  by the owner as a batch (owner, 2026-10-23):
  - A1: an edit that would make Clips overlap is refused; the drag shows the refusal and the Clips go back on release (AC-07).
  - A2: a Trim stops at the Source's own ends, at a neighbouring Clip, and one Frame short of the Clip's other end (AC-02, AC-03).
  - A3: Split acts on the selected Clips the Playhead is inside; with nothing selected, on every Clip under the Playhead on every Track; the second half is selected afterwards (AC-04, AC-05, AC-29).
  - A4: a Ripple delete closes the Gap on the same Track only (AC-11).
  - A5: a Duplicate goes directly after the original when there is room, otherwise after the Track's last Clip (AC-12, AC-13).
  - A6: several selected Clips move together by the same number of Frames, all or none (AC-09).
  - A7: a second video Track is added on top, at most two in this step; a Track is removed with its Clips in one Gesture; the last Track cannot be removed (AC-20–AC-22, AC-30).
  - A8: undo and redo by key and by button, each step named; Escape cancels a drag; 200 steps kept; history is not kept across sessions (AC-16–AC-19, AC-28).
  - A9: a Source is placed from the Source list after the last Clip on a Track (AC-24).
  - A10: Clips of an Offline Source stay editable within what was recorded at import, with no permission prompt (AC-25).
  - A11: editing during an Export is allowed; the Export writes the Timeline as it was when it started (AC-26).
  - A12: the new terms go in the repo-root glossary.
  - A13: the §6 and §7 numbers as drafted; D4 goes to an ADR in `/sdd:design`; D1, the flaky engine-worker check and SC-003's open item carry over in §8.
- `/sdd:clarify` ran at depth "easy". These assumptions were proposed by the agent and accepted
  by the owner as a batch, along with the drag preview, the stop of Playback and the mixing rule
  above (owner, 2026-10-23):
  - A14: dragging a Clip that is not selected makes it the only selected Clip and moves it alone. A Selection that holds Clips on both Tracks moves only along the Tracks; a move that would push any selected Clip off the Tracks is refused, as in AC-07 (AC-09).
  - A15: a head Trim also stops at the Timeline's first Frame (AC-03).
  - A16: a Gesture that changes nothing records no undo step and no save. Examples are a Clip dropped where it started, a Trim already at its limit, and a delete or Duplicate with nothing selected (AC-32).
  - A17: a Ripple delete of several Clips closes the Gaps on each Track separately. Every later Clip moves back by the total length deleted before it on its own Track, in one Gesture (AC-11).
  - A18: a Duplicate of several Clips keeps their positions relative to each other. The copies are placed as a block directly after the end of the Selection when every Track involved has room there, and otherwise after the last Clip on those Tracks. This is one Gesture, and the copies become the Selection (AC-12, AC-13).
  - A19: a Source placed from the Source list goes on the bottom Track, as an import does in step 1, and the new Clip becomes the Selection. An Offline Source can be placed too, at the length recorded at import (AC-24).
  - A20: Delete or Backspace deletes and leaves a Gap. Shift+Delete and a button make a Ripple delete. A Track is added and removed with buttons in the Track header; the Kino reference covers none of these.

## 2. Goals

- A User can turn several imported files into the Timeline they want — remove what they don't want,
  put the rest in order, export it — without leaving the Timeline and without a single Frame
  of error at any Edit point.
- Every edit is safe to try: each Gesture is one undo step, undo and redo are always one key
  away, and nothing an edit does is silently lost on reload.
- The Timeline can hold two video Tracks with every Clip's sound heard, so the model, the
  Preview and the Export are proven to handle more than one Clip at a time before transitions,
  Effects and compositing build on it.

## 3. Non-goals

- **Timeline ergonomics.** Snapping, marquee selection, nudge by Frame and second, zoom and pan,
  the shortcuts popover and the Clip context menu are roadmap step 12. They make editing faster;
  this step makes it possible.
- **Drag and drop from a library.** Dragging a Source onto a Track at a position is step 14,
  which needs the editor shell (step 13). Here a Source is placed from the Source list at the
  end of a Track.
- **Compositing and Track controls.** Transform, crop, opacity, blend modes, Track reordering,
  lock and hide are step 6. A second Track here only covers the one below it.
- **Audio and text Tracks.** Audio-only Tracks and files, per-Clip volume, fades, pan and mute
  are step 7. Here sound comes only from the video Clips themselves.
- **Ripple Trim and other edit modes.** Roll, slip, slide and a Trim that pulls the Clips after
  it are not offered (D2). Each is a different Gesture with its own refusals; none is needed for
  the story this step earns.
- **Overlapping Clips on one Track.** The reference allows it; Cutroom's document refuses it
  ([roadmap](../../roadmap.md) §Out of scope).

## 4. User stories

### US-01: Trim a Clip from either end

**As a** User
**I want** to drag either end of a Clip to show less of its Source, or more of it, up to the Source's own beginning and end
**So that** I can remove the part I don't want at the start or the end of a shot, to the exact Frame

### US-02: Split a Clip at the Playhead

**As a** User
**I want** to split a Clip into two at the Playhead
**So that** I can remove or move a part in the middle of a shot

### US-03: Move and reorder Clips

**As a** User
**I want** to drag one Clip, or several selected Clips together, to another place on the same Track or onto the other Track
**So that** my shots play in the order I want

### US-04: Delete Clips, leaving the Gap or closing it

**As a** User
**I want** to delete the selected Clips either leaving a Gap where they were or with a Ripple delete that pulls everything after them back
**So that** what I don't want is gone, with or without the empty space it leaves

### US-05: Duplicate a Clip

**As a** User
**I want** to duplicate the selected Clips
**So that** I can reuse a shot without bringing its Source in again

### US-06: Select the Clips an edit acts on

**As a** User
**I want** to select one Clip by clicking it, add or remove Clips with a modifier key, select every Clip at once and clear the Selection
**So that** I choose exactly which Clips the next edit acts on

### US-07: Undo and redo any edit

**As a** User
**I want** to undo and redo each thing I did, by key and by button, and see what the next undo or redo will take back
**So that** I can try an edit without being afraid of it

### US-08: Work with a second video Track

**As a** User
**I want** to add a second video Track whose Clips cover the Track below, and remove a Track I no longer need
**So that** I can put one shot over another, such as a cutaway over a continuous shot

### US-09: Hear every Clip's sound

**As a** User
**I want** the sound of every Clip that is playing, on every Track, to be heard together in Playback and in the exported file
**So that** a cutaway on the upper Track does not silence the shot under it

### US-10: Place a Source on the Timeline again

**As a** User
**I want** to place an already imported Source on a Track again from the Source list
**So that** I can bring back a shot I deleted, or use the same Source twice, without importing the file again

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** a Clip on a Track with Gaps on both sides and more of its Source available before and after it
**When** the User drags its tail end to the left by some Frames, and then its head end to the right by some Frames
**Then** the Clip ends that many Frames earlier and starts that many Frames later; the Preview shows, at the Clip's new first Frame, exactly the Source Frame that was that many Frames into the Clip before; and no other Clip on any Track has moved

### AC-02 (US-01) — domain invariant

**Given** a Clip that already shows its Source from the Source's first Frame, or up to its last
**When** the User drags that end further out
**Then** the end stops at the Source's own beginning or end and goes no further, because a Clip can show only what its Source holds. The Source's beginning is its container time 0 and its end is the duration recorded at import (ADR 0018). For a file whose first picture is stamped later than 0, a head Trim can reach that short stretch before it, where the first picture shows (owner, 2026-10-23)

### AC-03 (US-01) — domain invariant

**Given** a Clip with another Clip directly against one end, a Clip that starts on the Timeline's first Frame, or a Clip being trimmed to almost nothing
**When** the User drags that end into the neighbour, its head before the Timeline's first Frame, or past the Clip's other end
**Then** the end stops at the neighbour's edge, at the Timeline's first Frame, or one Frame short of the other end; Clips never overlap on a Track, nothing starts before the Timeline's first Frame, and a Clip is never shorter than one Frame

### AC-04 (US-02) — happy

**Given** a selected Clip with the Playhead strictly inside it, not on its first Frame
**When** the User splits
**Then** the Clip becomes two Clips that meet at the Playhead; playing across the new Edit point shows and sounds exactly as before the Split, with no Frame repeated or lost; and the second Clip is selected

### AC-05 (US-02) — error

**Given** either a Selection none of whose Clips the Playhead is strictly inside, or no Selection and no Clip on any Track that the Playhead is strictly inside (it is in a Gap or on a Clip's first Frame)
**When** the User splits
**Then** nothing changes, no undo step is recorded, and the User is told why: no selected Clip is under the Playhead, or no Clip is under the Playhead at all

### AC-06 (US-03) — happy

**Given** a Track holding Clips A, B and C in that order
**When** the User drags C into a Gap before A large enough to hold it, and releases
**Then** the Track plays C, A, B; C starts on the whole Frame where it was dropped; and one undo puts C back where it was

### AC-07 (US-03) — domain invariant

**Given** a drag of one or more Clips in progress
**When** the dragged Clips would overlap a Clip already on the Track under the pointer, or would start before the Timeline's first Frame
**Then** while the pointer is there the Timeline shows that the Clips cannot be placed there; releasing there puts every dragged Clip back where it started and records no undo step, because Clips never overlap on a Track

### AC-08 (US-03) — happy

**Given** two video Tracks and a Clip on the lower one
**When** the User drags it onto the upper Track to a place that is free, and releases
**Then** the Clip is on the upper Track at that Frame, and the Preview shows it covering whatever the lower Track has there

### AC-09 (US-03) — happy

**Given** several selected Clips, possibly on both Tracks
**When** the User drags one of them
**Then** all selected Clips move by the same number of Frames and keep their positions relative to each other; if any one of them cannot be placed, none of them moves (AC-07). A Selection holding Clips on both Tracks moves only along the Tracks, never onto another Track. Dragging a Clip that is not selected makes it the only selected Clip and moves it alone

### AC-10 (US-04) — happy

**Given** a Track holding Clips A, B and C, with B selected
**When** the User deletes B
**Then** B is gone, A and C stay exactly where they were, and a Gap the length of B is left between them, which plays as black and silent where no other Track has a Clip

### AC-11 (US-04) — happy

**Given** a Track holding Clips A, B and C, with B selected, and a second Track with Clips of its own
**When** the User makes a Ripple delete of B
**Then** B is gone and C, with everything after it on the same Track, moves back by B's length; Clips on the other Track do not move; and one undo restores B and puts every moved Clip back. With several Clips selected, each Track closes its own Gaps: every later Clip moves back by the total length deleted before it on its own Track, in one Gesture

### AC-12 (US-05) — happy

**Given** a selected Clip with a Gap after it at least as long as the Clip
**When** the User duplicates it
**Then** a copy showing the same part of the same Source is placed directly after the original, and the copy becomes the Selection. With several Clips selected, the copies keep their positions relative to each other and are placed as one block directly after the end of the Selection, in one Gesture

### AC-13 (US-05) — domain invariant

**Given** a selected Clip with no room directly after it
**When** the User duplicates it
**Then** the copy is placed after the last Clip on that Track instead of over the next Clip, because Clips never overlap on a Track. A block of several copies goes after the last Clip on the Tracks it spans when any one of those Tracks lacks room directly after the Selection

### AC-14 (US-06) — happy

**Given** Clips on two Tracks
**When** the User clicks one Clip, then adds another with the modifier key, then selects every Clip, then clears the Selection
**Then** the Timeline marks the selected Clips at each step; and none of these changes is an undo step or makes the Project be saved, because the Selection belongs to the session

### AC-15 (US-06) — domain invariant

**Given** a Selection of several Clips
**When** the User undoes a Split, a Duplicate or the placing of a Source that created a selected Clip, or redoes a delete of a selected Clip
**Then** the Selection never names a Clip that is not on the Timeline; edit commands act only on selected Clips that exist

### AC-16 (US-07) — happy

**Given** a Project after a Trim, a move and a Ripple delete
**When** the User undoes three times, then redoes three times, by key or by button
**Then** each undo takes back exactly one of those Gestures in reverse order, each redo puts one back, and the interface names the Gesture the next undo and the next redo will act on

### AC-17 (US-07) — domain invariant

**Given** a drag that passed through many positions before it was released
**When** the User undoes once
**Then** the Clip is back where the drag began, not at an intermediate position, because a Gesture is one undo step. Before the undo, the saved Project held only the drag's end position and never an intermediate one; after the undo, it holds the position where the drag began

### AC-18 (US-07) — error

**Given** a drag still in progress, or nothing left to undo or redo
**When** the User asks for undo or redo
**Then** nothing changes; the undo and redo controls show that they are not available, rather than taking back half a Gesture or failing silently

### AC-19 (US-07) — happy

**Given** a drag in progress
**When** the User presses Escape before releasing
**Then** the dragged Clips return to where they started, no undo step is recorded, and the saved Project is as it was before the drag

### AC-20 (US-08) — happy

**Given** a Project with one video Track
**When** the User adds a video Track
**Then** a second, empty Track appears above the first; Clips placed on it cover the lower Track's picture wherever the upper Track has a Clip; where it has a Gap the lower Track shows through

### AC-21 (US-08) — happy

**Given** a Project with two video Tracks, one of which holds Clips
**When** the User removes that Track
**Then** the Track and its Clips are gone in one Gesture, which one undo restores in full

### AC-22 (US-08) — domain invariant

**Given** a Project with only one video Track
**When** the User tries to remove it
**Then** removal is refused and the User is told a Project always keeps at least one Track

### AC-23 (US-09) — happy

**Given** a Clip with sound on the upper Track over a Clip with sound on the lower Track
**When** the User plays across the stretch where both are present, and exports the Project
**Then** both sounds are heard together, each at its own full level and in sync with its picture, in Playback and in the exported file, with no distortion where their sum would go past full scale; only the picture of the lower Clip is covered

### AC-24 (US-10) — happy

**Given** a Source in the Source list, whether or not any Clip still uses it, and whether it is Linked or Offline
**When** the User places it from the Source list
**Then** a new Clip showing the whole Source, at the length recorded at import, is added after the last Clip on the bottom Track and becomes the Selection, without reading or importing the file again

### AC-25 (US-01) — authorization

**Given** a Clip whose Source is Offline because the browser no longer has the User's permission to read it
**When** the User trims, splits, moves, duplicates or deletes that Clip
**Then** the edit is made within what was recorded about the Source at import, no permission prompt appears because of it, and the Clip's picture returns only after the User grants access again by their own action

### AC-26 (US-04) — cross-context

**Given** an Export in progress
**When** the User edits the Timeline before it finishes
**Then** the edit is made and saved as usual, and the exported file is the Timeline as it was when the Export started

### AC-27 (US-02) — cross-context

**Given** a Timeline with a Trim, a Split, a moved Clip and a Gap
**When** the User exports it
**Then** every Frame of the exported file matches the Preview of that Frame, including the Frames on either side of every Edit point and the black, silent Frames of the Gap

### AC-28 (US-07) — cross-context

**Given** a Project after several edits, with undo history
**When** the User reloads the page, or leaves and comes back
**Then** the Timeline is exactly as the last Gesture left it, and the undo history is empty, because history belongs to the session while the Project is saved

### AC-29 (US-02) — happy

**Given** no Selection, and the Playhead strictly inside a Clip on each of the two Tracks
**When** the User splits
**Then** every Clip under the Playhead, on every Track, becomes two Clips meeting at the Playhead, in one Gesture that one undo takes back; the second halves are selected

### AC-30 (US-08) — domain invariant

**Given** a Project that already has two video Tracks
**When** the User tries to add another Track
**Then** adding is refused and the User is told a Project has at most two video Tracks for now

### AC-31 (US-03) — cross-context

**Given** Playback in progress
**When** the User starts any Gesture, such as a drag, a Split or a delete
**Then** Playback stops first, on the Frame it had reached, and the Gesture then acts on the Timeline as it stands; a Split cuts at that Frame

### AC-32 (US-07) — domain invariant

**Given** a Gesture that would leave the Project unchanged, such as a Clip dropped where it started, a Trim already at its limit, or a delete or Duplicate with nothing selected
**When** the User completes it
**Then** no undo step is recorded and nothing is saved, and the undo control still names the Gesture before it

## 6. Non-functional requirements

All targets are on the reference machine named in the import-play-export spec §6 (MacBook Air
M4, Chrome). "Heavy Project" means two video Tracks holding 100 Clips in total, taken from 1080p
30 fps Sources.

| Aspect | Target | Measurement |
|---|---|---|
| Drag feedback | During a move or Trim drag on a heavy Project, the Clip follows the pointer within one display frame (≤ 16.7 ms p95 per pointer move) | Playwright trace of a scripted drag, main-thread long tasks during the drag |
| Preview after an edit | After any Gesture ends, the Preview shows the edited Frame at the Playhead within 300 ms p95 | Playwright timing from release to the Preview's new Frame |
| Playback across Edit points | Playing a Timeline with an Edit point every 2 s for 2 minutes keeps picture and sound within one Frame (SC-002's bar) and skips no more than 1% of Frames at the Edit points | Engine skipped-Frame counter (ADR 0013) and the A/V sync fixture adapted to Edit points |
| Two Tracks at full rate | Two overlapping 1080p 30 fps Clips, one per Track, play at full rate, skipping no more than 1% of Frames, with no audio interruption | Skipped-Frame counter and audio underrun count over 60 s |
| Export fidelity at Edit points | Every sampled Frame of the export matches the Preview, and the Frames on either side of each Edit point are always sampled (extends SC-007) | `export-fidelity` test over an edited fixture |
| Undo depth | The last 200 undo steps are kept in a session (the oldest is dropped beyond that), and undo or redo of any single step completes within 100 ms p95 on a heavy Project | Unit test on the store; Playwright timing |
| Frame accuracy | Zero one-Frame errors: a head Trim by N Frames, a Split and a move each land on exactly the expected Source Frame in 100% of model test cases | Model property tests over random Timebases and Source Timebases |

## 6.1 Security / privacy

- **Data classification:** confidential — the User's own Sources and Projects, which never leave
  their machine. This step adds no network surface.
- **Personal data touched:** none new. Edits change only Clip and Track placement in the
  Project Document on the User's own machine.
- **AuthZ/AuthN impact:** none. No accounts. Editing never asks for, and never relies on, the
  browser's file permission for a Source (AC-25); permission is requested only behind a User's
  own action, as in step 1 (ADR 0005).
- **Abuse cases:**
  - A crafted Project Document with overlapping Clips, negative positions or a Clip longer than
    its Source: refused when the Project is read, as every invariant is checked on load, not only
    on edit.
  - An edit that makes a Clip read outside its Source: refused by the Source-bounds invariant
    (AC-02), so neither the Preview nor the Export asks for a part of a Source that is not there.
  - An unbounded undo history exhausting memory: capped at 200 steps (§6 Undo depth).
- **Security review:** N/A — no new trust boundary, no new data, no network. The same verdict as
  step 1, which the owner has yet to confirm there.

## 7. Metrics / KPIs

Cutroom collects no usage data — nothing leaves the User's machine — so these are measured by
the owner's own use and by the test suite, not by telemetry.

- **The step's own story, end to end** — baseline: impossible (no editing exists); target: the
  owner takes three imported files, removes unwanted parts, reorders them and exports, in under
  5 minutes, at the `/sdd:ship` walk.
- **Frame errors at Edit points** — baseline: not measurable (no Edit points exist); target: 0 failing cases in
  the Frame-accuracy property tests and the export-fidelity test at Edit points, at merge.
- **Edits that lose work** — baseline: 0 (nothing can be edited); target: 0 reports of a Gesture
  that undo could not fully take back, or of an edit missing after reload, over the first month
  of the owner's own use after ship.

## 8. Open questions

- [ ] D4: Which time space is a Clip's In-point measured in — the container's presentation time, or time from the first sample? Default now: container time, as in step 1. Head Trim and Split are the first edits that write a non-zero In-point into saved Projects, which makes the choice hard to reverse. — owner: Architect, due: an ADR in this feature's `/sdd:design`, before any Trim lands
- [ ] D1 (carried from step 1): Does an exported file play correctly in VLC and in QuickTime Player itself (SC-006)? Default now: not closed. It was due before this spec; it is carried rather than blocking, because AC-27 adds Edit points to the same export path and the check is worth making once on an edited file. — owner: repo owner (at the reference machine), due: before this feature's `/sdd:ship`
- [ ] SC-003 (carried from step 1, ADR 0017): backward steps and far jumps on long-GOP 1080p take 301–313 ms against 300 ms. Default now: the §6 "Preview after an edit" target is 300 ms p95 and may miss on long-GOP Sources, because a head Trim or a move often shows an earlier Source position. — owner: repo owner, due: this feature's `/sdd:design` decides whether the target holds or waits for ADR 0017's keyframe preview
- [ ] R-03 (from the 2026-10-24 review): AC-23's "no distortion" for two loud Clips summed past full scale is measured in the export as "no flat-topped (clipped) run, peak within 1.1" (`apps/editor/e2e/editing-export.spec.ts:54`, ADR 0022 Consequences), while test-plan.md says "peak ≤ full scale". The decoded export peaked at 1.069 with no clipped run: the limiter is a ratio-20 compressor, not a brickwall, and AAC overshoots when decoded. Default now: the 1.1 ceiling and the no-clipped-run check stand, set by the agent and not yet signed off. The alternative is a true brickwall stage (ADR 0022 option 2) with the mix sent to the encoder held ≤ 1.0. — owner: repo owner, due: before PR #3 is merged
- [ ] The flaky `engine-worker.spec.ts` check (carried from step 1). Default now: undiagnosed; it keeps `pnpm test:e2e` from being reliably green, which this feature's implement gate depends on. — owner: Tech Lead, due: before this feature's `/sdd:implement`
