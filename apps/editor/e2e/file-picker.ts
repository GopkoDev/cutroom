// A stand-in for the native file pickers, for every spec that imports a Source through the UI or
// exports one.
//
// Not a `*.spec.ts`, so Playwright does not collect it.
//
// ## Why it has to exist
//
// `showOpenFilePicker` opens a native dialog Playwright cannot drive, and Chrome exposes no
// permission descriptor through which File System Access could be pre-granted (both recorded in
// playwright.config.ts, T012). So the picker is replaced through `page.addInitScript`, before the
// app's first line runs, with one that answers from a queue the spec fills.
//
// ## What it hands back
//
// **Real `FileSystemFileHandle`s**, from the origin-private file system. A fixture is copied from
// `packages/engine/test/fixtures/` into OPFS under a name the spec chooses, and the picker answers
// with the handle to it. That is the same interface a picked file has, it structured-clones into
// the link table and survives a reload the same way, and `getFile()` fails the same way when the
// file is removed or renamed under it. It is a stand-in for the user's disk; the app itself still
// copies nothing into browser storage (ADR 0005). Each Playwright test runs in a fresh browser
// context, so OPFS, IndexedDB and everything below start empty for every test.
//
// ## What is faked, and how faithfully
//
// An OPFS handle reports its permission as always granted, which would leave the `prompt` and
// `denied` states — the whole of a reload's "Offline until the user allows it" — untestable. So
// `queryPermission`, `requestPermission` and `getFile` are patched on the prototypes, and answer
// from a per-file permission state the spec controls. The patches keep the browser's rules:
//
//   * a pick grants read permission for the file picked, as a real pick does;
//   * `getFile()` on a file whose permission is not `granted` throws `NotAllowedError`;
//   * `requestPermission` and `showOpenFilePicker` without transient user activation throw
//     `SecurityError`, as Chrome does — so a spec catches a click handler that `await`s before it
//     asks, the rule ADR 0005 and `pickOneFile` are written around;
//   * `requestPermission` on a `granted` or `denied` file answers that without asking; on a
//     `prompt` file it answers what the spec said the user would, and the file keeps that answer.
//
// The permission states live in `sessionStorage`, so they survive `page.reload()` — a spec says
// "after the reload, this file is `prompt` again" by calling `setPermission("prompt")` before it
// reloads, which is what a real browser does to a restored handle (ADR 0005). Call counts and the
// pick queue are per page load.
//
// ## The save picker
//
// `showSaveFilePicker` (Export, T075) is replaced the same way and answers from its own queue,
// filled with `queueSave`: a name, `{ suggested: true }` for the name the app suggested, or
// `"cancel"`. It answers with an OPFS handle to that name, creating the file empty if it is not
// there — what Chrome does for a new name — and leaving an existing one as it is, so a spec can
// prove an Export into an existing file leaves it intact when it does not finish. It throws
// `SecurityError` without user activation, so a click handler that awaits before asking fails
// here as it would for real. The app then writes with `createWritable()` and hands the stream to
// the engine's Worker; the bytes land in OPFS, where `fileSize` and `readFile` read them back
// (or a spec opens them in the page, from `navigator.storage.getDirectory()`, by the same name).
//
// ## Counting bytes read (opt-in)
//
// With `{ countBytes: true }`, every byte a `File` delivers through `arrayBuffer()`, `bytes()`,
// `text()` or `stream()` is counted per file name, `slice`s included — on the main thread and in
// every module Worker the page starts. The engine reads in its Worker, which an init script cannot
// reach, so the `Worker` constructor is wrapped: a module Worker is started from a two-line entry
// that installs the counter and then imports the real worker URL. Off by default, because it
// changes how the engine's Worker is constructed; a spec that does not measure bytes should not
// pay for that. `FileReader` is not counted (nothing in the app or Mediabunny uses it).

import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { Page } from "@playwright/test"

export const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/engine/test/fixtures"
)

/** The files `pnpm fixtures` writes (quickstart.md, T013). */
export type Fixture =
  | "sync-1080p30.mp4"
  | "sync-1080p2997.mp4"
  | "sync-1080p30-10min.mp4"
  | "silent-720p24.mp4"
  | "long-1080p30-70min.mp4"
  | "audio-only.m4a"
  | "still.png"
  | "broken.mp4"

/**
 * What the next picker call answers.
 *
 *   * a fixture name — that fixture, under its own name (written to disk first if not already there);
 *   * `{ fixture, as }` — that fixture under another name (written, or overwritten, now);
 *   * `{ existing }` — whatever is on disk at that name right now, e.g. after `renameFile`;
 *   * `"cancel"` — the user closes the dialog (`AbortError`, which the app treats as no answer).
 *
 * A picker call with nothing queued fails with an error naming this helper, which the app shows as
 * "The file picker could not be opened" with the error under Details — a forgotten `queue` is
 * loud, not a hang.
 */
export type PickEntry = Fixture | { fixture: Fixture; as: string } | { existing: string } | "cancel"

/**
 * What the next save picker call answers: that name, the app's own suggested name, or a cancel
 * (`AbortError`). As with `PickEntry`, a save picker with nothing queued fails loudly.
 */
export type SaveEntry = string | { suggested: true } | "cancel"

export interface FilePickerOptions {
  /** What `queryPermission` answers for a file nothing more specific was said about. `granted`. */
  readonly permission?: PermissionState
  /** What the user answers when `requestPermission` would show a prompt. `granted`. */
  readonly requestAnswer?: PermissionState
  /** Count bytes read per file name. Off unless asked for; see the header. */
  readonly countBytes?: boolean
}

export interface PermissionCalls {
  readonly queried: number
  readonly requested: number
}

export interface FilePicker {
  /** Queues what the next picker calls answer, in order. Needs the app's page loaded. */
  queue(...entries: PickEntry[]): Promise<void>
  /** How many times the picker was opened since this page loaded. */
  picks(): Promise<number>
  /** Sets the permission state of one file, or — without a name — of every file. */
  setPermission(state: PermissionState, name?: string): Promise<void>
  /** What the user answers the next `requestPermission` prompts with. */
  answerRequestsWith(state: PermissionState): Promise<void>
  /** The permission state a file is in now, as `queryPermission` would answer it. */
  permissionOf(name: string): Promise<PermissionState>
  /** `queryPermission` / `requestPermission` calls since this page loaded. */
  permissionCalls(): Promise<PermissionCalls>
  /** Puts a fixture on disk under `name` (default: its own), replacing anything there. */
  writeFile(fixture: Fixture, name?: string): Promise<void>
  /** Puts `size` zero bytes on disk under `name`, replacing anything there. */
  writeBytes(name: string, size: number): Promise<void>
  /** Deletes a file. Handles to it stay, and `getFile()` on them throws `NotFoundError`. */
  removeFile(name: string): Promise<void>
  /** Renames a file on disk. Handles the app holds keep the old name and stop reading. */
  renameFile(from: string, to: string): Promise<void>
  /** Whether a file is on disk at `name`. */
  exists(name: string): Promise<boolean>
  /** Bytes delivered from files called `name` since load or the last reset. Needs `countBytes`. */
  bytesRead(name: string): Promise<number>
  /** Zeroes every byte count, in every Worker. */
  resetBytesRead(): Promise<void>
  /** Queues what the next save picker calls answer, in order. Needs the app's page loaded. */
  queueSave(...entries: SaveEntry[]): Promise<void>
  /** How many times the save picker was opened since this page loaded. */
  saves(): Promise<number>
  /** The `suggestedName` the app passed to the last save picker call, if any. */
  lastSuggestedName(): Promise<string | undefined>
  /** The size of a file on disk, or `null` when there is none. */
  fileSize(name: string): Promise<number | null>
  /** A file's bytes, read back into the spec. Meant for exports of a few MB, not for fixtures. */
  readFile(name: string): Promise<Buffer>
}

/** Same-origin, so a fetch from the page needs no CORS; answered by `page.route`, never by Vite. */
const FIXTURE_ROUTE = "/__e2e__/fixtures/"
const BRIDGE = "__cutroomFilePicker"

/** The page-side half, installed by the init script. */
interface Bridge {
  queue(names: Array<string | null>): void
  picks(): number
  setPermission(state: PermissionState, name?: string): void
  answerRequestsWith(state: PermissionState): void
  permissionOf(name: string): PermissionState
  permissionCalls(): PermissionCalls
  write(name: string, url: string): Promise<void>
  writeBytes(name: string, size: number): Promise<void>
  remove(name: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  exists(name: string): Promise<boolean>
  bytesRead(name: string): Promise<number>
  resetBytesRead(): Promise<void>
  queueSave(names: Array<string | { suggested: true } | null>): void
  saves(): number
  lastSuggestedName(): string | undefined
  fileSize(name: string): Promise<number | null>
  readBase64(name: string): Promise<string>
}

interface InitArgs {
  readonly bridge: string
  readonly permission: PermissionState
  readonly requestAnswer: PermissionState
  readonly countBytes: boolean
}

/**
 * Runs in the page before any of the app's code. Self-contained: Playwright sends its source, so
 * it may not close over anything in this module.
 */
function installInPage(args: InitArgs): void {
  const STATE_KEY = "__cutroomFilePicker.state"

  interface StoredState {
    defaultPermission: PermissionState
    requestAnswer: PermissionState
    byName: Record<string, PermissionState>
  }

  function load(): StoredState {
    try {
      const raw = sessionStorage.getItem(STATE_KEY)
      if (raw !== null) return JSON.parse(raw) as StoredState
    } catch {
      // about:blank and opaque origins have no sessionStorage; the defaults stand in.
    }
    return { defaultPermission: args.permission, requestAnswer: args.requestAnswer, byName: {} }
  }

  function save(state: StoredState): void {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state))
    } catch {
      // As above.
    }
  }

  // First load of this tab: record the options, so a reload keeps whatever the spec changed.
  save(load())

  function permissionOf(name: string): PermissionState {
    const state = load()
    return state.byName[name] ?? state.defaultPermission
  }

  function setPermission(state: PermissionState, name?: string): void {
    const stored = load()
    if (name === undefined) {
      stored.defaultPermission = state
      stored.byName = {}
    } else {
      stored.byName[name] = state
    }
    save(stored)
  }

  function hasActivation(): boolean {
    return navigator.userActivation?.isActive ?? true
  }

  const root = () => navigator.storage.getDirectory()

  // ---- permissions, on the real prototypes ------------------------------------------------------

  type PermissionMethod = (descriptor?: unknown) => Promise<PermissionState>
  const handleProto = FileSystemHandle.prototype as unknown as Record<string, PermissionMethod>
  const fileProto = FileSystemFileHandle.prototype
  const nativeGetFile = fileProto.getFile
  const calls = { queried: 0, requested: 0 }

  handleProto.queryPermission = async function (this: FileSystemHandle) {
    calls.queried += 1
    return permissionOf(this.name)
  }

  handleProto.requestPermission = async function (this: FileSystemHandle) {
    calls.requested += 1
    if (!hasActivation()) {
      throw new DOMException("User activation is required to request permissions.", "SecurityError")
    }
    const current = permissionOf(this.name)
    if (current !== "prompt") return current
    const answer = load().requestAnswer
    if (answer !== "prompt") setPermission(answer, this.name)
    return answer
  }

  fileProto.getFile = function (this: FileSystemFileHandle) {
    if (permissionOf(this.name) !== "granted") {
      return Promise.reject(
        new DOMException(
          "The request is not allowed by the user agent or the platform in the current context.",
          "NotAllowedError"
        )
      )
    }
    return nativeGetFile.call(this)
  }

  // ---- the picker -------------------------------------------------------------------------------

  /** `null` is a cancel. Per page load: a queue that outlived a reload would answer a stale ask. */
  const queued: Array<string | null> = []
  let picks = 0

  Object.defineProperty(window, "showOpenFilePicker", {
    configurable: true,
    writable: true,
    value: async function showOpenFilePicker(): Promise<FileSystemFileHandle[]> {
      // Checked before anything is awaited, as the browser checks it.
      if (!hasActivation()) {
        throw new DOMException(
          "Must be handling a user gesture to show a file picker.",
          "SecurityError"
        )
      }
      picks += 1
      if (queued.length === 0) {
        throw new Error(
          "e2e file picker: the picker was opened with nothing queued — call `picker.queue(…)` first"
        )
      }
      const name = queued.shift() as string | null
      if (name === null) throw new DOMException("The user aborted a request.", "AbortError")
      const handle = await (await root()).getFileHandle(name)
      setPermission("granted", name) // a pick grants read, as a real one does
      return [handle]
    },
  })

  // ---- the save picker --------------------------------------------------------------------------

  /** `null` is a cancel. Per page load, like the open picker's queue. */
  const saveQueued: Array<string | { suggested: true } | null> = []
  let saves = 0
  let lastSuggestedName: string | undefined

  Object.defineProperty(window, "showSaveFilePicker", {
    configurable: true,
    writable: true,
    value: async function showSaveFilePicker(options?: {
      suggestedName?: string
    }): Promise<FileSystemFileHandle> {
      if (!hasActivation()) {
        throw new DOMException(
          "Must be handling a user gesture to show a file picker.",
          "SecurityError"
        )
      }
      saves += 1
      lastSuggestedName = options?.suggestedName
      if (saveQueued.length === 0) {
        throw new Error(
          "e2e file picker: the save picker was opened with nothing queued — call `picker.queueSave(…)` first"
        )
      }
      const entry = saveQueued.shift() as string | { suggested: true } | null
      if (entry === null) throw new DOMException("The user aborted a request.", "AbortError")
      const name = typeof entry === "string" ? entry : options?.suggestedName
      if (name === undefined || name === "") {
        throw new Error(
          "e2e file picker: `{ suggested: true }` queued, but the app suggested no name"
        )
      }
      // A new name exists, empty, once the picker answers; an existing file is left as it is.
      const handle = await (await root()).getFileHandle(name, { create: true })
      setPermission("granted", name) // a save pick grants read and write
      return handle
    },
  })

  // ---- bytes read -------------------------------------------------------------------------------

  /**
   * Installs the counter in whatever global it runs in. Also stringified into each Worker, so it
   * too may not close over anything.
   */
  function installCounter(report: (totals: Record<string, number>) => void) {
    const totals: Record<string, number> = {}
    const origin = new WeakMap<Blob, string>()
    const nameOf = (blob: Blob): string | undefined =>
      origin.get(blob) ??
      (typeof File !== "undefined" && blob instanceof File ? blob.name : undefined)
    const add = (name: string | undefined, count: number) => {
      if (name === undefined || count === 0) return
      totals[name] = (totals[name] ?? 0) + count
      report(totals)
    }

    const proto = Blob.prototype as Blob & { bytes?: () => Promise<Uint8Array<ArrayBuffer>> }
    const { slice, arrayBuffer, text, stream, bytes } = proto

    proto.slice = function (this: Blob, ...rest: Parameters<Blob["slice"]>) {
      const part = slice.apply(this, rest)
      const name = nameOf(this)
      if (name !== undefined) origin.set(part, name)
      return part
    }
    proto.arrayBuffer = async function (this: Blob) {
      const buffer = await arrayBuffer.call(this)
      add(nameOf(this), buffer.byteLength)
      return buffer
    }
    proto.text = async function (this: Blob) {
      const result = await text.call(this)
      add(nameOf(this), this.size)
      return result
    }
    if (typeof bytes === "function") {
      proto.bytes = async function (this: Blob) {
        const result = await bytes.call(this)
        add(nameOf(this), result.byteLength)
        return result
      }
    }
    proto.stream = function (this: Blob) {
      const underlying = stream.call(this)
      const name = nameOf(this)
      if (name === undefined) return underlying
      // Counted as chunks are *taken*, with no read-ahead of our own: a reader that cancels after
      // the first chunk has read one chunk.
      const reader = underlying.getReader()
      return new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            const { done, value } = await reader.read()
            if (done) {
              controller.close()
              return
            }
            add(name, value.byteLength)
            controller.enqueue(value)
          },
          cancel(reason) {
            return reader.cancel(reason)
          },
        },
        { highWaterMark: 0 }
      ) as ReturnType<Blob["stream"]>
    } as Blob["stream"]

    return {
      totals,
      reset() {
        for (const key of Object.keys(totals)) delete totals[key]
      },
    }
  }

  const CHANNEL = "__cutroomFilePicker.bytes"
  type CounterMessage =
    | { kind: "totals"; id: string; totals: Record<string, number>; nonce?: string }
    | { kind: "flush"; nonce: string }
    | { kind: "reset"; nonce: string }
    | { kind: "reset-done"; id: string; nonce: string }

  let mainCounter: ReturnType<typeof installCounter> | null = null
  const workerTotals = new Map<string, Record<string, number>>()
  const liveWorkers = new Set<string>()
  let channel: BroadcastChannel | null = null
  const waiting = new Map<string, { pending: Set<string>; done: () => void }>()

  if (args.countBytes) {
    mainCounter = installCounter(() => {})
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (event: MessageEvent<CounterMessage>) => {
      const message = event.data
      if (message.kind === "totals") workerTotals.set(message.id, { ...message.totals })
      if ((message.kind === "totals" || message.kind === "reset-done") && message.nonce) {
        const wait = waiting.get(message.nonce)
        wait?.pending.delete(message.id)
        if (wait !== undefined && wait.pending.size === 0) wait.done()
      }
    }

    const NativeWorker = window.Worker
    const counterSource = installCounter.toString()
    class CountingWorker extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (options?.type !== "module") {
          super(url, options)
          return
        }
        const id = crypto.randomUUID()
        const prelude =
          `const install = ${counterSource};\n` +
          `const channel = new BroadcastChannel(${JSON.stringify(CHANNEL)});\n` +
          `const id = ${JSON.stringify(id)};\n` +
          `const counter = install((totals) => channel.postMessage({ kind: "totals", id, totals }));\n` +
          `channel.onmessage = (event) => {\n` +
          `  const m = event.data;\n` +
          `  if (m.kind === "flush") channel.postMessage({ kind: "totals", id, totals: counter.totals, nonce: m.nonce });\n` +
          `  if (m.kind === "reset") { counter.reset(); channel.postMessage({ kind: "reset-done", id, nonce: m.nonce }); }\n` +
          `};\n`
        const asModule = (source: string) =>
          URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
        const target = new URL(String(url), location.href).href
        // Two static imports, evaluated in order before the Worker takes its first message: the
        // counter is in place before the engine's first line, and nothing posted is missed.
        const entry = `import ${JSON.stringify(asModule(prelude))};\nimport ${JSON.stringify(target)};\n`
        super(asModule(entry), options)
        liveWorkers.add(id)
        const terminate = this.terminate.bind(this)
        this.terminate = () => {
          liveWorkers.delete(id)
          workerTotals.delete(id)
          terminate()
        }
      }
    }
    Object.defineProperty(window, "Worker", {
      configurable: true,
      writable: true,
      value: CountingWorker,
    })
  }

  /** Asks every live Worker and waits for all of them to answer, or a second. */
  function broadcast(kind: "flush" | "reset"): Promise<void> {
    if (channel === null) return Promise.resolve()
    const nonce = crypto.randomUUID()
    return new Promise<void>((resolve) => {
      const finish = () => {
        waiting.delete(nonce)
        resolve()
      }
      if (liveWorkers.size === 0) return finish()
      waiting.set(nonce, { pending: new Set(liveWorkers), done: finish })
      setTimeout(finish, 1000)
      channel?.postMessage({ kind, nonce } satisfies CounterMessage)
    })
  }

  // ---- the bridge the spec talks to -------------------------------------------------------------

  async function writeStream(name: string, body: ReadableStream<Uint8Array> | Uint8Array) {
    const handle = await (await root()).getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    if (body instanceof Uint8Array) {
      await writable.write(body as Uint8Array<ArrayBuffer>)
      await writable.close()
    } else {
      await body.pipeTo(writable)
    }
  }

  const bridge: Bridge = {
    queue(names) {
      queued.push(...names)
    },
    picks: () => picks,
    setPermission,
    answerRequestsWith(state) {
      const stored = load()
      stored.requestAnswer = state
      save(stored)
    },
    permissionOf,
    permissionCalls: () => ({ ...calls }),
    async write(name, url) {
      const response = await fetch(url)
      if (!response.ok || response.body === null) {
        throw new Error(`e2e file picker: could not fetch ${url} (${response.status})`)
      }
      await writeStream(name, response.body)
    },
    async writeBytes(name, size) {
      await writeStream(name, new Uint8Array(size))
    },
    async remove(name) {
      await (await root()).removeEntry(name)
    },
    async rename(from, to) {
      const directory = await root()
      const handle = await directory.getFileHandle(from)
      const movable = handle as FileSystemFileHandle & { move?: (name: string) => Promise<void> }
      if (typeof movable.move === "function") {
        await movable.move(to)
        return
      }
      const file = await nativeGetFile.call(handle)
      await writeStream(to, file.stream())
      await directory.removeEntry(from)
    },
    async exists(name) {
      try {
        await (await root()).getFileHandle(name)
        return true
      } catch {
        return false
      }
    },
    async bytesRead(name) {
      await broadcast("flush")
      let total = mainCounter?.totals[name] ?? 0
      for (const totals of workerTotals.values()) total += totals[name] ?? 0
      return total
    },
    async resetBytesRead() {
      mainCounter?.reset()
      workerTotals.clear()
      await broadcast("reset")
    },
    queueSave(names) {
      saveQueued.push(...names)
    },
    saves: () => saves,
    lastSuggestedName: () => lastSuggestedName,
    async fileSize(name) {
      try {
        const handle = await (await root()).getFileHandle(name)
        return (await nativeGetFile.call(handle)).size
      } catch {
        return null
      }
    },
    async readBase64(name) {
      const handle = await (await root()).getFileHandle(name)
      const bytes = new Uint8Array(await (await nativeGetFile.call(handle)).arrayBuffer())
      let binary = ""
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      }
      return btoa(binary)
    },
  }

  Object.defineProperty(window, args.bridge, { configurable: true, value: bridge })
}

function fixturePath(fixture: Fixture): string {
  const file = path.join(FIXTURES_DIR, fixture)
  if (!existsSync(file)) {
    throw new Error(
      `The fixture ${fixture} is missing from ${FIXTURES_DIR} — run \`pnpm fixtures\``
    )
  }
  return file
}

/**
 * Replaces the file picker and the permission model for `page`. **Call it before `page.goto`**:
 * it is an init script, so it applies from the next navigation on.
 *
 * Every method of the answer except the options needs the app's page loaded, because OPFS and the
 * permission state are the app origin's.
 */
export async function installFilePicker(
  page: Page,
  options: FilePickerOptions = {}
): Promise<FilePicker> {
  await page.route(`**${FIXTURE_ROUTE}*`, async (route) => {
    const name = decodeURIComponent(
      new URL(route.request().url()).pathname.slice(FIXTURE_ROUTE.length)
    )
    await route.fulfill({
      path: fixturePath(name as Fixture),
      contentType: "application/octet-stream",
    })
  })

  await page.addInitScript(installInPage, {
    bridge: BRIDGE,
    permission: options.permission ?? "granted",
    requestAnswer: options.requestAnswer ?? "granted",
    countBytes: options.countBytes ?? false,
  } satisfies InitArgs)

  /** Calls one bridge method in the page. */
  function call<K extends keyof Bridge>(
    method: K,
    ...rest: Parameters<Bridge[K]>
  ): Promise<Awaited<ReturnType<Bridge[K]>>> {
    return page.evaluate(
      async ({ bridge, method, rest }) => {
        const found = (window as unknown as Record<string, Bridge | undefined>)[bridge]
        if (found === undefined) {
          throw new Error(
            "e2e file picker is not installed in this page — call installFilePicker before page.goto"
          )
        }
        const fn = found[method] as (...a: unknown[]) => unknown
        return (await fn(...rest)) as Awaited<ReturnType<Bridge[K]>>
      },
      { bridge: BRIDGE, method, rest: rest as unknown[] }
    ) as Promise<Awaited<ReturnType<Bridge[K]>>>
  }

  const writeFile = async (fixture: Fixture, name: string = fixture) => {
    fixturePath(fixture) // fail here, in Node, with the remedy, rather than as a 404 in the page
    await call("write", name, FIXTURE_ROUTE + encodeURIComponent(fixture))
  }

  return {
    async queue(...entries) {
      const names: Array<string | null> = []
      for (const entry of entries) {
        if (entry === "cancel") names.push(null)
        else if (typeof entry === "string") {
          if (!(await call("exists", entry))) await writeFile(entry)
          names.push(entry)
        } else if ("existing" in entry) {
          names.push(entry.existing)
        } else {
          await writeFile(entry.fixture, entry.as)
          names.push(entry.as)
        }
      }
      await call("queue", names)
    },
    picks: () => call("picks"),
    setPermission: (state, name) => call("setPermission", state, name),
    answerRequestsWith: (state) => call("answerRequestsWith", state),
    permissionOf: (name) => call("permissionOf", name),
    permissionCalls: () => call("permissionCalls"),
    writeFile,
    writeBytes: (name, size) => call("writeBytes", name, size),
    removeFile: (name) => call("remove", name),
    renameFile: (from, to) => call("rename", from, to),
    exists: (name) => call("exists", name),
    async bytesRead(name) {
      if (options.countBytes !== true) {
        throw new Error("bytesRead needs installFilePicker(page, { countBytes: true })")
      }
      return call("bytesRead", name)
    },
    resetBytesRead: () => call("resetBytesRead"),
    async queueSave(...entries) {
      await call(
        "queueSave",
        entries.map((entry) => (entry === "cancel" ? null : entry))
      )
    },
    saves: () => call("saves"),
    lastSuggestedName: () => call("lastSuggestedName"),
    fileSize: (name) => call("fileSize", name),
    async readFile(name) {
      return Buffer.from(await call("readBase64", name), "base64")
    },
  }
}
