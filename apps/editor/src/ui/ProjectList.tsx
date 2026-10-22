// Where the app lands when no Project is open, including after a reload (FR-020). Lists what the
// Project library holds, opens one on click, and starts a new empty one.
//
// A Project this build cannot open (saved by a newer Cutroom) is listed anyway, marked, and not
// clickable: this is the screen a user checks to find out their work is still there.

import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  listProjects,
  loadProject,
  ProjectLoadError,
  type ProjectSummary,
} from "@/storage/projects"
import { editorStore } from "@/store"
import { autosave } from "@/store/session"

/** A new Project has no Source to take a Timebase or frame size from yet. These stand in until the
 * first import adopts the Source's (FR-005). */
const PLACEHOLDER_TIMEBASE = { numerator: 30, denominator: 1 }
const PLACEHOLDER_FRAME_SIZE = { width: 1920, height: 1080 }

function describeModified(modifiedAt: string | null): string {
  if (modifiedAt === null) return "unknown"
  const time = Date.parse(modifiedAt)
  return Number.isNaN(time) ? "unknown" : new Date(time).toLocaleString()
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      // Anything still in the debounce window is written first, or a just-edited Project would be
      // missing from — or stale in — the list.
      await autosave.flush()
      setProjects(await listProjects())
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
      setProjects([])
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data from IndexedDB on arrival
    void refresh()
  }, [refresh])

  async function open(id: string) {
    setProblem(null)
    try {
      const project = await loadProject(id)
      if (project === undefined) {
        setProblem("That Project is no longer in storage.")
        await refresh()
        return
      }
      editorStore.getState().openProject(project)
    } catch (error) {
      setProblem(
        error instanceof ProjectLoadError
          ? error.message
          : `Could not open the Project. ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  function create() {
    setProblem(null)
    editorStore.getState().openProject(null)
    editorStore.getState().dispatch({
      type: "create-project",
      at: new Date().toISOString(),
      projectId: crypto.randomUUID(),
      name: "Untitled project",
      timebase: PLACEHOLDER_TIMEBASE,
      frameSize: PLACEHOLDER_FRAME_SIZE,
      track: { id: crypto.randomUUID(), name: "Video 1" },
    })
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col gap-4 p-6 text-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-medium">Projects</h1>
        <Button onClick={create}>New project</Button>
      </div>

      {problem !== null && (
        <p role="alert" className="rounded-md bg-destructive/15 p-3 text-xs text-destructive">
          {problem}
        </p>
      )}

      {projects === null ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-muted-foreground">No Projects yet. Create one to get started.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {projects.map((summary) => (
            <li key={summary.id}>
              <button
                type="button"
                disabled={!summary.openable}
                onClick={() => void open(summary.id)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="font-medium">{summary.name ?? "Untitled project"}</span>
                <span className="text-xs text-muted-foreground">
                  Modified {describeModified(summary.modifiedAt)}
                  {!summary.openable &&
                    " — saved by a newer version of Cutroom, can't be opened here"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
