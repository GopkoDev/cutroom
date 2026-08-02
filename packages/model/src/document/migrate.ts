// Bringing a saved Project forward to the schema this build understands.
//
// ADR 0007 makes migrations a day-one obligation rather than something to add when the shape first
// changes: Projects live in the user's browser, they are not disposable, and the shape will change.
// So the mechanism exists now, exercised, rather than as a stub that the first real migration would
// have to debug at the same time as being the first real migration.
//
// The registry is keyed by the version a migration reads, and each one produces the version above
// it. `migrateProject` walks that ladder one rung at a time from whatever the document says it is
// up to `CURRENT_SCHEMA_VERSION`, so adding version 3 means adding one function under the key `2`
// and nothing else. Migrations take and return anonymous records, not `Project`s: a version-1
// document is not a `Project` by this build's definition, and typing it as one would be a lie that
// the next schema change would turn into a bug.
//
// Downgrading is not in the ladder and never will be. A document from a newer version is refused
// with a reason, because the alternative — opening it by ignoring the fields this build does not
// recognise — silently deletes the user's work the moment the Project is saved back.

import { parseProject } from "./parse"
import { CURRENT_SCHEMA_VERSION, type Project } from "./types"

export { CURRENT_SCHEMA_VERSION } from "./types"

/** A document at some schema version: plain fields, not yet known to be a `Project`. */
type StoredProject = Readonly<Record<string, unknown>>

/** Reads a document at version `n` and returns the same Project at version `n + 1`. */
type Migration = (project: StoredProject) => StoredProject

/**
 * Keyed by the version each migration reads.
 *
 * **Version 0** is the shape from before `schemaVersion` existed — a document with no version
 * field at all. It is the only version below the first release, it is what an unversioned
 * document is taken to be, and its single difference from version 1 is the missing field. That
 * makes the 0 → 1 migration a small one, which is the point: the ladder is climbed and tested from
 * the first release rather than written for the first time under pressure.
 */
const migrations: Readonly<Record<number, Migration>> = {
  0: (project) => ({ ...project, schemaVersion: 1 }),
}

function describe(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "an array"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "object") {
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype === Object.prototype || prototype === null) return "an object"
    const name = (value as { constructor?: { name?: string } }).constructor?.name
    return typeof name === "string" && name.length > 0 ? `a ${name}` : "an object"
  }
  if (typeof value === "undefined") return "nothing"
  return String(value)
}

/**
 * What version a document claims to be. A document with no `schemaVersion` is version 0: the field
 * was added by version 1, so its absence is information rather than corruption.
 */
function readSchemaVersion(raw: StoredProject): number {
  const stated = raw.schemaVersion
  if (stated === undefined) return 0
  if (typeof stated !== "number" || !Number.isSafeInteger(stated) || stated < 0) {
    throw new TypeError(
      `migrateProject: schemaVersion must be a whole number, zero or greater, got ${describe(stated)}`
    )
  }
  return stated
}

/**
 * Brings an untrusted document up to `CURRENT_SCHEMA_VERSION` and validates the result, or throws
 * saying why it could not.
 *
 * The input is never mutated: every migration returns a new record and `parseProject` rebuilds the
 * document from scratch, so the returned `Project` shares nothing with what was passed in.
 */
export function migrateProject(value: unknown): Project {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`migrateProject: a Project must be an object, got ${describe(value)}`)
  }

  const raw = value as StoredProject
  const version = readSchemaVersion(raw)

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new TypeError(
      `migrateProject: this Project is at schema version ${version}, and this build of Cutroom ` +
        `understands version ${CURRENT_SCHEMA_VERSION} — it was saved by a newer version of ` +
        "Cutroom and cannot be opened here. There is no downgrade: opening it would discard " +
        "whatever the newer version added."
    )
  }

  let migrated = raw
  for (let from = version; from < CURRENT_SCHEMA_VERSION; from += 1) {
    const migration = migrations[from]
    if (migration === undefined) {
      // Unreachable while the registry covers every rung, which is exactly why it is asserted:
      // the failure mode of a gap is a document opened as if it were a version it is not.
      throw new TypeError(
        `migrateProject: no migration from schema version ${from} to ${from + 1} is registered — ` +
          "the migration chain has a gap"
      )
    }
    migrated = migration(migrated)
  }

  return parseProject(migrated)
}
