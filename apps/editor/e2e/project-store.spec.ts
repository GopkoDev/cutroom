import { expect, test } from "@playwright/test"

import type { Project } from "@cutroom/model"

import type * as Db from "../src/storage/db"
import type * as ProjectStore from "../src/storage/projects"

// The Project library, exercised in the browser it actually runs in: real Chromium, real
// IndexedDB, real page reloads. Vitest cannot reach any of this — `packages/model` runs in node,
// where there is no IndexedDB and no structured clone of a file handle — so these live here.
//
// Each spec reaches the module the same way: the Vite dev server serves `/src/storage/*.ts`
// transformed, so the page can `import()` it directly. That keeps the test on the module's real
// interface, with no harness page in between that might work when the module does not. Playwright
// gives every test its own browser context, so each starts with empty storage; a `page.reload()`
// inside a test is a genuine second session against the same storage.

const PROJECT_STORE_MODULE = "/src/storage/projects.ts"
const DB_MODULE = "/src/storage/db.ts"

function aProject(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    id: "project-alpha",
    name: "Opening titles",
    createdAt: "2026-08-01T09:00:00.000Z",
    modifiedAt: "2026-08-01T09:30:00.000Z",
    timebase: { numerator: 30000, denominator: 1001 },
    frameSize: { width: 1920, height: 1080 },
    sources: [
      {
        id: "source-1",
        name: "interview.mp4",
        address: { kind: "local-file" },
        fingerprint: { size: 4096, lastModified: 1_750_000_000_000 },
        duration: { numerator: 10, denominator: 1 },
        timebase: { numerator: 30000, denominator: 1001 },
        dimensions: { width: 1920, height: 1080 },
        hasAudio: true,
        codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
      },
    ],
    timeline: {
      tracks: [
        {
          id: "track-1",
          kind: "video",
          name: "Video 1",
          clips: [
            {
              id: "clip-1",
              sourceId: "source-1",
              startFrame: 0,
              durationFrames: 300,
              sourceInPoint: { numerator: 0, denominator: 1 },
            },
          ],
        },
      ],
      durationFrames: 300,
    },
    ...overrides,
  }
}

test("a Project saved in one session is the same Project after a reload", async ({ page }) => {
  const project = aProject()
  await page.goto("/")

  await page.evaluate(
    async ({ specifier, projectDocument }) => {
      const store = (await import(specifier)) as typeof ProjectStore
      await store.saveProject(projectDocument)
    },
    { specifier: PROJECT_STORE_MODULE, projectDocument: project }
  )

  // A new page, a new module instance, a new IndexedDB connection — everything except the data.
  await page.reload()

  const reopened = await page.evaluate(
    async ({ specifier, id }) => {
      const store = (await import(specifier)) as typeof ProjectStore
      return store.loadProject(id)
    },
    { specifier: PROJECT_STORE_MODULE, id: project.id }
  )

  expect(reopened).toEqual(project)
})

test("what lands in the projects store is plain JSON and nothing else", async ({ page }) => {
  const project = aProject()
  await page.goto("/")

  const findings = await page.evaluate(
    async ({ projectsModule, dbModule, projectDocument }) => {
      const store = (await import(projectsModule)) as typeof ProjectStore
      const db = (await import(dbModule)) as typeof Db
      await store.saveProject(projectDocument)

      const database = await db.openCutroomDatabase()
      const stored: unknown = await database.get("projects", projectDocument.id)

      // Everything reachable from the stored record must be a plain object, an array, or a
      // string/number/boolean/null leaf. A `FileSystemFileHandle`, a `Date` or a `Map` is
      // structured-cloneable, so IndexedDB would have stored any of them without complaint — this
      // walk is what says none of them is there.
      const impure: string[] = []
      const walk = (value: unknown, path: string): void => {
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) return
        if (Array.isArray(value)) {
          value.forEach((entry, index) => {
            walk(entry, `${path}[${index}]`)
          })
          return
        }
        const prototype: unknown = Object.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) {
          impure.push(`${path} is a ${(value as object).constructor.name}`)
          return
        }
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
          walk(entry, `${path}.${key}`)
        }
      }
      walk(stored, "project")

      return {
        impure,
        // The proof that what was stored is the document itself: JSON in, JSON out, unchanged.
        json: JSON.stringify(stored) === JSON.stringify(projectDocument),
        stores: [...database.objectStoreNames].sort(),
      }
    },
    { projectsModule: PROJECT_STORE_MODULE, dbModule: DB_MODULE, projectDocument: project }
  )

  expect(findings.impure).toEqual([])
  expect(findings.json).toBe(true)
  expect(findings.stores).toEqual(["projects", "source-links"])
})

test("a file handle cannot be saved inside a Project", async ({ page }) => {
  const project = aProject()
  await page.goto("/")

  const attempt = await page.evaluate(
    async ({ projectsModule, dbModule, projectDocument }) => {
      const store = (await import(projectsModule)) as typeof ProjectStore
      const db = (await import(dbModule)) as typeof Db

      // A real handle. OPFS is only how the test gets one without a file picker it cannot drive —
      // the app stores no bytes there (ADR 0005).
      const directory = await navigator.storage.getDirectory()
      const handle = await directory.getFileHandle("smuggled.mp4", { create: true })

      // The way this leak would actually happen: a Source hanging on to the handle it was opened
      // with, and the whole Project going to storage as it always does.
      const poisoned = {
        ...projectDocument,
        sources: [{ ...projectDocument.sources[0], handle }],
      } as unknown as Project

      let refusal = ""
      try {
        await store.saveProject(poisoned)
      } catch (error) {
        refusal = error instanceof Error ? error.message : String(error)
      }

      const database = await db.openCutroomDatabase()
      return { refusal, stored: await database.count("projects") }
    },
    { projectsModule: PROJECT_STORE_MODULE, dbModule: DB_MODULE, projectDocument: project }
  )

  expect(attempt.refusal).toContain("handle")
  expect(attempt.stored).toBe(0)
})

test("a Project from an older schema opens, migrated", async ({ page }) => {
  // Version 0: the shape from before `schemaVersion` existed. Written straight into the store,
  // because `saveProject` would refuse to create one — which is the point of testing the load path
  // rather than a round trip.
  const legacy: Record<string, unknown> = { ...aProject({ id: "project-legacy" }) }
  delete legacy.schemaVersion

  await page.goto("/")

  const reopened = await page.evaluate(
    async ({ projectsModule, dbModule, projectDocument }) => {
      const store = (await import(projectsModule)) as typeof ProjectStore
      const db = (await import(dbModule)) as typeof Db

      const database = await db.openCutroomDatabase()
      await database.put("projects", projectDocument as { readonly id: string })

      return store.loadProject("project-legacy")
    },
    { projectsModule: PROJECT_STORE_MODULE, dbModule: DB_MODULE, projectDocument: legacy }
  )

  expect(reopened).toEqual(aProject({ id: "project-legacy" }))
})

test("a Project from a newer schema is refused, in words, and still listed", async ({ page }) => {
  const future = { ...aProject({ id: "project-future" }), schemaVersion: 2 }
  await page.goto("/")

  const outcome = await page.evaluate(
    async ({ projectsModule, dbModule, projectDocument }) => {
      const store = (await import(projectsModule)) as typeof ProjectStore
      const db = (await import(dbModule)) as typeof Db

      const database = await db.openCutroomDatabase()
      await database.put("projects", projectDocument as { readonly id: string })

      let refusal = ""
      try {
        await store.loadProject("project-future")
      } catch (error) {
        refusal = error instanceof Error ? error.message : String(error)
      }

      return { refusal, listed: await store.listProjects() }
    },
    { projectsModule: PROJECT_STORE_MODULE, dbModule: DB_MODULE, projectDocument: future }
  )

  // A person, not a stack trace: which Project, what happened, and why it will not be forced.
  expect(outcome.refusal).toContain("project-future")
  expect(outcome.refusal).toContain("schema version 2")
  expect(outcome.refusal).toContain("newer version of Cutroom")

  // Refusing to open it must not hide it. A Project the user can no longer see is one they will
  // conclude they have lost.
  expect(outcome.listed).toEqual([
    {
      id: "project-future",
      name: "Opening titles",
      createdAt: "2026-08-01T09:00:00.000Z",
      modifiedAt: "2026-08-01T09:30:00.000Z",
      schemaVersion: 2,
      openable: false,
    },
  ])
})

test("the library lists every Project, most recently modified first", async ({ page }) => {
  const projects = [
    aProject({ id: "b", name: "Middle", modifiedAt: "2026-08-01T12:00:00.000Z" }),
    aProject({ id: "c", name: "Newest", modifiedAt: "2026-08-01T15:00:00.000Z" }),
    aProject({ id: "a", name: "Oldest", modifiedAt: "2026-08-01T09:00:00.000Z" }),
  ]
  await page.goto("/")

  const listed = await page.evaluate(
    async ({ specifier, documents }) => {
      const store = (await import(specifier)) as typeof ProjectStore
      for (const projectDocument of documents) await store.saveProject(projectDocument)
      return store.listProjects()
    },
    { specifier: PROJECT_STORE_MODULE, documents: projects }
  )

  expect(listed.map((summary) => summary.name)).toEqual(["Newest", "Middle", "Oldest"])
  expect(listed[0]).toEqual({
    id: "c",
    name: "Newest",
    createdAt: "2026-08-01T09:00:00.000Z",
    modifiedAt: "2026-08-01T15:00:00.000Z",
    schemaVersion: 1,
    openable: true,
  })
})

test("a Project with a timestamp in a different offset still sorts by instant", async ({
  page,
}) => {
  // 09:00+02:00 is 07:00Z — earlier than 08:00Z, and later as text. Sorting the strings would put
  // these the wrong way round, and `parseProject` accepts both spellings.
  const projects = [
    aProject({ id: "utc", name: "Eight hundred UTC", modifiedAt: "2026-08-01T08:00:00.000Z" }),
    aProject({
      id: "cest",
      name: "Nine hundred CEST",
      modifiedAt: "2026-08-01T09:00:00.000+02:00",
    }),
  ]
  await page.goto("/")

  const listed = await page.evaluate(
    async ({ specifier, documents }) => {
      const store = (await import(specifier)) as typeof ProjectStore
      for (const projectDocument of documents) await store.saveProject(projectDocument)
      return store.listProjects()
    },
    { specifier: PROJECT_STORE_MODULE, documents: projects }
  )

  expect(listed.map((summary) => summary.name)).toEqual(["Eight hundred UTC", "Nine hundred CEST"])
})

test("saving is automatic, debounced, and keeps the last edit", async ({ page }) => {
  const first = aProject({ name: "Rough" })
  const second = aProject({ name: "Rough cut", modifiedAt: "2026-08-01T09:31:00.000Z" })
  await page.goto("/")

  const outcome = await page.evaluate(
    async ({ specifier, documents }) => {
      const store = (await import(specifier)) as typeof ProjectStore
      const [early, late] = documents
      const saver = store.createProjectSaver({ delayMs: 250 })

      saver.save(early)
      saver.save(late)
      // Nothing has been asked to save, and nothing has been written yet: the user pressed no
      // button, and the debounce has not elapsed.
      const duringTheQuietPeriod = await store.loadProject(early.id)

      await saver.flush()
      const afterwards = await store.loadProject(early.id)
      saver.close()

      return { duringTheQuietPeriod, storedName: afterwards?.name }
    },
    { specifier: PROJECT_STORE_MODULE, documents: [first, second] }
  )

  expect(outcome.duringTheQuietPeriod).toBeUndefined()
  expect(outcome.storedName).toBe("Rough cut")
})

test("an edit made while a save is in flight is written, not lost", async ({ page }) => {
  const first = aProject({ name: "One" })
  const second = aProject({ name: "Two" })
  await page.goto("/")

  const written = await page.evaluate(
    async ({ specifier, documents }) => {
      const store = (await import(specifier)) as typeof ProjectStore
      const [early, late] = documents

      const order: string[] = []
      let releaseTheFirstWrite = () => {}
      const firstWriteIsHeld = new Promise<void>((resolve) => {
        releaseTheFirstWrite = resolve
      })

      const saver = store.createProjectSaver({
        delayMs: 0,
        write: async (project) => {
          if (order.length === 0) await firstWriteIsHeld
          order.push(project.name)
        },
      })

      const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

      saver.save(early)
      // Let the debounce fire so the first write is genuinely under way, then edit again while it
      // is still open — and let *that* edit's debounce elapse too, before the first write is
      // allowed to finish. That is the lossy window: the second timer fires, finds a write already
      // running, and correctly does nothing, so the only thing that can still write "Two" is the
      // running write looking again when it is done.
      await settle(20)
      saver.save(late)
      await settle(20)
      releaseTheFirstWrite()

      // Deliberately **no** `flush()`. Saving is automatic (FR-020): the second edit has to be
      // written because the saver notices it on its own, not because something asked. A saver that
      // reads its queue before the write instead of after leaves "Two" in hand for ever — and
      // `flush` would paper over exactly that, because it loops until the queue is empty.
      const deadline = Date.now() + 2000
      while (order.length < 2 && Date.now() < deadline) await settle(10)

      saver.close()
      return order
    },
    { specifier: PROJECT_STORE_MODULE, documents: [first, second] }
  )

  expect(written).toEqual(["One", "Two"])
})
