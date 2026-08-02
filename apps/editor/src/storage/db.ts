// The one IndexedDB database this app opens, and the two stores inside it.
//
// The split between those stores is the whole of ADR 0005, expressed in schema:
//
//   `projects`      the Project Document — plain, portable, versioned JSON and nothing else. It is
//                   shaped exactly like the thing a server will hold instead one day (ADR 0007),
//                   so nothing that is true of this machine only may go in it.
//   `source-links`  `sourceId → FileSystemFileHandle`, for **this device**. Never part of a
//                   Project, never synchronised, never exported. A Project opened on another
//                   machine simply finds no rows here and shows its Sources as Offline.
//
// They are two stores rather than two fields of one record because that is the only arrangement in
// which the separation cannot be lost by accident: a `put` into `projects` has no handle in scope
// to write, and copying the whole `projects` store out to a server carries nothing device-local
// with it. A single store with a `handle` field beside the document would rely on every future
// caller remembering to strip it.
//
// Both stores use in-line keys — `id` for a Project, `sourceId` for a link — so a record cannot be
// filed under a key that disagrees with its contents.

import { openDB, type DBSchema, type IDBPDatabase } from "idb"

/** The database name. One database for the whole app; the stores inside it do the dividing. */
export const DATABASE_NAME = "cutroom"

/**
 * The schema version this build creates and understands.
 *
 * Distinct from the Project Document's `schemaVersion` (`packages/model`) and free to move
 * independently: this number describes the shape of the *stores*, that one the shape of a
 * *document*. Adding an index here is a database upgrade and no migration of any document;
 * adding a field to a Project is a document migration and no database upgrade.
 */
export const DATABASE_VERSION = 1

/** The Project Document store: one record per Project, keyed by the Project's own id. */
export const PROJECT_STORE = "projects"

/** The device-local link table. Never leaves this machine (ADR 0005). */
export const SOURCE_LINK_STORE = "source-links"

/**
 * One row of the link table.
 *
 * A `FileSystemFileHandle` is structured-cloneable, so IndexedDB stores it as itself and it comes
 * back working after a reload — that is the entire reason the table can exist. What does **not**
 * survive is permission: a handle can be here and still not be readable, which is why no status is
 * recorded beside it. Whether a Source is Linked or Offline is asked at the moment it matters
 * (`source-links.ts`), never stored, because a stored answer is wrong the instant the user revokes
 * access or moves the file.
 */
export interface SourceLinkRecord {
  readonly sourceId: string
  readonly handle: FileSystemFileHandle
}

/**
 * What the two stores hold, as far as IndexedDB is concerned.
 *
 * A Project record is typed as no more than `{ id }` on purpose. Everything else about it is
 * *whatever version wrote it*: a document from an older build, or from a newer one, is a perfectly
 * valid row here and neither is a `Project` by this build's definition. Claiming otherwise in the
 * type would be a lie that `projects.ts` then has to work around — instead it reads a stored record
 * as untrusted input and hands it to `migrateProject`, which is the one place in Cutroom that
 * decides what a document is.
 */
export interface CutroomSchema extends DBSchema {
  [PROJECT_STORE]: { key: string; value: { readonly id: string } }
  [SOURCE_LINK_STORE]: { key: string; value: SourceLinkRecord }
}

export type CutroomDatabase = IDBPDatabase<CutroomSchema>

/**
 * The upgrade ladder, climbed one rung at a time from whatever version this browser already has.
 *
 * Written as ordered `if (from < n)` blocks rather than a `switch` with fall-through: the effect is
 * the same, and a browser that has never seen the database (`from === 0`) runs every block in order
 * for free. Version 2 is one more block at the bottom and nothing else — including, one day, a
 * block that opens `transaction` to rewrite existing rows.
 */
function upgrade(database: CutroomDatabase, from: number): void {
  if (from < 1) {
    database.createObjectStore(PROJECT_STORE, { keyPath: "id" })
    database.createObjectStore(SOURCE_LINK_STORE, { keyPath: "sourceId" })
  }
}

let connection: Promise<CutroomDatabase> | undefined

/**
 * Opens the database, or hands back the connection already open.
 *
 * The promise is cached rather than the database, so two callers racing on the first call get one
 * connection instead of two. A failed open is not cached — clearing it lets a later call try again
 * rather than making one transient failure permanent for the life of the page.
 */
export function openCutroomDatabase(): Promise<CutroomDatabase> {
  connection ??= openDB<CutroomSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade,

    // Another tab is holding this database at an older version and blocking our upgrade. Nothing
    // useful can happen until it lets go, and it will not: the older tab has no idea it is in the
    // way. Reported rather than handled, because closing *this* connection would not help — the
    // block is the other tab's.
    blocked(currentVersion) {
      console.warn(
        `Cutroom cannot upgrade its storage from version ${currentVersion} to ` +
          `${DATABASE_VERSION} while another tab has it open. Close the other tabs and reload.`
      )
    },

    // The mirror image: *we* are the old tab, and a newer one wants to upgrade. Let go at once —
    // this page's transactions would fail against the new schema anyway, and holding on would
    // leave the other tab stuck on `blocked` for as long as this one stays open.
    blocking() {
      void connection?.then((database) => {
        database.close()
      })
      connection = undefined
    },

    // The browser dropped the connection out from under us (storage pressure, or the profile being
    // cleared). Forget it so the next call opens a fresh one instead of using a dead handle.
    terminated() {
      connection = undefined
    },
  }).catch((reason: unknown) => {
    connection = undefined
    throw reason
  })

  return connection
}

/**
 * Closes the connection this page holds, if any.
 *
 * Exists for tests and for the deliberate teardown of a page; the app has no reason to call it in
 * normal use. A closed connection is not an error — the next `openCutroomDatabase()` opens another.
 */
export async function closeCutroomDatabase(): Promise<void> {
  const opening = connection
  connection = undefined
  if (opening === undefined) return
  const database = await opening.catch(() => undefined)
  database?.close()
}
