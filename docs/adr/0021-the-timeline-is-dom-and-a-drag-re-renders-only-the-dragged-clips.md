---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0021 — The Timeline is DOM, and a drag re-renders only the dragged Clips

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Dmytro Hopko, with the agent during `/sdd:design editing`

## Context

The Timeline is written fresh. The Kino prototype is the reference for its look and behaviour,
not a codebase (ADR 0010). It has to hold two video Tracks and, on the spec's heavy Project, 100
Clips. A dragged Clip has to follow the pointer within one display frame. Rewriting the Timeline
on another rendering technology later would take weeks.

## Decision drivers

- Spec §6 Drag feedback: ≤ 16.7 ms p95 per pointer move on a heavy Project (two video Tracks, 100
  Clips).
- ADR 0008: sound plays on the main thread, so heavy React work on the main thread stutters audio.
  A drag stops Playback first (AC-31), but scrolling and Selection changes happen during Playback.
- The existing interface conventions: shadcn and Tailwind tokens, `data-testid` and `aria-label`
  on interactive elements, Playwright tests that target elements (architecture map §Frontend).

## Considered options

1. **DOM elements, with the drag preview applied as a transform.** Each Clip is a React element
   positioned from its Frames. While a drag is open, only the dragged Clips (and the refusal mark)
   re-render, offset by a CSS `transform` computed from the preview state.
2. **One `<canvas>` for the Timeline**, drawn by hand like the Preview. The cost per frame is
   constant whatever the Clip count, but hit-testing, focus, accessibility, text and every e2e
   selector are ours to build, and the design tokens have to be read into JavaScript.

## Decision outcome

**Chosen:** Option 1.

The Timeline lives in `apps/editor/src/ui/timeline/`. A Track renders its Clips as elements
positioned in Frames times the zoom (fixed in this step; zoom and pan are roadmap step 12). The
drag preview is held in its own small slice of the store (ADR 0020). Clip elements subscribe only
to their own Clip and to whether they are part of the open drag, so a pointer move re-renders
the dragged Clips and nothing else. Every Clip carries `data-testid` and an `aria-label` naming its
Source and position, so the e2e tests drive drags the way a User does.

## Consequences

**Positive**
- Accessibility, focus and pointer events come from the platform. The e2e tests find Clips as
  elements, as every step-1 test does.
- The interface keeps one styling system: Clips use the same tokens and `cn`/`cva` helpers as the
  rest of the editor.

**Negative**
- The cost grows with the number of Clips rendered. Well beyond the heavy Project (thousands of
  Clips) the Timeline would need virtualization, rendering only the visible span. That is not
  needed for this step's 100.
- The budget is kept by subscription discipline, not by the technology. A Clip element that
  subscribes to the whole Project, or a drag that writes to the Project, would re-render every
  Clip on each move. The Playwright drag-trace test is what catches that.

**Neutral**
- A canvas Timeline could still come later behind the same store slices if Clip counts grow by an
  order of magnitude. The rule functions (ADR 0019) and the preview state (ADR 0020) do not depend
  on how Clips are drawn.

## Links

- Spec: [spec.md](../features/editing/spec.md) §6 Drag feedback, AC-07, AC-14
- SAD: [sad.md](../features/editing/sad.md) §4, §5
- Related ADR: [0008](./0008-audio-stays-on-the-main-thread.md), [0010](./0010-the-lovable-prototype-is-a-reference-not-a-codebase.md), [0020](./0020-a-drag-is-a-preview-and-the-project-changes-once-on-release.md)
