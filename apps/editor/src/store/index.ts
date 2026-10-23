// The one owner of state, and the one way it changes (Principle IV, ADR 0004).
//
// Every edit to the Project goes through `applyCommand` and nothing else. The store's job is the
// part the reducer deliberately knows nothing about: **which edits belong to one gesture**, and
// what a single press of undo therefore means.
//
// ## Two kinds of state, and the line between them
//
// The Project is the document — saved, migrated, one day uploaded, and undoable in full. Beside it
// live the Playhead, the transport, each Source's Linked/Offline status and whatever the engine
// last said. Those are **runtime state**: they are in this store, they are not in the document, and
// they are not in the undo history (data-model.md, contracts/public-api.md).
//
// The line is load-bearing rather than tidy. Undo replays inverse patches over the Project and
// writes nothing else, so undoing an import cannot move the Playhead and cannot take a Source from
// Linked back to Offline — a permission the user granted is not an edit they can take back, and a
// Playhead that jumped on every undo would make the feature unusable. Nothing clamps the Playhead
// afterwards either: a Playhead past the end of a shortened Timeline shows an empty Preview, which
// is correct (FR-008), whereas moving it would be the store editing something the user was holding.
//
// ## Transactions
//
// A gesture is many commands and one undo step. A drag emits a command per pointer move; an import
// is a `create-project`, an `import-source` and an `add-clip` (T041). Undo has to take back the
// whole thing, so the store groups commands and pushes one history entry per group.
//
// The API is two functions, and the difference between them is who guarantees the close.
//
//   * `transact(label, body)` — the form that cannot leak. The transaction opens, `body` runs, and
//     it is committed on the way out or aborted if `body` throws. Synchronous on purpose: an
//     `await` inside a transaction is a window in which an unrelated edit joins the gesture, and a
//     gesture that swallowed someone else's edit is worse than one that is merely large.
//   * `beginTransaction(label)` — for the gesture that genuinely spans events, which `transact`
//     cannot express: a drag begins at `pointerdown` and ends at `pointerup`, with the store idle in
//     between. It hands back the handle that closes it.
//
// Rules, each chosen rather than fallen into:
//
//   * **Transactions join; they do not nest.** A `transact` inside an open gesture becomes part of
//     it and the outer label stands, because one gesture is one undo step and a nested step would
//     have to be undoable on its own — which it is not. Only the outermost close commits. This is
//     what lets a shared command sequence (the import of T041) be called both on its own and from
//     inside a larger gesture without either caller knowing about the other.
//   * **Abort restores the Project as it was when the gesture opened**, from the object the store
//     was already holding rather than by replaying patches: an exact restore, and one that cannot
//     itself go wrong halfway. An abort at any depth abandons the whole gesture.
//   * **A gesture that changed nothing is not a history entry.** Some commands legitimately produce
//     no patches — a Relink that finds the document already correct — and a step that undoes
//     nothing is worse than no step, because the user presses undo and watches nothing happen. For
//     the same reason it does not clear the redo stack: nothing happened.
//   * **A transaction left open is visible, not silently absorbed.** Nothing auto-commits and no
//     timer closes it. Instead `openTransaction` names it, and undo and redo are unavailable while
//     one is open — `canUndo` is false, and calling anyway throws rather than half-undoing a
//     gesture that is still being made. A leak is then a stuck undo button, a bug that shows
//     itself, rather than a history in which yesterday and today are one entry.
//
// ## Saving
//
// Every change to the Project is handed to the saver (FR-020); nothing asks the user to save. The
// rule for *when* it is written follows the gesture, the same line undo draws:
//
//   * **A finished gesture is written now** — a standalone command, a committed or aborted
//     transaction, an undo, a redo. The store is idle afterwards, and an edit the user has watched
//     land is the edit a reload straight after it must keep. These are one write per thing the user
//     did, so there is nothing for a debounce to save.
//   * **Edits inside an open gesture are debounced** (500 ms quiet, 2 s at most), because a drag
//     emits a command per pointer move and rebuilding the document for each would be the cost.
//   * **Whatever is outstanding is written as the page is hidden or unloaded** — `visibilitychange`
//     to `hidden` and `pagehide`; see `flushWhenLeaving`.
//
// What makes the last two hold across a real reload is in `saveProject`: the IndexedDB transaction
// is committed explicitly, because one left to auto-commit is aborted when the page goes away.

import { applyPatches, enablePatches, type Patch } from "immer"
import { create } from "zustand"

import { applyCommand, projectScene, type Command, type Project, type Scene } from "@cutroom/model"

import {
  createProjectSaver,
  loadProject,
  ProjectLoadError,
  type ProjectSaver,
} from "@/storage/projects"
import { storageProblem, technicalDetail } from "@/ui/failure-wording"

// `applyCommand` already enables patches in the model's copy of Immer. Repeated here because
// `applyPatches` is called from *this* module, and the call is documented as idempotent — the cost
// of being wrong about module identity is an undo that throws in production and works in every test.
enablePatches()

/** Which screen the app is on. There is no Project open on the list, by definition. */
export type Screen = "projects" | "editor"

/** Whether a Source's bytes can be reached from this machine right now (data-model.md). */
export type SourceStatus = "linked" | "offline"

/**
 * Why an Offline Source is Offline, in the terms the UI acts on (T051, T052). Not a third status:
 * data-model.md has exactly two, and *which way* a Source is unreachable belongs in the reason.
 *
 *   * `needs-permission` — the handle is here and one click re-grants it.
 *   * `never-linked-here` — this machine has no handle; the file has to be picked again.
 *   * `unreachable` — the handle is here and granted, and the file is not where it pointed.
 *   * `unreadable` — the file is there, and the engine could not read it as this Source.
 *
 * Plain data, like everything in this store; the handle a re-grant needs lives outside it, in
 * `source-status.ts`, keyed by the same id (ADR 0004).
 */
export interface SourceOfflineReason {
  readonly reason: "needs-permission" | "never-linked-here" | "unreachable" | "unreadable"
  /** The platform's or the engine's own words, when there are any. */
  readonly detail?: string
}

/**
 * A failure the store holds for the screen to show (T093): the plain statement, what it means, and
 * the platform's own words for "Details". Plain data, so it can sit in the store.
 */
export interface FailureReport {
  readonly title: string
  readonly explanation: string
  readonly detail?: string
}

/** What the engine said when it stopped (`fatal`), for the shell to show in the Preview's place. */
export interface EngineFatalReport {
  readonly reason: string
  /** The worker's stack, when it sent one. */
  readonly stack?: string
}

/**
 * One undo step: everything one gesture did, in both directions.
 *
 * `patches` redoes it and `inversePatches` undoes it. Both are flattened from the commands the
 * gesture ran — forwards in the order they ran, backwards in the reverse of it, because undoing an
 * insert and the thing it was inserted into only works one way round.
 */
export interface HistoryEntry {
  readonly label: string
  readonly patches: readonly Patch[]
  readonly inversePatches: readonly Patch[]
}

/** The handle that closes a gesture opened with `beginTransaction`. */
export interface Transaction {
  /** Ends the gesture and, if it changed anything, makes it one undo step. */
  commit(): void
  /** Abandons the gesture, restoring the Project to what it was when it opened. */
  abort(): void
}

/** A transaction was asked to do something it cannot — closed twice, or undone mid-gesture. */
export class TransactionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransactionError"
  }
}

interface OpenGesture {
  readonly label: string
  /** How many `beginTransaction`s deep we are. Only the outermost close commits. */
  depth: number
  /** Exactly what the Project was when the gesture opened, for `abort` to restore. */
  readonly before: Project | null
  /** One entry per command, so the inverses can be flattened in reverse at commit. */
  readonly steps: {
    readonly patches: readonly Patch[]
    readonly inversePatches: readonly Patch[]
  }[]
  aborted: boolean
}

export interface EditorState {
  // ------------------------------------------------------------------ the document and its past
  /**
   * The Project, or `null` when there is none open.
   *
   * `null` is a real state rather than an absence to be defended against: it is where the editor
   * starts before the first import, and it is what undoing a `create-project` gets back to.
   */
  readonly project: Project | null
  readonly past: readonly HistoryEntry[]
  readonly future: readonly HistoryEntry[]
  /** The label of the gesture currently open, or `null`. Undo is unavailable while it is set. */
  readonly openTransaction: string | null

  // ------------------------------------------------------------------------ what the engine sees
  /**
   * The Scene projected from the current Project, and the revision that identifies it.
   *
   * Recomputed after every change and compared by identity: `projectScene` returns the *same*
   * object when the picture did not move, so an edit the renderer cannot see does not bump the
   * revision and costs no repost. The comparison is used only in that direction — a different
   * object is always reposted, whether or not the pixels really moved (contracts/public-api.md).
   */
  readonly scene: Scene | null
  readonly sceneRevision: number

  // -------------------------------------------------------------- runtime: never in the document
  readonly screen: Screen
  readonly playheadFrame: number
  readonly transport: "stopped" | "playing"
  readonly sourceStatus: Readonly<Record<string, SourceStatus>>
  /** For each Offline Source, why. A Linked Source has no entry. */
  readonly sourceOffline: Readonly<Record<string, SourceOfflineReason>>
  /** What the engine said when it gave up, for the shell to show instead of a frozen Preview. */
  readonly engineFatal: EngineFatalReport | null
  /** Why the last attempt to open a Project from the list failed, in words for the user. */
  readonly openFailure: FailureReport | null
  /**
   * Why the last write of the Project failed, or `null` once a write has succeeded since. While it
   * is set, the Project in this tab is newer than the one in storage, and the editor says so.
   */
  readonly saveFailure: FailureReport | null

  // -------------------------------------------------------------------------------- the actions
  /** Applies one command. On its own it is one undo step; inside a gesture it joins that step. */
  run(command: Command): void
  transact<T>(label: string, body: () => T): T
  beginTransaction(label: string): Transaction
  undo(): void
  redo(): void

  setPlayhead(frame: number): void
  setTransport(transport: "stopped" | "playing"): void
  /**
   * Records whether a Source can be reached. Runtime state: no command, no patch, no history —
   * which is what makes undo unable to take a Source Offline (T022). *When* this is called is
   * T051's business (`source-status.ts`); that it is not undoable is settled here. `why` is kept
   * for an Offline Source and dropped for a Linked one.
   */
  markSource(sourceId: string, status: SourceStatus, why?: SourceOfflineReason): void
  reportEngineFatal(reason: string, stack?: string): void
  /** The saver's report of a write that failed. Not undoable; cleared by the next one that lands. */
  reportSaveFailure(error: unknown): void
  /** The saver's report of a write that landed. */
  reportSaved(): void
  /** Writes the Project again now, for the "Try again" beside a save failure. */
  retrySave(): Promise<void>
  /** Writes whatever is outstanding and resolves when storage is quiet. */
  flushSaves(): Promise<void>

  /** Opens the editor with no Project yet. The first import brings one into being (T041). */
  newProject(): void
  /** `name` is what the list showed, so a failure can say which Project it was. */
  openProject(id: string, name?: string): Promise<void>
  /**
   * Leaves the editor for the Project list, writing anything outstanding first. Stays in the editor
   * if that write fails: leaving would throw away the only copy of the edits storage refused.
   */
  closeProject(): Promise<void>
}

/** Undo is available when there is something to undo and no gesture is still being made. */
export function canUndo(state: EditorState): boolean {
  return state.past.length > 0 && state.openTransaction === null
}

/** Redo is available when there is something to redo and no gesture is still being made. */
export function canRedo(state: EditorState): boolean {
  return state.future.length > 0 && state.openTransaction === null
}

/** What the store reaches outside itself for. Replaced only in unit tests, which have no IndexedDB. */
export interface EditorStoreDependencies {
  readonly saver: Pick<ProjectSaver, "save" | "flush">
  readonly loadProject: (id: string) => Promise<Project | undefined>
}

/** The Scene and revision that follow from a Project, reusing both when the picture has not moved. */
function projected(
  project: Project | null,
  heldScene: Scene | null,
  heldRevision: number
): { scene: Scene | null; sceneRevision: number } {
  const scene = project === null ? null : projectScene(project)
  if (scene === heldScene) return { scene: heldScene, sceneRevision: heldRevision }
  return { scene, sceneRevision: heldRevision + 1 }
}

/**
 * Immer's `applyPatches`, typed for a base and a result that may be `null`.
 *
 * Its signature demands an `Objectish`, and in general that is right: a value with no properties
 * has nothing to patch. Our patch sets are the exception the signature cannot express.
 * `create-project` is applied to no Project at all, so its forward patch is a single root `replace`
 * to the new Project and its inverse a single root `replace` to `null` — and `applyPatches` deals
 * with a root replacement *before* it drafts anything, by taking the replacement as the base and
 * applying only what follows it. `null` is therefore a legitimate input and a legitimate output,
 * and the cast is about the declaration rather than about the behaviour. Both directions are
 * exercised by the undo of the first command a Project ever receives.
 */
function applyProjectPatches(base: Project | null, patches: readonly Patch[]): Project | null {
  return applyPatches(base as unknown as Project, [...patches]) as Project | null
}

/** What every action resets when a Project is closed, opened, or begun. */
const NO_PROJECT = {
  project: null,
  past: [],
  future: [],
  openTransaction: null,
  scene: null,
  playheadFrame: 0,
  transport: "stopped",
  sourceStatus: {},
  sourceOffline: {},
  engineFatal: null,
} as const

/**
 * Builds a store. The app has exactly one, `useEditorStore` below; tests build their own so that
 * each starts from nothing and none of them touches storage.
 */
export function createEditorStore({ saver, loadProject }: EditorStoreDependencies) {
  return create<EditorState>()((set, get) => {
    // The open gesture lives outside the store's state on purpose: it is a half-finished thing, and a
    // component re-rendering as commands accumulated into it would be rendering a stroke mid-stroke.
    // What the UI is allowed to know — that one is open, and what it is called — is `openTransaction`.
    let gesture: OpenGesture | null = null

    /** Everything a Project change implies: the document, the Scene, the revision, and the save. */
    function adopt(project: Project | null): void {
      const state = get()
      set({ project, ...projected(project, state.scene, state.sceneRevision) })
      if (project !== null) saver.save(project)
    }

    /**
     * Writes the Project now rather than when the debounce would. Called whenever a gesture has
     * finished and the store is idle: the edit is complete, the user has seen it, and nothing more
     * is coming for a debounce to fold into it. `flush` reports its own failures.
     */
    function writeNow(): void {
      void saver.flush()
    }

    /** Closes the outermost transaction: one history entry, or none if nothing changed. */
    function closeGesture(): void {
      if (gesture === null) return
      const finished = gesture
      gesture = null
      set({ openTransaction: null })
      // Aborted or committed, the Project is now what it will stay until the next gesture.
      writeNow()

      if (finished.aborted) return

      const patches = finished.steps.flatMap((step) => [...step.patches])
      // Backwards through the commands, each command's own inverses in the order Immer emitted them:
      // Immer's inverses for one write already apply as they stand, and it is the *commands* that
      // have to be taken back in reverse.
      const inversePatches = [...finished.steps]
        .reverse()
        .flatMap((step) => [...step.inversePatches])

      if (patches.length === 0) return

      set((state) => ({
        past: [...state.past, { label: finished.label, patches, inversePatches }],
        future: [],
      }))
    }

    function beginTransaction(label: string): Transaction {
      if (gesture === null) {
        gesture = { label, depth: 1, before: get().project, steps: [], aborted: false }
        set({ openTransaction: label })
      } else {
        gesture.depth += 1
      }

      const owned = gesture
      let settled = false

      const settle = (): void => {
        if (settled) throw new TransactionError(`the transaction ${label} was already closed`)
        settled = true
        owned.depth -= 1
      }

      return {
        commit() {
          settle()
          if (owned.depth === 0) closeGesture()
        },
        abort() {
          settle()
          owned.aborted = true
          // Restored from the object the store was holding when the gesture opened: exact, and immune
          // to a patch replay that could itself fail partway through.
          adopt(owned.before)
          if (owned.depth === 0) closeGesture()
        },
      }
    }

    function run(command: Command): void {
      // Outside a gesture a command is its own gesture, opened and closed here, so that every edit
      // reaches the history by exactly one path.
      const transaction = gesture === null ? beginTransaction(command.type) : null

      try {
        // Throws before writing anything if the command is impossible, so the Project the caller
        // holds is untouched — the reducer's guarantee, not a rollback of ours.
        const result = applyCommand(get().project, command)
        gesture?.steps.push({ patches: result.patches, inversePatches: result.inversePatches })
        adopt(result.project)
      } catch (error) {
        transaction?.abort()
        throw error
      }

      transaction?.commit()
    }

    function transact<T>(label: string, body: () => T): T {
      const transaction = beginTransaction(label)
      try {
        const answer = body()
        transaction.commit()
        return answer
      } catch (error) {
        transaction.abort()
        throw error
      }
    }

    function undo(): void {
      const state = get()
      if (state.openTransaction !== null) {
        throw new TransactionError(
          `cannot undo while the transaction ${state.openTransaction} is open — close the gesture first`
        )
      }
      const entry = state.past.at(-1)
      if (entry === undefined) return

      // Only the document moves. The Playhead, the transport and every Source's Linked/Offline status
      // are untouched by construction: they are not in `project`, and nothing else is written here.
      adopt(applyProjectPatches(state.project, entry.inversePatches))
      set({ past: state.past.slice(0, -1), future: [entry, ...state.future] })
      writeNow()
    }

    function redo(): void {
      const state = get()
      if (state.openTransaction !== null) {
        throw new TransactionError(
          `cannot redo while the transaction ${state.openTransaction} is open — close the gesture first`
        )
      }
      const entry = state.future[0]
      if (entry === undefined) return

      adopt(applyProjectPatches(state.project, entry.patches))
      set({ past: [...state.past, entry], future: state.future.slice(1) })
      writeNow()
    }

    async function openProject(id: string, name?: string): Promise<void> {
      set({ openFailure: null })
      const which = name === undefined ? "That Project" : name
      try {
        const project = await loadProject(id)
        if (project === undefined) {
          set({
            openFailure: {
              title: `${which} is no longer in this browser's storage.`,
              explanation:
                "It may have been deleted in another tab, or this browser's data for Cutroom was cleared.",
            },
          })
          return
        }

        const state = get()
        set({
          ...NO_PROJECT,
          project,
          // A different Project's patches do not apply to this one, so the history starts empty.
          // Opening is not an edit either, so nothing is saved here (see `loadProject`).
          screen: "editor",
          openFailure: null,
          ...projected(project, state.scene, state.sceneRevision),
        })
      } catch (error) {
        set({
          openFailure:
            error instanceof ProjectLoadError
              ? {
                  title: `${which} could not be opened.`,
                  explanation:
                    "What is saved for it is damaged, or was written in a way this version of Cutroom does not understand. It has been left exactly as it is.",
                  detail: technicalDetail(error),
                }
              : {
                  title: `${which} could not be opened.`,
                  explanation: `${storageProblem(error)} Try again.`,
                  detail: technicalDetail(error),
                },
        })
      }
    }

    return {
      ...NO_PROJECT,
      sceneRevision: 0,
      screen: "projects",
      openFailure: null,
      saveFailure: null,

      run,
      transact,
      beginTransaction,
      undo,
      redo,
      openProject,

      setPlayhead(frame) {
        set({ playheadFrame: frame })
      },

      setTransport(transport) {
        set({ transport })
      },

      markSource(sourceId, status, why) {
        set((state) => {
          const sourceOffline = { ...state.sourceOffline }
          if (status === "offline") sourceOffline[sourceId] = why ?? { reason: "unreachable" }
          else delete sourceOffline[sourceId]
          return { sourceStatus: { ...state.sourceStatus, [sourceId]: status }, sourceOffline }
        })
      },

      reportEngineFatal(reason, stack) {
        if (get().engineFatal !== null) return // the first `fatal` is the one that explains
        set({ engineFatal: stack === undefined ? { reason } : { reason, stack } })
      },

      reportSaveFailure(error) {
        set({
          saveFailure: {
            title: "Your latest changes could not be saved.",
            explanation: storageProblem(error),
            detail: technicalDetail(error),
          },
        })
      },

      reportSaved() {
        if (get().saveFailure !== null) set({ saveFailure: null })
      },

      async retrySave() {
        const project = get().project
        if (project !== null) saver.save(project)
        await saver.flush()
      },

      flushSaves() {
        return saver.flush()
      },

      newProject() {
        // No `create-project` command runs here, and that is the point. The spec has the Project
        // adopt the first Source's Timebase and picture size "so the user is not asked to configure a
        // Project before seeing anything" (spec assumptions, T041) — and no command in this slice can
        // change a Project's Timebase or frame size afterwards. A Project created now would therefore
        // be stuck with numbers we invented, and the adoption could never happen. So a new Project is
        // an editor with nothing in it yet, and the first import brings the document into being.
        set({ ...NO_PROJECT, screen: "editor", openFailure: null })
      },

      async closeProject() {
        await saver.flush()
        if (get().saveFailure !== null) return
        set({ ...NO_PROJECT, screen: "projects" })
      },
    }
  })
}

export type EditorStore = ReturnType<typeof createEditorStore>

// The saver reports into the store it feeds, so a write that fails is on screen rather than only
// in the console (T093). The store does not exist yet when the saver is made; both callbacks run
// long after it does.
const saver = createProjectSaver({
  onFailure: (error, project) => {
    console.error(`Cutroom could not save the Project ${project.id}`, error)
    useEditorStore.getState().reportSaveFailure(error)
  },
  onSaved: () => {
    useEditorStore.getState().reportSaved()
  },
})

/** The application's store. */
export const useEditorStore = createEditorStore({ saver, loadProject })

/**
 * Writes whatever is outstanding as the page is hidden or goes away.
 *
 * A finished gesture has already been written (`writeNow`), so what is outstanding here is at most
 * a gesture still being made — a drag the tab was closed in the middle of — or a write the debounce
 * had not reached yet. Two events, because neither covers every way a page goes away:
 *
 *   * `visibilitychange` to `hidden` is the one browsers promise to deliver — switching tabs,
 *     minimising, and on mobile the last event a page sees before it is discarded without any
 *     unload at all. It is also the earlier of the two on a reload or a close.
 *   * `pagehide` is the unload itself, and the one that fires when the page was never visible.
 *
 * Neither handler can await anything, and neither needs to. `flush` *starts* the write in the
 * handler's own turn — the connection is already open, so the `put` and its explicit `commit` are
 * issued before the page is torn down, and the browser finishes a committed transaction on its own
 * (`saveProject`). The one write this cannot rescue is a second one queued behind a write still in
 * flight at that instant: the saver never overlaps writes, so it is issued only when the first one
 * lands, which on an unloading page is too late. That window is the duration of one IndexedDB
 * write, a few milliseconds.
 */
function flushWhenLeaving(): void {
  void saver.flush()
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushWhenLeaving)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWhenLeaving()
  })
}
