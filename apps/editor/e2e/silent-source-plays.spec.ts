import { expect, test } from "@playwright/test"

import { counterText, readCounter } from "./burned-in-counter"
import { installFilePicker } from "./file-picker"
import {
  audioNodes,
  expectShownWithin,
  importFixture,
  installAudioNodeLog,
  newProject,
  play,
  stop,
} from "./playback"

// T067, US2 scenario 5: "Given a Source with no audio, When the user plays it, Then picture plays
// normally and silence is treated as valid, not as an error."
//
// `silent-720p24.mp4` has no audio track: 10 s at 24/1, Frames 0–239. The clock is the audio
// context's `currentTime`, which runs whether or not anything is scheduled on it, so the picture
// should advance at the Source's own pace with not one `AudioBufferSourceNode` made, and nothing —
// no refusal, no `fatal`, no uncaught error — should say anything is wrong.

test("a Source with no audio plays its picture against a silent clock", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await installAudioNodeLog(page)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("silent-720p24.mp4")
  await importFixture(page, 1)
  await expect(page.getByTestId("timeline-clip")).toHaveAttribute("data-duration-frames", "240")

  await play(page)
  const started = Date.now()
  // A second and a half of picture at 24 fps, give or take the start margin and a slow display.
  await expectShownWithin(page, 24, 240)
  await page.waitForTimeout(1_500 - (Date.now() - started))
  await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "true")

  const frame = await stop(page)
  // The clock paced it like sound would: about 1.5 s of 24 fps, never racing ahead of real time.
  expect(frame).toBeGreaterThanOrEqual(24)
  expect(frame).toBeLessThanOrEqual(Math.ceil(((Date.now() - started) / 1000) * 24))

  // Silence is valid: nothing was scheduled, and nothing complained.
  expect(await audioNodes(page)).toEqual([])
  await expect(page.getByTestId("engine-fatal")).toHaveCount(0)
  await expect(page.getByTestId("import-refusal")).toHaveCount(0)
  expect(errors).toEqual([])

  // The picture left on screen is the Source Frame the Playhead names.
  const reading = await readCounter(page)
  expect({ width: reading.width, height: reading.height }).toEqual({ width: 1280, height: 720 })
  expect(reading.text).toBe(counterText(frame))
})
