// One Export at a time, from the click that starts it to the file it leaves (T075, T076, and the
// main thread's half of T081–T083).
//
// ## What the click does, in order
//
//   1. **Asks where the file goes** — `showSaveFilePicker`, as the very first thing, before any
//      `await`, because the picker needs the click's user activation and an `await` is the
//      browser's chance to decide the gesture is over (FR-015, R4).
//   2. **Freezes the Timeline**, in the same task: the Scene projected from the Project the store
//      holds at that instant. `projectScene`'s Scene is frozen and shares no object with the
//      Project, so holding the reference *is* the snapshot: no later edit can reach it. It is what
//      travels in `export-start` (as a structured clone) and what the sound is mixed from, so the
//      picture and the sound are of the same Timeline (FR-019).
//      Nothing that happens while the picker is open counts, because the picker is modal and
//      nothing can.
//   3. **Refuses a destination that is a Source's own file** — compared with every Source's handle
//      through `FileSystemHandle.isSameEntry`, asked of the Source status tracker, which holds the
//      handles (ADR 0004). Writing there would destroy the Source the export is reading from
//      (spec.md §1, "saving the export over a Linked Source's own file is refused"). Nothing is opened or written, and
//      nothing is removed: the file is the user's Source, left exactly as it was.
//   4. Opens the destination with `createWritable()` and transfers to the worker a plain stream
//      forwarding to it (`forwardingWritable`; Chrome cannot transfer the file stream itself). The
//      worker writes the file through it, closes it only after a finished export — which commits
//      the file — and aborts it otherwise, which discards what was written (R4).
//   5. If there is sound, has `audio/offline-mix.ts` mix the frozen Scene — pulling the Clips'
//      decoded sound from the worker as it goes — and stream the mix back to the worker, no more
//      than the worker has acknowledged (invariant 4).
//
// Editing carries on throughout. Nothing here touches the editor store after step 2, and the
// store never learns that an export is running.
//
// ## How it ends, and what is left on disk
//
// `export-done` is the only ending presented as a finished file. Every other ending — cancelled,
// `export-failed`, the engine stopping, the mix failing — is reported as what it is, and **no
// partial file is left looking like a finished one** (FR-018). The worker closes its stream without
// finalizing; what that leaves at the destination depends on how it closed it, so this side does
// not guess. It noted the destination's size and modification time when it was picked, and after
// an ending short of `done` it removes the file if the export changed it (a partial MP4) or if it
// is empty (what the save picker creates for a new name). A file that is still exactly as it was —
// a file the user chose to replace, left intact because the write never committed — is not ours to
// delete, and stays. If the browser cannot remove a file, the ending says the file is unfinished.
//
// A sound mix that fails cancels the export rather than letting it finish without the sound it was
// started with: a silent file is only ever made when the user chose one (FR-024).
//
// ## One at a time
//
// A start while another export is in hand — choosing a destination, running, or cancelling — is
// refused before the picker opens (spec assumption). The engine client refuses a second
// `export-start` too; this is the half that keeps the user from being asked for a destination
// that could not be used.

import { createStore, type StoreApi } from "zustand/vanilla"

import { forwardingWritable } from "@cutroom/engine"
import { projectScene, type Frame, type Project, type Scene } from "@cutroom/model"

import { requestedExportPcm, type StreamExportAudioOptions } from "@/audio/offline-mix"
import type { EngineClient } from "@/engine-client"
import type { ExportSettings } from "@/ui/export-settings"
import { technicalDetail, type ExportFailureStage } from "@/ui/failure-wording"

/** The Frames an export covers: `fromFrame` up to, not including, `toFrame`. */
export interface ExportRange {
  readonly fromFrame: Frame
  readonly toFrame: Frame
}

/**
 * The seam to `audio/offline-mix.ts`: `streamExportAudio` itself in the app, a fake in tests. It
 * mixes the frozen Scene over `range` at `sampleRate`, pulls the Clips' decoded sound from the
 * worker through `pcm` (`export-audio-request` → `export-audio-pcm`), sends the mix with `send`
 * and waits on `acks` (invariant 4), and stops when `signal` aborts.
 */
export type StreamExportAudio = (options: StreamExportAudioOptions) => Promise<void>

/** What became of the destination after an export that did not finish. */
export type Leftover =
  /** Removed: it held only what this export wrote, or nothing. */
  | "removed"
  /** Exactly as it was before the export; the user's own file, left alone. */
  | "untouched"
  /** Changed by this export and could not be removed. It is not a finished file. */
  | "unfinished"

interface Running {
  readonly fileName: string
  /** Wall-clock milliseconds from `now()`, for elapsed and remaining time. */
  readonly startedAt: number
  readonly framesDone: number
  readonly framesTotal: number
  readonly withSound: boolean
}

export type ExportStatus =
  | { readonly phase: "idle" }
  | { readonly phase: "choosing-destination" }
  | ({ readonly phase: "running" } & Running)
  | ({ readonly phase: "cancelling" } & Running)
  | {
      readonly phase: "done"
      readonly fileName: string
      readonly bytes: number
      readonly elapsedMs: number
      readonly withSound: boolean
    }
  | { readonly phase: "cancelled"; readonly fileName: string; readonly leftover: Leftover }
  | {
      readonly phase: "failed"
      readonly fileName: string | null
      /** Where it failed, which decides the words and the action the dialog offers (T093). */
      readonly stage: ExportFailureStage
      /** The engine's or the platform's own words, for "Details". */
      readonly reason: string
      readonly leftover: Leftover | null
    }
  /** Not started, because the destination chosen is the file a Source reads from. */
  | {
      readonly phase: "refused"
      readonly fileName: string
      /** The Source whose file it is, by the name the Project knows it by. */
      readonly sourceName: string
    }

export interface ExportState {
  readonly status: ExportStatus
}

/** The part of the engine client an export uses. */
export type ExportEngine = Pick<
  EngineClient,
  "startExport" | "cancelExport" | "sendExportAudioChunk" | "requestExportAudio" | "on"
>

export interface ExportControllerOptions {
  readonly engine: ExportEngine
  /** Asks where the file goes; `null` when the user closes the picker. */
  readonly pickDestination: (suggestedName: string) => Promise<FileSystemFileHandle | null>
  readonly streamAudio: StreamExportAudio
  /**
   * The id of the Source whose file `destination` is, if any — `SourceStatusTracker.sourceAt` in
   * the app, which compares it with every Source's handle by `isSameEntry`. Without it, nothing is
   * refused.
   */
  readonly sourceAt?: (destination: FileSystemFileHandle) => Promise<string | undefined>
  /** Wall-clock milliseconds. `performance.now` in the app. */
  readonly now?: () => number
}

export interface ExportController {
  readonly store: StoreApi<ExportState>
  /**
   * Starts an export of `project` with `settings`. **Call it synchronously from the click** — it
   * opens the save picker before it does anything else. Resolves when the export has ended, however
   * it ended; the ending is in `status`, never thrown.
   */
  start(project: Project, settings: ExportSettings): Promise<void>
  /** Asks the running export to stop. Its ending arrives as `cancelled`. */
  cancel(): void
  /** Forgets a finished export's ending, ready for the next one. */
  dismiss(): void
  /** Stops listening to the engine. A running export is cancelled. */
  dispose(): void
}

/** Whether an export is in hand, so that another must wait (and the Project must stay open). */
export function isExportBusy(status: ExportStatus): boolean {
  return (
    status.phase === "choosing-destination" ||
    status.phase === "running" ||
    status.phase === "cancelling"
  )
}

/** The Timeline as it stands now, frozen for an export: see the header, step 2. */
export function freezeForExport(project: Project): {
  readonly scene: Scene
  readonly range: ExportRange
} {
  return {
    scene: projectScene(project),
    range: { fromFrame: 0, toFrame: project.timeline.durationFrames },
  }
}

/** The name the save picker suggests: the Project's, as an MP4. */
export function suggestedFileName(project: Project): string {
  const base = project.name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "Cutroom export"
  return `${base}.mp4`
}

function describe(error: unknown): string {
  return technicalDetail(error)
}

interface Snapshot {
  readonly size: number
  readonly lastModified: number
}

/** The file as it is now; `"missing"` when there is none, `null` when it cannot be read. */
async function snapshotOf(handle: FileSystemFileHandle): Promise<Snapshot | "missing" | null> {
  try {
    const file = await handle.getFile()
    return { size: file.size, lastModified: file.lastModified }
  } catch (error) {
    return error instanceof DOMException && error.name === "NotFoundError" ? "missing" : null
  }
}

/**
 * Removes the destination when this export is what is in it, or nothing is; leaves it otherwise.
 * See the header, "How it ends".
 */
async function clearLeftover(
  handle: FileSystemFileHandle,
  before: Snapshot | "missing" | null
): Promise<Leftover> {
  const after = await snapshotOf(handle)
  if (after === "missing") return "removed" // nothing there to mistake for a finished file
  if (after === null) return "unfinished" // cannot be read, so cannot be vouched for
  const unchanged =
    typeof before === "object" &&
    before !== null &&
    after.size === before.size &&
    after.lastModified === before.lastModified
  if (unchanged && after.size > 0) return "untouched"

  const removable = handle as FileSystemFileHandle & { remove?: () => Promise<void> }
  if (typeof removable.remove !== "function") return after.size > 0 ? "unfinished" : "untouched"
  try {
    await removable.remove()
    return "removed"
  } catch {
    return after.size > 0 ? "unfinished" : "untouched"
  }
}

export function createExportController(options: ExportControllerOptions): ExportController {
  const { engine, pickDestination, streamAudio } = options
  const now = options.now ?? (() => performance.now())
  const store = createStore<ExportState>()(() => ({ status: { phase: "idle" } }))

  /** Aborts the running export's sound mix. Set while one runs. */
  let mixing: AbortController | null = null
  let disposed = false

  const status = () => store.getState().status
  const setStatus = (next: ExportStatus) => {
    store.setState({ status: next })
  }

  const stopWatchingProgress = engine.on("export-progress", (event) => {
    const current = status()
    if (current.phase !== "running" && current.phase !== "cancelling") return
    setStatus({ ...current, framesDone: event.framesDone, framesTotal: event.framesTotal })
  })

  async function start(project: Project, settings: ExportSettings): Promise<void> {
    if (disposed || isExportBusy(status())) return

    // 1 and 2, in one task: the picker first, while the click's activation is fresh, and the
    // Timeline frozen as it stands at this instant.
    const picking = pickDestination(suggestedFileName(project))
    const frozen = freezeForExport(project)
    setStatus({ phase: "choosing-destination" })

    let handle: FileSystemFileHandle | null
    try {
      handle = await picking
    } catch (error) {
      setStatus({
        phase: "failed",
        fileName: null,
        stage: "choosing",
        reason: describe(error),
        leftover: null,
      })
      return
    }
    if (handle === null) {
      setStatus({ phase: "idle" }) // closed the picker: nothing happened
      return
    }
    const destination = handle
    const fileName = destination.name

    // 3: never over a Source's own file. Asked before the file is so much as read for a snapshot.
    const sourceId = await options.sourceAt?.(destination)
    if (sourceId !== undefined) {
      const source = project.sources.find((each) => each.id === sourceId)
      setStatus({ phase: "refused", fileName, sourceName: source?.name ?? fileName })
      return
    }

    const before = await snapshotOf(destination)

    let writable: FileSystemWritableFileStream
    try {
      writable = await destination.createWritable()
    } catch (error) {
      setStatus({
        phase: "failed",
        fileName,
        stage: "opening",
        reason: describe(error),
        leftover: null,
      })
      return
    }

    const audio = settings.audio
    setStatus({
      phase: "running",
      fileName,
      startedAt: now(),
      framesDone: 0,
      framesTotal: frozen.range.toFrame - frozen.range.fromFrame,
      withSound: audio !== null,
    })

    // Chrome cannot transfer the file stream itself, so the worker gets a plain stream forwarding
    // to it; `committed` says when the file stream's own close has committed the file (R4).
    const relay = forwardingWritable(writable)
    // The first thing that went wrong at the destination, as the platform raised it. A write that
    // fails here reaches the worker only as "Cannot close a ERRORED writable stream", so its
    // `export-failed` names the symptom; this is the cause — a full disk, a revoked permission — and
    // the words the user is given depend on it (T093). A `DOMException` only: the worker's own
    // abort reason arrives here too, as a plain `Error`, and says nothing the engine did not.
    let destinationError: DOMException | null = null
    relay.committed.catch((error: unknown) => {
      if (destinationError === null && error instanceof DOMException) destinationError = error
    })
    const finishing = engine.startExport(
      {
        scene: frozen.scene,
        range: frozen.range,
        video: settings.video,
        audio,
      },
      relay.writable
    )

    // The sound, alongside. A mix that fails stops the export: it was started with sound, and
    // finishing without it would be a silent file nobody chose.
    let mixFailure: string | null = null
    const mixer = new AbortController()
    mixing = mixer
    if (audio !== null) {
      void streamAudio({
        scene: frozen.scene,
        range: frozen.range,
        sampleRate: audio.sampleRate,
        pcm: requestedExportPcm(
          (toFrame) => {
            if (!mixer.signal.aborted) engine.requestExportAudio(toFrame)
          },
          (listener) => engine.on("export-audio-pcm", (event) => listener(event))
        ),
        send: (channels, startSample, final) => {
          if (!mixer.signal.aborted) engine.sendExportAudioChunk(channels, startSample, final)
        },
        acks: (listener) => engine.on("export-audio-ack", (event) => listener(event.startSample)),
        signal: mixer.signal,
      }).catch((error: unknown) => {
        if (mixer.signal.aborted) return
        mixFailure = describe(error)
        mixer.abort()
        engine.cancelExport()
      })
    }

    const elapsed = () => {
      const current = status()
      return current.phase === "running" || current.phase === "cancelling"
        ? now() - current.startedAt
        : 0
    }

    // Where the export is, for the words a failure is given: the engine making the file, or the
    // file's own close committing it once the engine has finished.
    let stage: ExportFailureStage = "running"
    try {
      const outcome = await finishing
      const elapsedMs = elapsed()
      mixer.abort()
      if (outcome.status === "done" && mixFailure === null) {
        // `export-done` can overtake the close travelling down the stream, and the file is only
        // finished once that close has committed it here.
        stage = "committing"
        await relay.committed
        setStatus({
          phase: "done",
          fileName,
          bytes: outcome.bytes,
          elapsedMs,
          withSound: audio !== null,
        })
        return
      }
      const leftover = await clearLeftover(destination, before)
      setStatus(
        mixFailure === null
          ? { phase: "cancelled", fileName, leftover }
          : { phase: "failed", fileName, stage: "mixing", reason: mixFailure, leftover }
      )
    } catch (error) {
      mixer.abort()
      // The engine discards what it wrote on every ending but `done`; this covers the endings it
      // never reached — a stream refused before it was posted, an engine that went away — and is a
      // no-op on a stream it already discarded. Never on a committed file: a commit that failed is
      // the only `done`-side way here, and then nothing was committed.
      await writable.abort().catch(() => {})
      const leftover = await clearLeftover(destination, before)
      const cause: DOMException | null = destinationError
      const engineSaid = describe(error)
      const platformSaid = cause === null ? engineSaid : describe(cause)
      setStatus({
        phase: "failed",
        fileName,
        stage: mixFailure === null ? stage : "mixing",
        reason:
          mixFailure ??
          (platformSaid === engineSaid ? engineSaid : `${platformSaid}\n(${engineSaid})`),
        leftover,
      })
    } finally {
      if (mixing === mixer) mixing = null
    }
  }

  function cancel(): void {
    const current = status()
    if (current.phase !== "running") return
    setStatus({ ...current, phase: "cancelling" })
    mixing?.abort()
    engine.cancelExport()
  }

  return {
    store,
    start,
    cancel,
    dismiss() {
      if (!isExportBusy(status())) setStatus({ phase: "idle" })
    },
    dispose() {
      if (disposed) return
      cancel()
      disposed = true
      stopWatchingProgress()
    },
  }
}
