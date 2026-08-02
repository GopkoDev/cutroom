// The gate every saved Project comes back through. Nothing else in Cutroom trusts a document:
// storage hands `parseProject` whatever IndexedDB returned, and what comes out the far side is
// either a `Project` that satisfies every invariant in data-model.md or an exception naming the
// field that was wrong and what was wrong with it.
//
// Two decisions shape the whole file.
//
// **It rebuilds rather than inspects.** Every value that survives validation is copied into a
// fresh object literal, so the returned `Project` shares no identity with the input and consists
// only of strings, numbers, booleans, arrays and plain objects. That is what makes the
// structured-clone requirement (ADR 0004, ADR 0007) hold by construction rather than by promise:
// there is no path through this file that puts a `Date`, a `Map`, a class instance or a file
// handle into the result, because every position in the shape is checked before it is copied and
// the check for an object position rejects anything with a prototype of its own. A `Date` at
// `createdAt` fails "must be a string"; a `Map` at `sources` fails "must be an array"; a
// `FileSystemFileHandle` at `address` fails "must be a plain object, got a FileSystemFileHandle".
//
// **It rejects rather than repairs.** An unknown field is an error, not something to drop; a
// document from a newer schema version is refused, never downgraded; a Frame of 10.5 is refused,
// never rounded. This is a user's saved work and the parser is the last thing standing between a
// corrupted document and silent data loss, so the only safe answer to "I do not understand this"
// is to say so.

import type { Rational, Timebase } from "../timebase"
import {
  CURRENT_SCHEMA_VERSION,
  type Clip,
  type Codecs,
  type Frame,
  type PixelSize,
  type Project,
  type Source,
  type SourceAddress,
  type SourceFingerprint,
  type Timeline,
  type Track,
} from "./types"

/**
 * ISO 8601 instant, as `Date.prototype.toISOString` writes it, plus an explicit offset as a
 * concession to documents that did not come from us.
 */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/

/** Every rejection goes through here, so every message reads the same way and names its field. */
function fail(path: string, problem: string): never {
  throw new TypeError(`parseProject: ${path} ${problem}`)
}

/** Names the kind of thing that turned up, so a rejection says "a Date" rather than "object". */
function describe(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "an array"
  switch (typeof value) {
    case "undefined":
      return "nothing"
    case "function":
      return "a function"
    case "string":
      return JSON.stringify(value)
    case "bigint":
      return `${value}n`
    case "symbol":
      return "a symbol"
    case "object": {
      const prototype: unknown = Object.getPrototypeOf(value)
      if (prototype === Object.prototype || prototype === null) return "an object"
      const name = (value as { constructor?: { name?: string } }).constructor?.name
      return typeof name === "string" && name.length > 0 ? `a ${name}` : "an object"
    }
    default:
      return String(value)
  }
}

/**
 * An object position in the document. Anything carrying a prototype of its own is refused here:
 * that single check is what keeps `Date`, `Map`, `Set`, `RegExp`, `FileSystemFileHandle` and every
 * other class instance out of the document, whether or not `structuredClone` would have copied it.
 */
function expectPlainObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, `must be an object, got ${describe(value)}`)
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, `must be a plain object, got ${describe(value)}`)
  }
  return value as Record<string, unknown>
}

/**
 * Unknown fields are refused rather than dropped. Dropping them would lose whatever a future
 * version of Cutroom put there, and quietly: the document would be saved back without it. If the
 * field belongs to a later schema, `schemaVersion` is how the document says so.
 */
function expectOnlyKeys(
  raw: Record<string, unknown>,
  path: string,
  allowed: readonly string[]
): void {
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    fail(
      path,
      `has ${unknown.length === 1 ? "an unknown field" : "unknown fields"} ` +
        `${unknown.map((key) => JSON.stringify(key)).join(", ")} — known fields are ` +
        `${allowed.map((key) => JSON.stringify(key)).join(", ")}`
    )
  }
}

function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, `must be an array, got ${describe(value)}`)
  return value as readonly unknown[]
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, `must be a string, got ${describe(value)}`)
  return value
}

function expectIdentifier(value: unknown, path: string): string {
  const id = expectString(value, path)
  if (id === "") fail(path, "must not be empty")
  return id
}

function expectInteger(value: unknown, path: string, minimum: number, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail(path, `must be ${what}, got ${describe(value)}`)
  }
  if (value < minimum) fail(path, `must be ${what}, got ${value}`)
  return value
}

/** A Frame is an integer index; 10.5 is not a position that exists, so it is refused (FR-006). */
function expectFrame(value: unknown, path: string): Frame {
  return expectInteger(value, path, 0, "a whole number of Frames, zero or greater")
}

/**
 * The shape alone is not enough: `Date.parse` accepts a 30th of February and quietly answers with
 * the 2nd of March, so the calendar fields are checked to survive a round trip through `Date.UTC`.
 * A timestamp that rolled over is not a timestamp the user's editor wrote, and repairing it into a
 * different day is precisely the coercion this parser exists not to do.
 */
function expectTimestamp(value: unknown, path: string): string {
  const text = expectString(value, path)
  const parts = ISO_INSTANT.exec(text)
  const reject = () => fail(path, `must be an ISO 8601 date and time, got ${JSON.stringify(text)}`)
  if (parts === null || !Number.isFinite(Date.parse(text))) reject()

  const year = Number(parts?.[1])
  const month = Number(parts?.[2])
  const day = Number(parts?.[3])
  const hour = Number(parts?.[4])
  const minute = Number(parts?.[5])
  const second = Number(parts?.[6])
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) reject()

  const asDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    reject()
  }
  return text
}

/**
 * A Timebase is a positive ratio, both parts integers: 30000/1001, never 29.97 (ADR 0002). A
 * numerator of zero would be a rate that converts nothing, and a denominator of zero is not a
 * number at all.
 */
function parseTimebase(value: unknown, path: string): Timebase {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["numerator", "denominator"])
  return {
    numerator: expectInteger(raw.numerator, `${path}.numerator`, 1, "a positive whole number"),
    denominator: expectInteger(
      raw.denominator,
      `${path}.denominator`,
      1,
      "a positive whole number"
    ),
  }
}

/**
 * An exact ratio of seconds in a Source's own timescale. Unlike a Timebase the numerator may be
 * zero — a Source can be addressed at its very first instant, and a zero-length Source is a real,
 * if useless, thing to have imported.
 */
function parseRational(value: unknown, path: string): Rational {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["numerator", "denominator"])
  return {
    numerator: expectInteger(
      raw.numerator,
      `${path}.numerator`,
      0,
      "a whole number, zero or greater"
    ),
    denominator: expectInteger(
      raw.denominator,
      `${path}.denominator`,
      1,
      "a positive whole number"
    ),
  }
}

function parsePixelSize(value: unknown, path: string): PixelSize {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["width", "height"])
  return {
    width: expectInteger(raw.width, `${path}.width`, 1, "a positive whole number of pixels"),
    height: expectInteger(raw.height, `${path}.height`, 1, "a positive whole number of pixels"),
  }
}

function parseAddress(value: unknown, path: string): SourceAddress {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["kind"])
  const kind = expectString(raw.kind, `${path}.kind`)
  if (kind !== "local-file") {
    fail(`${path}.kind`, `must be "local-file", got ${JSON.stringify(kind)}`)
  }
  return { kind }
}

function parseFingerprint(value: unknown, path: string): SourceFingerprint {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["size", "lastModified"])
  return {
    size: expectInteger(raw.size, `${path}.size`, 0, "a whole number of bytes, zero or greater"),
    lastModified: expectInteger(
      raw.lastModified,
      `${path}.lastModified`,
      0,
      "a whole number of milliseconds since the epoch, zero or greater"
    ),
  }
}

/**
 * Both codec names are optional, and absent is not the same as present-and-undefined: an explicit
 * `undefined` would survive `structuredClone` and then disappear through JSON, so it is refused
 * rather than treated as absence.
 */
function parseCodecs(value: unknown, path: string): Codecs {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["video", "audio"])
  const codecs: { video?: string; audio?: string } = {}
  if ("video" in raw) codecs.video = expectString(raw.video, `${path}.video`)
  if ("audio" in raw) codecs.audio = expectString(raw.audio, `${path}.audio`)
  return codecs
}

function parseSource(value: unknown, path: string): Source {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, [
    "id",
    "name",
    "address",
    "fingerprint",
    "duration",
    "timebase",
    "dimensions",
    "hasAudio",
    "codecs",
  ])
  const hasAudio = raw.hasAudio
  if (typeof hasAudio !== "boolean") {
    fail(`${path}.hasAudio`, `must be true or false, got ${describe(hasAudio)}`)
  }
  return {
    id: expectIdentifier(raw.id, `${path}.id`),
    name: expectString(raw.name, `${path}.name`),
    address: parseAddress(raw.address, `${path}.address`),
    fingerprint: parseFingerprint(raw.fingerprint, `${path}.fingerprint`),
    duration: parseRational(raw.duration, `${path}.duration`),
    timebase: parseTimebase(raw.timebase, `${path}.timebase`),
    dimensions: parsePixelSize(raw.dimensions, `${path}.dimensions`),
    hasAudio,
    codecs: parseCodecs(raw.codecs, `${path}.codecs`),
  }
}

function parseClip(value: unknown, path: string): Clip {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["id", "sourceId", "startFrame", "durationFrames", "sourceInPoint"])
  const startFrame = expectFrame(raw.startFrame, `${path}.startFrame`)
  const durationFrames = expectInteger(
    raw.durationFrames,
    `${path}.durationFrames`,
    1,
    "a whole number of Frames, one or greater"
  )
  if (!Number.isSafeInteger(startFrame + durationFrames)) {
    fail(
      `${path}.durationFrames`,
      `ends at Frame ${startFrame + durationFrames}, beyond the range of exact integers`
    )
  }
  return {
    id: expectIdentifier(raw.id, `${path}.id`),
    sourceId: expectIdentifier(raw.sourceId, `${path}.sourceId`),
    startFrame,
    durationFrames,
    sourceInPoint: parseRational(raw.sourceInPoint, `${path}.sourceInPoint`),
  }
}

function parseTrack(value: unknown, path: string): Track {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["id", "kind", "name", "clips"])
  const kind = expectString(raw.kind, `${path}.kind`)
  if (kind !== "video") {
    fail(
      `${path}.kind`,
      `must be "video" — schema version 1 has no other Track kind, got ` + JSON.stringify(kind)
    )
  }

  const clips = expectArray(raw.clips, `${path}.clips`).map((clip, index) =>
    parseClip(clip, `${path}.clips[${index}]`)
  )

  // Ordered by startFrame and non-overlapping, which one comparison of each neighbouring pair
  // covers: if a later Clip started earlier, its predecessor's end would be past its start, since
  // every duration is at least one Frame. Adjacency is integer equality, so a butt join is exact
  // and allowed (data-model.md).
  for (let index = 1; index < clips.length; index += 1) {
    const previous = clips[index - 1]
    const clip = clips[index]
    if (previous === undefined || clip === undefined) continue
    const previousEnd = previous.startFrame + previous.durationFrames
    if (previousEnd > clip.startFrame) {
      fail(
        `${path}.clips[${index}]`,
        `starts at Frame ${clip.startFrame}, but the Clip before it runs to Frame ${previousEnd} — ` +
          "Clips on a Track are ordered by startFrame and must not overlap"
      )
    }
  }

  return {
    id: expectIdentifier(raw.id, `${path}.id`),
    kind,
    name: expectString(raw.name, `${path}.name`),
    clips,
  }
}

function parseTimeline(value: unknown, path: string): Timeline {
  const raw = expectPlainObject(value, path)
  expectOnlyKeys(raw, path, ["tracks", "durationFrames"])
  const tracks = expectArray(raw.tracks, `${path}.tracks`).map((track, index) =>
    parseTrack(track, `${path}.tracks[${index}]`)
  )
  const durationFrames = expectFrame(raw.durationFrames, `${path}.durationFrames`)

  // Derived and stored, so it can disagree with what it was derived from. It is checked rather
  // than recomputed: a stored value that has drifted means something wrote the document without
  // going through the reducer, and that is worth hearing about rather than quietly correcting.
  let end = 0
  for (const track of tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.startFrame + clip.durationFrames)
    }
  }
  if (durationFrames !== end) {
    fail(
      `${path}.durationFrames`,
      `is ${durationFrames}, but the last Clip ends at Frame ${end} — the Timeline's duration is derived from its Clips`
    )
  }

  return { tracks, durationFrames }
}

/**
 * Validates an untrusted value and narrows it to a `Project`, or throws saying which field was
 * wrong and why.
 *
 * Refuses, in the words of contracts/model-api.md: non-integer Frame values, overlapping Clips,
 * non-positive durations, a Timebase that is not a positive ratio, and anything not round-trippable
 * through structured clone. It also refuses a document whose `schemaVersion` is not the current one
 * — an older document is `migrateProject`'s to open, and a newer one is nobody's.
 */
export function parseProject(value: unknown): Project {
  const raw = expectPlainObject(value, "project")
  expectOnlyKeys(raw, "project", [
    "schemaVersion",
    "id",
    "name",
    "createdAt",
    "modifiedAt",
    "timebase",
    "frameSize",
    "sources",
    "timeline",
  ])

  // No version at all is version 0 — the shape from before the field existed — which is a document
  // to migrate rather than a document to reject as nonsense, so it is named as such.
  if (raw.schemaVersion === undefined) {
    fail(
      "schemaVersion",
      "is missing — a Project without one predates versioning, and migrateProject is what opens it"
    )
  }
  const schemaVersion = expectInteger(
    raw.schemaVersion,
    "schemaVersion",
    0,
    "a whole number, zero or greater"
  )
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    fail(
      "schemaVersion",
      `is ${schemaVersion}, but this build of Cutroom understands version ${CURRENT_SCHEMA_VERSION} — ` +
        "the Project was saved by a newer version and will not be opened rather than opened wrongly"
    )
  }
  if (schemaVersion < CURRENT_SCHEMA_VERSION) {
    fail(
      "schemaVersion",
      `is ${schemaVersion}, but this build of Cutroom writes version ${CURRENT_SCHEMA_VERSION} — ` +
        "open an older Project with migrateProject, which brings it forward first"
    )
  }

  // Field by field, in the order they are written, so a document with more than one thing wrong
  // reports the first of them rather than whichever check happened to run first.
  const id = expectIdentifier(raw.id, "id")
  const name = expectString(raw.name, "name")
  const createdAt = expectTimestamp(raw.createdAt, "createdAt")
  const modifiedAt = expectTimestamp(raw.modifiedAt, "modifiedAt")
  const timebase = parseTimebase(raw.timebase, "timebase")
  const frameSize = parsePixelSize(raw.frameSize, "frameSize")
  const sources = expectArray(raw.sources, "sources").map((source, index) =>
    parseSource(source, `sources[${index}]`)
  )
  const timeline = parseTimeline(raw.timeline, "timeline")

  // Ids are references: a Clip finds its Source by one, and the reducer finds a Clip by one. A
  // duplicate makes "the Source with this id" ambiguous and a dangling one makes it nothing at all
  // — neither is a Source going Offline, which leaves the Source in the document (FR-022).
  const sourceIds = new Set<string>()
  for (const [index, source] of sources.entries()) {
    if (sourceIds.has(source.id)) {
      fail(
        `sources[${index}].id`,
        `repeats the id ${JSON.stringify(source.id)} — ids are never reused`
      )
    }
    sourceIds.add(source.id)
  }

  const trackIds = new Set<string>()
  const clipIds = new Set<string>()
  for (const [trackIndex, track] of timeline.tracks.entries()) {
    if (trackIds.has(track.id)) {
      fail(
        `timeline.tracks[${trackIndex}].id`,
        `repeats the id ${JSON.stringify(track.id)} — ids are never reused`
      )
    }
    trackIds.add(track.id)
    for (const [clipIndex, clip] of track.clips.entries()) {
      const where = `timeline.tracks[${trackIndex}].clips[${clipIndex}]`
      if (clipIds.has(clip.id)) {
        fail(`${where}.id`, `repeats the id ${JSON.stringify(clip.id)} — ids are never reused`)
      }
      clipIds.add(clip.id)
      if (!sourceIds.has(clip.sourceId)) {
        fail(
          `${where}.sourceId`,
          `is ${JSON.stringify(clip.sourceId)}, which no Source in this Project carries`
        )
      }
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    name,
    createdAt,
    modifiedAt,
    timebase,
    frameSize,
    sources,
    timeline,
  }
}
