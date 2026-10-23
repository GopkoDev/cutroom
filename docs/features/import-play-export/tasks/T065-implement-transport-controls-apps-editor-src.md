---
id: T065
title: "Implement transport controls in `apps/editor/src/ui/TopBar.tsx` (play/stop button and spacebar), starting…"
layer: "ui"
deps: []
blocks: []
acs: ["AC-13", "AC-14", "AC-15"]
files_hint: ["apps/editor/src/ui/TopBar.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T065 — Implement transport controls in `apps/editor/src/ui/TopBar.tsx` (play/stop button and spacebar), starting…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 4 — User Story 2 — Playback with sound in sync (Priority: P2) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
> **So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement transport controls in `apps/editor/src/ui/TopBar.tsx` (play/stop button and spacebar), starting….

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T065 [US2] Implement transport controls in `apps/editor/src/ui/TopBar.tsx` (play/stop button and spacebar), starting from the Playhead and leaving it on the Frame that was showing when stopped (FR-010, FR-014) — **done**: one Play/Stop button (`data-testid="transport"`, `aria-pressed`, `aria-keyshortcuts="Space"`), disabled with no Project, and Space wherever focus is except where Space types text; holding the key does not repeat. On a focused button Space would also click it on keyup — after a mouse press that button is Play itself, which would stop what Space just started — so the keyup is swallowed too. Stop sets the Playhead to the last Frame the engine drew during the run (or the starting Frame if none) and the transport to stopped in the same task; the shell then scrubs exactly that Frame, so the picture left on screen is the one the Playhead names (FR-014). Nothing touches the document or the undo history (ADR 0004). Checked in Chrome on `sync-1080p30.mp4`: 2 s of play reached Frame 55, Space on the focused button stopped exactly once at 56 with the Preview on 56, and 24 `AudioBufferSourceNode`s started butted end to start
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T065, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-13 — happy

> **Given** the Playhead is inside a Clip
> **When** the user starts playback
> **Then** playback begins from the Playhead's current Frame; picture and sound advance together, and the Playhead moves in step with them
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy

> **Given** the Playhead is on or past the Timeline's last Frame
> **When** the user starts playback
> **Then** playback starts again from Frame 0, as in common editors and players
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy

> **Given** playback is running
> **When** the user stops it
> **Then** playback halts and the Playhead stays exactly on the Frame that was showing
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement transport controls in `apps/editor/src/ui/TopBar.tsx` (play/stop button and spacebar), starting from the Playhead and leaving it on the Frame that was showing when stopped (FR-010, FR-014)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 4, commits 90b0009).
- [x] Delivered in Spec Kit Phase 4 (User Story 2 — Playback with sound in sync (Priority: P2)), commits 90b0009
