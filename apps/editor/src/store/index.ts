// The one place the Project is held while the user works (Principle IV).
//
// Every edit arrives as a `Command` and passes through `applyCommand`; this store never builds a
// Project by hand. That is what makes undo free: the reducer hands back the patches that redo the
// edit and the patches that undo it, and the history below is nothing more than a list of them.
//
// Three decisions the shape of this file rests on.
//
// **A gesture is one undo step.** Dragging a Clip is dozens of commands and the user means one
// thing. `transaction` groups whatever is dispatched inside it into a single history entry: redo
// is the patches in the order they happened, undo is the inverse patches in the *reverse* order.
// The reducer knows nothing about this (contracts/model-api.md) — grouping is the caller's.
//
// **A transaction is atomic.** If something inside it throws, the commands already applied are
// undone before the error continues, so a half-finished gesture never becomes the Project.
//
// **Runtime state is not history.** The playhead, the transport and Source link status live in
// the same store but never touch the undo stack: undoing an import must not move the playhead or
// flip a Source Offline (data-model.md, "Runtime only"). They are plain fields, set by plain
// actions.
//
// `create-project` is applied through the reducer like everything else but is not recorded: the
// state before it is "no Project", and undo has no business returning a user to that.

import { applyPatches, type Patch } from "immer"
import { createStore, useStore } from "zustand"

import {
  applyCommand,
  type Command,
  type CommandResult,
  type Frame,
  type Project,
} from "@cutroom/model"

/** One undo step: possibly several commands, as the two directions between before and after. */
export interface HistoryEntry {
  /** Applied to the Project before the step, gives the Project after it. */
  readonly patches: readonly Patch[]
  /** Applied to the Project after the step, gives the Project before it. */
  readonly inversePatches: readonly Patch[]
}

export type Transport = "stopped" | "playing"
export type SourceStatus = "linked" | "offline"

export interface EditorState {
  readonly project: Project | null
  /** The Project exactly as `openProject` received it, so that a load can be told from an edit. */
  readonly loaded: Project | null
  readonly past: readonly HistoryEntry[]
  readonly future: readonly HistoryEntry[]

  // Runtime only; never undoable.
  readonly playheadFrame: Frame
  readonly transport: Transport
  readonly sourceStatus: Readonly<Record<string, SourceStatus>>

  /** Applies a command. Throws `CommandError` and changes nothing if it cannot be carried out. */
  dispatch(command: Command): void
  /** Groups every `dispatch` made while `run` executes into one undo step. */
  transaction<T>(run: () => T): T
  undo(): void
  redo(): void

  /** Makes this the open Project (or none), with a fresh history: undo does not cross Projects. */
  openProject(project: Project | null): void
  setPlayhead(frame: Frame): void
  setTransport(transport: Transport): void
  setSourceStatus(sourceId: string, status: SourceStatus): void
}

export type EditorStore = ReturnType<typeof createEditorStore>

/** History only exists for an open Project, so `project` is never null where this is called. */
function replay(project: Project | null, patches: readonly Patch[]): Project {
  return applyPatches(project as Project, patches as Patch[])
}

function emptyEntry(entry: HistoryEntry): boolean {
  return entry.patches.length === 0 && entry.inversePatches.length === 0
}

export function createEditorStore() {
  // Commands collected by the outermost open transaction; `null` when none is open. Held outside
  // the state because nothing renders from it and a half-open gesture is not something to observe.
  let open: CommandResult[] | null = null
  let depth = 0

  return createStore<EditorState>()((set, get) => {
    function record(entry: HistoryEntry): void {
      if (emptyEntry(entry)) return
      set((state) => ({ past: [...state.past, entry], future: [] }))
    }

    function rollback(applied: readonly CommandResult[]): void {
      let project = get().project
      for (const result of [...applied].reverse()) {
        project = replay(project, result.inversePatches)
      }
      set({ project })
    }

    return {
      project: null,
      loaded: null,
      past: [],
      future: [],
      playheadFrame: 0,
      transport: "stopped",
      sourceStatus: {},

      dispatch(command) {
        const result = applyCommand(get().project, command)

        if (command.type === "create-project") {
          set({ project: result.project, past: [], future: [] })
          return
        }

        set({ project: result.project })
        if (open !== null) open.push(result)
        else record({ patches: result.patches, inversePatches: result.inversePatches })
      },

      transaction(run) {
        if (depth === 0) open = []
        depth += 1
        try {
          const value = run()
          depth -= 1
          if (depth === 0) {
            const applied = open ?? []
            open = null
            record({
              patches: applied.flatMap((result) => result.patches),
              inversePatches: [...applied].reverse().flatMap((result) => result.inversePatches),
            })
          }
          return value
        } catch (error) {
          depth -= 1
          if (depth === 0) {
            const applied = open ?? []
            open = null
            rollback(applied)
          }
          throw error
        }
      },

      undo() {
        const { past, future, project } = get()
        const entry = past.at(-1)
        if (entry === undefined || open !== null) return
        set({
          project: replay(project, entry.inversePatches),
          past: past.slice(0, -1),
          future: [entry, ...future],
        })
      },

      redo() {
        const { past, future, project } = get()
        const entry = future[0]
        if (entry === undefined || open !== null) return
        set({
          project: replay(project, entry.patches),
          past: [...past, entry],
          future: future.slice(1),
        })
      },

      openProject(project) {
        set({
          project,
          loaded: project,
          past: [],
          future: [],
          playheadFrame: 0,
          transport: "stopped",
          sourceStatus: {},
        })
      },

      setPlayhead(frame) {
        set({ playheadFrame: frame })
      },

      setTransport(transport) {
        set({ transport })
      },

      setSourceStatus(sourceId, status) {
        set((state) => ({ sourceStatus: { ...state.sourceStatus, [sourceId]: status } }))
      },
    }
  })
}

/** The application's store. Tests build their own with `createEditorStore`. */
export const editorStore = createEditorStore()

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector)
}
