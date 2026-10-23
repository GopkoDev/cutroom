---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0020 — A drag is a preview, and the Project changes once on release

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Dmytro Hopko (spec §1, 2026-10-23); recorded by the agent during `/sdd:design editing`

## Context

The store was built for drags that emit a command on every pointer move inside an open
`beginTransaction`. ADR 0011 debounces the saves of such an open Gesture (500 ms quiet, 2 s at
most) and flushes them on `pagehide`. The editing spec chose differently (§1): a drag is a preview
until it is released. The Timeline shows where the Clips would land, the Project changes only
once, on release, and nothing is saved while a drag is open. The spec asked this design to record
that ADR 0011's debounced save of an open drag is then never used.

## Decision drivers

- Spec AC-17: the saved Project never holds an intermediate drag position.
- Spec AC-19: Escape returns the Clips and leaves the saved Project as it was.
- Spec AC-07: the refusal is shown during the drag, not only on release.
- Spec §6 Drag feedback: ≤ 16.7 ms p95 per pointer move on a heavy Project. A reducer pass, a
  Scene projection and a Scene post per pointer move would spend that budget.
- ADR 0004 and ADR 0011: the save boundary is the undo boundary.

## Considered options

1. **The preview lives outside the Project.** The editor keeps the drag's state (which Clips, the
   Frame delta, the target Track, the trimmed edge, whether it can land) as runtime state. On
   release it sends one command inside one `transact`, and on Escape or a refused release it
   drops the preview.
2. **A command per pointer move inside an open transaction**, aborted on Escape. This is what the
   store was built for and what ADR 0011's debounce serves. The spec rules it out: the saved
   Project would hold intermediate positions, and every pointer move would cost a reducer pass
   and a Scene post. Recorded as the status quo this ADR replaces, not a live option: spec §1
   excludes it.

## Decision outcome

**Chosen:** Option 1.

A drag (a move or a Trim) has three phases:

- **Start.** A press on a Clip becomes a drag once the pointer moves past a few pixels. The
  editor then stops Playback if it is running (AC-31) and opens a drag preview. It does not open
  a transaction. A press released before that is a click, which only changes the Selection
  (AC-14) and leaves Playback running.
- **Pointer moves.** These update only the preview, which asks the model's rule functions
  (ADR 0019) where the Clips can land or where the edge stops. The Project, the Scene and the
  engine are untouched, so the Preview keeps showing the committed Timeline at the Playhead.
- **Release.** If the preview can land and differs from the start, one `transact(label, …)`
  applies one command. That is one history entry and one save, written at once under ADR 0011's
  finished-Gesture rule. Escape, a refused release or an unchanged release drops the preview and
  touches nothing.

While a drag preview is open, undo and redo are unavailable (AC-18), the same rule the store
applies to an open transaction.

The open-Gesture debounce in `apps/editor/src/storage/projects.ts` is removed with this change.
`beginTransaction` stays for a Gesture that genuinely spans events, but no editing Gesture uses
it.

## Consequences

**Positive**
- AC-17 and AC-19 hold by construction: nothing is written until release.
- A pointer move costs a rule check and a re-render of the dragged Clips only (ADR 0021), which is
  what makes the 16.7 ms budget reachable.
- A reload in the middle of a drag brings back the Project as it was before the drag. There is
  nothing to flush on `pagehide`.

**Negative**
- The Preview does not follow a Trim while it is being dragged. It shows the new first Frame only
  after release, within the "Preview after an edit" budget (spec §6). A live Trim preview in the
  Preview would be a later addition. It would post a preview-only Scene and never touch the
  Project.

**Neutral**
- This retires the open-Gesture debounce part of ADR 0011. ADR 0011's finished-Gesture rule
  (write at once, `transaction.commit()` after every `put`) is unchanged.

## Links

- Spec: [spec.md](../features/editing/spec.md) §1, AC-07, AC-17, AC-18, AC-19, AC-31, §6 Drag feedback
- SAD: [sad.md](../features/editing/sad.md) §4, §6
- Related ADR: [0004](./0004-single-reducer-with-inverse-patches-for-undo.md), [0011](./0011-saves-follow-the-gesture-and-commit-explicitly.md) (amended), [0019](./0019-edits-are-intent-commands-that-share-their-rules-with-the-preview.md), [0021](./0021-the-timeline-is-dom-and-a-drag-re-renders-only-the-dragged-clips.md)
