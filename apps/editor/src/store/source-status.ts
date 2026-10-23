// Whether each Source can be read right now, kept current (T051, FR-021, FR-022).
//
// Source status is runtime state: it is in the store, it is not in the Project Document, and it is
// not in the undo history (data-model.md). Every write here goes through `markSource`, which is a
// plain `set` — no command, no patch — so an undo can never take a Source from Linked to Offline or
// back. That is the whole of "a plain store action outside the undo history"; the rest of this
// module is about *when* the status is re-derived and what else has to move with it.
//
// ## Three occasions, not one
//
// A status is a verdict about the outside world, and the outside world changes without telling us.
// So it is worked out again:
//
//   1. **When a Project is opened** — `checkAll`. Done without a user gesture, so it only *asks*
//      about permission (`queryPermission`), never requests it: reopening a Project lands every
//      local Source Offline with `needs-permission` until the user clicks, which is the browser's
//      rule and not a defect (ADR 0005).
//   2. **When the window regains focus** — `checkAll` again. The commonest way a file goes missing
//      is the user renaming or moving it in another window; coming back is the moment to notice.
//   3. **Whenever a read of the file fails mid-session** — `readFailed`, from the engine, and
//      `verifyLinked`, which the shell calls as the Playhead moves. The second exists because the
//      edge case is "goes Offline on the next Frame it is asked for": a `File` the worker already
//      holds may keep answering from decoded Frames it cached, so waiting for the worker to fail
//      a read could mean a Preview showing pictures that no longer have a file behind them. A
//      `getFile()` on the handle fails the moment the file is gone and costs no decoding.
//
// ## What moves with the status
//
// The engine's attachment. A Source that goes Offline is detached, so its Clips render empty
// (FR-022, data-model.md: "A Clip whose Source is Offline stays on the Timeline and renders as
// empty") — the Clip stays in the Scene, the Scene does not change, and only the worker's picture
// of which files it can read does. A Source that comes back is attached again with the fresh
// `File`. The status is written *after* the attachment settles, so that anything re-rendering on a
// status change asks for a Frame the engine is already able to draw.
//
// ## What is kept outside the store
//
// The handles. A re-grant must call `requestPermission` as the very first act of a click — an
// `await` before it is the browser's chance to decide the gesture expired — so the handle has to be
// in memory already. It is not plain data, so it does not go in the store (ADR 0004); it is held
// here, keyed by Source id, and `handleFor` hands it out synchronously.

import type { SourceAttachedEvent } from "@cutroom/engine/protocol"
import type { SourceFingerprint } from "@cutroom/model"

import {
  fingerprintOf,
  readSourceFile,
  type SourceFileHandle,
  type SourceFileResult,
} from "@/storage/source-links"

import type { EditorState, SourceOfflineReason, SourceStatus } from "./index"

/** The engine, as far as Source status is concerned. */
export interface SourceStatusEngine {
  attachSource(sourceId: string, file: File): Promise<SourceAttachedEvent>
  detachSource(sourceId: string): void
}

export interface SourceStatusOptions {
  readonly store: { getState(): EditorState }
  readonly engine: SourceStatusEngine
  /** Replaced only in unit tests, which have no IndexedDB and no file handles. */
  readonly readSourceFile?: (sourceId: string) => Promise<SourceFileResult>
}

export interface SourceStatusTracker {
  /** Re-derives every Source in the open Project. On open and on focus. */
  checkAll(): Promise<void>
  /** Re-derives one Source — after a re-grant, or when the user asks to try again. */
  check(sourceId: string): Promise<void>
  /**
   * Re-checks only the Sources currently Linked, and only that their file is still there.
   * Coalesced: called on every Playhead move, it runs at most one pass at a time and one more
   * afterwards if it was asked again in the meantime.
   */
  verifyLinked(): Promise<void>
  /**
   * Hands a Source's bytes to the engine and remembers the handle they came from. Does **not**
   * mark the Source Linked: at import the Source is not in the Project yet, and whether it ever is
   * depends on commands that have not run. `markLinked` is the second half.
   */
  attach(sourceId: string, handle: SourceFileHandle, file: File): Promise<SourceAttachedEvent>
  /** Records that an attached Source is part of the Project and readable. */
  markLinked(sourceId: string): void
  /** Undoes an `attach` whose Source never made it into the Project. */
  release(sourceId: string): void
  /** A read of the Source's file failed mid-session. It goes Offline now, not at the next reload. */
  readFailed(sourceId: string, detail: string): void
  /** The handle for a Source, synchronously, for a click handler that must not await first. */
  handleFor(sourceId: string): SourceFileHandle | undefined
  /**
   * The Source in the open Project whose file `handle` is — compared with each held handle by
   * `isSameEntry`, so a different handle to the same file, under any name, is found. For the
   * export, which must not save over a Source (decisions.md). A Source with no handle here (never
   * linked in this browser) cannot be compared and is not found.
   */
  sourceAt(handle: FileSystemHandle): Promise<string | undefined>
  /** Whether an attach for this Source is in flight — a `source-failed` for it is its reply. */
  isAttaching(sourceId: string): boolean
  /** Stops everything: later answers from storage or the engine are ignored. */
  dispose(): void
}

/** The engine is gone. Its rejection says nothing about the file, so no status is written. */
function engineStopped(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "EngineFatalError" || error.name === "EngineClosedError")
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sameFingerprint(a: SourceFingerprint, b: SourceFingerprint): boolean {
  return a.size === b.size && a.lastModified === b.lastModified
}

export function createSourceStatusTracker(options: SourceStatusOptions): SourceStatusTracker {
  const { store, engine } = options
  const read = options.readSourceFile ?? readSourceFile

  const handles = new Map<string, SourceFileHandle>()
  /** What each attached Source was attached *from*, so a changed file is attached again. */
  const attached = new Map<string, SourceFingerprint>()
  const attaching = new Set<string>()
  /** One chain per Source, so two checks of one Source cannot interleave their attach/detach. */
  const queues = new Map<string, Promise<void>>()
  let disposed = false
  let verifying: Promise<void> | null = null
  let verifyAgain = false

  /**
   * Runs `task` after everything already queued for this Source. The answer is the task's own,
   * rejection included; the chain itself only ever records that the task settled, so one failed
   * check does not poison the next.
   */
  function serially<T>(sourceId: string, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(sourceId) ?? Promise.resolve()
    const answer = previous.then(task)
    queues.set(
      sourceId,
      answer.then(
        () => undefined,
        () => undefined
      )
    )
    return answer
  }

  /**
   * A check that throws — storage failing, a browser that cannot query permission — has no status
   * to write, and nobody awaiting it who could do better. Reported, so it is not silent.
   */
  function report(sourceId: string): (error: unknown) => void {
    return (error) => {
      if (!disposed)
        console.error(`Checking whether the Source ${sourceId} can be read failed`, error)
    }
  }

  function checkOne(sourceId: string): Promise<void> {
    return serially(sourceId, () => derive(sourceId)).catch(report(sourceId))
  }

  /** Writes a status only if it differs, so a pass that changes nothing re-renders nothing. */
  function mark(sourceId: string, status: SourceStatus, why?: SourceOfflineReason): void {
    if (disposed) return
    const state = store.getState()
    const heldWhy = state.sourceOffline[sourceId]
    const unchanged =
      state.sourceStatus[sourceId] === status &&
      (status === "linked" || (heldWhy?.reason === why?.reason && heldWhy?.detail === why?.detail))
    if (!unchanged) state.markSource(sourceId, status, why)
  }

  function detach(sourceId: string): void {
    if (!attached.has(sourceId)) return
    attached.delete(sourceId)
    engine.detachSource(sourceId)
  }

  function goOffline(sourceId: string, why: SourceOfflineReason): void {
    detach(sourceId)
    mark(sourceId, "offline", why)
  }

  async function attachNow(sourceId: string, file: File): Promise<SourceAttachedEvent> {
    detach(sourceId)
    attaching.add(sourceId)
    try {
      const metadata = await engine.attachSource(sourceId, file)
      attached.set(sourceId, fingerprintOf(file))
      return metadata
    } finally {
      attaching.delete(sourceId)
    }
  }

  /** The Source as the open Project records it, if it is in the Project. */
  function recorded(sourceId: string) {
    return store.getState().project?.sources.find((source) => source.id === sourceId)
  }

  async function derive(sourceId: string): Promise<void> {
    const result = await read(sourceId)
    if (disposed) return

    if (result.status === "offline") {
      if ("handle" in result) handles.set(sourceId, result.handle)
      else handles.delete(sourceId)
      goOffline(sourceId, {
        reason: result.reason,
        ...(result.reason === "unreachable" ? { detail: result.detail } : {}),
      })
      return
    }

    handles.set(sourceId, result.handle)
    const found = fingerprintOf(result.file)

    // The handle still points at *a* file, but is it this Source's? The same rule a Relink uses
    // (source-links.ts): size is identity, a timestamp may legitimately move. A file replaced by
    // something else at the same path must not quietly feed this Source's Clips.
    const expected = recorded(sourceId)?.fingerprint
    if (expected !== undefined && expected.size !== found.size) {
      goOffline(sourceId, {
        reason: "unreachable",
        detail: `the file there is now ${found.size} bytes, and this Source was ${expected.size}`,
      })
      return
    }

    const held = attached.get(sourceId)
    if (held === undefined || !sameFingerprint(held, found)) {
      try {
        await attachNow(sourceId, result.file)
      } catch (error) {
        if (disposed || engineStopped(error)) return
        goOffline(sourceId, { reason: "unreadable", detail: describe(error) })
        return
      }
      if (disposed) return
    }
    mark(sourceId, "linked")
  }

  function sourceIds(): string[] {
    return store.getState().project?.sources.map((source) => source.id) ?? []
  }

  return {
    async checkAll() {
      await Promise.all(sourceIds().map(checkOne))
    },

    check: checkOne,

    verifyLinked() {
      if (verifying !== null) {
        verifyAgain = true
        return verifying
      }
      const pass = async (): Promise<void> => {
        do {
          verifyAgain = false
          const state = store.getState()
          const linked = sourceIds().filter((id) => state.sourceStatus[id] === "linked")
          await Promise.all(linked.map(checkOne))
        } while (verifyAgain && !disposed)
      }
      verifying = pass().finally(() => {
        verifying = null
      })
      return verifying
    },

    attach(sourceId, handle, file) {
      handles.set(sourceId, handle)
      return serially(sourceId, () => attachNow(sourceId, file))
    },

    markLinked(sourceId) {
      mark(sourceId, "linked")
    },

    release(sourceId) {
      handles.delete(sourceId)
      detach(sourceId)
    },

    readFailed(sourceId, detail) {
      void serially(sourceId, async () => {
        goOffline(sourceId, { reason: "unreachable", detail })
      })
    },

    handleFor(sourceId) {
      return handles.get(sourceId)
    },

    async sourceAt(handle) {
      const ids = sourceIds()
      const matches = await Promise.all(
        ids.map(async (id) => {
          const held = handles.get(id)
          if (held === undefined) return false
          try {
            return await held.isSameEntry(handle)
          } catch {
            return false // a handle that cannot even be compared is not this file
          }
        })
      )
      return ids.find((_, index) => matches[index])
    },

    isAttaching(sourceId) {
      return attaching.has(sourceId)
    },

    dispose() {
      disposed = true
      handles.clear()
      attached.clear()
    },
  }
}
