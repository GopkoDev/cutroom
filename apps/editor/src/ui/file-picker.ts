// `showOpenFilePicker` and `showSaveFilePicker`, typed and narrowed to the two questions Cutroom
// asks them: "which file?" and "where should the Export go?".
//
// TypeScript's DOM library does not declare the pickers, since they are Chromium capabilities
// (ADR 0006). Each is reached through the global it lives on and declared here, once, with only
// the options we pass.
//
// **No `types` filter on the open picker.** Whether a file can be used is the engine's to say, at runtime, from the
// file itself (Principle I, FR-003): a list of extensions here would be a claim about decoders we
// have not asked, and it would hide the refusal the spec wants the user to *see* — an audio-only
// file or an image is refused clearly, not made unpickable.
//
// **Cancelling is not an error.** Closing the dialog rejects with `AbortError`; that is the user
// changing their mind, so it answers `null` and nothing is reported.

interface OpenFilePickerOptions {
  readonly multiple?: boolean
  /** Lets the browser reopen the dialog in the folder this picker last used. */
  readonly id?: string
}

type OpenFilePicker = (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>

/**
 * Asks the user for one file. **Call it as the first act of a click** — the picker needs a user
 * gesture, and an `await` before it is the browser's chance to decide the gesture has expired.
 */
export async function pickOneFile(
  scope: object = globalThis,
  id = "cutroom-sources"
): Promise<FileSystemFileHandle | null> {
  const picker = (scope as { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker
  if (typeof picker !== "function") {
    throw new TypeError("This browser cannot open a file picker (showOpenFilePicker is missing)")
  }
  try {
    const [handle] = await picker.call(scope, { multiple: false, id })
    return handle ?? null
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null
    throw error
  }
}

// ---------------------------------------------------------------------------------------------
// Where an Export goes
// ---------------------------------------------------------------------------------------------

interface SaveFilePickerOptions {
  readonly suggestedName?: string
  readonly id?: string
  readonly types?: readonly {
    readonly description?: string
    readonly accept: Readonly<Record<string, readonly string[]>>
  }[]
  readonly excludeAcceptAllOption?: boolean
}

type SaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>

/** Whether this browser can ask where to save a file at all. */
export function canPickSaveFile(scope: object = globalThis): boolean {
  return typeof (scope as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function"
}

/**
 * Asks the user where an Export should be written (FR-015, research R4). **Call it as the first act
 * of a click**, for the same reason as `pickOneFile`: the picker needs the gesture, and an `await`
 * before it may outlive it. Closing the dialog answers `null`.
 *
 * Offered as an MP4 only — unlike the open picker, here the type *is* ours to state: it is the one
 * format this slice writes.
 */
export async function pickSaveFile(
  suggestedName: string,
  scope: object = globalThis,
  id = "cutroom-exports"
): Promise<FileSystemFileHandle | null> {
  const picker = (scope as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
  if (typeof picker !== "function") {
    throw new TypeError("This browser cannot choose where to save (showSaveFilePicker is missing)")
  }
  try {
    return await picker.call(scope, {
      suggestedName,
      id,
      types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
      excludeAcceptAllOption: true,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null
    throw error
  }
}
