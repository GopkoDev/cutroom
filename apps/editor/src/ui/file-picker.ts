// `showOpenFilePicker`, typed and narrowed to the one question Cutroom asks it: "which file?".
//
// TypeScript's DOM library does not declare the picker, since it is a Chromium capability (ADR
// 0006). It is reached through the global it lives on and declared here, once, with only the
// options we pass.
//
// **No `types` filter.** Whether a file can be used is the engine's to say, at runtime, from the
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
