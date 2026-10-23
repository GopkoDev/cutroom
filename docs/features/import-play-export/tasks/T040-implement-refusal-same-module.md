---
id: T040
title: "Implement refusal in the same module"
layer: "app"
deps: []
blocks: []
acs: ["AC-09", "AC-10"]
files_hint: ["packages/engine/src/sources/attach.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T040 — Implement refusal in the same module

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement refusal in the same module.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T040 [US1] Implement refusal in the same module: a file with no decodable video track — an audio-only file or an image included — or one that fails `canDecode`, answers `source-failed` with a reason naming what was wrong, and the store leaves the Project untouched. The spec refuses these clearly rather than half-supporting them, so "no video track" is a first-class answer and not an accident (FR-003, spec edge case) — **done**: every reason starts with the file name and names what was wrong. `audio-only.m4a` is "no video track — it contains only sound (mp4a.40.2)"; `still.png` is "an image (image/png)", detected from `File.type`; `broken.mp4`, whose `moov` was cut off, is "describes no tracks at all, so it is probably damaged or incomplete", because calling it "no video track" would send the user looking for the wrong problem. Video *or* sound that fails `canDecode` refuses the whole Source, because a Source that plays silently is half-supported. Any other error Mediabunny raises while reading, a vanished file's `NotReadableError` included, becomes "could not be read — it may be damaged or incomplete (…)". Verified against all eight fixtures in the real worker in Chrome, and by re-attaching an attached id with junk bytes: `source-failed`, worker alive, earlier registration kept
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T040, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-09 — error

> **Given** any Project
> **When** the user picks a file the product cannot decode
> **Then** the system states plainly that the file cannot be used and why, and the Project is left unchanged
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — error

> **Given** any Project
> **When** the user picks an audio-only file or an image
> **Then** the system refuses it clearly as outside what this slice supports, rather than half-supporting it, and the Project is left unchanged
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement refusal in the same module: a file with no decodable video track — an audio-only file or an image included — or one that fails `canDecode`, answers `source-failed` with a reason naming what was wrong, and the store leaves the Project untouched. The spec refuses these clearly rather than half-supporting them, so "no video track" is a first-class answer and not an accident (FR-003, spec edge case)

## Edge cases

| Case | Behaviour |
|---|---|
| the user picks a file the product cannot decode | the system states plainly that the file cannot be used and why, and the Project is left unchanged |
| the user picks an audio-only file or an image | the system refuses it clearly as outside what this slice supports, rather than half-supporting it, and the Project is left unchanged |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
