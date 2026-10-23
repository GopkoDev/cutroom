---
id: T039
title: "Implement `attach-source` in `packages/engine/src/sources/attach.ts`"
layer: "app"
deps: []
blocks: []
acs: ["AC-01", "AC-12"]
files_hint: ["packages/engine/src/sources/attach.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T039 — Implement `attach-source` in `packages/engine/src/sources/attach.ts`

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 3 — User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement `attach-source` in `packages/engine/src/sources/attach.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T039 [US1] Implement `attach-source` in `packages/engine/src/sources/attach.ts`: open a Mediabunny `Input` over a `BlobSource`, read duration, dimensions, Source Timebase, codecs and audio presence, and answer `source-attached`. Duration and Timebase stay exact rationals in the Source's own timescale — the Principle II exception, never rounded to the Project's Frames here (FR-002) — **done**: one module answers every `attach-source` with either `source-attached` or `source-failed`, and nothing about a file is ever a `fatal`, because a refused file says nothing about whether the engine can continue. The file is opened as a Mediabunny `Input` over a `BlobSource`, which reads lazily and in ranges, and only packet metadata is read: all five moving fixtures attach in under 10 ms once the module has loaded, the seventy-minute one included, so T055's budget is met by construction. **The Source Timebase is measured, because no container stores one**: Frames × the track's tick rate over the tick span of its first 120 Frames in presentation order (16 extra packets read so B-frame reordering cannot cut the sample short), reduced by gcd. 30000/1001 comes out exact whether the timescale is 30000 or 90000, and 120 keeps the NTSC rates exact even on a millisecond clock; a variable-rate file gets the exact average of its opening Frames. Duration is the **video** track's end, as an exact ratio of its own ticks (899899/30000 for the 29.97 fixture, exactly 899 Frames), so an audio track running past the last Frame cannot stretch the Clip into empty picture. The tick arithmetic lives in the model's Timebase module (R7): `secondsToTicks` holds the one `Math.round`, with the module's tie rule, to recover the integer tick count the container stored from Mediabunny's float; `ticksToSeconds` gives the exact duration; and `timebaseFromTicks` does Frames × clock / span, reduced, in BigInt so a fine clock cannot overflow. attach.ts only reads the clock and ticks from Mediabunny and maps the model's `RangeError` to a refusal. Dimensions are the display size, after pixel aspect ratio and rotation; codec strings are the full parameter string, for diagnostics. On success the Source's `Input` and vetted tracks are held under its id — `getAttachedSource` for T043 and T059, `releaseSource` for `detach-source` — and a Relink supersedes them only on success, so a refused file changes nothing
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T039, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

### AC-01 — happy

> **Given** an empty Project
> **When** the user picks a video file from their own machine
> **Then** the system reads the Source's duration, picture size and Source Timebase; a Source appears in the Source list with its name and duration; and one Clip covering the whole Source appears on the Timeline starting at Frame 0
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — happy

> **Given** a Source over an hour long
> **When** the user imports it
> **Then** the Timeline shows its Clip about as promptly as for a short Source, because importing does not require reading the whole file
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement `attach-source` in `packages/engine/src/sources/attach.ts`: open a Mediabunny `Input` over a `BlobSource`, read duration, dimensions, Source Timebase, codecs and audio presence, and answer `source-attached`. Duration and Timebase stay exact rationals in the Source's own timescale — the Principle II exception, never rounded to the Project's Frames here (FR-002)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 3, commits 7f5efea).
- [x] Delivered in Spec Kit Phase 3 (User Story 1 — Bring a video in and see it (Priority: P1) 🎯 MVP), commits 7f5efea
