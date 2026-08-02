import { expect, test } from "@playwright/test"

import type * as Db from "../src/storage/db"
import type * as SourceLinks from "../src/storage/source-links"

// The device-local link table, in a real browser — the only place a `FileSystemFileHandle` exists
// at all, let alone survives a reload.
//
// The handles here come from OPFS (`navigator.storage.getDirectory`), for one reason: a handle
// from `showOpenFilePicker` cannot be obtained under Playwright at all — the native dialog is not
// drivable and no permission descriptor for File System Access exists to pre-grant (recorded in
// playwright.config.ts). An OPFS handle is the same `FileSystemFileHandle` interface, is stored
// and restored by IndexedDB the same way, and reports its permission as granted. It stands in for
// a chosen file; it is not how the app stores anything (ADR 0005 — nothing is copied into browser
// storage).
//
// **What that leaves untestable here, plainly**: the `prompt` and `denied` permission states.
// Reaching either needs a handle whose grant has lapsed between sessions, which needs a real
// picker grant to lapse from. The code path is one branch of `inspectSourceLink` and is exercised
// by hand against the quickstart walk-through; `requestSourceAccess` likewise cannot be called
// without a gesture that grants or refuses. What *is* pinned below is the invariant that matters
// most for a load path — that reopening a Project never asks for permission at all.

const SOURCE_LINKS_MODULE = "/src/storage/source-links.ts"
const DB_MODULE = "/src/storage/db.ts"

test("a handle stored for a Source still opens its bytes in the next session", async ({ page }) => {
  await page.goto("/")

  await page.evaluate(async (specifier) => {
    const links = (await import(specifier)) as typeof SourceLinks

    const directory = await navigator.storage.getDirectory()
    const handle = await directory.getFileHandle("interview.mp4", { create: true })
    const writable = await handle.createWritable()
    await writable.write(new Uint8Array(128))
    await writable.close()

    await links.putSourceLink("source-1", handle)
  }, SOURCE_LINKS_MODULE)

  await page.reload()

  const afterReload = await page.evaluate(async (specifier) => {
    const links = (await import(specifier)) as typeof SourceLinks
    const handle = await links.getSourceLink("source-1")
    const state = await links.inspectSourceLink("source-1")
    const bytes = await links.readSourceFile("source-1")

    return {
      name: handle?.name,
      status: state.status,
      access: await links.querySourceAccess(handle as FileSystemFileHandle),
      size: bytes.status === "linked" ? bytes.file.size : null,
      fingerprint: bytes.status === "linked" ? links.fingerprintOf(bytes.file) : null,
    }
  }, SOURCE_LINKS_MODULE)

  expect(afterReload.name).toBe("interview.mp4")
  expect(afterReload.status).toBe("linked")
  expect(afterReload.access).toBe("granted")
  expect(afterReload.size).toBe(128)
  expect(afterReload.fingerprint?.size).toBe(128)
})

test("reopening a Project asks for no permission, and says which Sources are Offline", async ({
  page,
}) => {
  await page.goto("/")

  const inspection = await page.evaluate(async (specifier) => {
    const links = (await import(specifier)) as typeof SourceLinks

    const directory = await navigator.storage.getDirectory()
    const handle = await directory.getFileHandle("linked.mp4", { create: true })
    await links.putSourceLink("source-linked", handle)

    // Counting the two permission calls apart is the point: querying is allowed on load,
    // requesting needs a user gesture and must never happen without one (ADR 0005, FR-021).
    const prototype = FileSystemHandle.prototype as unknown as Record<string, () => unknown>
    const calls = { queried: 0, requested: 0 }
    const query = prototype.queryPermission
    const request = prototype.requestPermission
    prototype.queryPermission = function (this: unknown, ...args: unknown[]) {
      calls.queried += 1
      return (query as (...a: unknown[]) => unknown).apply(this, args)
    }
    prototype.requestPermission = function (this: unknown, ...args: unknown[]) {
      calls.requested += 1
      return (request as (...a: unknown[]) => unknown).apply(this, args)
    }

    // What a Project's load path does: ask about every Source it has, one of which this machine
    // has never seen.
    const states = [
      await links.inspectSourceLink("source-linked"),
      await links.inspectSourceLink("source-never-seen-here"),
    ]

    prototype.queryPermission = query
    prototype.requestPermission = request
    return { states, calls }
  }, SOURCE_LINKS_MODULE)

  expect(inspection.states[0]).toMatchObject({ status: "linked" })
  expect(inspection.states[1]).toEqual({ status: "offline", reason: "never-linked-here" })
  expect(inspection.calls.queried).toBe(1)
  expect(inspection.calls.requested).toBe(0)
})

test("a Source whose file has gone is Offline the moment it is read", async ({ page }) => {
  await page.goto("/")

  const outcome = await page.evaluate(async (specifier) => {
    const links = (await import(specifier)) as typeof SourceLinks

    const directory = await navigator.storage.getDirectory()
    const handle = await directory.getFileHandle("doomed.mp4", { create: true })
    await links.putSourceLink("source-1", handle)

    const whileItExists = await links.readSourceFile("source-1")

    // The file moves out from under a perfectly good handle, mid-session — the case a Preview
    // must not go on showing pictures for (quickstart, Persistence step 7).
    await directory.removeEntry("doomed.mp4")
    const afterItIsGone = await links.readSourceFile("source-1")

    return {
      before: whileItExists.status,
      after: afterItIsGone,
      // The row is still there: the Source is Offline, not forgotten, and a Relink has somewhere
      // to put its answer.
      stillLinked: (await links.getSourceLink("source-1")) !== undefined,
    }
  }, SOURCE_LINKS_MODULE)

  expect(outcome.before).toBe("linked")
  expect(outcome.after).toMatchObject({ status: "offline", reason: "unreachable" })
  expect(outcome.stillLinked).toBe(true)
})

test("a Relink accepts the same file under a new name and corrects what changed", async ({
  page,
}) => {
  await page.goto("/")

  const outcome = await page.evaluate(
    async ({ linksModule, dbModule }) => {
      const links = (await import(linksModule)) as typeof SourceLinks
      const db = (await import(dbModule)) as typeof Db

      const directory = await navigator.storage.getDirectory()
      const write = async (name: string, size: number) => {
        const handle = await directory.getFileHandle(name, { create: true })
        const writable = await handle.createWritable()
        await writable.write(new Uint8Array(size))
        await writable.close()
        return handle
      }

      const original = await write("interview.mp4", 4096)
      await links.putSourceLink("source-1", original)

      // The file the user picks: same bytes, renamed, and with the new timestamp a copy gets.
      // `expected` is what the Project recorded at import.
      const renamed = await write("interview-final.mp4", 4096)
      const relinked = await links.relinkSource("source-1", renamed, {
        size: 4096,
        lastModified: 1_750_000_000_000,
      })

      const database = await db.openCutroomDatabase()
      return {
        relinked,
        boundTo: (await links.getSourceLink("source-1"))?.name,
        actualLastModified: (await renamed.getFile()).lastModified,
        // Nothing about a Relink belongs in the Project store, and this half wrote nothing there.
        projectsTouched: await database.count("projects"),
      }
    },
    { linksModule: SOURCE_LINKS_MODULE, dbModule: DB_MODULE }
  )

  expect(outcome.relinked).toMatchObject({ ok: true, name: "interview-final.mp4" })
  expect(outcome.relinked.ok && outcome.relinked.fingerprint).toEqual({
    size: 4096,
    lastModified: outcome.actualLastModified,
  })
  expect(outcome.boundTo).toBe("interview-final.mp4")
  expect(outcome.projectsTouched).toBe(0)
})

test("a Relink refuses a different file and keeps the link it had", async ({ page }) => {
  await page.goto("/")

  const outcome = await page.evaluate(async (specifier) => {
    const links = (await import(specifier)) as typeof SourceLinks

    const directory = await navigator.storage.getDirectory()
    const write = async (name: string, size: number) => {
      const handle = await directory.getFileHandle(name, { create: true })
      const writable = await handle.createWritable()
      await writable.write(new Uint8Array(size))
      await writable.close()
      return handle
    }

    const original = await write("interview.mp4", 4096)
    await links.putSourceLink("source-1", original)

    const wrongFile = await write("holiday.mp4", 8192)
    const refused = await links.relinkSource("source-1", wrongFile, {
      size: 4096,
      lastModified: 1_750_000_000_000,
    })

    return { refused, boundTo: (await links.getSourceLink("source-1"))?.name }
  }, SOURCE_LINKS_MODULE)

  expect(outcome.refused).toMatchObject({
    ok: false,
    reason: "different-file",
    expected: { size: 4096 },
    found: { size: 8192 },
  })
  // The mistake cost nothing: the Source is still bound to the file it was bound to.
  expect(outcome.boundTo).toBe("interview.mp4")
})
