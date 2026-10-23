---
id: T009
title: "Add the add-track and remove-track commands with the two-Track limit"
layer: "domain"
deps: ["T008"]
blocks: ["T010"]
acs: ["AC-20", "AC-21", "AC-22", "AC-30"]
files_hint: ["packages/model/src/commands/index.ts", "packages/model/src/commands/apply.ts", "packages/model/test/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "done"
step: "COMMIT"
---
# T009 — Add the add-track and remove-track commands with the two-Track limit

## Place in the sequence

- **Blocked by:** T008 — Add the duplicateDelta rule and the duplicate-clips command · **Blocks:** T010 — Add placeSourceCommand and make importCommands reuse it · **Wave:** 7.
- **Lane:** shares files with T002, T003, T004, T005, T006, T007, T008, T010 — serialized.

## Why (user story)

> **As a** User
> **I want** to add a second video Track whose Clips cover the Track below, and remove a Track I no longer need
> **So that** I can put one shot over another, such as a cutaway over a continuous shot
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

The model adds a second video Track on top and removes a Track with its Clips, and refuses a third Track or removing the last one.

## Inlined context

> AddTrackCommand { type: "add-track", at, track: { id, name } }
> RemoveTrackCommand { type: "remove-track", at, trackId }
> `add-track` | `{ id, name }` | Appends an empty video Track on top (`tracks[length]`) | AC-20, AC-30
> `remove-track` | `trackId` | Removes the Track and every Clip on it | AC-21, AC-22
>
> — `contracts/public-api.md` §Reducer, abridged · full text: [public-api.md](../contracts/public-api.md)

> "track-limit"            // add-track beyond MAX_VIDEO_TRACKS
> "last-track"             // remove-track of the only Track
>
> — `contracts/public-api.md` §Refusals, abridged · full text: [public-api.md](../contracts/public-api.md)

> Track limit. At most two video Tracks is a refusal of `add-track`, not a document invariant. Schema version 1 already allows any number of Tracks.
>
> — `sad.md` §4, Tactical rules, verbatim · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Timeline.tracks` | Track[] | at least one; at most two is an `add-track` refusal | appended / removed |
| `Track.name` | string | | given by the editor, e.g. `"Video 2"` |

— `data-model.md` §Timeline + §Track, abridged · full text: [data-model.md](../data-model.md)

## API contract

Refusals: `track-limit`, `last-track`, `unknown-track`, `duplicate-id`, `invalid`.

— `contracts/public-api.md` §Refusals, abridged · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-20 — happy

> **Given** a Project with one video Track
> **When** the User adds a video Track
> **Then** a second, empty Track appears above the first; Clips placed on it cover the lower Track's picture wherever the upper Track has a Clip; where it has a Gap the lower Track shows through
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — happy

> **Given** a Project with two video Tracks, one of which holds Clips
> **When** the User removes that Track
> **Then** the Track and its Clips are gone in one Gesture, which one undo restores in full
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — domain invariant

> **Given** a Project with only one video Track
> **When** the User tries to remove it
> **Then** removal is refused and the User is told a Project always keeps at least one Track
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

### AC-30 — domain invariant

> **Given** a Project that already has two video Tracks
> **When** the User tries to add another Track
> **Then** adding is refused and the User is told a Project has at most two video Tracks for now
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add both command types — `commands/index.ts`
- [ ] Implement `add-track` (append on top, `kind: "video"`) and `remove-track` (Track and Clips, `retimeTimeline`) in `apply.ts`
- [ ] Tests: AC-20, AC-21 with inverse patches restoring Clips, AC-22 `last-track`, AC-30 `track-limit`

## Edge cases

| Case | Behaviour |
|---|---|
| Remove the upper Track holding Clips | Track and Clips gone; inverse patches restore both in order |
| Track id already used | Refused `duplicate-id` |

## Definition of Done

- [ ] Unit tests cover AC-20, AC-21, AC-22, AC-30
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
