---
status: Approved
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
---

# Public API — import-play-export (`packages/model`)

This is the `library-sdk` surface's contract ([sad.md](../sad.md) frontmatter
`target_surfaces`): the public signatures of `@cutroom/model`, exported from
`packages/model/src/index.ts`. Migrated from the Spec Kit `contracts/model-api.md`, then completed
against the code so that it lists **every** name `index.ts` exports, under the code's own type
names. The check is in [api-sync-report.md](./api-sync-report.md).

The framework-free core. Pure functions and plain data — no browser APIs, no React, no PixiJS, no
Mediabunny. This is what the future backend will reuse to validate a Project document
(ADR 0007), so it must stay dependency-free. Its one runtime dependency is Immer, inside the
reducer; the `Patch` type is re-exported so a caller can hold an undo stack without importing
Immer itself.

## Types

The document's shape. What each field means and the rules on it are in
[data-model.md](../data-model.md); this lists the exported names and fields only.

```
Timebase       { numerator, denominator }   // Frames per second, exact; both positive integers
Rational       { numerator, denominator }   // exact seconds in a Source's own timescale
Frame          number                       // a whole Frame of the Project's Timebase
PixelSize      { width, height }

Project        { schemaVersion: CURRENT_SCHEMA_VERSION, id, name, createdAt, modifiedAt,
                 timebase: Timebase, frameSize: PixelSize, sources: Source[], timeline: Timeline }
Source         { id, name, address: SourceAddress, fingerprint: SourceFingerprint,
                 duration: Rational, timebase: Timebase, dimensions: PixelSize,
                 hasAudio: boolean, codecs: Codecs }
SourceAddress  { kind: "local-file" }
SourceFingerprint { size, lastModified }
Codecs         { video?, audio? }
Timeline       { tracks: Track[], durationFrames: Frame }
Track          { id, kind: TrackKind, name, clips: Clip[] }
TrackKind      "video"
Clip           { id, sourceId, startFrame: Frame, durationFrames: Frame, sourceInPoint: Rational }
```

Every field is `readonly`. `createdAt`, `modifiedAt` and a command's `at` are ISO 8601 strings.

## Timebase

The single place where Frames become anything else (Principle II, R7).

```
frameToSeconds(timebase, frame): number
timebaseAsNumber(timebase): number              // Frames per second as a float, for a muxer's
                                                // track metadata only; never computes a position
secondsToFrame(timebase, seconds): integer      // documented rounding, one definition
frameToSampleIndex(timebase, sampleRate, frame): integer
framesForDuration(timebase, duration: Rational): integer  // exact ratio, not a float
                                                // counts Frames whose start is inside the media
frameToSourceTime(timebase, sourceInPoint: Rational, frame): Rational
sourceTimeBefore(time: Rational, duration: Rational): Rational  // exact; clamps at 0
frameToTimecode(timebase, frame): Timecode      // Timecode = { hours, minutes, seconds, frames }
                                                // wall-clock, not SMPTE; frames = offset in second

// A Source's own clock — ticks of a container timescale, never Frames of the Project
secondsToTicks(ticksPerSecond, seconds): integer  // recovers a stored integer; may be negative
ticksToSeconds(ticksPerSecond, ticks): Rational
sourceTimeToTicks(ticksPerSecond, time: Rational): integer  // an exact Source time on a clock,
                                                  // e.g. a Clip's in-point as a sample index
timebaseFromTicks(ticksPerSecond, frames, spanTicks): Timebase  // measures a Source Timebase

// Playback on the audio clock — PlaybackAnchor = { frame, contextSeconds }: Frame `frame` begins
// to sound when AudioContext.currentTime reads `contextSeconds` (ADR 0008)
frameToContextTime(timebase, anchor, frame): number           // when a Frame begins to sound
frameAtContextTime(timebase, anchor, contextSeconds): integer // the last Frame begun: floor, not
                                                              // nearest; the anchor's before it
timelineSampleToContextTime(timebase, anchor, sampleRate, sample): number
                                                // a Timeline-grid sample (audio-pcm) on the clock
anchorAtTimelineSample(timebase, sampleRate, sample, frame): PlaybackAnchor
                                                // the anchor under which `sample` begins at
                                                // context time 0 — for an OfflineAudioContext
                                                // rendering the export mix from `sample` on
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
| `secondsToTicks` | Nearest tick, the same tie rule. It recovers an integer the container stored from a demuxer's `ticks / clock` float, so it absorbs one division's last-bit error and involves no rate. |
| `sourceTimeToTicks` | Nearest tick, the same tie rule, computed exactly from the rational. Where the time is a Frame boundary it agrees with `frameToSampleIndex`, so a Clip's sound and picture start on the same sample. |
| `frameToTimecode` | Exact, no tie to break: the second is floor(frame ÷ Timebase), and that second's first Frame is ceil(second × Timebase) — the same count `framesForDuration` gives. |

- Where a container states how many Frames a Source actually holds, that fact beats
  `framesForDuration`, which is for audio and for expressing a Source's length in a Timebase it
  was not authored in.
- `frameToSourceTime` stays rational the whole way, so a Source whose Timebase differs from the
  Project's is handled here and nowhere else. `packages/engine` calls it rather than doing the
  arithmetic itself (R7).
- `frameToTimecode` is wall-clock: `seconds` is the real second a Frame begins in. At an integer
  Timebase that equals SMPTE non-drop; at 30000/1001 a second holds 30 or 29 Frames as the
  arithmetic falls, instead of drifting 3.6 s an hour (non-drop) or adopting drop-frame's
  29.97-only skipping rule. Formatting it as `HH:MM:SS:FF` is the UI's job, not arithmetic.
- The tick functions are how a Source's duration and Source Timebase are built (`packages/engine`
  reads the clock and the ticks from Mediabunny and calls them, R7). They produce Source time —
  Principle II's exception — and never a Frame of the Project's Timebase. Results are in lowest
  terms, so 30000/1001 comes out the same from a 30000, 90000 or millisecond clock.
- All functions are total: invalid input throws rather than returning a plausible number. The
  error is a `RangeError` naming the function, the argument and the value.

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
// Every command carries `at`: the ISO 8601 instant that becomes the Project's `modifiedAt`.
type Command = CreateProjectCommand | ImportSourceCommand | AddClipCommand | RelinkSourceCommand
CreateProjectCommand { type: "create-project", at, projectId, name, timebase: Timebase,
                       frameSize: PixelSize, track: { id, name } }
ImportSourceCommand  { type: "import-source", at, source: Source }
AddClipCommand       { type: "add-clip", at, trackId, clip: Clip }
RelinkSourceCommand  { type: "relink-source", at, sourceId, name, fingerprint: SourceFingerprint }

applyCommand(project: Project | null, command: Command): CommandResult
CommandResult { project: Project, patches: Patch[], inversePatches: Patch[] }
// null is the prior state accepted by `create-project`, and by nothing else:
// a Project has to come from somewhere, and the reducer is that somewhere.
// `patches` is redo, `inversePatches` is undo — both fall out of the same write.
class CommandError extends Error   // name "CommandError"; message "applyCommand: <type>: <problem>"
type Patch                          // Immer's, re-exported

// The import gesture as commands — built here so the editor never assembles them itself
importCommands(project: Project | null, request: ImportRequest): Command[]
ImportRequest { at, source: Source, clipId, projectId, trackId }
FIRST_TRACK_NAME = "Video 1"        // the first Track's name when an import creates the Project
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
- A command that cannot be carried out on this Project throws `CommandError` before anything is
  written, so the caller's Project is exactly as it was. It is a class of its own so the store
  can tell "the user asked for something impossible" from a bug.
- `importCommands` returns, in apply order: with no Project, `create-project` (adopting the
  Source's Timebase and dimensions, named after the Source, first Track named
  `FIRST_TRACK_NAME`), then `import-source`, then `add-clip` covering the whole Source at Frame 0.
  With a Project open, its Timebase and frame size stay; it returns `import-source` then
  `add-clip` at the end of the first video Track. `projectId` and `trackId` are asked for always
  and used only when there is no Project. It throws `CommandError` up front when the import could
  never succeed (a Source shorter than one Frame, a duration that is not an exact ratio, no video
  Track); every other refusal is `applyCommand`'s.

## Scene projection

```
projectScene(project: Project): Scene
Scene     { timebase: Timebase, frameSize: PixelSize, clips: SceneClip[] }
SceneClip { clipId, sourceId, startFrame: Frame, durationFrames: Frame, sourceInPoint: Rational }
```

**Contract**

- Pure and total. Contains only what affects the picture (see data-model).
- Deterministic ordering: `SceneClip`s back to front — `tracks[0]` backmost — stable across calls, so two identical Projects
  produce byte-identical Scenes.
- Referentially transparent enough to memoise: an edit that does not change the picture must not
  produce a different Scene.
