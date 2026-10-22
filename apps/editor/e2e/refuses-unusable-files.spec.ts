import { expect, test, type Page } from "@playwright/test"

import type * as EditorStore from "../src/store"
import type * as Projects from "../src/storage/projects"

import { PROJECT_STORE_MODULE, STORE_MODULE } from "./editor-fixtures"
import { installFilePicker, type Fixture, type FilePicker } from "./file-picker"

// T054 — the three refusals the spec names (FR-003, edge case "audio-only, or an image"), each
// picked through the Sources panel's own button, into the two editors a refusal can meet: one with
// no Project yet, where a refusal must not bring a Project into being, and one with a Project and a
// Clip, where it must leave every byte of that Project as it was.
//
// "As it was" is asserted three ways, because each would miss what the others catch: the document
// in the store, compared whole (a stray `modifiedAt` or an extra Source fails it); the undo history
// (a refusal that left an empty step behind fails it); and the screen — Sources panel, Timeline and
// Project name — which is what the user actually checks.

interface Refusal {
  readonly fixture: Fixture
  /** What the reason must say was wrong — the engine's wording (T040). */
  readonly says: RegExp
}

const REFUSALS: readonly Refusal[] = [
  {
    fixture: "broken.mp4",
    says: /describes no tracks at all, so it is probably damaged or incomplete/,
  },
  {
    fixture: "audio-only.m4a",
    says: /has no video track — it contains only sound \(mp4a\.40\.2\)/,
  },
  { fixture: "still.png", says: /is an image \(image\/png\)/ },
]

/** The usable file the "existing Project" case is built from: 30 s at 30/1, so 900 Frames. */
const USABLE: Fixture = "sync-1080p30.mp4"
const USABLE_FRAMES = 900

/** Everything a refusal must not touch, read out of the running store in one round trip. */
interface Before {
  readonly projectJson: string
  readonly past: readonly string[]
  readonly future: readonly string[]
  readonly openTransaction: string | null
  readonly sourceStatus: Record<string, string>
}

async function capture(page: Page): Promise<Before> {
  return page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    const state = store.useEditorStore.getState()
    return {
      projectJson: JSON.stringify(state.project),
      past: state.past.map((entry) => entry.label),
      future: state.future.map((entry) => entry.label),
      openTransaction: state.openTransaction,
      sourceStatus: { ...state.sourceStatus },
    }
  }, STORE_MODULE)
}

/** How many Projects are in storage, and how many Sources the first of them names. */
async function stored(page: Page): Promise<{ projects: number; sources: number }> {
  return page.evaluate(async (specifier) => {
    const projects = (await import(specifier)) as typeof Projects
    const all = await projects.listProjects()
    const first = all[0] === undefined ? undefined : await projects.loadProject(all[0].id)
    return { projects: all.length, sources: first?.sources.length ?? 0 }
  }, PROJECT_STORE_MODULE)
}

async function newProject(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("import-source")).toBeEnabled()
}

/** Picks `fixture` through the panel and waits for the refusal to be on screen. */
async function pickAndExpectRefusal(page: Page, picker: FilePicker, refusal: Refusal) {
  await picker.queue(refusal.fixture)
  await page.getByTestId("import-source").click()
  const shown = page.getByTestId("import-refusal")
  await expect(shown).toBeVisible({ timeout: 20_000 })
  // It says the file cannot be used, names the file, and says what was wrong with it.
  await expect(shown).toContainText(`${refusal.fixture} cannot be used.`)
  await expect(shown).toContainText(refusal.says)
  // And the panel is back to accepting a pick, not stuck reading.
  await expect(page.getByTestId("import-pending")).toHaveCount(0)
  await expect(page.getByTestId("import-source")).toBeEnabled()
}

for (const refusal of REFUSALS) {
  test(`${refusal.fixture} into an empty editor is refused and no Project comes into being`, async ({
    page,
  }) => {
    const picker = await installFilePicker(page)
    await newProject(page)
    const before = await capture(page)
    expect(before.projectJson).toBe("null")

    await pickAndExpectRefusal(page, picker, refusal)

    expect(await capture(page)).toEqual(before)
    await expect(page.getByTestId("source-row")).toHaveCount(0)
    await expect(page.getByTestId("timeline-clip")).toHaveCount(0)
    await expect(page.getByTestId("project-name")).toHaveText("New Project")
    await expect(page.getByTestId("undo")).toBeDisabled()
    // Longer than the saver's debounce, so a write it had been asked for would have landed.
    await page.waitForTimeout(800)
    expect(await stored(page)).toEqual({ projects: 0, sources: 0 })

    // The refusal is an answer, not a broken engine: the next usable file still imports.
    await picker.queue(USABLE)
    await page.getByTestId("import-source").click()
    await expect(page.getByTestId("source-row")).toHaveCount(1, { timeout: 20_000 })
    await expect(page.getByTestId("import-refusal")).toHaveCount(0)
    await expect(page.getByTestId("timeline-clip")).toHaveAttribute(
      "data-duration-frames",
      String(USABLE_FRAMES)
    )
  })

  test(`${refusal.fixture} into a Project with a Clip is refused and the Project is untouched`, async ({
    page,
  }) => {
    const picker = await installFilePicker(page)
    await newProject(page)
    await picker.queue(USABLE)
    await page.getByTestId("import-source").click()
    await expect(page.getByTestId("source-row")).toHaveCount(1, { timeout: 20_000 })
    await expect(page.getByTestId("source-status")).toHaveText("Linked")
    await expect.poll(() => stored(page)).toEqual({ projects: 1, sources: 1 })

    const before = await capture(page)
    const clip = page.getByTestId("timeline-clip")
    const timelineBefore = await page.getByTestId("timeline-duration").textContent()

    await pickAndExpectRefusal(page, picker, refusal)

    expect(await capture(page)).toEqual(before)
    const rows = page.getByTestId("source-row")
    await expect(rows).toHaveCount(1)
    await expect(rows.getByTestId("source-name")).toHaveText(USABLE)
    await expect(rows.getByTestId("source-status")).toHaveText("Linked")
    await expect(clip).toHaveCount(1)
    await expect(clip).toHaveAttribute("data-start-frame", "0")
    await expect(clip).toHaveAttribute("data-duration-frames", String(USABLE_FRAMES))
    await expect(page.getByTestId("timeline-duration")).toHaveText(timelineBefore ?? "")
    await expect(page.getByTestId("project-name")).toHaveText("sync-1080p30")
    await page.waitForTimeout(800)
    expect(await stored(page)).toEqual({ projects: 1, sources: 1 })

    // The one undo step there is is still the import, so undo takes back that and nothing else.
    await page.getByTestId("undo").click()
    await expect(page.getByTestId("source-row")).toHaveCount(0)
    await expect(page.getByTestId("timeline-clip")).toHaveCount(0)
    await expect(page.getByTestId("undo")).toBeDisabled()
  })
}
