import { expect, test, type Locator, type Page } from "@playwright/test"

import type * as EditorStore from "../src/store"

import { counterText, readCounter } from "./burned-in-counter"
import { STORE_MODULE } from "./editor-fixtures"
import { installFilePicker, type FilePicker } from "./file-picker"
import { importFixture, newProject, parkAt } from "./playback"

// T018 (AC-04, AC-05, AC-10, AC-11, AC-12, AC-13, AC-16, AC-18, AC-24, AC-28, AC-29): the edit
// toolbar, named Undo and Redo, keyboard shortcuts and the Place action, in the real browser.

test.describe.configure({ timeout: 90_000 })

const WAIT = { timeout: 5_000 }

interface Ids {
  readonly sourceId: string
  readonly lowerTrackId: string
  readonly lowerClipId: string
}

/** A Clip to lay out: Timeline position, length, and the Source Frame its first Frame shows. */
interface ClipSpec {
  readonly id: string
  readonly start: number
  readonly duration: number
  readonly inFrames: number
  readonly track?: "lower" | "upper"
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

async function openWithOneClip(page: Page): Promise<{ ids: Ids; picker: FilePicker }> {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  const ids = await page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    const project = store.useEditorStore.getState().project!
    const track = project.timeline.tracks[0]!
    return {
      sourceId: project.sources[0]!.id,
      lowerTrackId: track.id,
      lowerClipId: track.clips[0]!.id,
    }
  }, STORE_MODULE)
  return { ids, picker }
}

/** Replaces the imported Clip by exactly `specs` (on the lower Track unless they say upper). */
async function layout(page: Page, ids: Ids, specs: readonly ClipSpec[]): Promise<void> {
  const wire = specs.map((spec) => {
    const divisor = gcd(spec.inFrames, 30) || 1
    return {
      id: spec.id,
      start: spec.start,
      duration: spec.duration,
      numerator: spec.inFrames / divisor,
      denominator: 30 / divisor,
      upper: spec.track === "upper",
    }
  })
  await page.evaluate(
    async ({ specifier, sourceId, original, clips }) => {
      const store = (await import(specifier)) as typeof EditorStore
      const state = store.useEditorStore.getState()
      state.run({
        type: "delete-clips",
        at: new Date().toISOString(),
        clipIds: [original],
        ripple: false,
      })
      for (const clip of clips) {
        const tracks = store.useEditorStore.getState().project!.timeline.tracks
        const track = clip.upper ? tracks[1]! : tracks[0]!
        store.useEditorStore.getState().run({
          type: "add-clip",
          at: new Date().toISOString(),
          trackId: track.id,
          clip: {
            id: clip.id,
            sourceId,
            startFrame: clip.start,
            durationFrames: clip.duration,
            sourceInPoint: { numerator: clip.numerator, denominator: clip.denominator },
          },
        })
      }
    },
    { specifier: STORE_MODULE, sourceId: ids.sourceId, original: ids.lowerClipId, clips: wire }
  )
  await expect(page.getByTestId("timeline-clip")).toHaveCount(specs.length, WAIT)
}

async function addTrack(page: Page): Promise<void> {
  await page.getByTestId("track-add").click(WAIT)
  await expect(page.getByTestId("timeline-track")).toHaveCount(2, WAIT)
}

function clipById(page: Page, id: string): Locator {
  return page.locator(`[data-testid=timeline-clip][data-clip-id="${id}"]`)
}

function ghostOf(page: Page, id: string): Locator {
  return page.locator(`[data-testid=clip-ghost][data-clip-id="${id}"]`)
}

async function expectClip(page: Page, id: string, start: number, duration: number): Promise<void> {
  const clip = clipById(page, id)
  await expect(clip).toHaveAttribute("data-start-frame", String(start), WAIT)
  await expect(clip).toHaveAttribute("data-duration-frames", String(duration), WAIT)
}

async function pastLabels(page: Page): Promise<string[]> {
  return page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    return store.useEditorStore.getState().past.map((entry) => entry.label)
  }, STORE_MODULE)
}

async function expectCounter(page: Page, expected: number): Promise<void> {
  const reading = await readCounter(page)
  expect(reading.text, `counter read with a weakest margin of ${reading.margin}`).toBe(
    counterText(expected)
  )
}

// ---------------------------------------------------------------- driving the mouse

interface Point {
  readonly x: number
  readonly y: number
}

/** Pixels per Frame, as the task defines it, from the Timeline body as it is right now. */
async function pxPerFrame(page: Page): Promise<number> {
  const body = page.getByTestId("timeline-body")
  const box = (await body.boundingBox())!
  return box.width / (Number(await body.getAttribute("aria-valuemax")) + 1)
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Presses at `from` and moves by `frames` Frames (and `dy` pixels), leaving the button down. */
async function dragBy(
  page: Page,
  from: Point,
  frames: number,
  scale: number,
  dy = 0
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + frames * scale, from.y + dy, { steps: 12 })
}

/** Drags a Clip's body by `frames` Frames and keeps the button down. */
async function holdMove(page: Page, id: string, frames: number, dy = 0): Promise<void> {
  const scale = await pxPerFrame(page)
  await dragBy(page, await centerOf(clipById(page, id)), frames, scale, dy)
}

/** Drags one end of a Clip by `frames` Frames and keeps the button down. */
async function holdTrim(
  page: Page,
  id: string,
  edge: "head" | "tail",
  frames: number
): Promise<void> {
  const scale = await pxPerFrame(page)
  const handle = clipById(page, id).getByTestId(`clip-${edge}-handle`)
  await dragBy(page, await centerOf(handle), frames, scale)
}

async function drag(page: Page, id: string, frames: number, dy = 0): Promise<void> {
  await holdMove(page, id, frames, dy)
  await page.mouse.up()
}

async function trim(page: Page, id: string, edge: "head" | "tail", frames: number): Promise<void> {
  await holdTrim(page, id, edge, frames)
  await page.mouse.up()
}

interface ClipRow {
  readonly id: string
  readonly track: number
  readonly start: number
  readonly duration: number
  readonly selected: boolean
}

/** Every Clip on screen, by Track (DOM order) then start. */
async function clipRows(page: Page): Promise<ClipRow[]> {
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-testid=timeline-clip]")].map((el) => ({
      id: el.dataset.clipId!,
      track: [...document.querySelectorAll("[data-testid=timeline-track]")].indexOf(
        el.closest("[data-testid=timeline-track]")!
      ),
      start: Number(el.dataset.startFrame),
      duration: Number(el.dataset.durationFrames),
      selected: el.dataset.selected === "true",
    }))
  )
  return rows.sort((a, b) => a.track - b.track || a.start - b.start)
}

/** `[start, duration]` pairs of one Track's Clips (DOM Track index). */
async function spans(page: Page, track: number): Promise<number[][]> {
  return (await clipRows(page)).filter((r) => r.track === track).map((r) => [r.start, r.duration])
}

async function expectSpans(page: Page, track: number, expected: number[][]): Promise<void> {
  await expect.poll(() => spans(page, track), WAIT).toEqual(expected)
}

/** The Source in-point of each Clip, by id, as stored. */
async function inPoints(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    const out: Record<string, number> = {}
    for (const track of store.useEditorStore.getState().project!.timeline.tracks)
      for (const clip of track.clips)
        out[clip.id] = clip.sourceInPoint.numerator / clip.sourceInPoint.denominator
    return out
  }, STORE_MODULE)
}

async function readIds(page: Page): Promise<Ids> {
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

/** Presses a key with focus on the page body, not on a button left focused by an earlier click. */
async function press(page: Page, key: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press(key)
}

async function select(page: Page, ...ids: string[]): Promise<void> {
  await clipById(page, ids[0]!).click(WAIT)
  for (const id of ids.slice(1)) await clipById(page, id).click({ modifiers: ["Shift"] })
  for (const id of ids)
    await expect(clipById(page, id)).toHaveAttribute("data-selected", "true", WAIT)
}

async function expectUndo(page: Page, text: string): Promise<void> {
  await expect(page.getByTestId("undo")).toHaveText(text, WAIT)
}
async function expectRedo(page: Page, text: string): Promise<void> {
  await expect(page.getByTestId("redo")).toHaveText(text, WAIT)
}

async function expectRefusal(page: Page, reason: string): Promise<void> {
  const refusal = page.getByTestId("edit-refusal")
  await expect(refusal).toBeVisible(WAIT)
  await expect(refusal).toHaveAttribute("data-reason", reason)
}

async function reopen(page: Page): Promise<void> {
  await page.reload()
  await page.getByTestId("project-row").click(WAIT)
  await expect(page.getByTestId("editor-shell")).toBeVisible()
  await expect(page.getByTestId("timeline-track").first()).toBeVisible({ timeout: 20_000 })
}

const modifier = "Meta"

// ---------------------------------------------------------------- the tests

test("AC-04: S splits the selected Clip at the Playhead; the cut loses and repeats no Frame", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [{ id: "x", start: 200, duration: 300, inFrames: 100 }])
  await select(page, "x")
  await parkAt(page, 350)

  await press(page, "s")
  await expectSpans(page, 0, [
    [200, 150],
    [350, 150],
  ])
  const rows = await clipRows(page)
  expect(rows.map((r) => r.selected)).toEqual([false, true])
  await expectUndo(page, "Undo Split")

  // Source Frames 100 + 149 and 100 + 150 are consecutive across the new Edit point.
  await parkAt(page, 349)
  await expectCounter(page, 249)
  await parkAt(page, 350)
  await expectCounter(page, 250)
  // The second half starts 150 Frames (5 s) further into the Source than the first.
  const [first, second] = await clipRows(page)
  const points = await inPoints(page)
  expect(points[first!.id]).toBeCloseTo(100 / 30, 6)
  expect(points[second!.id]).toBeCloseTo(250 / 30, 6)
})

test("AC-05: Split with nothing under the Playhead is refused and records no step", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "x", start: 200, duration: 300, inFrames: 100 },
    { id: "y", start: 600, duration: 100, inFrames: 0 },
  ])
  const labels = await pastLabels(page)
  await select(page, "y")

  // Selected Clip y, Playhead inside x only.
  await parkAt(page, 300)
  await press(page, "s")
  await expectRefusal(page, "selection-not-under-frame")
  await expectSpans(page, 0, [
    [200, 300],
    [600, 100],
  ])

  // On the first Frame of the selected Clip is not strictly inside.
  await parkAt(page, 600)
  await press(page, "s")
  await expectRefusal(page, "selection-not-under-frame")

  // No Selection, Playhead in a Gap.
  await press(page, "Escape")
  await expect(page.getByTestId("edit-refusal")).toHaveCount(0, WAIT)
  await expect(page.locator("[data-testid=timeline-clip][data-selected=true]")).toHaveCount(0)
  await parkAt(page, 550)
  await press(page, "s")
  await expectRefusal(page, "nothing-under-frame")
  await page.getByTestId("edit-split").click(WAIT)
  await expectRefusal(page, "nothing-under-frame")

  await expectSpans(page, 0, [
    [200, 300],
    [600, 100],
  ])
  expect(await pastLabels(page)).toEqual(labels)
})

test("AC-29: with no Selection, Split cuts the Clips under the Playhead on both Tracks in one step", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await addTrack(page)
  await layout(page, ids, [
    { id: "l", start: 100, duration: 400, inFrames: 0 },
    { id: "u", start: 200, duration: 300, inFrames: 300, track: "upper" },
  ])
  await press(page, "Escape")
  await expect(page.locator("[data-testid=timeline-clip][data-selected=true]")).toHaveCount(0)
  await parkAt(page, 300)

  await page.getByTestId("edit-split").click(WAIT)
  await expectSpans(page, 0, [
    [200, 100],
    [300, 200],
  ])
  await expectSpans(page, 1, [
    [100, 200],
    [300, 200],
  ])
  const rows = await clipRows(page)
  expect(rows.filter((r) => r.selected).map((r) => [r.track, r.start])).toEqual([
    [0, 300],
    [1, 300],
  ])

  await press(page, `${modifier}+z`)
  await expectSpans(page, 0, [[200, 300]])
  await expectSpans(page, 1, [[100, 400]])
})

test("AC-10: Delete and Backspace remove the selected Clip and leave a Gap", async ({ page }) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "b", start: 250, duration: 100, inFrames: 200 },
    { id: "c", start: 400, duration: 60, inFrames: 400 },
  ])

  await select(page, "b")
  await press(page, "Delete")
  await expectSpans(page, 0, [
    [100, 100],
    [400, 60],
  ])
  await expectUndo(page, "Undo Delete")

  await press(page, `${modifier}+z`)
  await expectSpans(page, 0, [
    [100, 100],
    [250, 100],
    [400, 60],
  ])
  await select(page, "b")
  await press(page, "Backspace")
  await expectSpans(page, 0, [
    [100, 100],
    [400, 60],
  ])
  await expectUndo(page, "Undo Delete")
  // Nothing is shown in the Gap: the Preview reports no Clip there.
  await parkAt(page, 300)
  await expect(page.getByTestId("preview-shown")).toContainText("showing Frame 300 of")
})

test("AC-11: Ripple delete closes the Gap on its own Track only, in one step", async ({ page }) => {
  const { ids } = await openWithOneClip(page)
  await addTrack(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "b", start: 250, duration: 100, inFrames: 200 },
    { id: "c", start: 400, duration: 60, inFrames: 400 },
    { id: "d", start: 500, duration: 50, inFrames: 500 },
    { id: "u", start: 300, duration: 100, inFrames: 300, track: "upper" },
  ])
  const lowerBefore = [
    [100, 100],
    [250, 100],
    [400, 60],
    [500, 50],
  ]

  await select(page, "b")
  await press(page, "Shift+Delete")
  await expectSpans(page, 1, [
    [100, 100],
    [300, 60],
    [400, 50],
  ])
  await expectSpans(page, 0, [[300, 100]])
  await expectUndo(page, "Undo Ripple delete")
  await press(page, `${modifier}+z`)
  await expectSpans(page, 1, lowerBefore)
  await expectSpans(page, 0, [[300, 100]])

  // The toolbar button does the same.
  await select(page, "b")
  await page.getByTestId("edit-ripple-delete").click(WAIT)
  await expectSpans(page, 1, [
    [100, 100],
    [300, 60],
    [400, 50],
  ])
  await expectSpans(page, 0, [[300, 100]])
  await page.getByTestId("undo").click()
  await expectSpans(page, 1, lowerBefore)
})

test("AC-12: Duplicate puts the copy directly after the original and selects it", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "b", start: 400, duration: 100, inFrames: 200 },
  ])
  await select(page, "a")
  await press(page, `${modifier}+d`)
  await expectSpans(page, 0, [
    [100, 100],
    [200, 100],
    [400, 100],
  ])
  const rows = await clipRows(page)
  expect(rows.map((r) => r.selected)).toEqual([false, true, false])
  const points = await inPoints(page)
  expect(points[rows[1]!.id]).toBeCloseTo(points.a!, 6)
  await expectUndo(page, "Undo Duplicate")

  await page.getByTestId("undo").click()
  await expectSpans(page, 0, [
    [100, 100],
    [400, 100],
  ])
  await select(page, "a")
  await page.getByTestId("edit-duplicate").click(WAIT)
  await expectSpans(page, 0, [
    [100, 100],
    [200, 100],
    [400, 100],
  ])
})

test("AC-13: with no room after the Clip the copy goes after the Track's last Clip", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "b", start: 250, duration: 100, inFrames: 200 },
    { id: "c", start: 500, duration: 60, inFrames: 400 },
  ])
  await select(page, "a")
  await press(page, `${modifier}+d`)
  await expectSpans(page, 0, [
    [100, 100],
    [250, 100],
    [500, 60],
    [560, 100],
  ])
  const rows = await clipRows(page)
  expect(rows.map((r) => r.selected)).toEqual([false, false, false, true])

  await page.getByTestId("undo").click()
  await select(page, "a")
  await page.getByTestId("edit-duplicate").click(WAIT)
  await expectSpans(page, 0, [
    [100, 100],
    [250, 100],
    [500, 60],
    [560, 100],
  ])
})

test("AC-16: three undos take back Ripple delete, Move, Trim in turn and three redos return them", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "x", start: 200, duration: 300, inFrames: 100 },
    { id: "y", start: 600, duration: 100, inFrames: 0 },
    { id: "z", start: 800, duration: 50, inFrames: 600 },
  ])
  // The layout is test setup made of commands, so it left history of its own; start this test's
  // history empty, so that three undos are all there is to undo.
  await page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    store.useEditorStore.setState({ past: [], future: [] })
  }, STORE_MODULE)
  const start = await spans(page, 0)

  await trim(page, "x", "tail", -30)
  await expectClip(page, "x", 200, 270)
  await drag(page, "y", 40)
  await expectClip(page, "y", 640, 100)
  await expect(clipById(page, "y")).toHaveAttribute("data-selected", "true", WAIT)
  await press(page, "Shift+Delete")
  await expectSpans(page, 0, [
    [200, 270],
    [700, 50],
  ])

  await expectUndo(page, "Undo Ripple delete")
  await press(page, `${modifier}+z`)
  await expectSpans(page, 0, [
    [200, 270],
    [640, 100],
    [800, 50],
  ])
  await expectRedo(page, "Redo Ripple delete")
  await expectUndo(page, "Undo Move")
  await press(page, `${modifier}+z`)
  await expectSpans(page, 0, [
    [200, 270],
    [600, 100],
    [800, 50],
  ])
  await expectRedo(page, "Redo Move")
  await expectUndo(page, "Undo Trim")
  await press(page, `${modifier}+z`)
  await expectSpans(page, 0, start)
  await expectRedo(page, "Redo Trim")
  await expect(page.getByTestId("undo")).toBeDisabled()

  await press(page, `Shift+${modifier}+z`)
  await expectClip(page, "x", 200, 270)
  await expectRedo(page, "Redo Move")
  await press(page, `Shift+${modifier}+z`)
  await expectClip(page, "y", 640, 100)
  await expectRedo(page, "Redo Ripple delete")
  await press(page, `Shift+${modifier}+z`)
  await expectSpans(page, 0, [
    [200, 270],
    [700, 50],
  ])
  await expect(page.getByTestId("redo")).toBeDisabled()

  // By button.
  await expectUndo(page, "Undo Ripple delete")
  await page.getByTestId("undo").click()
  await expectSpans(page, 0, [
    [200, 270],
    [640, 100],
    [800, 50],
  ])
  await expectRedo(page, "Redo Ripple delete")
  await page.getByTestId("redo").click()
  await expectSpans(page, 0, [
    [200, 270],
    [700, 50],
  ])
})

test("AC-18: undo is unavailable with nothing to undo and while a drag is open", async ({
  page,
}) => {
  await openWithOneClip(page)
  await page.waitForTimeout(1_500)
  await reopen(page)
  const ids = await readIds(page)

  const undo = page.getByTestId("undo")
  const redo = page.getByTestId("redo")
  await expect(undo).toBeDisabled(WAIT)
  await expect(undo).toHaveAttribute("title", "Nothing to undo")
  await expect(undo).toHaveText("Undo")
  await expect(redo).toBeDisabled()
  await expect(redo).toHaveAttribute("title", "Nothing to redo")
  await expect(redo).toHaveText("Redo")
  const before = await spans(page, 0)
  await press(page, `${modifier}+z`)
  await press(page, `Shift+${modifier}+z`)
  expect(await spans(page, 0)).toEqual(before)
  expect(await pastLabels(page)).toEqual([])

  await layout(page, ids, [{ id: "x", start: 200, duration: 300, inFrames: 100 }])
  await expect(undo).toBeEnabled(WAIT)
  const labels = await pastLabels(page)

  await holdMove(page, "x", 50)
  await expect(ghostOf(page, "x")).toHaveAttribute("data-drop", "ok", WAIT)
  await expect(undo).toBeDisabled()
  await expect(undo).toHaveAttribute("title", "Finish the drag first")
  await press(page, `${modifier}+z`)
  expect(await pastLabels(page)).toEqual(labels)
  await expectClip(page, "x", 200, 300)
  await page.mouse.up()
  await expectClip(page, "x", 250, 300)
  await expectUndo(page, "Undo Move")
})

test("AC-24: Place adds the whole Source after the last Clip on the bottom Track, selected", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "a", start: 400, duration: 50, inFrames: 0 },
    { id: "b", start: 100, duration: 100, inFrames: 200 },
  ])
  await select(page, "b")
  await press(page, "Delete")
  await expectSpans(page, 0, [[400, 50]])
  await select(page, "a")
  await press(page, "Delete")
  await expectSpans(page, 0, [])
  await expect(page.getByTestId("edit-split")).toBeDisabled()

  await page.getByTestId("source-row").first().getByTestId("source-place").click(WAIT)
  await expectSpans(page, 0, [[0, 900]])
  expect((await clipRows(page)).map((r) => r.selected)).toEqual([true])
  await expectUndo(page, "Undo Place")
})

test("AC-28: after a reload the Timeline is as left and both history controls are unavailable", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "x", start: 200, duration: 300, inFrames: 100 },
    { id: "y", start: 600, duration: 100, inFrames: 0 },
  ])
  await select(page, "x")
  await parkAt(page, 300)
  await press(page, "s")
  await expectSpans(page, 0, [
    [200, 100],
    [300, 200],
    [600, 100],
  ])
  await select(page, "y")
  await press(page, "Delete")
  await expectSpans(page, 0, [
    [200, 100],
    [300, 200],
  ])
  await expectUndo(page, "Undo Delete")

  await expect
    .poll(
      async () =>
        page.evaluate(async (specifier) => {
          const store = (await import(specifier)) as typeof EditorStore
          return store.useEditorStore.getState().project!.timeline.tracks[0]!.clips.length
        }, STORE_MODULE),
      WAIT
    )
    .toBe(2)
  await page.waitForTimeout(2_000)

  await reopen(page)
  await expectSpans(page, 0, [
    [200, 100],
    [300, 200],
  ])
  await expect(page.getByTestId("undo")).toBeDisabled()
  await expect(page.getByTestId("redo")).toBeDisabled()
  await expect(page.getByTestId("undo")).toHaveAttribute("title", "Nothing to undo")
})

test("Meta+A selects every Clip and Escape clears the Selection", async ({ page }) => {
  const { ids } = await openWithOneClip(page)
  await addTrack(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "b", start: 300, duration: 100, inFrames: 200 },
    { id: "u", start: 150, duration: 100, inFrames: 300, track: "upper" },
  ])
  await press(page, `${modifier}+a`)
  await expect(page.locator("[data-testid=timeline-clip][data-selected=true]")).toHaveCount(3, WAIT)
  await press(page, "Escape")
  await expect(page.locator("[data-testid=timeline-clip][data-selected=true]")).toHaveCount(0, WAIT)
})

test("keys typed while focus is in a text field do not edit", async ({ page }) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [{ id: "x", start: 200, duration: 300, inFrames: 100 }])
  await select(page, "x")
  await parkAt(page, 350)
  const labels = await pastLabels(page)

  await page.evaluate(() => {
    const input = document.createElement("input")
    input.id = "scratch-input"
    document.body.appendChild(input)
    input.focus()
  })
  await page.keyboard.type("s")
  await page.keyboard.press("Backspace")
  await page.keyboard.type("s")
  await page.keyboard.press("Delete")
  await expect(page.locator("#scratch-input")).toHaveValue("s")
  await expectSpans(page, 0, [[200, 300]])
  expect(await pastLabels(page)).toEqual(labels)

  // Control: the same key does split once focus has left the field.
  await page.evaluate(() => document.getElementById("scratch-input")!.blur())
  await page.keyboard.press("s")
  await expectSpans(page, 0, [
    [200, 150],
    [350, 150],
  ])
})
