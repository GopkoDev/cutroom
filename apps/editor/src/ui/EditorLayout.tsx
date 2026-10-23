// The application shell: the Source list, the Preview and the Timeline, with the engine behind the
// Preview.
//
// ## The canvas is transferred once, and once is a stronger word than it looks
//
// `transferControlToOffscreen()` can be called on a canvas element exactly once. Ever. The second
// call throws `InvalidStateError`, and there is no way to give the element back.
//
// React's development double-mount runs every effect twice — mount, clean up, mount again — against
// *the same DOM element*. A component that transferred in the effect and terminated the worker in
// the cleanup would therefore work in production and fail on the second mount in development, with
// a message about invalid state that says nothing about why. It is handled here rather than
// discovered in the browser:
//
//   * The engine session is keyed on the canvas **element**, in a `WeakMap`, so the second mount
//     finds the session the first one made instead of transferring again.
//   * Teardown is deferred by a task and reference-counted. StrictMode's release is immediately
//     followed by a retain, which cancels it; a real unmount is not, so the worker is terminated
//     one task later. Nothing is left running, and nothing is torn down that is about to be needed.
//
// ## What the shell is responsible for
//
// Keeping the engine's picture of the Timeline current, and no more. It posts a `Scene` when the
// store says the picture changed, asks for the Frame under the Playhead, and shows what the engine
// says it drew — which for an empty Project is a black raster at the Project's frame size, the
// Phase 2 checkpoint. The panels around the Preview are their own components: the Source list
// (`SourcesPanel`), the Timeline (`Timeline`), the top bar with the timecode (`TopBar`) and the
// prompt for Offline Sources (`RelinkPrompt`).
//
// It also owns the transport (T062) — play and stop, and the audio clock that drives the Preview
// while playing — for the same reason as the tracker below: the transport talks to this engine.
//
// It also owns the export controller (T075, T076), for the same reason again: an export is a
// conversation with this engine, and ends with it. The dialog is opened from the top bar.
//
// It also owns the one Source status tracker (T051), because the tracker's lifetime is the
// engine's: attachments are per worker, so a tracker that outlived its engine would believe Sources
// were attached to a worker that no longer exists. The three occasions on which status is derived
// again are wired here — the Project being opened, the window regaining focus, and a read failing
// mid-session (the engine's `source-failed` for a Source already attached, and a check of the
// Linked Sources each time the Playhead moves). A status change asks for the Frame again, so a
// Source that goes Offline empties the Preview at once and one that comes back fills it, with no
// edit to the Scene either way.
//
// ## Nothing here re-renders per Frame
//
// While playing, every Frame the engine draws moves the Playhead (the transport follows the
// picture) and changes the "showing Frame …" line — thirty times a second. So neither is read here:
// the Playhead's readouts are components of their own (`PlayheadLabel`, `ShownLabel`, the top bar's
// timecode, the Timeline's Playhead), and this component reads only `scrubFrame`, which stands still
// while playing. When the shell itself followed the Playhead, each Frame re-rendered the Source
// list, the Timeline, the top bar and this, which was half the main thread's busy time during
// playback and, on a slow moment, a missed display frame — and at the wrong phase between the
// display and the audio clock, one missed display frame is one skipped Frame (T072).
//
// A `fatal` from the engine is shown in the Preview's place. The alternative is the failure ADR
// 0003 names: the canvas belongs to the worker, so a dead worker and a still picture look
// identical from out here. It says what still holds — the Project is saved, which it makes sure of
// by flushing the saver before it says so — and what to do: reload (T093).
//
// A save that failed is shown across the top of the editor, with "Try again", for as long as it
// stays failed: the Project in this tab is then newer than the one in storage, and the page asks
// before it unloads.

import { useEffect, useRef, useState } from "react"

import type { PixelSize, Timebase } from "@cutroom/model"

import { createTransport, type Transport } from "@/audio/transport"
import { streamExportAudio } from "@/audio/offline-mix"
import { startEngine, type EngineClient } from "@/engine-client"
import { useEditorStore, type EngineFatalReport } from "@/store"
import { createExportController, type ExportController } from "@/store/export"
import { createSourceStatusTracker, type SourceStatusTracker } from "@/store/source-status"

import { ExportDialog } from "./ExportDialog"
import { reloadPage } from "./failure-wording"
import { Notice } from "./Notice"
import { pickSaveFile } from "./file-picker"
import { RelinkPrompt } from "./RelinkPrompt"
import { SourcesPanel } from "./SourcesPanel"
import { Timeline } from "./Timeline"
import { TopBar } from "./TopBar"

/**
 * What the engine is initialised with before any Project exists.
 *
 * Legitimate rather than a guess: `init.timebase` and `init.frameSize` are "a convenience for the
 * first Render only" and every `Scene` carries its own, which win (worker-protocol invariant 6). So
 * these size the raster until the first Scene arrives and are overwritten by it.
 */
const BEFORE_ANY_PROJECT: { frameSize: PixelSize; timebase: Timebase } = {
  frameSize: { width: 1920, height: 1080 },
  timebase: { numerator: 30, denominator: 1 },
}

interface PreviewSession {
  readonly client: EngineClient
  retained: number
  /** A teardown waiting to happen, cancelled if the same element is retained again. */
  closing: ReturnType<typeof setTimeout> | null
}

// Keyed on the element, not on the component: the element is what can only be transferred once, and
// it is what survives a double-mount. Weak so that a Preview genuinely thrown away takes its entry
// with it.
const sessions = new WeakMap<HTMLCanvasElement, PreviewSession>()

function retainSession(
  element: HTMLCanvasElement,
  size: PixelSize,
  timebase: Timebase
): EngineClient {
  const existing = sessions.get(element)
  if (existing !== undefined) {
    if (existing.closing !== null) {
      clearTimeout(existing.closing)
      existing.closing = null
    }
    existing.retained += 1
    return existing.client
  }

  const client = startEngine({
    canvas: element.transferControlToOffscreen(),
    frameSize: size,
    timebase,
  })
  sessions.set(element, { client, retained: 1, closing: null })
  return client
}

function releaseSession(element: HTMLCanvasElement): void {
  const session = sessions.get(element)
  if (session === undefined) return
  session.retained -= 1
  if (session.retained > 0 || session.closing !== null) return

  // Deferred by one task. React's double-mount releases and retains within the same tick, so this
  // timer never fires there; a real unmount has nothing to cancel it and the worker goes.
  session.closing = setTimeout(() => {
    sessions.delete(element)
    session.client.terminate()
  }, 0)
}

/** The Playhead as a Frame index. The timecode beside it is the top bar's (T050). */
function frameLabel(frame: number): string {
  return `Frame ${frame}`
}

/** The Playhead's Frame. Its own component, because the Playhead moves every Frame while playing. */
function PlayheadLabel() {
  const playheadFrame = useEditorStore((state) => state.playheadFrame)
  return <span data-testid="playhead">{frameLabel(playheadFrame)}</span>
}

/** What the engine says it drew last. Its own component for the same reason as `PlayheadLabel`. */
function ShownLabel({ engine }: { readonly engine: EngineClient | null }) {
  const [shown, setShown] = useState<{ frame: number; revision: number } | null>(null)

  useEffect(() => {
    if (engine === null) return
    return engine.on("frame-rendered", (event) => {
      setShown({ frame: event.frame, revision: event.revision })
    })
  }, [engine])

  return (
    <span data-testid="preview-shown">
      {shown === null
        ? "nothing rendered yet"
        : `showing ${frameLabel(shown.frame)} of Scene ${shown.revision}`}
    </span>
  )
}

/** What is shown in the Preview's place once the engine has stopped. */
function EngineStopped({ report }: { readonly report: EngineFatalReport }) {
  const hasProject = useEditorStore((state) => state.project !== null)
  const saveFailed = useEditorStore((state) => state.saveFailure !== null)
  const [checked, setChecked] = useState(false)

  // Whatever is outstanding is written before the screen says the Project is saved, so the claim
  // is a fact rather than a hope. The saver reports a failure into the store, which this reads.
  useEffect(() => {
    let current = true
    void useEditorStore
      .getState()
      .flushSaves()
      .then(() => {
        if (current) setChecked(true)
      })
    return () => {
      current = false
    }
  }, [])

  const saved = !checked
    ? "Making sure your Project is saved…"
    : !hasProject
      ? "Nothing had been imported yet, so reloading loses nothing."
      : saveFailed
        ? "Your latest changes could not be saved (see the message above). Try saving again before you reload, or they will be lost."
        : "Your Project is saved, so reloading loses nothing."

  return (
    <Notice
      testId="engine-fatal"
      tone="dark"
      className="max-w-md"
      title="Cutroom's engine stopped."
      details={
        // A stack usually opens with the reason itself; shown once, not twice.
        report.stack === undefined
          ? report.reason
          : report.stack.includes(report.reason)
            ? report.stack
            : `${report.reason}\n\n${report.stack}`
      }
      actions={[{ label: "Reload", testId: "engine-fatal-reload", onClick: reloadPage }]}
    >
      <p>
        The Preview, playback, importing and exporting all need it, so they are unavailable until
        the page is reloaded. The Timeline and its Clips are untouched.
      </p>
      <p data-testid="engine-fatal-saved">{saved}</p>
    </Notice>
  )
}

/** A write of the Project that failed, across the top of the editor until one succeeds. */
function SaveFailure() {
  const failure = useEditorStore((state) => state.saveFailure)
  const retrySave = useEditorStore((state) => state.retrySave)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (failure === null) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [failure])

  if (failure === null) return null
  return (
    <Notice
      testId="save-failure"
      className="mx-3 mt-2"
      title={failure.title}
      details={failure.detail}
      actions={[
        {
          label: retrying ? "Saving…" : "Try again",
          testId: "save-retry",
          disabled: retrying,
          onClick: () => {
            setRetrying(true)
            void retrySave().finally(() => setRetrying(false))
          },
        },
      ]}
    >
      <p>{failure.explanation}</p>
      <p>
        Your edits are still here in this tab, and each new edit tries again. Until a save succeeds,
        closing or reloading this tab would lose them, so the way back to Projects stays closed.
      </p>
    </Notice>
  )
}

/**
 * The Frame the shell asks the engine for: the Playhead while stopped, and `null` while playing,
 * when the transport asks instead. A selector rather than `playheadFrame` itself, so a Playhead
 * that moves every Frame while playing does not re-render the shell.
 */
function scrubFrameOf(state: { transport: "stopped" | "playing"; playheadFrame: number }) {
  return state.transport === "playing" ? null : state.playheadFrame
}

export function EditorLayout() {
  const project = useEditorStore((state) => state.project)
  const scene = useEditorStore((state) => state.scene)
  const sceneRevision = useEditorStore((state) => state.sceneRevision)
  const scrubFrame = useEditorStore(scrubFrameOf)
  const engineFatal = useEditorStore((state) => state.engineFatal)
  const sourceStatus = useEditorStore((state) => state.sourceStatus)
  const reportEngineFatal = useEditorStore((state) => state.reportEngineFatal)

  const previewRef = useRef<HTMLCanvasElement>(null)
  const [engine, setEngine] = useState<EngineClient | null>(null)
  const [tracker, setTracker] = useState<SourceStatusTracker | null>(null)
  const [transport, setTransport] = useState<Transport | null>(null)
  const [exporter, setExporter] = useState<ExportController | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [renderer, setRenderer] = useState<string | null>(null)

  // The frame size the raster is created at. Fixed at the first render — a lazy initial state, not
  // a ref, because it *is* rendered — because the element's width and height cannot be changed
  // after the transfer. From then on the worker resizes it to whatever the newest Scene says
  // (invariant 6), which is why this being merely the starting size is correct rather than a
  // limitation.
  const [initialSize] = useState<PixelSize>(
    () => project?.frameSize ?? BEFORE_ANY_PROJECT.frameSize
  )

  useEffect(() => {
    const element = previewRef.current
    if (element === null) return

    let client: EngineClient
    try {
      client = retainSession(
        element,
        initialSize,
        useEditorStore.getState().project?.timebase ?? BEFORE_ANY_PROJECT.timebase
      )
    } catch (error) {
      // The one way this happens is a canvas whose control was transferred by something other than
      // `retainSession`. Reported rather than thrown, because a thrown error here unmounts the app
      // and leaves nothing on screen to read it from.
      reportEngineFatal(
        `The Preview could not be handed to the engine. ${error instanceof Error ? error.message : String(error)}`
      )
      return
    }

    setEngine(client)
    // The tracker lives exactly as long as this engine: attachments are per worker (T051).
    const statusTracker = createSourceStatusTracker({ store: useEditorStore, engine: client })
    setTracker(statusTracker)
    const playback = createTransport({ store: useEditorStore, engine: client })
    setTransport(playback)
    const exports = createExportController({
      engine: client,
      pickDestination: (suggestedName) => pickSaveFile(suggestedName),
      streamAudio: streamExportAudio,
      sourceAt: (destination) => statusTracker.sourceAt(destination),
    })
    setExporter(exports)
    const stopWatchingFatal = client.on("fatal", (event) => {
      reportEngineFatal(event.reason, event.stack)
    })
    void client.ready.then(
      (capabilities) => {
        setRenderer(capabilities.renderer)
      },
      () => {
        // Already reported through `fatal`; a second message would say the same thing twice.
      }
    )

    return () => {
      stopWatchingFatal()
      exports.dispose()
      playback.dispose()
      statusTracker.dispose()
      releaseSession(element)
    }
  }, [initialSize, reportEngineFatal])

  // When Source status is derived again (T051). The tracker itself is made and disposed with the
  // engine, above; this wires the occasions to it.
  useEffect(() => {
    if (engine === null || tracker === null) return
    const statusTracker = tracker

    // Occasion 1, the Project being opened. A Project already in the store when the engine starts is
    // one opened from the list; a new Project has no Sources yet, so this is a no-op for it, and its
    // first Source is marked by the import that brings it in.
    void statusTracker.checkAll()

    // Occasion 2, the window regaining focus — the user coming back from renaming the file.
    const onFocus = () => {
      void statusTracker.checkAll()
    }
    window.addEventListener("focus", onFocus)

    // Occasion 3, a read failing mid-session. A `source-failed` for a Source being attached is that
    // attach's own answer and is handled by whoever asked; any other is a read that failed later.
    const stopWatchingFailures = engine.on("source-failed", (event) => {
      if (!statusTracker.isAttaching(event.sourceId)) {
        statusTracker.readFailed(event.sourceId, event.reason)
      }
    })
    // And the check that does not wait for the worker to fail: every Playhead move asks whether the
    // Linked Sources' files are still there, so a vanished file goes Offline on the next Frame.
    const stopWatchingPlayhead = useEditorStore.subscribe((state, previous) => {
      if (state.playheadFrame !== previous.playheadFrame) void statusTracker.verifyLinked()
    })

    return () => {
      window.removeEventListener("focus", onFocus)
      stopWatchingFailures()
      stopWatchingPlayhead()
    }
  }, [engine, tracker])

  // The engine's picture of the Timeline, kept current. Posting the Scene and asking for the Frame
  // are one step deliberately: a Scene nobody rendered afterwards leaves the Preview showing the
  // previous one, which is indistinguishable from an edit that did nothing. `sourceStatus` is a
  // reason to ask again without a new Scene: a Source attached or detached changes the picture
  // and not the Timeline, and a Scene the worker already holds is ignored on repost.
  //
  // While stopped, this is the only place in the editor that asks for a Frame, and it is how the
  // Playhead reaches the engine (T049): a drag moves `playheadFrame`, this effect asks for the Frame under it with
  // `scrub`, and the client's latest-wins guard keeps a fast drag to one request in flight. The
  // Timeline itself only ever calls `setPlayhead`; a second caller here would be a second opinion
  // about which Frame the Preview should show.
  //
  // `renderer` is a reason to ask again too: it is set when the engine answers `ready`, and a Frame
  // asked for before then is answered `frames-dropped`. A Project reopened with every Source Offline
  // changes nothing else afterwards, so without it the Preview would wait for the Playhead to move.
  //
  // **While playing, this effect posts the Scene and asks for nothing** (T062). The transport asks
  // for the clock's Frame on every animation frame, and the Playhead follows what the engine drew —
  // so the Playhead moving is an effect of a Frame request, not a reason for one, and asking again
  // here would be a scrub that tells the worker to abandon its streaming iterators. `scrubFrame`
  // is `null` while playing so a moving Playhead does not even re-run this effect; on stop it is the
  // Playhead the transport left, and the scrub request for it makes sure that is the picture that
  // stays. One requester at a time, and the client's latest-wins guard covers both.
  useEffect(() => {
    if (engine === null || scene === null) return
    engine.postScene(sceneRevision, scene)
    if (scrubFrame === null) return
    engine.renderFrame(scrubFrame, "scrub")
  }, [engine, scene, sceneRevision, scrubFrame, sourceStatus, renderer])

  return (
    <div data-testid="editor-shell" className="flex h-svh flex-col overflow-hidden">
      <TopBar
        transport={transport}
        exporter={exporter}
        onExport={() => {
          setExportOpen(true)
        }}
      />
      {exporter === null ? null : (
        <ExportDialog
          controller={exporter}
          open={exportOpen}
          onClose={() => {
            setExportOpen(false)
          }}
          onOpen={() => {
            setExportOpen(true)
          }}
        />
      )}
      <SaveFailure />

      <div className="flex min-h-0 flex-1">
        <SourcesPanel tracker={tracker} />

        <section
          data-testid="preview-panel"
          aria-label="Preview"
          className="flex min-w-0 flex-1 flex-col"
        >
          <RelinkPrompt tracker={tracker} />
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
            {engineFatal === null ? (
              <canvas
                ref={previewRef}
                data-testid="preview-canvas"
                width={initialSize.width}
                height={initialSize.height}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <EngineStopped report={engineFatal} />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t px-3 py-1 text-xs text-muted-foreground">
            <PlayheadLabel />
            <ShownLabel engine={engine} />
            <span data-testid="engine-renderer" className="ml-auto">
              {engineFatal !== null
                ? "engine stopped"
                : renderer === null
                  ? "engine starting"
                  : `engine: ${renderer}`}
            </span>
          </div>
        </section>
      </div>

      <Timeline />
    </div>
  )
}
