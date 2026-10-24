---
id: T020
title: "Measure the drag, Preview, undo and two-Track playback budgets on a heavy Project"
layer: "tests"
deps: ["T019"]
blocks: []
acs: ["AC-16", "AC-17", "AC-23"]
files_hint: ["apps/editor/e2e/editing-performance.spec.ts", "apps/editor/e2e/playback-rate.spec.ts", "docs/features/editing/_evidence/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---
# T020 — Measure the drag, Preview, undo and two-Track playback budgets on a heavy Project

## Place in the sequence

- **Blocked by:** T019 — Prove the edited Export matches the Preview at every Edit point, with both sounds mixed · **Blocks:** nothing · **Wave:** 15.
- **Lane:** shares files with T001 — serialized.

## Why (user story)

> **As a** User
> **I want** to drag one Clip, or several selected Clips together, to another place on the same Track or onto the other Track
> **So that** my shots play in the order I want
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** to undo and redo each thing I did, by key and by button, and see what the next undo or redo will take back
> **So that** I can try an edit without being afraid of it
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** User
> **I want** the sound of every Clip that is playing, on every Track, to be heard together in Playback and in the exported file
> **So that** a cutaway on the upper Track does not silence the shot under it
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

Editing and Playback stay responsive on a heavy Project, measured rather than assumed.

## Inlined context

> "Heavy Project" means two video Tracks holding 100 Clips in total, taken from 1080p 30 fps Sources.
>
> — `spec.md` §6, verbatim · full text: [spec.md](../spec.md)

> Drag feedback | [...] ≤ 16.7 ms p95 per pointer move
> Preview after an edit | After any Gesture ends, the Preview shows the edited Frame at the Playhead within 300 ms p95
> Playback across Edit points | Playing a Timeline with an Edit point every 2 s for 2 minutes keeps picture and sound within one Frame (SC-002's bar) and skips no more than 1% of Frames at the Edit points
> Two Tracks at full rate | Two overlapping 1080p 30 fps Clips, one per Track, play at full rate, skipping no more than 1% of Frames, with no audio interruption
> Undo depth | [...] undo or redo of any single step completes within 100 ms p95 on a heavy Project
>
> — `spec.md` §6, abridged · full text: [spec.md](../spec.md)

> Long-GOP 1080p (a keyframe every 300 Frames) is measured and recorded but does not gate merge. Its backward jumps already take 301–313 ms (ADR 0017). This closes spec §8's SC-003 item for this feature
>
> — `sad.md` §10, QG-3b, abridged · full text: [sad.md](../sad.md)

> Playback may skip more than 1% at Edit points. [...] | High | Measure first (QG-3c). If it misses, pre-open the next Clip's stream ahead of its Edit point in `playback/stream.ts` [...]
> Two 1080p decoders at once may not hold full rate on the reference machine (QG-3d) | Medium | Measure early in implement. [...] If it misses, stop and decide before building on it
>
> — `sad.md` §11, abridged · full text: [sad.md](../sad.md)

> All targets are on the reference machine named in the import-play-export spec §6 (MacBook Air M4, Chrome).
>
> — `spec.md` §6, verbatim · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Schema version 1 and IndexedDB version 1 stay as they are (`data-model.md` §intro, verbatim: "No schema change.").

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-16 — happy

> **Given** a Project after a Trim, a move and a Ripple delete
> **When** the User undoes three times, then redoes three times, by key or by button
> **Then** each undo takes back exactly one of those Gestures in reverse order, each redo puts one back, and the interface names the Gesture the next undo and the next redo will act on
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — domain invariant

> **Given** a drag that passed through many positions before it was released
> **When** the User undoes once
> **Then** the Clip is back where the drag began, not at an intermediate position, because a Gesture is one undo step. Before the undo, the saved Project held only the drag's end position and never an intermediate one; after the undo, it holds the position where the drag began
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — happy

> **Given** a Clip with sound on the upper Track over a Clip with sound on the lower Track
> **When** the User plays across the stretch where both are present, and exports the Project
> **Then** both sounds are heard together, each at its own full level and in sync with its picture, in Playback and in the exported file, with no distortion where their sum would go past full scale; only the picture of the lower Clip is covered
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Build the heavy Project (two Tracks, 100 Clips over the 1080p 30 fps fixtures) in the test through editing commands
- [x] Drag trace: time per pointer move, p95 ≤ 16.7 ms — `apps/editor/e2e/editing-performance.spec.ts`
- [x] Release → Preview's new Frame p95 ≤ 300 ms (keyframe-every-2 s fixtures gate; long-GOP recorded only, SC-003)
- [x] ⌘Z → settled Timeline p95 ≤ 100 ms
- [x] Edit point every 2 s for 2 min: skipped ≤ 1%, A/V within one Frame (SC-002); two Tracks 60 s: skipped ≤ 1%, zero underruns
- [x] Record numbers, machine and Chrome version in `docs/features/editing/_evidence/performance.md`, with the caveat when not on the reference machine

## Edge cases

| Case | Behaviour |
|---|---|
| Skipped Frames > 1% at Edit points | Stop: apply the §11 mitigation in `packages/engine/src/playback/stream.ts` as its own change, do not loosen the bar |
| Measured off the reference machine | Record the machine; the owner re-runs on the MacBook Air M4 |

## Outcome

Decided by the agent on the owner's delegation, 2026-10-24: misses measured while the machine's
1-minute load was far above its 10 cores (22–33) are recorded as provisional and re-run at a load
near 6; the re-runs are the numbers of record. All six budgets pass on this machine (Apple M4,
16 GB, Chrome 156), which is not the reference MacBook Air M4; the owner re-runs them there.
The sad §11 mitigation (Clips starting within 15 Frames prepared ahead while playing,
`packages/engine/src/playback/stream.ts`) is applied. Numbers, load per run and history:
[`_evidence/performance.md`](../_evidence/performance.md).

Open item, inherited, not this task's: `playback-rate.spec.ts` (import-play-export SC-004, at most
one skipped Frame per minute) fails on this branch and on `main` alike, with a ~120 ms main-thread
stall near the two-minute mark (Frames 3597–3599). See the evidence file's "Inherited" section.

## Definition of Done

- [x] Each budget has a passing e2e measurement or a recorded miss with the stop-and-decide note
- [x] Evidence file written
- [x] lint + typecheck clean
- [x] every Hard Rule inlined above still holds
- [x] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
