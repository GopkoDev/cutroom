import { afterEach, describe, expect, it, vi } from "vitest"

// There is no IndexedDB under Node, and the property tested here is about what `openCutroomDatabase`
// does with idb's `blocked` callback, so `openDB` is replaced by one the test drives: it records
// the callbacks and settles when told to.
const opening = vi.hoisted(() => ({
  callbacks: null as { blocked?: (current: number) => void } | null,
  settle: null as ((database: unknown) => void) | null,
  refuse: null as ((error: unknown) => void) | null,
}))

vi.mock("idb", () => ({
  openDB: (_name: string, _version: number, callbacks: { blocked?: (current: number) => void }) => {
    opening.callbacks = callbacks
    return new Promise((settle, refuse) => {
      opening.settle = settle
      opening.refuse = refuse
    })
  },
}))

const { closeCutroomDatabase, onStorageBlocked, openCutroomDatabase } = await import("./db")

afterEach(async () => {
  opening.settle?.({ close: () => undefined })
  await closeCutroomDatabase()
})

describe("storage held by another tab (T093)", () => {
  it("is reported to the screen while it lasts, and cleared once the database opens", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const seen: boolean[] = []
    const stop = onStorageBlocked((blocked) => seen.push(blocked))

    const open = openCutroomDatabase()
    opening.callbacks?.blocked?.(1)
    expect(seen).toEqual([false, true])

    opening.settle?.({ close: () => undefined })
    await open
    expect(seen).toEqual([false, true, false])
    stop()
  })

  it("is cleared when the open fails instead, so the failure is what the screen shows", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const seen: boolean[] = []
    const stop = onStorageBlocked((blocked) => seen.push(blocked))

    const open = openCutroomDatabase()
    opening.callbacks?.blocked?.(1)
    opening.refuse?.(new DOMException("Version change aborted", "AbortError"))
    await expect(open).rejects.toThrow("Version change aborted")
    expect(seen).toEqual([false, true, false])
    stop()
  })
})
