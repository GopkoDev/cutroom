---
id: T096
title: "Walk the manual validation list in quickstart.md end to end in Chrome and record the result"
layer: "tests"
deps: []
blocks: []
acs: ["AC-01", "AC-31"]
files_hint: ["docs/features/import-play-export/_evidence/validation.md"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "blocked"
step: "awaits a person — SC-006 in VLC and QuickTime Player, and the rest of validation.md §Needs a human"
---

# T096 — Walk the manual validation list in quickstart.md end to end in Chrome and record the result

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 6 — Polish & Cross-Cutting Concerns (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Walk the manual validation list in quickstart.md end to end in Chrome and record the result.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [ ] T096 Walk the manual validation list in [quickstart.md](./quickstart.md) end to end in Chrome and record the result. Three items in it are gates rather than observations: the CPU-throttled playback check, the time from page load to Frame 0 on screen with picker time excluded (SC-001), and opening an exported file in all three named players — QuickTime, VLC and Chrome — where two out of three is a failure (SC-006) — **walked; SC-006 awaits a person**: every quickstart step ran in real Chrome 156 on the M4 through the real UI with stand-in pickers, results in `validation.md`. **Gates**: CPU-throttled playback passes — the literal 6× skips no Frames on this machine, so it was run at 20× on the page (77 of 900 skipped, sound one unbroken 30 000.000 ms run, clicks on the sample) and with the engine worker ≈90 % busy (300 skipped, sound as clean); SC-001 passes at 483–652 ms from page load to Frame 0 against 15 s, now a permanent test (`page-load-to-frame-0.spec.ts`); **SC-006 is not closed** — Chrome passes (a `<video>` plays 30.000 s, 0 dropped, counters 000000…000899, clicks on seconds 1–29), QuickTime passes only by AVFoundation proxy (all 900 Frames and exactly 1 440 000 samples, clicks on the sample, `AVPlayer` plays to the end), and VLC is not installed (its decoder library, ffmpeg, passes). Still for a person: VLC and QuickTime Player themselves, the real save dialog choosing an existing file (decisions.md open risk), real permission prompts, a Finder rename, listening through speakers, SC-001 timed by hand — checklist at the end of `validation.md`
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T096, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy

> **Given** an empty Project
> **When** the user picks a video file from their own machine
> **Then** the system reads the Source's duration, picture size and Source Timebase; a Source appears in the Source list with its name and duration; and one Clip covering the whole Source appears on the Timeline starting at Frame 0
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-31 — happy

> **Given** an exported file
> **When** it is played in a common video player
> **Then** its duration matches the Timeline, and its picture and sound are in sync throughout
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Walk the manual validation list in [quickstart.md](./quickstart.md) end to end in Chrome and record the result. Three items in it are gates rather than observations: the CPU-throttled playback check, the time from page load to Frame 0 on screen with picker time excluded (SC-001), and opening an exported file in all three named players — QuickTime, VLC and Chrome — where two out of three is a failure (SC-006)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Every quickstart step walked in real Chrome through the UI with stand-in pickers; results in [validation.md](../_evidence/validation.md)
- [x] CPU-throttled playback gate and SC-001 gate passed
- [ ] SC-006 confirmed by a person in VLC and in QuickTime Player itself
- [ ] The remaining validation.md §Needs a human items checked by a person
