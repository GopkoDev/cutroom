import { expect, test, type Page } from "@playwright/test"

import type { Project } from "@cutroom/model"

import type * as Db from "../src/storage/db"
import type * as ProjectStore from "../src/storage/projects"

import { aStoredProject, DB_MODULE, PROJECT_STORE_MODULE } from "./editor-fixtures"

// The Project list as a screen rather than as a function (FR-020).
//
// `project-store.spec.ts` already proves what `listProjects` returns; what only a browser can show
// is that a user can see it, click it, and end up in the editor with their Timeline — and that a
// Project this build cannot open is still on the screen rather than apparently lost.

/** Puts documents into IndexedDB the way an earlier session would have left them. */
async function seed(page: Page, documents: readonly Project[]): Promise<void> {
  await page.evaluate(
    async ({ specifier, stored }) => {
      const store = (await import(specifier)) as typeof ProjectStore
      for (const projectDocument of stored) await store.saveProject(projectDocument)
    },
    { specifier: PROJECT_STORE_MODULE, stored: documents }
  )
}

test("every Project is listed, most recently modified first, with when it was touched", async ({
  page,
}) => {
  await page.goto("/")
  await seed(page, [
    aStoredProject({ id: "b", name: "Middle", modifiedAt: "2026-08-01T12:00:00.000Z" }),
    aStoredProject({ id: "c", name: "Newest", modifiedAt: "2026-08-01T15:00:00.000Z" }),
    aStoredProject({ id: "a", name: "Oldest", modifiedAt: "2026-08-01T09:00:00.000Z" }),
  ])
  await page.reload()

  await expect(page.getByTestId("project-row-name")).toHaveText(["Newest", "Middle", "Oldest"])
  await expect(page.getByTestId("project-row").first()).toContainText("Last modified")
})

test("a Project opens on click, with its Timeline as it was", async ({ page }) => {
  await page.goto("/")
  await seed(page, [aStoredProject()])
  await page.reload()

  await page.getByTestId("project-row").click()

  await expect(page.getByTestId("editor-shell")).toBeVisible()
  await expect(page.getByTestId("project-name")).toHaveText("Opening titles")
  await expect(page.getByTestId("source-name")).toHaveText(["interview.mp4"])
  await expect(page.getByTestId("timeline-duration")).toContainText("300 Frames")

  // And back again, which is the other half of "this is where the app lands with no Project open".
  await page.getByRole("button", { name: "Projects" }).click()
  await expect(page.getByTestId("project-list")).toBeVisible()
  await expect(page.getByTestId("project-row-name")).toHaveText(["Opening titles"])
})

test("a Project this build cannot open is listed and says why", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(
    async ({ dbModule, stored }) => {
      const db = (await import(dbModule)) as typeof Db
      const database = await db.openCutroomDatabase()
      // Written straight into the store, because `saveProject` would refuse to create a document
      // from a schema this build does not know — which is exactly the situation being tested.
      await database.put("projects", stored as { readonly id: string })
    },
    {
      dbModule: DB_MODULE,
      stored: {
        ...aStoredProject({ id: "project-future", name: "From the future" }),
        schemaVersion: 2,
      },
    }
  )
  await page.reload()

  const row = page.getByTestId("project-row")
  await expect(row).toBeVisible()
  await expect(page.getByTestId("project-row-name")).toHaveText("From the future")
  await expect(row).toBeDisabled()
  // Listed, and honest about it. A Project that vanished would be one the user concludes they have
  // lost, which is both false and unrecoverable-looking.
  await expect(page.getByTestId("project-row-unopenable")).toContainText("newer version of Cutroom")
  await expect(page.getByTestId("project-row-unopenable")).toContainText("schema version 2")
})

test("a Project with nothing usable in its name is shown as untitled, not hidden", async ({
  page,
}) => {
  await page.goto("/")
  await page.evaluate(
    async ({ dbModule, stored }) => {
      const db = (await import(dbModule)) as typeof Db
      const database = await db.openCutroomDatabase()
      await database.put("projects", stored as { readonly id: string })
    },
    { dbModule: DB_MODULE, stored: { ...aStoredProject({ id: "nameless" }), name: 42 } }
  )
  await page.reload()

  await expect(page.getByTestId("project-row-name")).toHaveText("Untitled Project")
})

test("a Project that has gone from storage says so rather than opening an empty editor", async ({
  page,
}) => {
  await page.goto("/")
  await seed(page, [aStoredProject({ id: "vanishing" })])
  await page.reload()
  await expect(page.getByTestId("project-row")).toBeVisible()

  // Deleted behind the list's back — another tab, or storage cleared while this one was open.
  await page.evaluate(async (dbModule) => {
    const db = (await import(dbModule)) as typeof Db
    const database = await db.openCutroomDatabase()
    await database.delete("projects", "vanishing")
  }, DB_MODULE)

  await page.getByTestId("project-row").click()

  await expect(page.getByTestId("open-failure")).toContainText(
    "no longer in this browser's storage"
  )
  await expect(page.getByTestId("editor-shell")).toHaveCount(0)
})
