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
framesForDuration(timebase, seconds): integer
```

**Contract**

- `secondsToFrame` is the only rounding of time in the codebase. Its rule is documented and
  tested at boundaries (exactly on a Frame, half a Frame either side, negative input rejected).
- `frameToSampleIndex` is computed from the absolute Frame, never accumulated, so error cannot
  build up over a long Timeline (≤ half a sample at 29.97).
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
type Command = { type: "import-source", ... } | { type: "set-playhead", ... } | ...
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
- Deterministic ordering: Scene items back to front, stable across calls, so two identical Projects
  produce byte-identical Scenes.
- Referentially transparent enough to memoise: an edit that does not change the picture must not
  produce a different Scene.
