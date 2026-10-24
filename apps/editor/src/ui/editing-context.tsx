// The editing controllers, handed to every part of the interface that edits (sad.md §5).
//
// `store/edit.ts` and `store/drag.ts` are plain functions over the store, built once with what they
// reach outside it for: the clock, the id generator and a way to stop Playback. The transport that
// stops Playback is made by the editor shell once the engine is up, so the controllers are built
// there too and passed down through this context rather than imported — a Timeline rendered in a
// test, or before the engine exists, simply has none and offers no edits.

import { createContext, useContext } from "react"

import type { DragController } from "@/store/drag"
import type { EditActions } from "@/store/edit"

export interface Editing {
  readonly edit: EditActions
  readonly drag: DragController
}

export const EditingContext = createContext<Editing | null>(null)

/** The editing controllers, or `null` where there are none (no shell, or no engine yet). */
export function useEditing(): Editing | null {
  return useContext(EditingContext)
}
