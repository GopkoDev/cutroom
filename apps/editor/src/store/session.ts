// The application's autosave, connected to the application's store. Separate from `autosave.ts`
// so that tests can connect their own saver to their own store without this running as an import
// side effect.

import { connectAutosave } from "./autosave"
import { editorStore } from "./index"

export const autosave = connectAutosave(editorStore)
