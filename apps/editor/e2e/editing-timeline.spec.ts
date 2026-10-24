import { expect, test, type Locator, type Page } from "@playwright/test"

import type * as EditorStore from "../src/store"

import type * as ProjectStore from "../src/storage/projects"

import { counterText, readCounter } from "./burned-in-counter"
import { PROJECT_STORE_MODULE, STORE_MODULE } from "./editor-fixtures"
import { installFilePicker } from "./file-picker"
import { importFixture, newProject, parkAt } from "./playback"

// T016 (AC-08 picture rule, AC-14, AC-20, AC-21, AC-22, AC-30): the Timeline as Track rows of
// selectable Clip views with Track headers, driven through the UI in the real browser.

test.describe.configure({ timeout: 60_000 })

const UPPER_CLIP = "clip-upper"

interface Ids {
  readonly sourceId: string
  readonly lowerTrackId: string
  readonly lowerClipId: string
}

/** A Project with one 30 s Source on the lower Track (Frames 0-899). */
async function openWithOneClip(page: Page): Promise<Ids> {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  return page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    const project = store.useEditorStore.getState().project!
    const track = project.timeline.tracks[0]!
    return {
      sourceId: project.sources[0]!.id,
      lowerTrackId: track.id,
      lowerClipId: track.clips[0]!.id,
    }
  }, STORE_MODULE)
}

/** Puts a 60-Frame Clip at `startFrame` on the upper Track, reading the Source from 10 s. */
async function addUpperClip(page: Page, ids: Ids, id = UPPER_CLIP, startFrame = 0): Promise<void> {
  await page.evaluate(
    async ({ specifier, sourceId, clipId, start }) => {
      const store = (await import(specifier)) as typeof EditorStore
      const state = store.useEditorStore.getState()
      const upper = state.project!.timeline.tracks[1]!
      state.run({
        type: "add-clip",
        at: new Date().toISOString(),
        trackId: upper.id,
        clip: {
          id: clipId,
          sourceId,
          startFrame: start,
          durationFrames: 60,
          sourceInPoint: { numerator: 10, denominator: 1 },
        },
      })
    },
    { specifier: STORE_MODULE, sourceId: ids.sourceId, clipId: id, start: startFrame }
  )
}

async function pastLabels(page: Page): Promise<string[]> {
  return page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    return store.useEditorStore.getState().past.map((entry) => entry.label)
  }, STORE_MODULE)
}

async function storedModifiedAt(page: Page): Promise<string | undefined> {
  return page.evaluate(
    async ({ store: storeSpecifier, projects: projectsSpecifier }) => {
      const store = (await import(storeSpecifier)) as typeof EditorStore
      const projects = (await import(projectsSpecifier)) as typeof ProjectStore
      const id = store.useEditorStore.getState().project!.id
      return (await projects.loadProject(id))?.modifiedAt
    },
    { store: STORE_MODULE, projects: PROJECT_STORE_MODULE }
  )
}

function clipById(page: Page, id: string): Locator {
  return page.locator(`[data-testid=timeline-clip][data-clip-id="${id}"]`)
}

async function expectSelected(page: Page, selected: readonly string[], all: readonly string[]) {
  for (const id of all) {
    const clip = clipById(page, id)
    if (selected.includes(id)) {
      await expect(clip).toHaveAttribute("data-selected", "true", { timeout: 5_000 })
      await expect(clip).toHaveAttribute("aria-selected", "true")
    } else {
      await expect(clip).not.toHaveAttribute("data-selected", "true", { timeout: 5_000 })
      await expect(clip).not.toHaveAttribute("aria-selected", "true")
    }
  }
}

async function expectCounter(page: Page, expected: number): Promise<void> {
  const reading = await readCounter(page)
  expect(reading.text, `counter read with a weakest margin of ${reading.margin}`).toBe(
    counterText(expected)
  )
}

async function addTrack(page: Page): Promise<void> {
  await page.getByTestId("track-add").click({ timeout: 5_000 })
}

// ---------------------------------------------------------------- the tests

test("AC-20: Add Track puts an empty upper Track above, and its Clips cover the lower picture", async ({
  page,
}) => {
  const ids = await openWithOneClip(page)
  await expect(page.getByTestId("timeline-track")).toHaveCount(1, { timeout: 5_000 })
  await expect(page.getByTestId("track-header")).toHaveCount(1)

  await addTrack(page)
  const tracks = page.getByTestId("timeline-track")
  await expect(tracks).toHaveCount(2)
  // The upper Track is first in DOM order and empty; the Clip stays on the lower one.
  await expect(tracks.nth(0).getByTestId("timeline-clip")).toHaveCount(0)
  await expect(tracks.nth(1).getByTestId("timeline-clip")).toHaveCount(1)
  await expect(tracks.nth(1).getByTestId("timeline-clip")).toHaveAttribute(
    "data-clip-id",
    ids.lowerClipId
  )
  await expect(page.getByTestId("track-header").nth(0)).toContainText("Video 2")

  await addUpperClip(page, ids)
  await expect(tracks.nth(0).getByTestId("timeline-clip")).toHaveCount(1)

  // Under the upper Clip: its Source Frame (10 s x 30 fps + 30) covers the lower Track.
  await parkAt(page, 30)
  await expectCounter(page, 330)
  // A Gap on the upper Track: the lower Track shows through.
  await parkAt(page, 90)
  await expectCounter(page, 90)
})

test("AC-30: a third Track is refused with the limit wording", async ({ page }) => {
  await openWithOneClip(page)
  await addTrack(page)
  await expect(page.getByTestId("timeline-track")).toHaveCount(2)

  await addTrack(page)
  const refusal = page.getByTestId("edit-refusal")
  await expect(refusal).toBeVisible({ timeout: 5_000 })
  await expect(refusal).toHaveAttribute("data-reason", "track-limit")
  await expect(page.getByTestId("edit-refusal-title")).toHaveText(
    "A Project has at most two video Tracks for now."
  )
  await expect(page.getByTestId("timeline-track")).toHaveCount(2)
})

test("AC-21: removing the upper Track takes its Clips, and one undo restores them", async ({
  page,
}) => {
  const ids = await openWithOneClip(page)
  await addTrack(page)
  await expect(page.getByTestId("timeline-track")).toHaveCount(2)
  await addUpperClip(page, ids)
  await expect(clipById(page, UPPER_CLIP)).toHaveCount(1)

  await page
    .getByTestId("track-header")
    .nth(0)
    .getByTestId("track-remove")
    .click({ timeout: 5_000 })
  await expect(page.getByTestId("timeline-track")).toHaveCount(1)
  await expect(clipById(page, UPPER_CLIP)).toHaveCount(0)

  await page.getByTestId("undo").click()
  await expect(page.getByTestId("timeline-track")).toHaveCount(2)
  await expect(page.getByTestId("timeline-track").nth(0).getByTestId("timeline-clip")).toHaveCount(
    1
  )
  await expect(clipById(page, UPPER_CLIP)).toHaveCount(1)
  await expect(clipById(page, ids.lowerClipId)).toHaveCount(1)
})

test("AC-22: the last Track cannot be removed, and the notice can be dismissed", async ({
  page,
}) => {
  await openWithOneClip(page)
  await expect(page.getByTestId("track-header")).toHaveCount(1, { timeout: 5_000 })

  await page.getByTestId("track-remove").click({ timeout: 5_000 })
  const refusal = page.getByTestId("edit-refusal")
  await expect(refusal).toBeVisible({ timeout: 5_000 })
  await expect(refusal).toHaveAttribute("data-reason", "last-track")
  await expect(page.getByTestId("edit-refusal-title")).toHaveText(
    "A Project always keeps at least one Track."
  )
  await expect(page.getByTestId("timeline-track")).toHaveCount(1)

  await page.getByTestId("edit-refusal-dismiss").click()
  await expect(refusal).toHaveCount(0)
})

test("AC-14: clicking, modifier-clicking and clearing mark Clips and are no undo step or save", async ({
  page,
}) => {
  const ids = await openWithOneClip(page)
  await addTrack(page)
  await expect(page.getByTestId("timeline-track")).toHaveCount(2)
  await addUpperClip(page, ids)
  await expect(clipById(page, UPPER_CLIP)).toHaveCount(1)

  const all = [ids.lowerClipId, UPPER_CLIP]
  const lower = clipById(page, ids.lowerClipId)
  const upper = clipById(page, UPPER_CLIP)

  // Let the edits so far reach storage, then watch that nothing below changes either record.
  await page.waitForTimeout(1_500)
  const labelsBefore = await pastLabels(page)
  const modifiedBefore = await storedModifiedAt(page)
  expect(modifiedBefore).toBeDefined()

  await expectSelected(page, [], all)

  await lower.click({ timeout: 5_000 })
  await expectSelected(page, [ids.lowerClipId], all)

  await upper.click({ modifiers: ["Shift"] })
  await expectSelected(page, all, all)

  await lower.click({ modifiers: ["Meta"] })
  await expectSelected(page, [UPPER_CLIP], all)

  await upper.click()
  await expectSelected(page, [UPPER_CLIP], all)

  // A click on an empty part of a Track (the upper Track past its Clip) clears the Selection.
  const track = page.getByTestId("timeline-track").nth(0)
  const box = (await track.boundingBox())!
  await track.click({ position: { x: box.width - 20, y: box.height / 2 } })
  await expectSelected(page, [], all)

  await page.waitForTimeout(1_500) // past the saver's debounce
  expect(await pastLabels(page)).toEqual(labelsBefore)
  expect(await storedModifiedAt(page)).toBe(modifiedBefore)
})
