# Changelog — editing

## editing — the Timeline can be edited: Trim, Split, move, Duplicate, delete, two Tracks, undo

**What:** A User can now cut their footage into the video they want, entirely in the browser.
On the Timeline they can:

- **Trim** a Clip from either end. A Trim leaves a Gap and never moves a neighbouring Clip.
- **Split** at the Playhead.
- **Move** Clips by dragging, within a Track or onto the second video Track.
- **Duplicate** Clips.
- **Delete** Clips, leaving a Gap, or **Ripple delete** to close it.
- **Select several Clips** and act on them together.
- **Place** a Source from the Source list again.

A drag shows where the Clips would land, and whether they can, before the button is released.
Clips never overlap. Each Gesture is one named step that **Undo** and **Redo** take back and put
back, by key and by button, and one save. An upper Track's picture covers the lower one, and both
Tracks' sound plays together, in Playback and in the exported file.

**Why:** After step 1 Cutroom was a viewer: nothing about the Timeline could be changed, and every
later roadmap step decorates or drives an editable Timeline ([spec](../spec.md) §1–§2). The
load-bearing decisions:

- [ADR 0019](../../../adr/0019-edits-are-intent-commands-that-share-their-rules-with-the-preview.md):
  edits are intent commands whose rules the preview shares, so a drag cannot promise what the
  release refuses.
- [ADR 0020](../../../adr/0020-a-drag-is-a-preview-and-the-project-changes-once-on-release.md):
  a drag is a preview, and the Project changes once, on release.
- [ADR 0021](../../../adr/0021-the-timeline-is-dom-and-a-drag-re-renders-only-the-dragged-clips.md):
  the Timeline is DOM, and a drag re-renders only the dragged Clips.
- [ADR 0022](../../../adr/0022-every-clip-is-mixed-through-one-limiter-whose-delay-is-measured.md):
  every Clip's sound goes through one limiter whose delay is measured.
- [ADR 0018](../../../adr/0018-the-in-point-stays-in-container-presentation-time.md): the In-point
  stays in container presentation time.

**How to use:**

- Drag a Clip's edge to Trim it, or its body to move it. Drag it up or down to change Track.
- Press **S** to Split at the Playhead (the selected Clips, or every Clip under it when nothing
  is selected).
- **⌘D** duplicates. **Delete** / **Backspace** deletes. **⇧Delete** Ripple-deletes.
- **⌘Z** / **⇧⌘Z** undo and redo; the Undo and Redo buttons name the step.
- **⇧-click** or **⌘-click** adds a Clip to the Selection; **⌘A** selects all; **Escape** cancels
  a drag or clears the Selection.
- **+ Track** adds the second video Track; **Place** in the Source list adds a Source after the
  last Clip on the bottom Track.

**Operational notes:**

- Migration: none. The Project schema (version 1) and the IndexedDB version (1) are unchanged;
  Projects saved by step 1 open as they were.
- Feature flag / config: none.
- Rollback: revert the merge. Projects saved with edits stay valid step-1 Projects, because
  their shape did not change.
- `pnpm test` now also runs a small Vitest suite in `packages/engine` (fake-driven race tests).
- The drag, Preview-after-edit and undo timing budgets moved to `pnpm test:e2e:slow`, beside the
  two-minute and 60 s playback measurements.
- **Open before merge:**
  - D1: check an exported file in VLC and QuickTime Player at the reference machine.
  - R-03: the owner's sign-off on AC-23's export peak ceiling (spec §8).
  - Re-run `pnpm test:e2e:slow` on the reference MacBook Air M4; the numbers in
    [`_evidence/performance.md`](../_evidence/performance.md) are from another M4 machine.
  - `playback-rate.spec.ts` (SC-004) fails on `main` and on this branch alike. A ~120 ms
    main-thread stall near the two-minute mark predates this feature. It is recorded there as
    inherited.

**Acceptance criteria delivered:** AC-01 – AC-32 ([spec](../spec.md) §5). The review record
([`_review/review-2026-10-24.md`](../_review/review-2026-10-24.md)) traces each AC to its tests.
AC-23 is met with the export ceiling the owner has yet to confirm (R-03).
