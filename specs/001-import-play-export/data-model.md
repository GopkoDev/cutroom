# Phase 1 Data Model: Import, Play, Export

Entities use the vocabulary of `CONTEXT.md`. Types below are descriptive, not final
TypeScript.

## Persisted: the Project document

Plain JSON, versioned, stored in IndexedDB (ADR 0007). Contains nothing device-specific.

### Project

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer | Drives migrations. Version 1 is the first shape that carries this field; a document without one is version 0, the shape from before versioning existed, and only `migrateProject` opens it. |
| `id` | string | Stable across renames and storage moves. |
| `name` | string | User-facing. |
| `createdAt` / `modifiedAt` | ISO string | Timestamps are strings, not `Date`, to stay serializable. |
| `timebase` | `{ numerator, denominator }` | Exact frame rate, e.g. `{ 30000, 1001 }`. Never a float. |
| `frameSize` | `{ width, height }` | Pixels. Not named `canvas` — `CONTEXT.md` reserves that word (it is the wrong name for the Preview). |
| `sources` | `Source[]` | |
| `timeline` | `Timeline` | |

**Rules**

- `timebase.denominator > 0`, `numerator > 0`.
- Changing `timebase` after Clips exist is a migration of every Frame value, not an edit
  (ADR 0002). Out of scope for this slice: the Timebase is set once, on first import.

### Source

| Field | Type | Notes |
|---|---|---|
| `id` | string | Referenced by Clips. Never reused. |
| `name` | string | Original file name, shown to the user. |
| `address` | `{ kind: "local-file" }` | Discriminated union; `{ kind: "cloud-object", url }` arrives later (ADR 0005). The handle itself is **not** here. |
| `fingerprint` | `{ size, lastModified }` | Used to confirm a Relink points at the same file. |
| `duration` | `{ numerator, denominator }` | Source-native duration as an exact ratio of seconds, in the Source's own timescale — never the Project's Frames and never a float. This is Principle II's one exception (constitution 1.1.0, ADR 0002): a Source's media time is not the Project's to renumber. |
| `timebase` | `{ numerator, denominator }` | The Source Timebase — its own rate as an exact ratio. May differ from the Project's Timebase. Not named `frameRate`: `CONTEXT.md` lists "frame rate" under `_Avoid_`. |
| `dimensions` | `{ width, height }` | |
| `hasAudio` | boolean | A Source without audio is valid (spec, US2 scenario 5). |
| `codecs` | `{ video?, audio? }` | Recorded at import for diagnostics and for reporting why a Source cannot be used. |

**Rules**

- A Source is immutable once imported, with one exception: a Relink may correct its `name` and
  `fingerprint`, because the file it addresses can legitimately be renamed or replaced by the same
  content at another path. Nothing else about a Source ever changes — re-importing the same file
  creates a second Source rather than modifying this one.
- `address` says where it lives, never how to reach it on this machine.

### Timeline

| Field | Type | Notes |
|---|---|---|
| `tracks` | `Track[]` | This slice: exactly one video Track. |
| `durationFrames` | integer | Derived, stored for cheap listing; must equal the maximum Clip end. |

### Track

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `kind` | `"video"` | `"audio"`, `"text"` follow later. |
| `name` | string | |
| `clips` | `Clip[]` | Ordered by `startFrame`, non-overlapping. |

### Clip

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `sourceId` | string | Survives the Source going Offline (FR-022). |
| `startFrame` | integer | Position on the Timeline, in the Project's Timebase. |
| `durationFrames` | integer | `> 0`. |
| `sourceInPoint` | `{ numerator, denominator }` | Where in the Source the Clip begins, in the **Source's** timescale — an address inside the Source, not a position on the Timeline, and so the second half of Principle II's exception. Zero for this slice (no trimming). |

**Rules**

- `startFrame ≥ 0`, integers only. No sub-Frame positions can be expressed (FR-006).
- Clips on one Track must not overlap: for adjacent clips, `a.startFrame + a.durationFrames ≤
  b.startFrame`. Adjacency is integer equality, so butt joins are exact.
- A Clip whose Source is Offline stays on the Timeline and renders as empty.

## Not persisted: device-local link table

Separate IndexedDB store, never part of the document, never synchronised (ADR 0005).

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | Key. |
| `handle` | `FileSystemFileHandle` | Structured-cloneable, survives reload. Permission is a separate question from existence. |

**States a Source can be in at runtime** (derived, not stored):

```
Unlinked ──user picks file──▶ Linked (permission granted) ──▶ readable
   ▲                              │
   │                     permission lapsed / file moved
   └────────── Relink ──────── Offline
```

- `Linked` requires both an entry in this table and a granted read permission. Requesting
  permission needs a user gesture (FR-021), so reopening a Project lands in `Offline` until the
  user acts.
- `Relink` verifies the newly picked file against `Source.fingerprint` before rebinding.

## Runtime only: the Scene

What crosses into the worker (ADR 0003). Derived from the Project, never edited there, never
persisted.

| Field | Type | Notes |
|---|---|---|
| `timebase` | `{ numerator, denominator }` | |
| `frameSize` | `{ width, height }` | |
| `clips` | `SceneClip[]` | Back to front. |

`SceneClip` = `{ clipId, sourceId, startFrame, durationFrames, sourceInPoint, transform }`.

Named `SceneClip`, because that is what each one is — a Clip as the renderer needs to see it.
Not `SceneLayer`, and not `SceneItem` either: `CONTEXT.md` lists "Layer" under the words to avoid
for a Track, and "Item" under the words to avoid for a Clip. Both are the commonest wrong names in
editors, which is exactly why they are listed.

**Rules**

- Contains only what affects the picture. Names, selection, panel sizes and undo history do not
  cross.
- Posted on change (throttled during continuous gestures); a Frame request is just an integer.

## Runtime only: playback and export state

Lives in the store but outside the Project document, and is never undoable.

| Field | Type | Notes |
|---|---|---|
| `playheadFrame` | integer | |
| `transport` | `"stopped" \| "playing"` | |
| `sourceStatus` | `Record<sourceId, "linked" \| "offline">` | |
| `export` | `{ state, framesDone, framesTotal }` \| null | One at a time (spec assumption). |

## Validation summary

| Rule | Enforced where | Spec reference |
|---|---|---|
| Frame values are integers | Model, at document parse and on every reducer write | FR-006 |
| Clips do not overlap on a Track | Reducer + parse | Data integrity |
| `durationFrames > 0` | Reducer + parse | Data integrity |
| `Timeline.durationFrames` equals the maximum Clip end | Reducer + parse | Data integrity |
| Source and Clip ids are unique | Reducer + parse | Data integrity |
| Every Clip's `sourceId` resolves to a Source | Parse | Data integrity |
| Timebase is a positive ratio | Migration + parse | ADR 0002 |
| Document contains no handles or class instances | Parse (structural clone round-trip in tests) | ADR 0004, 0005 |
| Relinked file matches fingerprint | Link table write path | FR-021 |

A Relink is split across the two stores on purpose: the handle and its permission go to the
device-local link table, and only the Source's `name` and `fingerprint` are part of the Project
Document. A Relink that finds the document already correct therefore changes nothing and produces
no patches — it must not put an entry on the undo stack that would undo nothing.
