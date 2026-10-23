import { expect, test } from "@playwright/test"

import { counterText, readCounter } from "./burned-in-counter"
import { installFilePicker } from "./file-picker"
import {
  audioNodes,
  expectShownWithin,
  importFixture,
  installAudioNodeLog,
  newProject,
  parkAt,
  play,
  settledFrame,
  sounded,
  stop,
} from "./playback"

// T068, US2 scenario 6: "Given playback reaches the end of the Timeline, When the last Frame has
// been shown, Then playback stops there rather than continuing into empty space."
//
// `sync-1080p30.mp4` is one Clip of Frames 0–899. Played from Frame 870, playback should stop by
// itself once Frame 899 has had its whole thirtieth of a second, with the Playhead left on 899 and
// the Preview showing the Source's last Frame — not on an empty Frame past the end — and with no
// sound scheduled beyond the Timeline's end.
//
// FR-010: Play with the Playhead on the last Frame — where a run that reached the end leaves it —
// or past the end starts again from Frame 0, as common editors and players do.

test("playback stops on the Timeline's last Frame by itself", async ({ page }) => {
  await installAudioNodeLog(page)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await parkAt(page, 870)

  await play(page)
  // 30 Frames is a second; the transport releases itself without anyone pressing Stop.
  await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "false", {
    timeout: 5_000,
  })

  expect(await settledFrame(page)).toBe(899)
  await expect(page.getByTestId("timeline-playhead")).toHaveAttribute("data-frame", "899")
  expect((await readCounter(page)).text).toBe(counterText(899))

  // The sound ran from Frame 870 to the end and no further: 30 Frames is exactly one second of it.
  const stretches = (await audioNodes(page)).map(sounded).filter((s) => s !== null)
  expect(stretches.length).toBeGreaterThan(0)
  const from = Math.min(...stretches.map((s) => s.from))
  const until = Math.max(...stretches.map((s) => s.until))
  expect(until - from).toBeCloseTo(1, 3)
})

for (const parked of [899, 905]) {
  test(`Play with the Playhead on Frame ${parked} starts again from Frame 0`, async ({ page }) => {
    await installAudioNodeLog(page)
    const picker = await installFilePicker(page)
    await newProject(page)
    await picker.queue("sync-1080p30.mp4")
    await importFixture(page, 1)
    await parkAt(page, parked)

    await play(page)
    await expectShownWithin(page, 10, 300)
    await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "true")
    const frame = await stop(page)
    expect(frame).toBeGreaterThanOrEqual(10)
    expect(frame).toBeLessThan(300)
    expect((await readCounter(page)).text).toBe(counterText(frame))

    // The sound started from the top too: from its first node's start to where Stop cut it is
    // as long as the picture ran from Frame 0 (give or take the Frames still in flight).
    const nodes = await audioNodes(page)
    const begins = Math.min(...nodes.map((node) => node.when - node.offset))
    const cut = Math.max(...nodes.flatMap((node) => (node.stopAt === null ? [] : [node.stopAt])))
    expect(Math.abs((cut - begins) * 30 - frame)).toBeLessThan(3)
  })
}
