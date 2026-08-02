// The Project as it is saved: the shape that goes into IndexedDB today and to a server later
// (ADR 0007). Every field here is plain, serializable data — strings, numbers, booleans, arrays
// and object literals, and nothing else.
//
// What must never appear in these types, and why (Principle IV, ADR 0005, ADR 0007):
//
//   - No class instances, no `Map`, no `Set`, no `Date`. A `Date` would survive `structuredClone`
//     and then not survive JSON, which is the worst of both: the document would work locally and
//     lose fidelity the day it is sent to a server. Timestamps are ISO strings.
//   - No `FileSystemFileHandle` and nothing else device-specific. A handle is meaningless on
//     another machine, so the link table holds it and the document holds only the address and the
//     fingerprint (ADR 0005).
//   - No floats where time is concerned. Timeline positions are integer Frames; a Source's own
//     media time is an exact `Rational` of seconds, which is Principle II's one exception.
//
// `Timebase` and `Rational` are imported rather than redeclared: `../timebase` is the only place
// in Cutroom that knows what a rate means, and a second declaration of the same idea is how two
// slightly different ideas start.

import type { Rational, Timebase } from "../timebase"

/**
 * The schema version this build writes and understands. Every document carries it, and
 * `migrateProject` walks a document from its own version up to this one (ADR 0007).
 *
 * It lives here, beside the shape it describes, so the dependency between the document modules
 * runs one way — types ← parse ← migrate — and `parseProject` can say "this document is from the
 * future" without importing the migration chain that imports it back.
 */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * A whole number of Frames: an index when it is a position on the Timeline, a count when it is a
 * duration. TypeScript cannot express "integer", so this alias documents the intent and
 * `parseProject` enforces it — every value typed `Frame` has been checked to be a non-negative
 * safe integer before it reaches a `Project`.
 */
export type Frame = number

/** A size in pixels. Used for the Project's `frameSize` and for a Source's native `dimensions`. */
export interface PixelSize {
  readonly width: number
  readonly height: number
}

/**
 * Where a Source lives — never how to reach it from this machine. A discriminated union with one
 * member today; `{ kind: "cloud-object", url }` joins it when cloud storage arrives (ADR 0005).
 */
export type SourceAddress = { readonly kind: "local-file" }

/** What a Relink checks a newly picked file against before rebinding it (FR-021). */
export interface SourceFingerprint {
  readonly size: number
  readonly lastModified: number
}

/** Recorded at import, for diagnostics and for saying why a Source cannot be used. */
export interface Codecs {
  readonly video?: string
  readonly audio?: string
}

/**
 * Media brought into the Project. Immutable once imported: re-importing the same file creates a
 * second Source rather than changing this one.
 *
 * `duration` and `timebase` are in the Source's **own** timescale and stay exact ratios. They are
 * addresses inside media we did not author, not positions on our Timeline, so they are never
 * renumbered into the Project's Frames (Principle II's exception, ADR 0002).
 */
export interface Source {
  readonly id: string
  readonly name: string
  readonly address: SourceAddress
  readonly fingerprint: SourceFingerprint
  readonly duration: Rational
  readonly timebase: Timebase
  readonly dimensions: PixelSize
  readonly hasAudio: boolean
  readonly codecs: Codecs
}

/** `"audio"` and `"text"` follow later; schema version 1 has only video Tracks. */
export type TrackKind = "video"

/**
 * A placement of part of a Source onto a Track.
 *
 * `startFrame` and `durationFrames` are the Project's Frames. `sourceInPoint` is where inside the
 * Source the Clip begins, in the Source's own timescale — the second half of Principle II's
 * exception. `sourceId` survives the Source going Offline (FR-022).
 */
export interface Clip {
  readonly id: string
  readonly sourceId: string
  readonly startFrame: Frame
  readonly durationFrames: Frame
  readonly sourceInPoint: Rational
}

/** One lane of the Timeline. Its Clips are ordered by `startFrame` and never overlap. */
export interface Track {
  readonly id: string
  readonly kind: TrackKind
  readonly name: string
  readonly clips: readonly Clip[]
}

/** `durationFrames` is derived — it equals the greatest `startFrame + durationFrames` of any Clip. */
export interface Timeline {
  readonly tracks: readonly Track[]
  readonly durationFrames: Frame
}

/**
 * The whole unit of work a user opens and saves. `schemaVersion` is pinned to the current version:
 * a value of this type has been through `parseProject`, so it is by construction the shape this
 * build understands.
 */
export interface Project {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly modifiedAt: string
  readonly timebase: Timebase
  readonly frameSize: PixelSize
  readonly sources: readonly Source[]
  readonly timeline: Timeline
}
