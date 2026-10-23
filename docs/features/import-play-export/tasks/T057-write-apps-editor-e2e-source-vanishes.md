---
id: T057
title: "Write `apps/editor/e2e/source-vanishes-mid-session.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-37"]
files_hint: ["apps/editor/e2e/source-vanishes-mid-session.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T057 — Write `apps/editor/e2e/source-vanishes-mid-session.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/source-vanishes-mid-session.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T057 [P] [US1] Write `apps/editor/e2e/source-vanishes-mid-session.spec.ts`: with the Project open and a Frame showing, rename the fixture on disk, move the Playhead, and assert the Source reads Offline and the Preview goes empty — not that it keeps showing the last good Frame (T051, spec edge case) — **done**: with Frame 0 on screen (read back with bright counter pixels), the fixture is renamed on disk. 750 ms later the Source still reads Linked, so status is not polled; one ArrowRight then takes the Source Offline with reason `unreachable`. The Clip stays in place and is drawn Offline, and the Preview draws Frame 1 as the opaque black stage, every pixel — not the last good Frame. A second move to Frame 2 stays black. A counter on window `focus` events reads 0, so the trigger was the Playhead move (T051's `verifyLinked`), not the focus check. The engine sends no `source-failed` for this case, so the spec covers only the `getFile()` check on a Playhead move; that remains T051's open contract question
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T057, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-37 — cross-context

> **Given** a Project open with a Frame showing
> **When** the Source's file is moved or deleted and the Playhead moves
> **Then** the Source is reported Offline from the next Frame the Preview is asked to draw, not only after a reload, and the Preview shows no stale picture
>
> — `spec.md §5, AC-37, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/source-vanishes-mid-session.spec.ts`: with the Project open and a Frame showing, rename the fixture on disk, move the Playhead, and assert the Source reads Offline and the Preview goes empty — not that it keeps showing the last good Frame (T051, spec edge case)

## Edge cases

| Case | Behaviour |
|---|---|
| the Source's file is moved or deleted and the Playhead moves | the Source is reported Offline from the next Frame the Preview is asked to draw, not only after a reload, and the Preview shows no stale picture |

## Definition of Done

- [x] Done as recorded: `source-vanishes-mid-session.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
