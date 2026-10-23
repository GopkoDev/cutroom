// Bringing a file the user picked into the Project as a Source (T038, FR-001 – FR-005).
//
// The order of the steps is the design, so it is stated once here:
//
//   1. **Read the `File` from the handle.** Nothing is copied: the handle is where the bytes live
//      and the `File` is a view onto them (FR-004, ADR 0005).
//   2. **Let the engine read it** (`attach-source`). The duration, dimensions, Source Timebase,
//      codecs and audio presence all come from the file itself, in the Source's own timescale. A
//      `source-failed` stops here, with the engine's own reason, and the Project has not been
//      touched — there is nothing to roll back because nothing was written (FR-003).
//   3. **Remember the handle** in the device-local link table, so the Source can be reached again
//      after a reload. Before the document names the Source, not after: a Project that names a
//      Source this machine was never told where to find is the state this ordering rules out.
//   4. **Run the import commands** — `importCommands` from the model decides which ones and with
//      what values (T041) — inside one transaction, so the whole import is one undo step and a
//      refusal anywhere in it leaves the Project exactly as it was.
//   5. **Mark the Source Linked.** Last, because until the commands ran it was not in the Project.
//
// Everything this reaches outside itself for is passed in, so the order can be tested without a
// browser. The ids and the timestamp are minted here — the model takes them as input and never
// generates its own (contracts/model-api.md).

import type { SourceAttachedEvent } from "@cutroom/engine/protocol"
import { importCommands, type Source } from "@cutroom/model"

import { fingerprintOf, type SourceFileHandle } from "@/storage/source-links"
import { fileProblem, storageProblem, technicalDetail } from "@/ui/failure-wording"

import type { EditorState } from "./index"
import type { SourceStatusTracker } from "./source-status"

export interface ImportDependencies {
  readonly store: { getState(): EditorState }
  readonly tracker: Pick<SourceStatusTracker, "attach" | "markLinked" | "release">
  readonly putSourceLink: (sourceId: string, handle: FileSystemFileHandle) => Promise<void>
  /** `crypto.randomUUID` in the app. */
  readonly newId: () => string
  /** `new Date().toISOString()` in the app. */
  readonly now: () => string
}

/**
 * How an import ended. A refusal is an answer for the user, not an exception.
 *
 *   * `refused` — this file cannot be used, and `reason` says why in words about the file.
 *   * `failed` — nothing is known to be wrong with the file: Cutroom could not get as far as asking
 *     (the engine has stopped). Shown differently, because "cannot be used" would blame the file.
 *
 * `detail` is the platform's or the model's own words, for "Details", when they are not already
 * the reason.
 */
export type ImportOutcome =
  | { readonly status: "imported"; readonly source: Source }
  | {
      readonly status: "refused" | "failed"
      readonly name: string
      readonly reason: string
      readonly detail?: string
    }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The engine is gone. Its rejection says nothing about the file. */
function engineStopped(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "EngineFatalError" || error.name === "EngineClosedError")
  )
}

/** The model's refusal without the function name it leads with ("importCommands: …"). */
function withoutCaller(message: string): string {
  return message.replace(/^([\w-]+: )+/, "")
}

/** The Source as the Project Document will hold it, from what the engine read. */
function sourceFrom(id: string, file: File, read: SourceAttachedEvent): Source {
  return {
    id,
    name: file.name,
    address: { kind: "local-file" },
    fingerprint: fingerprintOf(file),
    duration: read.duration,
    timebase: read.timebase,
    dimensions: read.dimensions,
    hasAudio: read.hasAudio,
    codecs: read.codecs,
  }
}

export async function importPickedFile(
  handle: SourceFileHandle,
  dependencies: ImportDependencies
): Promise<ImportOutcome> {
  const { store, tracker } = dependencies

  let file: File
  try {
    file = await handle.getFile()
  } catch (error) {
    return {
      status: "refused",
      name: handle.name,
      reason: fileProblem(error),
      detail: technicalDetail(error),
    }
  }

  const sourceId = dependencies.newId()
  let read: SourceAttachedEvent
  try {
    read = await tracker.attach(sourceId, handle, file)
  } catch (error) {
    tracker.release(sourceId)
    if (engineStopped(error)) {
      return {
        status: "failed",
        name: file.name,
        reason:
          "Cutroom's engine has stopped, so the file could not be read. Reload the page, then import it again.",
        detail: technicalDetail(error),
      }
    }
    // The engine's own reason is already written for a person, naming the file and what is wrong.
    return { status: "refused", name: file.name, reason: describe(error) }
  }

  const source = sourceFrom(sourceId, file, read)

  try {
    await dependencies.putSourceLink(sourceId, handle)
  } catch (error) {
    tracker.release(sourceId)
    return {
      status: "refused",
      name: file.name,
      reason: `Cutroom could not remember where this file is, so it would be lost on reload. ${storageProblem(error)}`,
      detail: technicalDetail(error),
    }
  }

  const ids = {
    at: dependencies.now(),
    clipId: dependencies.newId(),
    projectId: dependencies.newId(),
    trackId: dependencies.newId(),
  }

  try {
    // Synchronous from here to the end of the transaction: the Project the commands are computed
    // from is the one the commands are applied to, with no `await` for another edit to slip into.
    store.getState().transact(`Import ${file.name}`, () => {
      for (const command of importCommands(store.getState().project, { ...ids, source })) {
        store.getState().run(command)
      }
    })
  } catch (error) {
    // The transaction aborted, so the Project is as it was. The link-table row written above is
    // keyed by an id no Project names and is never read; it is left rather than deleted, since
    // the link table has no delete and an orphan row costs nothing.
    tracker.release(sourceId)
    return {
      status: "refused",
      name: file.name,
      reason: `It cannot be placed on the Timeline: ${withoutCaller(describe(error))}.`,
      detail: technicalDetail(error),
    }
  }

  tracker.markLinked(sourceId)
  return { status: "imported", source }
}
