// Keeps the open Project in storage without the user asking (FR-020).
//
// Subscribes to the store and hands the saver every Project it has not seen. It compares by
// identity: `applyCommand` preserves structural sharing, so an unchanged Project is the same
// object, and runtime-only changes (the playhead, Source status) write nothing. A Project that is
// exactly what `openProject` loaded is skipped too — a load is not an edit, and writing it back
// would rewrite a document the user only looked at (T027).

import { createProjectSaver, type ProjectSaver } from "@/storage/projects"

import type { EditorStore } from "./index"

export interface Autosave {
  /** Writes whatever is outstanding and resolves when storage is quiet. */
  flush(): Promise<void>
  /** Stops listening and refuses further saves; `flush` first if the last edit matters. */
  disconnect(): void
}

export function connectAutosave(
  store: EditorStore,
  saver: ProjectSaver = createProjectSaver()
): Autosave {
  let last = store.getState().project

  const unsubscribe = store.subscribe((state) => {
    if (state.project === last) return
    last = state.project
    if (state.project !== null && state.project !== state.loaded) saver.save(state.project)
  })

  return {
    flush: () => saver.flush(),
    disconnect() {
      unsubscribe()
      saver.close()
    },
  }
}
