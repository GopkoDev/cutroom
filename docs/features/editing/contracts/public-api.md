---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-23"
feature_size: "L"
---

# Public API — editing (`packages/model`)

This is the contract of the `library-sdk` surface ([sad.md](../sad.md) frontmatter
`target_surfaces`): what this step adds to, or changes in, the public signatures of
`@cutroom/model`, exported from `packages/model/src/index.ts`. Everything not named here stands as
[import-play-export/contracts/public-api.md](../../import-play-export/contracts/public-api.md)
states it. Each name below was derived from [data-model.md](../data-model.md), the
[sad.md](../sad.md) §6 flows, the spec's acceptance criteria and ADRs 0018 and 0019. The check is
in [api-sync-report.md](./api-sync-report.md).

The Timeline issues these commands today, and the agent will issue the same ones in roadmap steps
10–11 (spec §1). That is why each one is plain data, names its Clips by id, carries a resolved
target and is refused with a machine-readable reason (ADR 0019).

## Types

No document type changes. Schema version 1 already expresses every edit ([data-model.md](../data-model.md)).

```
MAX_VIDEO_TRACKS = 2        // the product limit add-track refuses beyond (AC-30); not a document rule
```

## Timebase

One addition. It is needed to bound a head Trim that extends a Clip back into its Source, which is
the only place editing turns Source time into a count of Frames (ADR 0018).

```
wholeFramesIn(timebase, duration: Rational): integer   // whole Frames that fit in `duration`:
                                                       // rounds DOWN, the opposite of
                                                       // framesForDuration
```

**Contract**

- `wholeFramesIn` rounds down, because it answers "how many whole Frames of Source lie before
  this In-point". `framesForDuration` rounds up, because it answers "how many Frames start inside
  this media". Where the duration is an exact number of Frames the two agree. That is always the
  case for an In-point that editing wrote, since it only ever moves by whole Frames from `0`.
- It throws a `RangeError` on invalid input, like every other Timebase function.

Editing moves an In-point only through existing functions, by whole Project Frames `n` (ADR 0018):

| Edit | New `sourceInPoint` |
|---|---|
| Head Trim later by `n` | `frameToSourceTime(timebase, inPoint, n)` |
| Head Trim earlier by `n` | `sourceTimeBefore(inPoint, frameToSourceTime(timebase, {0,1}, n))` |
| Split at offset `k` into the Clip (second half) | `frameToSourceTime(timebase, inPoint, k)` |

## Document

Signatures are unchanged. `parseProject` now also refuses a Clip outside its Source and a
Timeline with no Track. The single list of what it accepts stays in
[data-model.md](../data-model.md#validation-summary).

## Reducer

### Commands

```
type Command = CreateProjectCommand | ImportSourceCommand | AddClipCommand | RelinkSourceCommand
             | TrimClipCommand | SplitClipsCommand | MoveClipsCommand | DeleteClipsCommand
             | DuplicateClipsCommand | AddTrackCommand | RemoveTrackCommand

TrimClipCommand       { type: "trim-clip", at, clipId, edge: "head" | "tail", frame: Frame }
SplitClipsCommand     { type: "split-clips", at, frame: Frame,
                        cuts: { clipId, newClipId }[] }
MoveClipsCommand      { type: "move-clips", at, clipIds: string[], delta: integer,
                        toTrackId: string | null }
DeleteClipsCommand    { type: "delete-clips", at, clipIds: string[], ripple: boolean }
DuplicateClipsCommand { type: "duplicate-clips", at, delta: integer,
                        copies: { clipId, newClipId }[] }
AddTrackCommand       { type: "add-track", at, track: { id, name } }
RemoveTrackCommand    { type: "remove-track", at, trackId }
```

Every command carries `at`, as in step 1. Every new id (`newClipId`, `track.id`) comes from the
caller. What each command writes is the table in [data-model.md](../data-model.md) §Clip.

| Command | Target | Applies | Spec |
|---|---|---|---|
| `trim-clip` | `frame` is where the edge goes: for `head`, the new `startFrame`; for `tail`, the new end, `startFrame + durationFrames` (exclusive) | A head Trim moves the In-point by the same number of Frames (§Timebase). A tail Trim changes only `durationFrames` | AC-01–AC-03, AC-25 |
| `split-clips` | `frame` is the Playhead. Each cut names a Clip that `frame` is strictly inside, and the id of its second half | The first half ends at `frame`, and the second half starts there with the In-point advanced by `frame − startFrame`. Both halves keep the Source | AC-04, AC-29 |
| `move-clips` | `delta` in Frames, which may be negative. `toTrackId` is `null` to keep each Clip on its own Track, or a Track id when every Clip is on one Track | Each Clip keeps its id, so the engine's per-Clip state survives the move. All or none | AC-06, AC-08, AC-09 |
| `delete-clips` | the Clips; `ripple` | Without `ripple`, it removes the Clips. With `ripple`, every later Clip on the same Track moves back by the total length deleted before it on that Track. Each Track is closed separately | AC-10, AC-11 |
| `duplicate-clips` | `delta` is the Frame offset of the block from the originals. Each copy has the same Track, Source, In-point and length as its original | All copies are placed, or the command is refused | AC-12, AC-13 |
| `add-track` | `{ id, name }` | Appends an empty video Track on top (`tracks[length]`) | AC-20, AC-30 |
| `remove-track` | `trackId` | Removes the Track and every Clip on it | AC-21, AC-22 |
| `add-clip` (step 1) | unchanged | Also refuses a Clip outside its Source now (`source-bounds`) | AC-24, data-model.md |

**Contract**

- **Whole or refused.** A command either applies in full, in one `produceWithPatches`, or throws
  `CommandError` before anything is written. A move, Duplicate or Split of several Clips never
  applies to some of them.
- **No change, no patches.** A command that would change nothing returns the Project unchanged,
  with empty `patches` and `inversePatches`. That covers a move by `0` onto the same Track, a Trim
  to the edge's current Frame, and a delete or Duplicate with an empty list. The store records no
  history entry and no save for it (AC-32). This is not a refusal.
- **Ids in, ids out.** A command names Clips only by id and never sees the Selection. An id that
  is not on the Timeline is refused with `unknown-clip`. The same id twice in one command is
  refused with `invalid`.
- **The target is exact.** The reducer refuses a target that breaks a rule rather than moving it
  to the nearest valid one. Holding a dragged edge at its limit is the caller's job, done with the
  rule functions below, so the command sent on release is already valid (ADR 0019).
- **No Source is read.** Every bound comes from `Source.duration` as recorded at import, so every
  command works the same on an Offline Source (AC-25).

### Refusals

```
class CommandError extends Error   // name "CommandError"; message "applyCommand: <type>: <problem>"
  readonly reason: RefusalReason   // NEW — machine-readable; the message stays for people

type RefusalReason =
  // editing rules (ADR 0019)
  | "overlap"                // Clips would overlap on a Track                     AC-03, AC-07, AC-13
  | "before-timeline-start"  // a Clip would start before Frame 0                  AC-03, AC-07
  | "too-short"              // a Clip would be shorter than one Frame             AC-03
  | "source-bounds"          // a Clip would show past its Source's start or end  AC-02
  | "track-limit"            // add-track beyond MAX_VIDEO_TRACKS                  AC-30
  | "last-track"             // remove-track of the only Track                     AC-22
  | "nothing-to-split"       // a cut whose Clip `frame` is not strictly inside   AC-05
  | "unknown-clip"           // a Clip id not on the Timeline                      AC-15
  // the refusals step 1 already makes, now named
  | "unknown-track"          // a Track id not in the Project
  | "unknown-source"         // a Source id not in the Project
  | "duplicate-id"           // a new id already in use
  | "no-project"             // any command but create-project on no Project
  | "invalid"                // a malformed field: a non-whole Frame, an empty id, a bad
                             // timestamp, a repeated id in one command, a two-Track move
                             // given a toTrackId
```

**Contract**

- Every `CommandError` carries a `reason`, including those from step-1 commands and from
  `importCommands`. The editor maps `reason` to the notice wording (`ui/failure-wording.ts`), and
  never parses `message`.
- When a command breaks more than one rule, the reason is the first one checked, in this order:
  `no-project`, `invalid`, then `unknown-*`, `duplicate-id`, then the editing rules in the order
  listed. A command is deterministic, so the same refused command always gives the same reason.

## Editing rules

These are the pure functions in `packages/model/src/editing/`, exported from the barrel. The
reducer decides with them, the drag preview draws with them on every pointer move, and the
agent can ask them before issuing a command. So the preview cannot promise what the release then
refuses (ADR 0019, AC-07).

```
trimRange(project, clipId, edge: "head" | "tail"): TrimRange
TrimRange { earliest: Frame, latest: Frame }   // every Frame the edge may sit at, inclusive;
                                               // the current Frame is always inside

checkMove(project, clipIds: string[], delta: integer, toTrackId: string | null): Verdict
Verdict   { ok: true } | { ok: false, reason: RefusalReason }

duplicateDelta(project, clipIds: string[]): integer
                                               // the Frame offset of the block of copies

splitTargets(project, frame: Frame, selectedClipIds: string[]): SplitTargets
SplitTargets { kind: "cut", clipIds: string[] }
           | { kind: "none", because: "selection-not-under-frame" | "nothing-under-frame" }

rippleShifts(project, clipIds: string[]): { clipId, delta: integer }[]
                                               // how far each later Clip moves back
```

| Function | Rule | Spec |
|---|---|---|
| `trimRange` | `head`: no earlier than Frame 0, the end of the Clip before it on the Track, or `startFrame − wholeFramesIn(timebase, inPoint)`, whichever is latest; no later than one Frame before the Clip's end. `tail`: no earlier than one Frame after `startFrame`; no later than the next Clip's start, or `startFrame + framesForDuration(timebase, sourceTimeBefore(Source.duration, inPoint))`, whichever is earliest | AC-02, AC-03 |
| `checkMove` | Every Clip lands at or after Frame 0, overlapping nothing that is not itself moving. With `toTrackId`, every Clip must start on one Track | AC-07, AC-09 |
| `duplicateDelta` | It returns `end of the Selection − start of the Selection` when every Track the Selection spans has room there. Otherwise it returns the offset that places the block after the last Clip on those Tracks | AC-12, AC-13 |
| `splitTargets` | With a Selection, the selected Clips that `frame` is strictly inside. With none, every Clip strictly under `frame` on every Track. `because` tells the two empty cases apart for the notice | AC-04, AC-05, AC-29 |
| `rippleShifts` | Per Track, each Clip after a deleted one moves back by the total length deleted before it on its own Track. Clips on other Tracks get no entry | AC-11 |

**Contract**

- The functions are pure and total over a parsed Project. An unknown id is not an exception:
  `checkMove` answers `{ ok: false, reason: "unknown-clip" }`, and the others ignore the id.
- `applyCommand` refuses exactly when the matching function says no. A command built from a
  `trimRange` Frame, a `checkMove` verdict of `ok`, a `duplicateDelta` or a `splitTargets` cut is
  never refused for an editing rule. Property tests pin this pairing.
- `splitTargets`' `kind: "none"` is not a refusal. The editor shows the notice and sends no command
  (AC-05).

## Place a Source

```
placeSourceCommand(project: Project, request: PlaceRequest): AddClipCommand
PlaceRequest { at, sourceId, clipId }
```

**Contract**

- Builds the `add-clip` that places the whole Source at the length recorded at import
  (`framesForDuration(timebase, Source.duration)`, In-point `0`). It goes after the last Clip on
  `tracks[0]`, the bottom Track (AC-24). It reads nothing from the file, so it works for an Offline
  Source.
- `importCommands` builds its own `add-clip` with it, so an import and a place cannot disagree on
  where a whole Source lands.
- It throws `CommandError` with `unknown-source` for an id not in the Project, and `too-short` for
  a Source shorter than one Frame.

## Scene projection

Unchanged. `projectScene` already lists the Clips of every Track back to front, `tracks[0]`
backmost, so a Clip on the upper Track covers the lower one with no new field (AC-08, AC-20).
