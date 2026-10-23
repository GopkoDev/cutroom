// Faults a spec can switch on in the running app, for the failures a user can hit but a test cannot
// cause honestly by other means (T093): storage refusing a write, storage refusing to open, a
// destination that runs out of space, and a way to reach the engine's Worker.
//
// Not a `*.spec.ts`, so Playwright does not collect it.
//
// Each fault patches the platform, not the app — `IDBObjectStore.prototype.put`,
// `IDBFactory.prototype.open`, `FileSystemWritableFileStream.prototype.write` — and raises the
// DOMException the browser itself raises for that failure, so what is tested is the app's handling
// of the real error shape. The switches live in `sessionStorage`, so a fault set before a reload is
// in force from the app's first line after it.
//
// The Worker is reached by wrapping the `Worker` constructor and remembering each instance: posting
// a message the protocol does not have makes the real engine answer `fatal` (engine-worker.spec.ts),
// which is how a spec stops the engine without touching its code.

import type { Page } from "@playwright/test"

export type Fault = "save-refused" | "storage-unavailable" | "destination-full"

const BRIDGE = "__cutroomFaults"
const KEY = "__cutroomFaults.on"

interface FaultBridge {
  set(fault: Fault, on: boolean): void
  /** Posts `message` to the newest Worker the page started. */
  postToNewestWorker(message: unknown): void
}

function installInPage(args: { bridge: string; key: string }): void {
  function on(): Set<string> {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(args.key) ?? "[]") as string[])
    } catch {
      return new Set()
    }
  }

  const workers: Worker[] = []
  const OriginalWorker = window.Worker
  window.Worker = class extends OriginalWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options)
      workers.push(this)
    }
  }

  const put = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...rest: Parameters<typeof put>) {
    // Only the Project store: the link table is written by the same method, and a refused link is
    // an import refusal, which is a different failure from a save.
    if (on().has("save-refused") && this.name === "projects") {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
    }
    return put.apply(this, rest)
  }

  const open = IDBFactory.prototype.open
  IDBFactory.prototype.open = function (this: IDBFactory, ...rest: Parameters<typeof open>) {
    if (on().has("storage-unavailable")) {
      throw new DOMException("Internal error opening backing store.", "UnknownError")
    }
    return open.apply(this, rest)
  }

  const write = FileSystemWritableFileStream.prototype.write
  FileSystemWritableFileStream.prototype.write = function (
    this: FileSystemWritableFileStream,
    ...rest: Parameters<typeof write>
  ) {
    if (on().has("destination-full")) {
      return Promise.reject(
        new DOMException("There is not enough space on the disk.", "QuotaExceededError")
      )
    }
    return write.apply(this, rest)
  }

  const bridge: FaultBridge = {
    set(fault, enabled) {
      const faults = on()
      if (enabled) faults.add(fault)
      else faults.delete(fault)
      sessionStorage.setItem(args.key, JSON.stringify([...faults]))
    },
    postToNewestWorker(message) {
      const worker = workers.at(-1)
      if (worker === undefined) throw new Error("faults: the page has started no Worker yet")
      worker.postMessage(message)
    },
  }
  ;(window as unknown as Record<string, FaultBridge>)[args.bridge] = bridge
}

export interface Faults {
  /** Switches a fault on or off. Survives a reload. Needs the app's page loaded. */
  set(fault: Fault, on: boolean): Promise<void>
  /** Makes the engine answer `fatal`, by posting it a message the protocol does not have. */
  stopTheEngine(): Promise<void>
}

/** Installs the fault switches. Call before `page.goto`. */
export async function installFaults(page: Page): Promise<Faults> {
  await page.addInitScript(installInPage, { bridge: BRIDGE, key: KEY })

  function bridge<K extends keyof FaultBridge>(method: K, ...rest: Parameters<FaultBridge[K]>) {
    return page.evaluate(
      ({ name, method, rest }) => {
        const found = (window as unknown as Record<string, FaultBridge | undefined>)[name]
        if (found === undefined) throw new Error("faults are not installed in this page")
        ;(found[method] as (...a: unknown[]) => void)(...rest)
      },
      { name: BRIDGE, method, rest: rest as unknown[] }
    )
  }

  return {
    set: (fault, enabled) => bridge("set", fault, enabled),
    stopTheEngine: () =>
      bridge("postToNewestWorker", { type: "a message the engine does not have" }),
  }
}
