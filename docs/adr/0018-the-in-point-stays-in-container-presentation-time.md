---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0018 — The In-point stays in container presentation time

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Dmytro Hopko, with the agent during `/sdd:design editing`

## Context

A Clip's In-point is an exact `Rational` of seconds in its Source's own timescale (ADR 0002,
`packages/model/src/document/types.ts`). Step 1 always wrote `0/1`, so it never mattered what
"zero seconds" meant. Head Trim and Split are the first edits to write a non-zero In-point into
saved Projects, and from then on changing its meaning is a migration of every saved Project. This
was roadmap decision D4, deferred by the editing spec (§8) to this design.

## Decision drivers

- Spec §6 Frame accuracy: a head Trim by N Frames, a Split and a move land on exactly the expected
  Source Frame in 100% of model test cases.
- Spec AC-01 and the §1 note on D4: trimming the head by N Frames shows exactly the Frame that was
  N Frames into the Clip.
- Principle II: the Timebase module is the only place a Frame becomes Source time.
- The engine already maps the In-point in this space for both picture (`playback/mapping.ts`) and
  sound (`sources/audio.ts`, `sourceTimeToTicks(sampleRate, clip.sourceInPoint)`).
- Spec AC-25: an Offline Source's Clips are edited from what was recorded at import, so the rule
  cannot depend on reading the file again.

## Considered options

1. **Container presentation time.** The In-point is a timestamp as the container states it and
   Mediabunny reports it. A Source spans `[0, Source.duration]` as recorded at import.
2. **Time from the first sample.** The In-point is measured from the video track's first
   presentation timestamp. Each Source stores that offset, which means a schema version 2 and a
   migration step, and the engine shifts sound by the difference between the audio and video
   tracks' first timestamps.

## Decision outcome

**Chosen:** Option 1, container presentation time, as step 1 already behaves.

The In-point changes only through `frameToSourceTime`. A head Trim by `n` Frames sets the
In-point to `frameToSourceTime(timebase, inPoint, n)`. A Split at offset `k` into a Clip gives
the second half `frameToSourceTime(timebase, inPoint, k)`. Both are exact ratios, so "the first
Frame after a head Trim by N is the Frame that was N Frames in" holds by construction rather than
by rounding. The Source-bounds rule follows from the same space. A Clip may show `durationFrames`
Frames only while `durationFrames ≤ framesForDuration(timebase, Source.duration − inPoint)`. That
is the same ceiling rule the import used to size the first Clip, so every step-1 Project
satisfies it. The model checks the rule on every edit and when it loads a Project.

## Consequences

**Positive**
- No schema change and no migration. Schema version 1 already holds any non-negative `Rational`
  In-point.
- The relation between picture and sound is the one the file itself defines, and the engine keeps
  mapping both through the same In-point.
- Bounds are computable for an Offline Source from `Source.duration` alone.

**Negative**
- For a file whose first video sample has a presentation time above zero (some camera MP4s, TS
  streams), "the Source's beginning" is time zero, not the first picture. A head Trim can reach
  back past the first picture by that offset. The decoder then shows the first picture, so
  nothing breaks, but the Trim limit sits slightly before the picture.

**Neutral**
- This narrows one sentence of ADR 0002 ("no editing operation computes with it"): editing now
  advances the In-point, but only through the Timebase module and only by whole Project Frames.
  No editing operation does arithmetic on Source time outside `packages/model/src/timebase.ts`.
- Switching to option 2 later is possible. It needs a schema bump and a migration that adds each
  Source's offset and rewrites every In-point.

## Links

- Spec: [spec.md](../features/editing/spec.md) §8 (D4), AC-01–AC-04, §6 Frame accuracy
- SAD: [sad.md](../features/editing/sad.md) §4
- Related ADR: [0002](./0002-timeline-time-is-integer-frames.md), [0016](./0016-the-source-timebase-is-measured.md), [0019](./0019-edits-are-intent-commands-that-share-their-rules-with-the-preview.md)
