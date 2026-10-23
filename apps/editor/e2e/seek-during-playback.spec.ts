import { expect, test, type Page } from "@playwright/test"

import { counterText, readCounter } from "./burned-in-counter"
import { installFilePicker } from "./file-picker"
import {
  audioClock,
  audioNodes,
  expectShownWithin,
  importFixture,
  installAudioNodeLog,
  newProject,
  play,
  runsOf,
  SAMPLE_SECONDS,
  setPlayhead,
  sounded,
  stop,
  type LoggedNode,
  type Sounded,
} from "./playback"

// T066, US2 scenario 3: "Given playback is running, When the user moves the Playhead elsewhere,
// Then playback continues from the new position without an audible gap or repeated sound."
//
// Two witnesses. The sound: every `AudioBufferSourceNode` the graph starts or cuts is logged on the
// audio clock (playback.ts), so the spec can check that the stretches of the clock given sound
// before the seek end at one instant, that those after it begin at that same instant, and that no
// instant is given sound twice. The picture: after the seek the burned-in counter shows the Source
// Frame the Playhead names, which is only true if the worker reopened its iterators at the new
// position rather than walking on from the old one.

/**
 * `START_MARGIN_SECONDS` in `audio/clock.ts`: how far ahead of the audio clock the new position is
 * anchored once its sound is in hand — the least time from the seek to the hand-over.
 */
const START_MARGIN = 0.05
/** How long the new position's sound may take to arrive on an idle machine. */
const SOUND_ARRIVES_WITHIN = 0.1

interface Handover {
  /** The audio clock just before the seek was made. */
  readonly seekAt: number
  /** Every node of the session up to a second after the seek. */
  readonly nodes: LoggedNode[]
}

/** Seeks with `move` once sound has been playing a while, and returns the audio log around it. */
async function seekWhilePlaying(page: Page, move: () => Promise<void>): Promise<Handover> {
  const seekAt = await audioClock(page)
  if (seekAt === null) throw new Error("no sound was scheduled before the seek")
  await move()
  // Long enough for the new position's first chunks to be scheduled well past the hand-over.
  await page.waitForTimeout(1_000)
  return { seekAt, nodes: await audioNodes(page) }
}

function expectGaplessHandover({ seekAt, nodes }: Handover): void {
  // The seek cut the nodes still sounding the old position, all at one instant: the hand-over, a
  // start margin after the new position's sound arrived. (A stop and a restart would cut them
  // *now* instead.)
  const cuts = [...new Set(nodes.flatMap((node) => (node.stopAt === null ? [] : [node.stopAt])))]
  expect(cuts, "the instants the seek cut the old sound at").toHaveLength(1)
  const [handover = Number.NaN] = cuts
  expect(handover).toBeGreaterThanOrEqual(seekAt + START_MARGIN - 0.005)
  expect(handover).toBeLessThanOrEqual(seekAt + START_MARGIN + SOUND_ARRIVES_WITHIN + 0.1)

  // The new position's first sample sounds at that instant…
  const fresh = nodes.filter((node) => node.calledAt >= seekAt && node.stopAt === null)
  expect(fresh.length, "nodes started for the new position").toBeGreaterThan(0)
  const firstNew = Math.min(...fresh.map((node) => node.when))
  expect(Math.abs(firstNew - handover)).toBeLessThanOrEqual(SAMPLE_SECONDS)

  // …and across the whole session the audio clock was given sound in one unbroken run, with no
  // instant given sound twice: no gap at the hand-over, and nothing of the old position after it.
  const stretches = nodes.map(sounded).filter((stretch): stretch is Sounded => stretch !== null)
  const { runs, overlaps } = runsOf(stretches)
  expect(overlaps, "instants given sound twice").toEqual([])
  expect(runs, "unbroken runs of sound").toHaveLength(1)
  // The new position kept going: well past the hand-over is already scheduled.
  expect((runs[0]?.until ?? 0) - handover).toBeGreaterThan(0.5)
}

test.beforeEach(async ({ page }) => {
  await installAudioNodeLog(page)
})

test("a seek forwards hands the sound over without a gap or a repeat, and shows the new position", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)

  await play(page)
  await expectShownWithin(page, 30, 300)

  const handover = await seekWhilePlaying(page, () => setPlayhead(page, 600))
  expectGaplessHandover(handover)

  // Playback went on from the new position — it never stopped — and the picture is the Source's.
  await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "true")
  await expectShownWithin(page, 610, 700)
  const frame = await stop(page)
  expect(frame).toBeGreaterThanOrEqual(610)
  expect(frame).toBeLessThan(700)
  expect((await readCounter(page)).text).toBe(counterText(frame))
})

test("a seek backwards with Home plays the start again, gaplessly, from Frame 0", async ({
  page,
}) => {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await setPlayhead(page, 450)
  await expect(page.getByTestId("preview-shown")).toContainText("showing Frame 450 of")

  await play(page)
  await expectShownWithin(page, 480, 700)

  // The user's own way back to the start, on the Timeline while it plays.
  const handover = await seekWhilePlaying(page, async () => {
    const body = page.getByTestId("timeline-body")
    await body.focus()
    await body.press("Home")
  })
  expectGaplessHandover(handover)

  await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "true")
  await expectShownWithin(page, 10, 120)
  const frame = await stop(page)
  expect(frame).toBeGreaterThanOrEqual(10)
  expect(frame).toBeLessThan(120)
  expect((await readCounter(page)).text).toBe(counterText(frame))
})
