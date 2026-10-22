// The application shell: Source list, Preview, Timeline. Each panel is a placeholder for the task
// that fills it (T038, T048); what is real here is the frame and the Preview's canvas, which is
// transferred to the engine worker on mount.

import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { EngineClient } from "@/engine-client"
import { editorStore, useEditor } from "@/store"
import { autosave } from "@/store/session"

import { EngineContext } from "./engine-context"
import { Preview } from "./Preview"

export function EditorLayout() {
  const project = useEditor((state) => state.project)
  const [engine, setEngine] = useState<EngineClient | null>(null)

  if (project === null) return null

  async function closeProject() {
    // Written before leaving, so the list the user lands on shows this edit.
    await autosave.flush()
    editorStore.getState().openProject(null)
  }

  return (
    <EngineContext.Provider value={engine}>
      <div className="flex h-svh flex-col text-sm">
        <header className="flex items-center gap-3 border-b px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => void closeProject()}>
            Projects
          </Button>
          <h1 className="min-w-0 truncate font-medium">{project.name}</h1>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside aria-label="Sources" className="w-64 shrink-0 border-r p-3 text-muted-foreground">
            No Sources yet.
          </aside>
          <main aria-label="Preview" className="flex min-w-0 flex-1 flex-col">
            <Preview projectId={project.id} onEngine={setEngine} />
            <section
              aria-label="Timeline"
              className="h-40 shrink-0 border-t p-3 text-muted-foreground"
            >
              Timeline
            </section>
          </main>
        </div>
      </div>
    </EngineContext.Provider>
  )
}
