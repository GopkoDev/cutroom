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
// Phase 2 checkpoint. Decoding, playback and the Timeline's own drawing arrive with US1 and US2.
//
// A `fatal` from the engine is shown in the Preview's place. The alternative is the failure ADR
// 0003 names: the canvas belongs to the worker, so a dead worker and a still picture look
// identical from out here.

import { useEffect, useRef, useState } from "react"

import type { PixelSize, Timebase } from "@cutroom/model"

import { Button } from "@/components/ui/button"
import { startEngine, type EngineClient } from "@/engine-client"
import { canRedo, canUndo, useEditorStore } from "@/store"

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

/** Frames as a person reads them, without pretending to be the timecode of T050. */
function frameLabel(frame: number): string {
  return `Frame ${frame}`
}

export function EditorLayout() {
  const project = useEditorStore((state) => state.project)
  const scene = useEditorStore((state) => state.scene)
  const sceneRevision = useEditorStore((state) => state.sceneRevision)
  const playheadFrame = useEditorStore((state) => state.playheadFrame)
  const engineFatal = useEditorStore((state) => state.engineFatal)
  const undoable = useEditorStore(canUndo)
  const redoable = useEditorStore(canRedo)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const closeProject = useEditorStore((state) => state.closeProject)
  const reportEngineFatal = useEditorStore((state) => state.reportEngineFatal)

  const previewRef = useRef<HTMLCanvasElement>(null)
  const [engine, setEngine] = useState<EngineClient | null>(null)
  const [renderer, setRenderer] = useState<string | null>(null)
  const [shown, setShown] = useState<{ frame: number; revision: number } | null>(null)

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
    const stopWatchingFrames = client.on("frame-rendered", (event) => {
      setShown({ frame: event.frame, revision: event.revision })
    })
    const stopWatchingFatal = client.on("fatal", (event) => {
      reportEngineFatal(event.reason)
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
      stopWatchingFrames()
      stopWatchingFatal()
      releaseSession(element)
    }
  }, [initialSize, reportEngineFatal])

  // The engine's picture of the Timeline, kept current. Posting the Scene and asking for the Frame
  // are one step deliberately: a Scene nobody rendered afterwards leaves the Preview showing the
  // previous one, which is indistinguishable from an edit that did nothing.
  useEffect(() => {
    if (engine === null || scene === null) return
    engine.postScene(sceneRevision, scene)
    engine.renderFrame(playheadFrame, "scrub")
  }, [engine, scene, sceneRevision, playheadFrame])

  const sources = project?.sources ?? []
  const durationFrames = project?.timeline.durationFrames ?? 0

  return (
    <div data-testid="editor-shell" className="flex h-svh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => void closeProject()}>
          Projects
        </Button>
        <h1 data-testid="project-name" className="truncate text-sm font-medium">
          {project?.name ?? "New Project"}
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            data-testid="undo"
            disabled={!undoable}
            onClick={() => {
              undo()
            }}
          >
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="redo"
            disabled={!redoable}
            onClick={() => {
              redo()
            }}
          >
            Redo
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          data-testid="sources-panel"
          aria-label="Sources"
          className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r p-3"
        >
          <h2 className="text-xs font-medium text-muted-foreground">Sources</h2>
          {sources.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing here yet. Bringing a video in is what gives this Project its frame size and
              its Timebase.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {sources.map((source) => (
                <li key={source.id} data-testid="source-row" className="truncate">
                  {source.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          data-testid="preview-panel"
          aria-label="Preview"
          className="flex min-w-0 flex-1 flex-col"
        >
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
              <p data-testid="engine-fatal" className="max-w-md text-center text-xs text-white">
                The engine stopped and the Preview is no longer live. {engineFatal}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 border-t px-3 py-1 text-xs text-muted-foreground">
            <span data-testid="playhead">{frameLabel(playheadFrame)}</span>
            <span data-testid="preview-shown">
              {shown === null
                ? "nothing rendered yet"
                : `showing ${frameLabel(shown.frame)} of Scene ${shown.revision}`}
            </span>
            <span data-testid="engine-renderer" className="ml-auto">
              {renderer === null ? "engine starting" : `engine: ${renderer}`}
            </span>
          </div>
        </section>
      </div>

      <section
        data-testid="timeline-panel"
        aria-label="Timeline"
        className="flex h-40 shrink-0 flex-col gap-2 border-t p-3"
      >
        <h2 className="text-xs font-medium text-muted-foreground">Timeline</h2>
        <p data-testid="timeline-duration" className="text-xs">
          {durationFrames === 0
            ? "Empty — no Clips yet."
            : `${durationFrames} Frames across ${project?.timeline.tracks.length ?? 0} Track(s).`}
        </p>
      </section>
    </div>
  )
}
