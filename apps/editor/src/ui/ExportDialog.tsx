// The export dialog: what can be made, where it goes, how it is going, and how it ended (T073,
// T074, and the dialog's half of T075 and T081–T083).
//
// Everything it decides is decided elsewhere and tested there — what is offered and whether it can
// start in `export-settings.ts`, the click, the frozen Timeline and every ending in
// `store/export.ts`. This file asks, shows and forwards.
//
// **It asks the machine every time it opens** (FR-017): see `export-settings.ts` for why the
// engine's startup answer is not enough. A quality the machine refuses is listed, disabled, with
// the reason, never left out — the user learns why there is no High rather than wondering where it
// went.
//
// **It is not modal once the export runs.** Editing continues during an export (FR-019 is what
// makes that safe), so the running export shows as a panel beside the editor and the editor stays
// usable underneath it. Closing the tab would take the worker and the half-written file with it,
// so while an export is in hand the page asks before it unloads.
//
// **The Export button's click opens the save picker as its first act** — `controller.start` is
// called synchronously from it and opens the picker before it awaits anything (T075). The Project
// it is given is read from the store at that instant, not from this render, so the Timeline
// exported is the one standing when the button was pressed.

import { useEffect, useState } from "react"
import { useStore } from "zustand"

import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/store"
import {
  isExportBusy,
  type ExportController,
  type ExportStatus,
  type Leftover,
} from "@/store/export"

import {
  EXPORT_QUALITIES,
  QUALITY_LABEL,
  estimateRemainingMs,
  formatBitrate,
  formatDuration,
  probeExportOffer,
  readiness,
  timelineHasSound,
  webCodecsSupport,
  type EncoderSupport,
  type ExportOffer,
  type ExportQuality,
  type ExportSettings,
} from "./export-settings"
import {
  explainExportFailure,
  reloadPage,
  technicalDetail,
  type ExportFailureAction,
} from "./failure-wording"
import { canPickSaveFile } from "./file-picker"
import { Notice } from "./Notice"

/** The settings the last export was started with, so "Try again" can start the same one. */
interface LastStart {
  readonly settings: ExportSettings
  /** Whether the Timeline had sound then. If that has changed, the settings are asked again. */
  readonly hadSound: boolean
}

const RETRY_LABEL: Record<ExportFailureAction, string> = {
  "try-again": "Try again",
  "choose-another-name": "Choose another name…",
  reload: "Reload",
}

const PANEL =
  "fixed top-12 right-3 z-50 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col gap-3 rounded-lg border bg-background p-4 text-xs shadow-lg"

function soundLine(offer: ExportOffer): string {
  switch (offer.sound.kind) {
    case "available": {
      const { codec, bitrate, sampleRate, channels } = offer.sound.settings
      const name = codec === "aac" ? "AAC" : codec === "opus" ? "Opus" : codec
      return `${name}, ${bitrate / 1000} kbps, ${channels === 2 ? "stereo" : `${channels} channels`}, ${sampleRate / 1000} kHz`
    }
    case "silent-timeline":
      return "Nothing on the Timeline has sound, so the file will have no sound track."
    case "no-encoder":
      return "This machine cannot encode sound."
  }
}

function leftoverLine(fileName: string | null, leftover: Leftover | null): string {
  if (fileName === null || leftover === null) return "No file was written."
  switch (leftover) {
    case "removed":
      return `No file was left at ${fileName}.`
    case "untouched":
      return `${fileName} was left exactly as it was before.`
    case "unfinished":
      return `${fileName} is unfinished and could not be removed. It is not a finished export — delete it.`
  }
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

/** Asks before the page unloads while an export is in hand. */
function useLeaveGuard(busy: boolean): void {
  useEffect(() => {
    if (!busy) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [busy])
}

/** A wall clock for the elapsed and remaining readouts, ticking twice a second while mounted. */
function useWallClock(): number {
  const [time, setTime] = useState(() => performance.now())
  useEffect(() => {
    const timer = setInterval(() => setTime(performance.now()), 500)
    return () => clearInterval(timer)
  }, [])
  return time
}

/** The machine's own answers, asked through WebCodecs (export-settings.ts). */
const defaultSupport = webCodecsSupport()

function Settings({
  controller,
  support,
  onClose,
  onStart,
}: {
  readonly controller: ExportController
  readonly support: EncoderSupport
  readonly onClose: () => void
  readonly onStart: (start: LastStart) => void
}) {
  const project = useEditorStore((state) => state.project)
  const sourceStatus = useEditorStore((state) => state.sourceStatus)
  const choosing = useStore(
    controller.store,
    (state) => state.status.phase === "choosing-destination"
  )

  const width = project?.frameSize.width ?? 0
  const height = project?.frameSize.height ?? 0
  const hasSound = project !== null && timelineHasSound(project)

  // What was asked, so an answer to an older question (a frame size since changed) is not read
  // as the answer to this one. The choice is keyed the same way and starts from the preselection.
  const question = `${width}x${height}:${hasSound ? "sound" : "silent"}`
  // Bumped by "Try again" after the machine could not be asked.
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<{
    readonly question: string
    readonly offer: ExportOffer | null
    readonly failure: string | null
  } | null>(null)
  const [choice, setChoice] = useState<{
    readonly question: string
    readonly quality: ExportQuality | null
    readonly withoutSound: boolean
  } | null>(null)

  // Asked when the dialog opens, and again only if what it was asked about changes.
  useEffect(() => {
    if (width === 0 || height === 0) return
    let current = true
    probeExportOffer({ width, height }, hasSound, support).then(
      (offer) => {
        if (current) setAnswer({ question, offer, failure: null })
      },
      (error: unknown) => {
        if (current) setAnswer({ question, offer: null, failure: technicalDetail(error) })
      }
    )
    return () => {
      current = false
    }
  }, [question, width, height, hasSound, support, attempt])

  const answered = answer?.question === question ? answer : null
  const offer = answered?.offer ?? null
  const probeFailure = answered?.failure ?? null
  const chosen = choice?.question === question ? choice : null
  const quality = chosen === null ? (offer?.preselected ?? null) : chosen.quality
  const withoutSound = chosen?.withoutSound ?? false
  const setQuality = (next: ExportQuality) => {
    setChoice({ question, quality: next, withoutSound })
  }
  const setWithoutSound = (next: boolean) => {
    setChoice({ question, quality, withoutSound: next })
  }

  if (project === null) return null

  const durationFrames = project.timeline.durationFrames
  const ready = offer === null ? null : readiness(offer, { quality, withoutSound }, durationFrames)
  const canSave = canPickSaveFile()
  const offline = project.sources.filter((source) => sourceStatus[source.id] === "offline")

  function onExport() {
    if (ready === null || !ready.ok) return
    // The first act of the click: `start` opens the save picker before it awaits anything, and
    // freezes the Project the store holds at this instant (T075, T076).
    const atClick = useEditorStore.getState().project
    if (atClick === null) return
    void controller.start(atClick, ready.settings)
    onStart({ settings: ready.settings, hadSound: timelineHasSound(atClick) })
  }

  return (
    <>
      <p className="text-muted-foreground">
        MP4, H.264 · {project.frameSize.width}×{project.frameSize.height} · {durationFrames} Frames
        at the Project&apos;s Timebase
      </p>

      {offer === null ? (
        probeFailure === null ? (
          <p data-testid="export-probing">Asking this machine what it can encode…</p>
        ) : (
          <Notice
            testId="export-probe-failed"
            title="Cutroom could not ask this machine what it can encode."
            details={probeFailure}
            actions={[
              {
                label: "Try again",
                testId: "export-probe-retry",
                onClick: () => {
                  setAnswer(null)
                  setAttempt((count) => count + 1)
                },
              },
            ]}
          >
            <p>Without that answer no export settings can be offered.</p>
          </Notice>
        )
      ) : (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 font-medium">Quality</legend>
            {EXPORT_QUALITIES.map((each) => {
              const entry = offer.qualities.find((q) => q.quality === each)
              if (entry === undefined) return null
              return (
                <label
                  key={each}
                  data-testid="export-quality"
                  data-quality={each}
                  data-available={entry.available}
                  className={`flex items-baseline gap-2 ${entry.available ? "" : "text-muted-foreground"}`}
                >
                  <input
                    type="radio"
                    name="export-quality"
                    value={each}
                    checked={quality === each}
                    disabled={!entry.available || choosing}
                    onChange={() => setQuality(each)}
                  />
                  <span className="font-medium">{QUALITY_LABEL[each]}</span>
                  <span>{formatBitrate(entry.bitrate)}</span>
                  {entry.available ? null : (
                    <span data-testid="export-quality-unavailable">
                      — unavailable: this machine cannot encode it at this frame size
                    </span>
                  )}
                </label>
              )
            })}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <p className="font-medium">Sound</p>
            <p data-testid="export-sound" data-sound={offer.sound.kind}>
              {soundLine(offer)}
            </p>
            {offer.sound.kind === "no-encoder" ? (
              <div
                data-testid="export-no-sound-warning"
                role="alert"
                className="flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2"
              >
                <p>
                  The Timeline has sound, and this machine has no encoder that can write it. The
                  file can only be made without sound.
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid="export-without-sound"
                    checked={withoutSound}
                    disabled={choosing}
                    onChange={(event) => setWithoutSound(event.target.checked)}
                  />
                  Export without sound
                </label>
              </div>
            ) : null}
          </div>
        </>
      )}

      {offline.length === 0 ? null : (
        <p data-testid="export-offline-warning" className="text-amber-700 dark:text-amber-400">
          {offline.length === 1
            ? `${offline[0].name} is Offline: its Clips`
            : `${offline.length} Sources are Offline: their Clips`}{" "}
          will be exported as the Preview shows them, empty.
        </p>
      )}

      {!canSave ? (
        <p role="alert" className="text-destructive">
          This browser cannot choose where to save a file.
        </p>
      ) : ready !== null && !ready.ok ? (
        <p data-testid="export-blocked" className="text-muted-foreground">
          {ready.why}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" data-testid="export-close" onClick={onClose}>
          Close
        </Button>
        <Button
          size="sm"
          data-testid="export-start"
          disabled={!canSave || ready === null || !ready.ok || choosing}
          onClick={onExport}
        >
          {choosing ? "Choosing where…" : "Export…"}
        </Button>
      </div>
    </>
  )
}

function Progress({
  controller,
  status,
}: {
  readonly controller: ExportController
  readonly status: Extract<ExportStatus, { phase: "running" | "cancelling" }>
}) {
  const time = useWallClock()
  const elapsed = Math.max(0, time - status.startedAt)
  const remaining = estimateRemainingMs(elapsed, status.framesDone, status.framesTotal)
  const percent =
    status.framesTotal > 0 ? Math.floor((100 * status.framesDone) / status.framesTotal) : 0

  return (
    <div data-testid="export-progress" data-phase={status.phase} className="flex flex-col gap-2">
      <p>
        Exporting to <span className="font-medium">{status.fileName}</span>
        {status.withSound ? "" : ", without sound"}.
      </p>
      <progress
        className="w-full"
        max={status.framesTotal}
        value={status.framesDone}
        aria-label="Export progress"
      />
      <p className="tabular-nums">
        <span data-testid="export-frames">
          {status.framesDone} of {status.framesTotal} Frames ({percent}%)
        </span>{" "}
        · <span data-testid="export-elapsed">{formatDuration(elapsed)} elapsed</span> ·{" "}
        <span data-testid="export-remaining">
          {remaining === null ? "estimating…" : `about ${formatDuration(remaining)} left`}
        </span>
      </p>
      <p className="text-muted-foreground">
        You can keep editing; the export uses the Timeline as it was when it started.
      </p>
      <div className="flex justify-end">
        <Button
          variant="destructive"
          size="sm"
          data-testid="export-cancel"
          disabled={status.phase === "cancelling"}
          onClick={() => controller.cancel()}
        >
          {status.phase === "cancelling" ? "Cancelling…" : "Cancel export"}
        </Button>
      </div>
    </div>
  )
}

function Ending({
  status,
  onClose,
  onRetry,
}: {
  readonly status: Extract<ExportStatus, { phase: "done" | "cancelled" | "failed" | "refused" }>
  readonly onClose: () => void
  /** Starts the same export again — the first act of the click, so the save picker can open. */
  readonly onRetry: () => void
}) {
  const failure =
    status.phase === "failed"
      ? explainExportFailure(status.stage, status.reason, status.fileName)
      : null
  return (
    <>
      {status.phase === "done" ? (
        <p data-testid="export-done" data-bytes={status.bytes}>
          Exported <span className="font-medium">{status.fileName}</span> ({megabytes(status.bytes)}
          {status.withSound ? "" : ", no sound"}) in {formatDuration(status.elapsedMs)}.
        </p>
      ) : status.phase === "refused" ? (
        <Notice
          testId="export-refused"
          title={`Not exported: ${status.fileName} is the file the Source ${status.sourceName} reads from.`}
          actions={[{ label: "Choose another name…", testId: "export-retry", onClick: onRetry }]}
        >
          <p>Saving over it would destroy that Source. Nothing was written to it.</p>
        </Notice>
      ) : status.phase === "cancelled" ? (
        <p data-testid="export-cancelled" data-leftover={status.leftover}>
          Export cancelled. {leftoverLine(status.fileName, status.leftover)}
        </p>
      ) : failure === null ? null : (
        <Notice
          testId="export-failed"
          data={{ "data-leftover": status.leftover ?? "none", "data-stage": status.stage }}
          title={failure.title}
          details={status.reason}
          actions={[
            {
              label: RETRY_LABEL[failure.action],
              testId: "export-retry",
              onClick: failure.action === "reload" ? reloadPage : onRetry,
            },
          ]}
        >
          <p>{failure.explanation}</p>
          <p>{leftoverLine(status.fileName, status.leftover)}</p>
        </Notice>
      )}
      <div className="flex justify-end">
        <Button size="sm" data-testid="export-dismiss" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  )
}

export function ExportDialog({
  controller,
  open,
  onClose,
  onOpen,
  support = defaultSupport,
}: {
  readonly controller: ExportController
  /** Whether the user has the dialog open. A running or finished export shows regardless. */
  readonly open: boolean
  readonly onClose: () => void
  /** Opens the dialog again, for a "Try again" that goes back to the settings. */
  readonly onOpen?: () => void
  readonly support?: EncoderSupport
}) {
  const status = useStore(controller.store, (state) => state.status)
  const [lastStart, setLastStart] = useState<LastStart | null>(null)
  useLeaveGuard(isExportBusy(status))

  const choosingSettings = status.phase === "idle" || status.phase === "choosing-destination"
  if (choosingSettings && !open) return null

  const close = () => {
    controller.dismiss()
    onClose()
  }

  // The same export again, straight to the save picker — unless the Timeline has gained or lost
  // its sound since, when the settings (and FR-024's question) have to be asked again.
  const retry = () => {
    onOpen?.()
    const project = useEditorStore.getState().project
    if (
      project !== null &&
      lastStart !== null &&
      timelineHasSound(project) === lastStart.hadSound
    ) {
      void controller.start(project, lastStart.settings)
    } else {
      controller.dismiss()
    }
  }

  return (
    <section role="dialog" aria-label="Export" data-testid="export-dialog" className={PANEL}>
      <h2 className="text-sm font-medium">Export</h2>
      {choosingSettings ? (
        <Settings
          controller={controller}
          support={support}
          onClose={onClose}
          onStart={setLastStart}
        />
      ) : status.phase === "running" || status.phase === "cancelling" ? (
        <Progress controller={controller} status={status} />
      ) : (
        <Ending status={status} onClose={close} onRetry={retry} />
      )}
    </section>
  )
}
