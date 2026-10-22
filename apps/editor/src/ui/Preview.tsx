// The Preview: a canvas whose control is handed to the engine worker, which owns every pixel in
// it. The main thread never draws here.
//
// The canvas is made inside the effect rather than rendered by React, because
// `transferControlToOffscreen` works once per element. React's StrictMode runs effects twice, and
// a canvas React rendered would be transferred by the first run and refuse the second; one created
// per run, and removed on cleanup, has no such history.

import { useEffect, useRef, useState } from "react"

import { createEngineClient, type EngineClient } from "@/engine-client"
import { editorStore } from "@/store"
import { projectScene, type Scene } from "@cutroom/model"

export function Preview({
  projectId,
  onEngine,
}: {
  projectId: string
  onEngine(engine: EngineClient | null): void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    const element = host.current
    const project = editorStore.getState().project
    if (element === null || project === null) return

    setProblem(null)
    const canvas = document.createElement("canvas")
    canvas.width = project.frameSize.width
    canvas.height = project.frameSize.height
    canvas.className = "absolute inset-0 size-full object-contain"
    element.append(canvas)

    // Set by cleanup. A run that has been replaced (StrictMode runs every effect twice) must not
    // report on its engine: terminating it rejects `init`, and that is not a problem to show.
    let cancelled = false
    const engine = createEngineClient()
    engine.onFatal((error) => {
      if (!cancelled) setProblem(error.message)
    })

    let revision = 0
    let posted: Scene | null = null
    const post = () => {
      const current = editorStore.getState().project
      if (current === null) return
      // `projectScene` hands back the same object for an edit that moves no pixel, so identity is
      // the whole "did the picture change" test.
      const scene = projectScene(current)
      if (scene === posted) return
      posted = scene
      revision += 1
      engine.postScene(revision, scene)
    }

    let unsubscribe: (() => void) | undefined
    const offscreen = canvas.transferControlToOffscreen()
    engine
      .init(offscreen, project.timebase, project.frameSize)
      .then(() => {
        if (cancelled || engine.fatal !== null) return
        post()
        unsubscribe = editorStore.subscribe(post)
        onEngine(engine)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // A fatal is already on screen through `onFatal`; anything else still must be.
        if (engine.fatal === null)
          setProblem(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
      unsubscribe?.()
      onEngine(null)
      engine.terminate()
      canvas.remove()
    }
  }, [projectId, onEngine])

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/90 p-2">
      <div ref={host} className="absolute inset-2" />
      {problem !== null && (
        <p
          role="alert"
          className="absolute inset-x-4 top-4 rounded-md bg-destructive/15 p-3 text-xs text-destructive"
        >
          The preview engine stopped: {problem}
        </p>
      )}
    </div>
  )
}
