// The export's destination, made transferable — the one piece of the export that runs on the main
// thread (R4, events.md `export-start`).
//
// Chrome does not transfer a `FileSystemWritableFileStream`: `postMessage` refuses it with a
// `DataCloneError`, although the plain `WritableStream` it extends transfers fine. (Measured, not
// read.) So the main thread keeps the file stream and hands the worker a plain stream that forwards
// to it — every write, the close that commits the file, and the abort that discards it. The worker
// still never sees a handle or a permission (ADR 0005); it gets a stream, as the contract says.
//
// **The commit happens here, so it is reported here.** A transferred stream's `close()` settles on
// the worker's side once the close has been *posted*, not once the file has been committed — so
// `export-done` can arrive before the file exists at its destination, and a commit that fails (the
// disk filled at the last moment, the file was locked) would never reach the worker at all. So the
// main thread waits for `committed` as well as for `export-done` before it calls the file finished
// (FR-018); measured, `export-done` came first and the file still read as 0 bytes.
//
// Imported by the main thread, so it must stay free of anything that only exists in a worker —
// nothing here touches PixiJS or the engine's state.

/** The two halves of an export's destination. */
export interface ExportDestination {
  /** Transfer this in `export-start` — never the file stream itself. */
  readonly writable: WritableStream
  /**
   * Resolves once the file has been committed: the worker finished the export and the file
   * stream's own `close()` succeeded. Rejects if the file was discarded instead — the export was
   * cancelled or failed — or a write or the commit itself failed. Only an export that has both
   * answered `export-done` and resolved this is a finished file.
   */
  readonly committed: Promise<void>
}

/**
 * A transferable stream forwarding to `file`: writes (Mediabunny's `{ type: "write", data,
 * position }` chunks, which a `FileSystemWritableFileStream` takes as-is), `close` — which commits
 * the file — and `abort`, which discards everything written. Do not write to `file` while it is in
 * use.
 */
export function forwardingWritable(file: FileSystemWritableFileStream): ExportDestination {
  let commit: () => void = () => undefined
  let refuse: (reason: unknown) => void = () => undefined
  const committed = new Promise<void>((resolve, reject) => {
    commit = resolve
    refuse = reject
  })
  // Rejection is an ordinary outcome (a cancel), and a caller that only awaits `export-cancelled`
  // must not see it reported as unhandled.
  committed.catch(() => undefined)

  const writable = new WritableStream({
    async write(chunk: FileSystemWriteChunkType) {
      try {
        await file.write(chunk)
      } catch (error) {
        refuse(error)
        throw error
      }
    },
    async close() {
      try {
        await file.close()
        commit()
      } catch (error) {
        refuse(error)
        throw error
      }
    },
    async abort(reason: unknown) {
      refuse(reason ?? new Error("the export was discarded"))
      await file.abort(reason)
    },
  })

  return { writable, committed }
}
