// The device-local link table: `sourceId → FileSystemFileHandle`, and the questions only this
// machine can answer about it.
//
// A Source is addressed, never copied (ADR 0005). The Project Document says a Source exists, what
// it is called and what it fingerprints as; *how to reach its bytes from this computer* is here,
// in a store the Project knows nothing about. Nothing in this file writes to `projects`, and
// nothing a Project carries is written here — that is what keeps a Project portable enough to be
// uploaded, and what makes opening one on a second machine a matter of relinking rather than
// repair.
//
// **Existence and permission are two different questions.** A handle survives a reload because it
// is structured-cloneable; the permission to read it does not survive anything. So the table
// stores handles and never a status, and every answer about whether a Source is readable is worked
// out at the moment it is asked. The three runtime states data-model.md draws are derived here,
// never persisted: an entry plus a granted permission is Linked, and every other combination is
// Offline with a reason the UI can act on.
//
// **Asking is free; requesting needs the user.** `queryPermission` may be called at any time, and
// `inspectSourceLink` is built out of it precisely so that reopening a Project can work out what
// is readable without a user gesture. `requestPermission` is the opposite: it must happen inside a
// user gesture (ADR 0005), so it is exposed as its own function for the UI to call from a click,
// and nothing in the load path may reach it.

import type { SourceFingerprint } from "@cutroom/model"

import { openCutroomDatabase, SOURCE_LINK_STORE } from "./db"

/**
 * Chromium's permission methods on a stored handle, which TypeScript's DOM library does not
 * declare. Optional, because the type only claims what the browser might offer: a browser without
 * them cannot answer the one question this module exists to ask, and is told so rather than being
 * assumed to mean "granted".
 */
export interface SourceFileHandle extends FileSystemFileHandle {
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>
}

/**
 * Read, always. A Source is never modified and never written to (ADR 0005), so asking for write
 * access would be asking the user to grant something the product has no use for.
 */
const READ: { mode: "read" } = { mode: "read" }

/**
 * Whether a Source can be read right now, and when it cannot, why.
 *
 * Derived state, computed on demand and stored nowhere. The reasons are separated because the UI
 * does something different with each: `needs-permission` is one click away from Linked,
 * `never-linked-here` needs a file chooser, and `unreachable` needs a Relink.
 *
 * "Offline" is the word CONTEXT.md gives this, for every one of these reasons — the Source's bytes
 * are out of reach and the Clips that use it stay exactly where they are (FR-022).
 */
export type SourceLinkState =
  | { readonly status: "linked"; readonly handle: SourceFileHandle }
  | { readonly status: "offline"; readonly reason: "never-linked-here" }
  | {
      readonly status: "offline"
      readonly reason: "needs-permission"
      readonly handle: SourceFileHandle
      readonly permission: PermissionState
    }
  | {
      readonly status: "offline"
      readonly reason: "unreachable"
      readonly handle: SourceFileHandle
      readonly detail: string
    }

/** The same verdicts, with the bytes attached when there are any. */
export type SourceFileResult =
  | { readonly status: "linked"; readonly handle: SourceFileHandle; readonly file: File }
  | Exclude<SourceLinkState, { status: "linked" }>

/** What a Relink concluded about the file the user picked. */
export type RelinkOutcome =
  | {
      readonly ok: true
      readonly file: File
      /** The name the file goes by now, which a rename may have changed. */
      readonly name: string
      /** The fingerprint to record, which a copy may have changed the timestamp of. */
      readonly fingerprint: SourceFingerprint
    }
  | {
      readonly ok: false
      readonly reason: "different-file"
      readonly expected: SourceFingerprint
      readonly found: SourceFingerprint
    }
  | { readonly ok: false; readonly reason: "unreadable"; readonly detail: string }

/** What a `File` fingerprints as. One definition, used at import and at every Relink. */
export function fingerprintOf(file: File): SourceFingerprint {
  return { size: file.size, lastModified: file.lastModified }
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * Records where a Source's bytes are on this machine. Replaces any earlier handle for that id.
 *
 * Device-local by construction: the id is the only thing this row shares with the Project
 * Document, and it travels in the other direction — a Project can be exported without consulting
 * this table at all.
 */
export async function putSourceLink(sourceId: string, handle: FileSystemFileHandle): Promise<void> {
  const database = await openCutroomDatabase()
  await database.put(SOURCE_LINK_STORE, { sourceId, handle })
}

/** The handle stored for a Source on this machine, or `undefined` if this machine has none. */
export async function getSourceLink(sourceId: string): Promise<SourceFileHandle | undefined> {
  const database = await openCutroomDatabase()
  const record = await database.get(SOURCE_LINK_STORE, sourceId)
  return record?.handle
}

/**
 * Whether this handle may be read, asked without asking the user.
 *
 * Safe to call whenever, including while a Project is loading — which is the whole reason it is
 * separate from `requestSourceAccess`.
 */
export async function querySourceAccess(handle: SourceFileHandle): Promise<PermissionState> {
  if (typeof handle.queryPermission !== "function") {
    throw new TypeError(
      "querySourceAccess: this browser cannot say whether a stored Source may be read — " +
        "persisted file handles are a Chromium capability (ADR 0006)"
    )
  }
  return handle.queryPermission(READ)
}

/**
 * Asks the user to let this Source be read. **Must be called from a user gesture** — a click, not
 * a load — or the browser refuses without ever showing a prompt (ADR 0005).
 *
 * It takes the handle rather than a Source id on purpose. The UI already holds the handle, from
 * `inspectSourceLink` at load time, so the gesture's handler can call this as its first act with
 * no lookup in between: an `await` before the request is an opportunity for the browser to decide
 * the gesture has expired.
 */
export async function requestSourceAccess(handle: SourceFileHandle): Promise<PermissionState> {
  if (typeof handle.requestPermission !== "function") {
    throw new TypeError(
      "requestSourceAccess: this browser cannot ask for access to a stored Source — " +
        "persisted file handles are a Chromium capability (ADR 0006)"
    )
  }
  return handle.requestPermission(READ)
}

/**
 * What state a Source is in on this machine, without opening it and without a user gesture.
 *
 * Never answers `unreachable`: it does not touch the file, so it cannot know whether the bytes are
 * still there. That is deliberate — this is the call a Project's load path makes for every Source
 * at once, and it does no file I/O and shows no prompt. `readSourceFile` is where a moved file
 * becomes visible.
 */
export async function inspectSourceLink(sourceId: string): Promise<SourceLinkState> {
  const handle = await getSourceLink(sourceId)
  if (handle === undefined) return { status: "offline", reason: "never-linked-here" }

  const permission = await querySourceAccess(handle)
  if (permission === "granted") return { status: "linked", handle }
  return { status: "offline", reason: "needs-permission", handle, permission }
}

/**
 * Resolves a Source to its bytes, or to the reason it is Offline.
 *
 * A granted permission is not a promise that the file is still there: it can be renamed, moved or
 * deleted while the Project is open, and the first sign of that is `getFile` throwing. Turning
 * that throw into an Offline verdict here is what stops a Preview going on showing pictures from a
 * file that no longer exists.
 */
export async function readSourceFile(sourceId: string): Promise<SourceFileResult> {
  const state = await inspectSourceLink(sourceId)
  if (state.status === "offline") return state

  try {
    return { status: "linked", handle: state.handle, file: await state.handle.getFile() }
  } catch (reason) {
    return {
      status: "offline",
      reason: "unreachable",
      handle: state.handle,
      detail: describe(reason),
    }
  }
}

/**
 * Points an Offline Source at the file the user just picked, if it is the same file.
 *
 * **`size` is what is verified; `lastModified` and the name are corrected.** data-model.md asks for
 * two things that only this rule satisfies at once: that a Relink checks the picked file against
 * `Source.fingerprint`, and that a Relink may legitimately correct that fingerprint and the
 * Source's name. A file that was renamed keeps its size and its timestamp; one that was copied to
 * another folder keeps its size and usually gets a new timestamp. Demanding both fields match
 * would refuse every copied file — the commonest reason a Source goes Offline in the first place —
 * and would leave the "may correct its fingerprint" allowance describing something that could
 * never happen. Demanding neither would let a Relink silently bind a Clip to different footage.
 * A size in bytes is the strongest identity the platform offers without reading the whole file.
 *
 * The handle is written **only** on success, so a mistaken pick cannot cost the user the good link
 * they already had. Nothing here touches the Project: the caller takes `name` and `fingerprint`
 * from the outcome and applies the `relink-source` command, which is the document's half of the
 * same act and the only half that belongs on the undo stack.
 */
export async function relinkSource(
  sourceId: string,
  handle: FileSystemFileHandle,
  expected: SourceFingerprint
): Promise<RelinkOutcome> {
  let file: File
  try {
    file = await handle.getFile()
  } catch (reason) {
    return { ok: false, reason: "unreadable", detail: describe(reason) }
  }

  const found = fingerprintOf(file)
  if (found.size !== expected.size) return { ok: false, reason: "different-file", expected, found }

  await putSourceLink(sourceId, handle)
  return { ok: true, file, name: file.name, fingerprint: found }
}
