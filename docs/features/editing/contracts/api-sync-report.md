---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-23"
feature_size: "L"
---

# API sync report — editing

This report checks the two contracts against [data-model.md](../data-model.md), the
[sad.md](../sad.md) §6 flows, [spec.md](../spec.md) §4/§5, ADRs 0018–0022, and the code at
`fdd25c0` on `feat/editing`:

- [public-api.md](./public-api.md), the `library-sdk` surface;
- [events.md](./events.md), the `worker` surface. It is unchanged in shape.

There is no HTTP surface, so there is no `openapi.yaml`. The `web-frontend` surface consumes these
contracts and authors none ([sad.md](../sad.md) §4).

## Section A — field origins

| schema_path | origin | confidence |
|---|---|---|
| `TrimClipCommand.clipId`, `.edge`, `.frame` | data-model.md → `Clip.startFrame` / `durationFrames` (head and tail rows); ADR 0019 "the edge Frame for a Trim" | high |
| `SplitClipsCommand.frame`, `.cuts[].clipId`, `.cuts[].newClipId` | data-model.md → `Clip.id` (new for a second half), `sourceInPoint`; ADR 0019 "the Frame for a Split"; sad Flow 2 "new ids for the second halves" | high |
| `MoveClipsCommand.clipIds`, `.delta`, `.toTrackId` | data-model.md → `Clip.startFrame`, `Track.clips`; ADR 0019 "a Frame delta and a Track"; AC-09 (a two-Track Selection stays on its Tracks) | high |
| `DeleteClipsCommand.clipIds`, `.ripple` | data-model.md → `Track.clips`, `Clip.startFrame`; ADR 0019 `ripple: boolean` | high |
| `DuplicateClipsCommand.delta`, `.copies[].clipId`, `.copies[].newClipId` | data-model.md → `Clip.id` (new for a copy); ADR 0019 "exact targets"; AC-12, AC-13 | high |
| `AddTrackCommand.track.id`, `.track.name` | data-model.md → `Track.id`, `Track.name` | high |
| `RemoveTrackCommand.trackId` | data-model.md → `Track.id` | high |
| `*.at` | step-1 `CommandFields.at` (`packages/model/src/commands/index.ts:23-32`) | high |
| `CommandError.reason` — `overlap` … `unknown-clip` | ADR 0019 §Decision outcome | high |
| `CommandError.reason` — `unknown-track`, `unknown-source`, `duplicate-id`, `no-project`, `invalid` | the step-1 refusals in `packages/model/src/commands/apply.ts:79-356` and `import.ts:108-130`, now named. Accepted by owner, 2026-10-23 | high |
| `MAX_VIDEO_TRACKS` | AC-30; sad §4 "Track limit". Accepted by owner, 2026-10-23 | high |
| `wholeFramesIn` | ADR 0018 (Source time touched only in `timebase.ts`) + AC-02/AC-03 head-Trim limit. Accepted by owner, 2026-10-23 | high |
| `trimRange` → `TrimRange.earliest`, `.latest` | sad §5 `editing/limits.ts`; data-model.md §Clip Source bounds | high |
| `checkMove` → `Verdict` | sad §5 `editing/placement.ts`; AC-07, AC-09 | high |
| `duplicateDelta` | sad §5 `editing/placement.ts` "Duplicate block placement"; AC-12, AC-13 | high |
| `splitTargets` → `SplitTargets.because` | sad §5 `editing/split.ts`; AC-05's two notices; sad Flow 2's two `else` branches | high |
| `rippleShifts` → `{ clipId, delta }` | sad §5 `editing/ripple.ts`; AC-11; sad Flow 4 "ask the model how far each later Clip shifts" | high |
| `placeSourceCommand`, `PlaceRequest.at`, `.sourceId`, `.clipId` | AC-24; sad Flow 10 (`add-clip`, the whole Source, after the last Clip on the bottom Track). Accepted by owner, 2026-10-23 | high |
| events.md (every message) | unchanged — `packages/engine/src/protocol.ts:252-262`, `:433-446` | high |

## Section B — drift findings

- [x] **Operation ↔ data-model (core).** Every command writes at least one entity in
  data-model.md, and the write table there (§Clip, "Which command writes which field") matches the
  contract's Applies column row for row. No contract field lacks an origin. The new load checks
  (Source bounds, at least one Track) appear in both documents. `add-clip` gains the Source-bounds
  refusal in both.
- [x] **Error code ↔ repo (core).** The repo keeps no error registry. Refusals are thrown through
  one `refuse()` helper (`packages/model/src/commands/apply.ts:72`). The `RefusalReason` union in
  the contract becomes that registry when it lands in `commands/apply.ts`. The 5 reasons beyond ADR
  0019's 8 name refusals the code already makes, and the owner accepted them (2026-10-23). The
  editor maps them in `ui/failure-wording.ts`.
- [x] **Validation ↔ constraint (core).** The contract's limits are data-model.md's constraints:
  - Frame `≥ 0` → `before-timeline-start`;
  - `durationFrames ≥ 1` → `too-short`;
  - Source bounds `framesForDuration(timebase, Source.duration − inPoint)` → `source-bounds` and
    `trimRange`'s tail limit;
  - no overlap → `overlap`;
  - at least one Track → `last-track`;
  - at most two Tracks → `track-limit`.

  There is no conflict, so nothing needed the stricter-value rule.
- [x] **Contract ↔ sequences (supporting).** Every `alt`/`else` branch in sad §6 has its answer:

  | Flow | Branch | Answered by |
  |---|---|---|
  | 1 | edge past a limit / within the limits | `trimRange` |
  | 1 | released with a change / Escape or no change | `trim-clip` / no patches |
  | 2 | Clips qualify | `splitTargets` `kind: "cut"`, then `split-clips` |
  | 2 | the two notice branches | `splitTargets` `because` |
  | 3 | every Clip can land / overlap, before Frame 0, a two-Track Selection leaving its Tracks | `checkMove` `ok` / `overlap`, `before-timeline-start`, `invalid` |
  | 3 | release | `move-clips` |
  | 4 | nothing selected / plain / Ripple | no command / `delete-clips` / `rippleShifts` with `delete-clips { ripple: true }` |
  | 5 | room after the Selection / no room | `duplicateDelta` |
  | 8 | Add Track at two | `track-limit` |
  | 8 | Remove Track of the only one | `last-track` |
  | 10 | place | `placeSourceCommand` → `add-clip` |
  | 7 | load refused | `parseProject`'s new checks |

  Flows 6 and 9 and the cross-cutting flow touch no command. Their worker traffic is the unchanged
  protocol, with events.md's expectations.
- [x] **Back-feed: spec coverage.**
  - **Model contract:** AC-01–AC-13, AC-15, AC-20–AC-22, AC-24, AC-25, AC-29, AC-30 and AC-32.
  - **Worker expectations (events.md):** AC-08, AC-20, AC-23, AC-26 and AC-27.
  - **Editor only, no contract surface:**
    - AC-14 (the Selection);
    - AC-16–AC-19 and AC-28 (history and the drag preview);
    - AC-31 (stopping Playback).

  Every operation maps to a §4 story and at least one AC. **No sequence gap found.** `unknown-clip`
  has no §6 branch, by design: the editor prunes the Selection after undo and redo (AC-15), so a
  stale id is a programming error the reducer still refuses, not a User path.

**Flags resolved with the owner (2026-10-23), all *Accept*:**

1. Five refusal reasons beyond ADR 0019's list, so that every `CommandError` carries one.
2. `wholeFramesIn` in `timebase.ts`. sad §5's changed-path tree omits `packages/model/src/timebase.ts`;
   `tasks` should include it.
3. `placeSourceCommand` (reused by `importCommands`) and `MAX_VIDEO_TRACKS`. sad §5 omits
   `commands/import.ts`; `tasks` should include it.

No finding is open.
