# Contract: `packages/model`

The framework-free core. Pure functions and plain data — no browser APIs, no React, no PixiJS, no
Mediabunny. This is what the future backend will reuse to validate a Project document
(ADR 0007), so it must stay dependency-free.

## Timebase

The single place where Frames become anything else (Principle II, R7).

```
frameToSeconds(timebase, frame): number
secondsToFrame(timebase, seconds): integer      // documented rounding, one definition
frameToSampleIndex(timebase, sampleRate, frame): integer
framesForDuration(timebase, duration): integer  // duration is an exact ratio, not a float
                                                // counts Frames whose start is inside the media
frameToSourceTime(timebase, sourceInPoint, frame): { numerator, denominator }
```

**Contract**

- Three functions have to collapse an exact ratio to an integer, and all three use one stated
  rule so they cannot disagree:
  - `secondsToFrame` — **nearest Frame, an exact half rounding up**. Frame n owns [n − ½, n + ½),
    so every instant belongs to exactly one Frame. This is the rule meant by "time is snapped onto
    the Frame grid in one place"; it is tested at the boundaries, and negative input is rejected.
  - `frameToSampleIndex` — same tie rule. A rounding here is unavoidable, not a lapse: at 48 kHz a
    29.97 Frame boundary falls at 1601.6 samples and the two grids never realign.
  - `framesForDuration` — **rounds up**, because a count of n means indices 0 … n − 1 and index n
    is the exclusive end. A 10.000 s Source at 30000/1001 is 300 Frames: index 299 starts at
    9.9766 s, inside the media, and only index 300 — never displayed — lies past it. Truncating
    here silently discards the last real Frame of every Source, which is the mistake this line
    exists to prevent.
- Where a container states how many Frames a Source actually holds, that fact beats this
  inference; `framesForDuration` is for audio, and for expressing a Source's length in a Timebase
  it was not authored in.
- `frameToSampleIndex` is computed from the absolute Frame, never accumulated, so error cannot
  build up over a long Timeline (≤ half a sample at 29.97).
- `frameToSourceTime` turns a Project Frame into a time inside a Source, staying rational the whole
  way, so a Source whose Timebase differs from the Project's is handled here and nowhere else.
  `packages/engine` calls it rather than doing the arithmetic itself — R7 forbids frame-rate
  arithmetic outside this module, and a mismatched-Timebase Source is exactly where that rule earns
  its keep.
- All functions are total: invalid input throws rather than returning a plausible number.

## Document

```
parseProject(unknown): Project                 // validates and narrows; throws on invalid
migrateProject(unknown): Project               // applies migrations up to current schemaVersion
CURRENT_SCHEMA_VERSION: integer
```

**Contract**

- `parseProject` rejects: non-integer Frame values, overlapping Clips, non-positive durations, a
  Timebase that is not a positive ratio, and anything not round-trippable through structured
  clone.
- Every schema version has a migration to the next. A document one version behind must open; a
  document from the future must be refused with a clear reason, not silently coerced.

## Reducer

```
type Command = { type: "create-project", ... } | { type: "import-source", ... }
             | { type: "add-clip", ... }      | { type: "relink-source", ... }
applyCommand(project, command): { project, patches, inversePatches }
```

**Contract**

- Pure: same input, same output; no clocks, no randomness, no I/O. Ids and timestamps are passed
  in by the caller, never generated inside.
- Every command produces inverse patches. A command that cannot be inverted is not a command
  (Principle IV).
- Commands that belong to one user gesture are grouped by the caller into a transaction; the
  reducer itself knows nothing about transactions.
- Runtime state (playhead, transport, export progress, Source link status) lives outside the
  document and is not undoable.

## Scene projection

```
projectScene(project): Scene
```

**Contract**

- Pure and total. Contains only what affects the picture (see data-model).
- Deterministic ordering: `SceneClip`s back to front, stable across calls, so two identical Projects
  produce byte-identical Scenes.
- Referentially transparent enough to memoise: an edit that does not change the picture must not
  produce a different Scene.
