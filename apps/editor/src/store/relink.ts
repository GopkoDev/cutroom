// The two ways an Offline Source comes back (T052, FR-021, FR-022).
//
// **Re-granting** is for a Source whose handle is still in the link table and whose permission
// lapsed — every local Source after a reload, since permission does not survive one (ADR 0005).
// One click, no file chooser: the browser asks, the user agrees, and the Source is read again
// through the handle it already had.
//
// **Picking the file again** is a Relink proper: the user points the Source at a file, the file is
// checked against `Source.fingerprint` (size is identity; the name and timestamp may be corrected —
// see `relinkSource`), and only then is anything rebound. A Relink has two halves on purpose: the
// handle goes to the device-local link table, and the name and fingerprint — the only part that is
// in the Project Document — go through the `relink-source` command, so that half alone is undoable.
// A Relink that finds the document already right produces no patches and so no undo step.
//
// Either way, every Clip that references the Source comes back at once, because none of them ever
// left: the Timeline is not rebuilt, only the engine's attachment is restored (FR-022).

import type { SourceFingerprint } from "@cutroom/model"

import {
  relinkSource,
  requestSourceAccess,
  type RelinkOutcome,
  type SourceFileHandle,
} from "@/storage/source-links"
import { fileProblem, technicalDetail } from "@/ui/failure-wording"

import type { EditorState } from "./index"
import type { SourceStatusTracker } from "./source-status"

/**
 * How a re-grant or Relink ended, for the prompt to show. `message` is the plain statement;
 * `detail`, when there is one, is the platform's or the engine's own words, for "Details".
 */
export type RelinkResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string; readonly detail?: string }

export interface RegrantDependencies {
  readonly tracker: Pick<SourceStatusTracker, "handleFor" | "check">
  readonly store: { getState(): EditorState }
  readonly requestAccess?: (handle: SourceFileHandle) => Promise<PermissionState>
}

/**
 * Asks the browser to let a Source be read again. **Call it as the first act of a click**: the
 * handle is taken synchronously from the tracker so that `requestPermission` is the first thing
 * awaited, and the gesture is still live when it is.
 */
export async function regrantAccess(
  sourceId: string,
  dependencies: RegrantDependencies
): Promise<RelinkResult> {
  const handle = dependencies.tracker.handleFor(sourceId)
  if (handle === undefined) {
    return { ok: false, message: "This machine has no link to the file. Find it instead." }
  }

  let permission: PermissionState
  try {
    permission = await (dependencies.requestAccess ?? requestSourceAccess)(handle)
  } catch (error) {
    return {
      ok: false,
      message: "The browser did not ask for permission. Click Allow access again.",
      detail: technicalDetail(error),
    }
  }
  if (permission !== "granted") {
    return { ok: false, message: "Access was not granted, so the Source stays Offline." }
  }

  await dependencies.tracker.check(sourceId)
  const state = dependencies.store.getState()
  if (state.sourceStatus[sourceId] === "linked") return { ok: true }
  const detail = state.sourceOffline[sourceId]?.detail
  return {
    ok: false,
    message: "Access was granted, but the file is no longer where it was. Find it instead.",
    ...(detail === undefined ? {} : { detail }),
  }
}

export interface RelinkDependencies {
  readonly store: { getState(): EditorState }
  readonly tracker: Pick<SourceStatusTracker, "attach" | "markLinked">
  /** `new Date().toISOString()` in the app. */
  readonly now: () => string
  readonly relink?: (
    sourceId: string,
    handle: FileSystemFileHandle,
    expected: SourceFingerprint
  ) => Promise<RelinkOutcome>
}

/**
 * `relinkSource` hands back the platform's message as a string; the DOMException name it leads
 * with, when it does, is all `fileProblem` needs.
 */
function namedError(detail: string): { name: string } | undefined {
  const name = /^([A-Z]\w+Error)\b/.exec(detail)?.[1]
  return name === undefined ? undefined : { name }
}

/** Words for a size, for a message that has to say two files differ. */
function bytes(size: number): string {
  return `${new Intl.NumberFormat().format(size)} bytes`
}

/**
 * Points an Offline Source at a file the user just picked — if it is the same file.
 *
 * Nothing changes on a mismatch: the old handle stays, the document stays, and the message says
 * what was different.
 */
export async function relinkPickedFile(
  sourceId: string,
  handle: FileSystemFileHandle,
  dependencies: RelinkDependencies
): Promise<RelinkResult> {
  const { store, tracker } = dependencies
  const source = store.getState().project?.sources.find((candidate) => candidate.id === sourceId)
  if (source === undefined)
    return { ok: false, message: "That Source is no longer in the Project." }

  const outcome = await (dependencies.relink ?? relinkSource)(sourceId, handle, source.fingerprint)
  if (!outcome.ok) {
    if (outcome.reason === "unreadable") {
      return {
        ok: false,
        message: `That file could not be used for ${source.name}. ${fileProblem(namedError(outcome.detail))}`,
        detail: outcome.detail,
      }
    }
    return {
      ok: false,
      message:
        `That is not the same file: it is ${bytes(outcome.found.size)}, ` +
        `and ${source.name} was ${bytes(outcome.expected.size)}.`,
    }
  }

  try {
    await tracker.attach(sourceId, handle, outcome.file)
  } catch (error) {
    return {
      ok: false,
      message: `The file matches ${source.name}, but it could not be read. Its Clips stay as they are.`,
      detail: technicalDetail(error),
    }
  }

  // The document's half: the name the file goes by now and the fingerprint the next Relink checks
  // against. No patches when both are already right, so no undo step for a Relink that changed
  // nothing in the document (T022).
  store.getState().run({
    type: "relink-source",
    at: dependencies.now(),
    sourceId,
    name: outcome.name,
    fingerprint: outcome.fingerprint,
  })
  tracker.markLinked(sourceId)
  return { ok: true }
}
