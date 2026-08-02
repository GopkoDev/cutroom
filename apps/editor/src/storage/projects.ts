// The Project library: what the app lists on arrival, what it opens, and what it writes back
// without ever asking the user to save (FR-020).
//
// Three rules shape everything below.
//
// **Loading goes through `migrateProject`, never `parseProject` directly.** A stored document is
// whatever version wrote it, and the version that wrote it is exactly the thing this module cannot
// assume. `migrateProject` walks it up to the current schema or refuses with a reason (ADR 0007);
// reaching for `parseProject` here would turn "this Project is older than this build" into
// "this Project is corrupt".
//
// **Nothing here validates a document itself.** Every rule about what a Project may contain lives
// in `packages/model`, and a second opinion in this file would be a second definition of a valid
// Project — one that a server, which will run the model and not this file, would not share.
//
// **Listing is generous, opening is strict.** The list is where a user goes to recover: if one
// unreadable row could make `listProjects` throw, a single bad record would hide every Project
// they have. So a summary is read structurally, field by field, and a document this build cannot
// open still appears in the list — it is only `loadProject` that refuses it, by which point there
// is a Project on screen to attach the refusal to.

import { CURRENT_SCHEMA_VERSION, migrateProject, parseProject, type Project } from "@cutroom/model"

import { openCutroomDatabase, PROJECT_STORE } from "./db"

/**
 * Enough to list a Project without opening it: what it is called, when it was last touched, and
 * whether this build could open it at all.
 *
 * `name` and `modifiedAt` are nullable because a summary is read from an untrusted record rather
 * than from a `Project`. Null means the stored document carries nothing usable there, and what to
 * show in its place is the list's decision (T037), not this module's — inventing a name here would
 * put a value on screen that is in no document and would be written back by the first save.
 */
export interface ProjectSummary {
  readonly id: string
  readonly name: string | null
  readonly createdAt: string | null
  readonly modifiedAt: string | null
  /** The version the stored document claims. `null` when it claims none, which means version 0. */
  readonly schemaVersion: number | null
  /**
   * Whether this build understands the stored version. `false` means the Project was saved by a
   * newer Cutroom: it is listed, so the user can see their work is still there, and `loadProject`
   * explains why it will not open.
   */
  readonly openable: boolean
}

/**
 * A Project that is in storage but cannot be turned into one this build can work with.
 *
 * A distinct type because the two cases the UI must tell apart — "there is no such Project" and
 * "there is one and it cannot be opened" — are otherwise both an absence. The reason from the
 * model is kept verbatim, both in the message and as `cause`: it already names the schema version
 * and says there is no downgrade, and rewording it here would leave the user's error message a
 * paraphrase of the real one.
 */
export class ProjectLoadError extends Error {
  readonly projectId: string

  constructor(projectId: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    super(`The Project stored as ${projectId} could not be opened. ${reason}`)
    this.name = "ProjectLoadError"
    this.projectId = projectId
    this.cause = cause
  }
}

/** A field of an untrusted record, when it happens to be a string. */
function readString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field]
  return typeof value === "string" ? value : null
}

/**
 * What version a stored record claims, by the same rule `migrateProject` uses: a document with no
 * `schemaVersion` is version 0, the shape from before the field existed. Anything that is not a
 * whole number is `null` — unreadable rather than absent, and `openable` is false either way.
 */
function readSchemaVersion(record: Record<string, unknown>): number | null {
  const stated = record.schemaVersion
  if (stated === undefined) return 0
  if (typeof stated !== "number" || !Number.isSafeInteger(stated) || stated < 0) return null
  return stated
}

function summarise(stored: unknown): ProjectSummary | null {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return null
  const record = stored as Record<string, unknown>
  const id = readString(record, "id")
  if (id === null) return null

  const schemaVersion = readSchemaVersion(record)
  return {
    id,
    name: readString(record, "name"),
    createdAt: readString(record, "createdAt"),
    modifiedAt: readString(record, "modifiedAt"),
    schemaVersion,
    openable: schemaVersion !== null && schemaVersion <= CURRENT_SCHEMA_VERSION,
  }
}

/**
 * When a timestamp says, as a number, or `NaN` when it says nothing legible.
 *
 * `Date.parse` rather than a string comparison: `parseProject` accepts an explicit UTC offset as
 * well as a `Z`, so `2026-08-02T09:00:00+02:00` and `2026-08-02T08:00:00Z` are the same instant and
 * sort the wrong way round as text.
 */
function instantOf(timestamp: string | null): number {
  return timestamp === null ? Number.NaN : Date.parse(timestamp)
}

/**
 * Every Project in the library, most recently modified first.
 *
 * Read with `getAll` and ordered here rather than through an IndexedDB index on `modifiedAt`,
 * because an index silently omits records that lack its key path: a document whose timestamp went
 * missing would vanish from the list instead of appearing as one that needs attention. Rows with
 * no legible `modifiedAt` sort last, in stable id order, so the list is deterministic.
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  const database = await openCutroomDatabase()
  const stored = await database.getAll(PROJECT_STORE)

  return stored
    .map((record) => summarise(record))
    .filter((summary): summary is ProjectSummary => summary !== null)
    .sort((a, b) => {
      const left = instantOf(a.modifiedAt)
      const right = instantOf(b.modifiedAt)
      if (Number.isNaN(left) && Number.isNaN(right)) return a.id < b.id ? -1 : 1
      if (Number.isNaN(left)) return 1
      if (Number.isNaN(right)) return -1
      return right - left
    })
}

/**
 * Opens one Project, bringing it forward to the schema this build understands.
 *
 * `undefined` means there is no Project with that id. A `ProjectLoadError` means there is one and
 * it cannot be opened here — a document from a newer Cutroom, or one that no longer parses.
 *
 * The migrated document is deliberately **not** written back. A load is not an edit: rewriting on
 * open would change `modifiedAt` order for a Project the user only looked at, and would commit
 * this build's reading of an old document before the user has done anything they could keep. The
 * first real edit saves the migrated shape anyway.
 */
export async function loadProject(id: string): Promise<Project | undefined> {
  const database = await openCutroomDatabase()
  const stored = await database.get(PROJECT_STORE, id)
  if (stored === undefined) return undefined

  try {
    return migrateProject(stored)
  } catch (cause) {
    throw new ProjectLoadError(id, cause)
  }
}

/**
 * Writes a Project, replacing whatever was stored under its id.
 *
 * What goes to IndexedDB is `parseProject(project)` — the model's own rebuild of the document, not
 * the object handed in. That single line buys three things no check in this file could:
 *
 *   * A `FileSystemFileHandle`, a `Date`, a `Map` or any other object with a prototype of its own
 *     cannot reach the store. All of them are structured-cloneable, so IndexedDB would take them
 *     happily and the Project Document would quietly stop being portable JSON (ADR 0005, 0007).
 *     The parser refuses them, here, at the only door into storage.
 *   * A document that would not survive its next load fails now, loudly, while the Project the
 *     caller holds is still intact — rather than in a session the user has already closed.
 *   * The validation is the model's, in the model, once. This file states no rule of its own.
 *
 * The cost is a rebuild per write, which is why writes are debounced (`createProjectSaver`) rather
 * than made on every keystroke.
 *
 * No timestamp is stamped here. `modifiedAt` comes from the command that made the edit, so that
 * saving is a consequence of an edit and never an edit in itself.
 */
export async function saveProject(project: Project): Promise<void> {
  const database = await openCutroomDatabase()
  await database.put(PROJECT_STORE, parseProject(project))
}

/** How a saver reports a write that failed. */
export type SaveFailureHandler = (error: unknown, project: Project) => void

export interface ProjectSaverOptions {
  /** Quiet time before a write, in milliseconds. */
  readonly delayMs?: number
  /**
   * The longest an edit may sit unwritten while edits keep arriving. A plain debounce never fires
   * during a continuous gesture — a drag, or a name being typed — so this bounds what is at risk
   * if the tab goes away mid-gesture.
   */
  readonly maximumDelayMs?: number
  /** Called when a write throws. */
  readonly onFailure?: SaveFailureHandler
  /**
   * The write itself. Replaced only in tests, where the interesting property — that an edit
   * arriving while a write is in flight is not lost — needs a write that can be held open.
   */
  readonly write?: (project: Project) => Promise<void>
}

export interface ProjectSaver {
  /**
   * Records that this is now the Project to store. Returns immediately: saving is automatic, so
   * nothing the user does may wait on it (FR-020).
   */
  save(project: Project): void
  /** Writes whatever is outstanding now and resolves when storage is quiet. */
  flush(): Promise<void>
  /** Stops the timer and refuses further saves. Does not write; call `flush` first if that matters. */
  close(): void
}

/**
 * Automatic saving: the caller says what the Project now is, and this decides when to write it.
 *
 * The property worth stating precisely, because it is the one a naive debounce gets wrong: **the
 * last Project handed to `save` is always the last one written.** A write is awaited, and edits
 * made while it is in flight arrive after the queue was emptied — so the loop re-reads what is
 * outstanding *after* each write rather than before, and a second write follows immediately.
 * Nothing is ever dropped because storage was busy when it arrived, and two writes never overlap,
 * so the store cannot end up holding an older document than one it already held.
 *
 * A failed write is reported and not retried. Every write carries the whole document, so the next
 * save subsumes the lost one; retrying instead would spin forever on a document that will never be
 * writable, which is the failure mode that takes the tab down with it.
 */
export function createProjectSaver(options: ProjectSaverOptions = {}): ProjectSaver {
  const delayMs = options.delayMs ?? 500
  const maximumDelayMs = options.maximumDelayMs ?? 2000
  const write = options.write ?? saveProject
  const onFailure =
    options.onFailure ??
    ((error: unknown, project: Project) => {
      // Reported by default rather than swallowed: `save` returns nothing to reject, so a saver
      // built without a failure handler would otherwise lose the user's work in silence.
      console.error(`Cutroom could not save the Project ${project.id}`, error)
    })

  let outstanding: Project | null = null
  let outstandingSince = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let draining: Promise<void> | null = null
  let closed = false

  async function writeOutstanding(): Promise<void> {
    // Re-read after every write: `outstanding` is set again by any edit that arrived while the
    // previous write was in flight, and that edit is newer than what just landed.
    while (outstanding !== null) {
      const next = outstanding
      outstanding = null
      try {
        await write(next)
      } catch (error) {
        onFailure(error, next)
      }
    }
  }

  function drain(): Promise<void> {
    // `draining` is cleared by the `finally` on the promise, not inside `writeOutstanding`: with
    // nothing outstanding that function finishes synchronously, and a `finally` *inside* it would
    // clear the flag before this line had even set it — leaving a settled promise in `draining`
    // forever, which `flush` would then await for work that never runs.
    draining ??= writeOutstanding().finally(() => {
      draining = null
    })
    return draining
  }

  return {
    save(project) {
      if (closed) throw new Error("createProjectSaver: this saver is closed")

      if (outstanding === null) outstandingSince = Date.now()
      outstanding = project

      const deadline = outstandingSince + maximumDelayMs - Date.now()
      const wait = Math.max(0, Math.min(delayMs, deadline))
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void drain()
      }, wait)
    },

    async flush() {
      // Loops because a `save` made while the previous drain was finishing arms a new timer that
      // this flush has not yet cancelled; one pass would return with that edit still unwritten.
      while (outstanding !== null || draining !== null) {
        if (timer !== undefined) {
          clearTimeout(timer)
          timer = undefined
        }
        await drain()
      }
    },

    close() {
      closed = true
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    },
  }
}
