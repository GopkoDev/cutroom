import { expect, test, type Locator, type Page } from "@playwright/test"

import type * as EditorStore from "../src/store"

import type * as ProjectStore from "../src/storage/projects"

import { counterText, readCounter } from "./burned-in-counter"
import { PROJECT_STORE_MODULE, STORE_MODULE } from "./editor-fixtures"
import { installFilePicker, type FilePicker } from "./file-picker"
import { importFixture, newProject, parkAt, play } from "./playback"

// T017 (AC-01, AC-02, AC-03, AC-06, AC-07, AC-08, AC-09, AC-17, AC-19, AC-25, AC-31): Trim and
// move drags from Clip handles and bodies, driven with the real mouse in the real browser.

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

async function storedTimeline(page: Page): Promise<string> {
  return page.evaluate(
    async ({ store: storeSpecifier, projects: projectsSpecifier }) => {
      const store = (await import(storeSpecifier)) as typeof EditorStore
      const projects = (await import(projectsSpecifier)) as typeof ProjectStore
      const id = store.useEditorStore.getState().project!.id
      return JSON.stringify((await projects.loadProject(id))?.timeline)
    },
    { store: STORE_MODULE, projects: PROJECT_STORE_MODULE }
  )
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

// ---------------------------------------------------------------- the tests

test("AC-01: a tail Trim left then a head Trim right shorten the Clip and keep its picture", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "x", start: 200, duration: 300, inFrames: 100 },
    { id: "y", start: 600, duration: 100, inFrames: 0 },
  ])

  await trim(page, "x", "tail", -30)
  await expectClip(page, "x", 200, 270)

  await trim(page, "x", "head", 20)
  await expectClip(page, "x", 220, 250)
  await expect(page.getByTestId("undo")).toContainText("Trim", WAIT)

  // No other Clip moved.
  await expectClip(page, "y", 600, 100)

  // The new first Frame shows the Source Frame that was 20 Frames into the Clip.
  await parkAt(page, 220)
  await expectCounter(page, 120)
})

test("AC-02: an edge dragged past the Source's beginning or end is held there", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "x", start: 200, duration: 300, inFrames: 100 },
    { id: "z", start: 600, duration: 100, inFrames: 700 },
  ])
  const x = clipById(page, "x")
  const z = clipById(page, "z")

  // X shows the Source from Frame 100: its head can reach 100 Frames earlier, no further.
  await holdTrim(page, "x", "head", -150)
  await expect(x).toHaveAttribute("data-preview-start-frame", "100", WAIT)
  await expect(x).toHaveAttribute("data-preview-duration-frames", "400")
  await expect(x).toHaveAttribute("data-at-limit", "true")
  await expect(x).toHaveAttribute("data-start-frame", "200")
  await page.mouse.up()
  await expectClip(page, "x", 100, 400)

  // Z shows Source Frames 700-799: its tail can reach the Source's last Frame (900), no further.
  await holdTrim(page, "z", "tail", 300)
  await expect(z).toHaveAttribute("data-preview-start-frame", "600", WAIT)
  await expect(z).toHaveAttribute("data-preview-duration-frames", "200")
  await expect(z).toHaveAttribute("data-at-limit", "true")
  await page.mouse.up()
  await expectClip(page, "z", 600, 200)
  await expect(z).not.toHaveAttribute("data-at-limit", "true")
})

test("AC-03: an edge stops at the neighbour, at Frame 0, and one Frame short of the other end", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "w", start: 20, duration: 100, inFrames: 100 },
    { id: "x", start: 200, duration: 300, inFrames: 100 },
    { id: "y", start: 550, duration: 150, inFrames: 0 },
  ])

  // Head before the Timeline's first Frame stops at Frame 0.
  const w = clipById(page, "w")
  await holdTrim(page, "w", "head", -60)
  await expect(w).toHaveAttribute("data-preview-start-frame", "0", WAIT)
  await expect(w).toHaveAttribute("data-preview-duration-frames", "120")
  await expect(w).toHaveAttribute("data-at-limit", "true")
  await page.mouse.up()
  await expectClip(page, "w", 0, 120)

  // Tail into the neighbour stops at the neighbour's edge.
  const x = clipById(page, "x")
  await holdTrim(page, "x", "tail", 150)
  await expect(x).toHaveAttribute("data-preview-start-frame", "200", WAIT)
  await expect(x).toHaveAttribute("data-preview-duration-frames", "350")
  await expect(x).toHaveAttribute("data-at-limit", "true")
  await page.mouse.up()
  await expectClip(page, "x", 200, 350)

  // Head past the other end stops one Frame short of it. x is [200, 550) after the tail Trim, so
  // +400 takes the pointer to 600, past its end.
  await holdTrim(page, "x", "head", 400)
  await expect(x).toHaveAttribute("data-preview-start-frame", "549", WAIT)
  await expect(x).toHaveAttribute("data-preview-duration-frames", "1")
  await expect(x).toHaveAttribute("data-at-limit", "true")
  await page.mouse.up()
  await expectClip(page, "x", 549, 1)
  await expectClip(page, "y", 550, 150)
})

test("AC-06: a Clip dragged into a Gap before the first lands there, and one undo puts it back", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "b", start: 250, duration: 100, inFrames: 200 },
    { id: "c", start: 400, duration: 60, inFrames: 400 },
  ])

  await holdMove(page, "c", -380)
  const ghost = ghostOf(page, "c")
  await expect(ghost).toHaveAttribute("data-drop", "ok", WAIT)
  await expect(ghost).toHaveAttribute("data-start-frame", "20")
  await expect(clipById(page, "c")).toHaveAttribute("data-dragging", "true")
  await expect(clipById(page, "c")).toHaveAttribute("data-start-frame", "400")
  await page.mouse.up()

  await expect(ghost).toHaveCount(0, WAIT)
  await expectClip(page, "c", 20, 60)
  await expectClip(page, "a", 100, 100)
  await expectClip(page, "b", 250, 100)
  await expect(page.getByTestId("undo")).toContainText("Move", WAIT)

  await page.getByTestId("undo").click()
  await expectClip(page, "c", 400, 60)
  await expectClip(page, "a", 100, 100)
  await expectClip(page, "b", 250, 100)
})

test("AC-07: a drag onto another Clip or before Frame 0 is refused while there and on release", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "b", start: 250, duration: 100, inFrames: 200 },
  ])
  const labels = await pastLabels(page)

  // Onto B: A would land on [300, 400).
  await holdMove(page, "a", 200)
  const ghost = ghostOf(page, "a")
  await expect(ghost).toHaveAttribute("data-drop", "refused", WAIT)
  await expect(ghost).toHaveAttribute("data-reason", "overlap")
  await page.mouse.up()
  await expect(ghost).toHaveCount(0, WAIT)
  await expectClip(page, "a", 100, 100)
  await expectClip(page, "b", 250, 100)
  expect(await pastLabels(page)).toEqual(labels)

  // Before the Timeline's first Frame: A would start at -50.
  await holdMove(page, "a", -150)
  await expect(ghost).toHaveAttribute("data-drop", "refused", WAIT)
  await expect(ghost).toHaveAttribute("data-reason", "before-timeline-start")
  await page.mouse.up()
  await expect(ghost).toHaveCount(0, WAIT)
  await expectClip(page, "a", 100, 100)
  expect(await pastLabels(page)).toEqual(labels)
})

test("AC-08: a Clip dragged onto the free upper Track is on it and covers the lower picture", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await addTrack(page)
  await layout(page, ids, [{ id: "l", start: 100, duration: 200, inFrames: 200 }])

  const upper = page.getByTestId("timeline-track").nth(0)
  const lower = page.getByTestId("timeline-track").nth(1)
  await expect(lower.locator('[data-clip-id="l"]')).toHaveCount(1, WAIT)
  const dy = (await centerOf(upper)).y - (await centerOf(lower)).y

  await holdMove(page, "l", 50, dy)
  await expect(ghostOf(page, "l")).toHaveAttribute("data-drop", "ok", WAIT)
  await expect(ghostOf(page, "l")).toHaveAttribute("data-start-frame", "150")
  await page.mouse.up()

  await expect(upper.locator('[data-clip-id="l"]')).toHaveCount(1, WAIT)
  await expect(lower.locator('[data-clip-id="l"]')).toHaveCount(0)
  await expectClip(page, "l", 150, 200)
  await expect(page.getByTestId("undo")).toContainText("Move")

  // At Frame 160 it covers the lower Track: Source Frame 200 + 10.
  await parkAt(page, 160)
  await expectCounter(page, 210)
})

test("AC-09: a drag moves the whole Selection by one delta; an unselected Clip moves alone", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "b", start: 300, duration: 100, inFrames: 200 },
    { id: "c", start: 500, duration: 100, inFrames: 400 },
  ])

  await clipById(page, "a").click(WAIT)
  await clipById(page, "b").click({ modifiers: ["Shift"] })
  await expect(clipById(page, "a")).toHaveAttribute("data-selected", "true", WAIT)
  await expect(clipById(page, "b")).toHaveAttribute("data-selected", "true", WAIT)

  await drag(page, "a", 40)
  await expectClip(page, "a", 140, 100)
  await expectClip(page, "b", 340, 100)
  await expectClip(page, "c", 500, 100)
  await expect(page.getByTestId("undo")).toContainText("Move")

  // Pressing an unselected Clip makes it the only selected one and moves it alone.
  await drag(page, "c", 60)
  await expectClip(page, "c", 560, 100)
  await expectClip(page, "a", 140, 100)
  await expectClip(page, "b", 340, 100)
  await expect(clipById(page, "c")).toHaveAttribute("data-selected", "true", WAIT)
  await expect(clipById(page, "a")).not.toHaveAttribute("data-selected", "true")
  await expect(clipById(page, "b")).not.toHaveAttribute("data-selected", "true")
})

test("AC-09: a Selection on both Tracks cannot be dragged onto the other Track", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await addTrack(page)
  await layout(page, ids, [
    { id: "a", start: 100, duration: 100, inFrames: 0 },
    { id: "u", start: 400, duration: 100, inFrames: 300, track: "upper" },
  ])
  const labels = await pastLabels(page)

  await clipById(page, "a").click(WAIT)
  await clipById(page, "u").click({ modifiers: ["Shift"] })
  await expect(clipById(page, "u")).toHaveAttribute("data-selected", "true", WAIT)
  await expect(clipById(page, "a")).toHaveAttribute("data-selected", "true")

  const upper = page.getByTestId("timeline-track").nth(0)
  const lower = page.getByTestId("timeline-track").nth(1)
  const dy = (await centerOf(upper)).y - (await centerOf(lower)).y
  await holdMove(page, "a", 30, dy)
  await expect(ghostOf(page, "a")).toHaveAttribute("data-drop", "refused", WAIT)
  await page.mouse.up()

  await expect(ghostOf(page, "a")).toHaveCount(0, WAIT)
  await expect(lower.locator('[data-clip-id="a"]')).toHaveCount(1)
  await expect(upper.locator('[data-clip-id="u"]')).toHaveCount(1)
  await expectClip(page, "a", 100, 100)
  await expectClip(page, "u", 400, 100)
  expect(await pastLabels(page)).toEqual(labels)
})

test("AC-17: the saved Project never holds a drag's intermediate position, and one undo restores the start", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [{ id: "x", start: 200, duration: 300, inFrames: 100 }])
  await page.waitForTimeout(1_500) // the layout reaches storage
  const before = await storedTimeline(page)

  const scale = await pxPerFrame(page)
  const from = await centerOf(clipById(page, "x"))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 40 * scale, from.y, { steps: 8 })
  await expect(ghostOf(page, "x")).toHaveAttribute("data-drop", "ok", WAIT)
  await page.waitForTimeout(1_500)
  expect(await storedTimeline(page)).toBe(before)
  await page.mouse.move(from.x + 90 * scale, from.y, { steps: 8 })
  await expect(ghostOf(page, "x")).toHaveAttribute("data-start-frame", "290", WAIT)
  await page.waitForTimeout(1_500)
  expect(await storedTimeline(page)).toBe(before)
  await page.mouse.up()

  await expectClip(page, "x", 290, 300)
  await expect
    .poll(async () => JSON.parse(await storedTimeline(page)).tracks[0].clips[0].startFrame, {
      timeout: 10_000,
    })
    .toBe(290)

  await page.getByTestId("undo").click()
  await expectClip(page, "x", 200, 300)
  await expect.poll(() => storedTimeline(page), { timeout: 10_000 }).toBe(before)
})

test("AC-19: Escape during a move drag or a Trim drag leaves everything as it was", async ({
  page,
}) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [{ id: "x", start: 200, duration: 300, inFrames: 100 }])
  await page.waitForTimeout(1_500)
  const before = await storedTimeline(page)
  const labels = await pastLabels(page)

  await holdMove(page, "x", 80)
  await expect(ghostOf(page, "x")).toHaveAttribute("data-drop", "ok", WAIT)
  await page.keyboard.press("Escape")
  await expect(ghostOf(page, "x")).toHaveCount(0, WAIT)
  await page.mouse.up()
  await expectClip(page, "x", 200, 300)
  await expect(clipById(page, "x")).not.toHaveAttribute("data-dragging", "true")

  await holdTrim(page, "x", "tail", -50)
  await expect(clipById(page, "x")).toHaveAttribute("data-preview-duration-frames", "250", WAIT)
  await page.keyboard.press("Escape")
  await expect(clipById(page, "x")).not.toHaveAttribute("data-preview-duration-frames", /.*/, WAIT)
  await page.mouse.up()
  await expectClip(page, "x", 200, 300)

  await page.waitForTimeout(1_500)
  expect(await pastLabels(page)).toEqual(labels)
  expect(await storedTimeline(page)).toBe(before)
})

test("AC-25: an Offline Clip can be trimmed and moved with no permission prompt", async ({
  page,
}) => {
  const { ids, picker } = await openWithOneClip(page)
  await layout(page, ids, [{ id: "x", start: 200, duration: 300, inFrames: 100 }])
  await page.waitForTimeout(1_500) // the layout reaches storage before the reload

  await picker.setPermission("prompt")
  await page.reload()
  await page.getByTestId("project-row").click(WAIT)
  await expect(page.getByTestId("editor-shell")).toBeVisible()
  await expect(clipById(page, "x")).toHaveAttribute("data-offline", "true", {
    timeout: 20_000,
  })
  expect((await picker.permissionCalls()).requested).toBe(0)

  await trim(page, "x", "tail", -40)
  await expectClip(page, "x", 200, 260)
  await drag(page, "x", 70)
  await expectClip(page, "x", 270, 260)
  await expect(clipById(page, "x")).toHaveAttribute("data-offline", "true")

  expect((await picker.permissionCalls()).requested).toBe(0)
  expect(await picker.permissionOf("sync-1080p30.mp4")).toBe("prompt")
})

test("AC-31: starting a drag during Playback stops it before the Clips move", async ({ page }) => {
  const { ids } = await openWithOneClip(page)
  await layout(page, ids, [{ id: "x", start: 200, duration: 300, inFrames: 100 }])

  await play(page)
  await holdMove(page, "x", 50)
  await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "false", WAIT)
  await expect(ghostOf(page, "x")).toHaveAttribute("data-start-frame", "250", WAIT)
  await expectClip(page, "x", 200, 300)
  await page.mouse.up()
  await expectClip(page, "x", 250, 300)
  await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "false")
})
