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

Three functions collapse an exact ratio to an integer, and all three use one tie rule so they
cannot disagree: **nearest, an exact half rounding up**. Their directions differ where the
question differs, and each is stated once here and argued once, at its definition in
`timebase.ts` — not in both places:

| | Rule |
|---|---|
| `secondsToFrame` | Nearest Frame. Frame n owns [n − ½, n + ½), so every instant belongs to exactly one Frame. Negative input is rejected. |
| `frameToSampleIndex` | Nearest sample, computed from the absolute Frame and never accumulated, so error stays ≤ half a sample however long the Timeline. |
| `framesForDuration` | Rounds **up**: a count of n means indices 0 … n − 1, and the last Frame still starts inside the media. Truncating discards a real Frame. |

- Where a container states how many Frames a Source actually holds, that fact beats
  `framesForDuration`, which is for audio and for expressing a Source's length in a Timebase it
  was not authored in.
- `frameToSourceTime` stays rational the whole way, so a Source whose Timebase differs from the
  Project's is handled here and nowhere else. `packages/engine` calls it rather than doing the
  arithmetic itself (R7).
- All functions are total: invalid input throws rather than returning a plausible number.

## Document

```
parseProject(unknown): Project                 // validates and narrows; throws on invalid
migrateProject(unknown): Project               // applies migrations up to current schemaVersion
CURRENT_SCHEMA_VERSION: integer
```

**Contract**

- What `parseProject` accepts is the validation summary in
  [data-model.md](../data-model.md#validation-summary), which is the single list — it is not
  restated here, because two lists of rules drift.
- Every schema version has a migration to the next. A document one version behind must open; a
  document from the future must be refused with a clear reason, not silently coerced.

## Reducer

```
type Command = { type: "create-project", ... } | { type: "import-source", ... }
             | { type: "add-clip", ... }      | { type: "relink-source", ... }
applyCommand(project: Project | null, command): { project, patches, inversePatches }
// null is the prior state accepted by `create-project`, and by nothing else:
// a Project has to come from somewhere, and the reducer is that somewhere.
// `patches` is redo, `inversePatches` is undo — both fall out of the same write.
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
- Deterministic ordering: `SceneClip`s back to front — `tracks[0]` backmost — stable across calls, so two identical Projects
  produce byte-identical Scenes.
- Referentially transparent enough to memoise: an edit that does not change the picture must not
  produce a different Scene.
