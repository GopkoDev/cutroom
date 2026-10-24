import { execFileSync } from "node:child_process"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { frameToSampleIndex, type Command, type Timebase } from "@cutroom/model"

import type * as EditorStore from "../src/store"

import { counterText } from "./burned-in-counter"
import { PROJECT_STORE_MODULE, STORE_MODULE } from "./editor-fixtures"
import { exportedFrame, openExport } from "./exported-file"
import { FIXTURES_DIR, installFilePicker, type FilePicker } from "./file-picker"
import { importFixture, newProject, parkAt } from "./playback"

// T019 (QG-1b, AC-23, AC-26, AC-27): the export of an EDITED Timeline is what the Preview shows and
// what the Clips sound like — Frame for Frame, click for click.
//
// NOT COVERED HERE — SC-006 (D1): whether the exported file plays correctly in VLC and in QuickTime
// Player needs the repository owner at the reference machine. No spec in this file stands in for it.
//
// ## AC-27 (extends SC-007)
//
// One Clip of `sync-1080p30.mp4` is cut by the editing commands into a head Trim, a Split, a moved
// Clip and a Gap (deleted piece), then exported through the dialog. For every Edit point the Frames
// `edit − 1` and `edit` are sampled, and one Frame inside each Gap: the exported Frame's burned-in
// counter must equal the Preview's counter with the Playhead parked on the same Frame, and the
// Timeline's own arithmetic. A Gap Frame is black in both (the counter reads `??????` with every
// square unlit), and the exported sound in a Gap is silent. The Clips' clicks are found where the
// edited Timeline puts them.
//
// ## AC-23
//
// Two Tracks, the same fixture on both with different In-points. Where the upper Clip's clicks fall
// between the lower Clip's they are separate; where both fall on the same instant they sum to 1.2
// before the limiter. The export must keep every sample within full scale without a run of clipped
// samples, each separate click at the source's own level (a Clip alone comes out at the level it
// had in step 1, QG-3c), and each click on its own Clip's picture.
//
// ## AC-26
//
// An edit made while an export runs is applied and saved; the file is the Timeline as it was at
// Start.

const TIMEBASE: Timebase = { numerator: 30, denominator: 1 }
const RATE = 48_000
/**
 * What "no distortion where the sum would go past full scale" (AC-23) is measured against in the
 * decoded file: full scale plus what a ratio-20 limiter lets through on a transient and the AAC
 * decode's overshoot of a signal held at full scale (measured 1.069; the same mix without the
 * limiter peaks at 1.336, which this rejects). The other half of the check is that nothing is
 * flat-topped. Recorded in ADR 0022 §Consequences (agent on the owner's delegation, 2026-10-24).
 */
const CEILING = 1.1
const SEARCH = 3000
const TOLERANCE = 2
const WAIT = { timeout: 5_000 }

// ------------------------------------------------------------------- driving the editor

const at = () => new Date().toISOString()

async function runCommands(page: Page, commands: readonly Command[]): Promise<void> {
  await page.evaluate(
    async ({ specifier, list }) => {
      const store = (await import(specifier)) as typeof EditorStore
      for (const command of list) store.useEditorStore.getState().run(command)
    },
    { specifier: STORE_MODULE, list: commands as Command[] }
  )
}

interface Layout {
  readonly sourceId: string
  readonly trackId: string
  readonly clipId: string
  readonly projectId: string
}

async function openWithOneClip(page: Page): Promise<{ picker: FilePicker; layout: Layout }> {
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  const layout = await page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    const project = store.useEditorStore.getState().project!
    const track = project.timeline.tracks[0]!
    return {
      sourceId: project.sources[0]!.id,
      trackId: track.id,
      clipId: track.clips[0]!.id,
      projectId: project.id,
    }
  }, STORE_MODULE)
  return { picker, layout }
}

/** `[id, start, duration]` of every Clip, by Track then start, as the store holds them. */
async function storedClips(page: Page, withInPoints = true): Promise<string[]> {
  return page.evaluate(
    async ({ specifier, withIn }) => {
      const store = (await import(specifier)) as typeof EditorStore
      return store.useEditorStore
        .getState()
        .project!.timeline.tracks.flatMap((track, index) =>
          [...track.clips]
            .sort((a, b) => a.startFrame - b.startFrame)
            .map(
              (clip) =>
                `${index}:${clip.id}:${clip.startFrame}+${clip.durationFrames}` +
                (withIn ? `@${clip.sourceInPoint.numerator}/${clip.sourceInPoint.denominator}` : "")
            )
        )
    },
    { specifier: STORE_MODULE, withIn: withInPoints }
  )
}

async function openDialog(page: Page) {
  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(
    dialog.locator('[data-testid="export-quality"][data-quality="standard"] input')
  ).toBeChecked({ timeout: 10_000 })
  await expect(dialog.getByTestId("export-sound")).toHaveAttribute("data-sound", "available")
  return dialog
}

async function exportThroughTheDialog(page: Page, picker: FilePicker, name: string) {
  const dialog = await openDialog(page)
  await picker.queueSave(name)
  await dialog.getByTestId("export-start").click()
  await expect(dialog.getByTestId("export-done")).toBeVisible({ timeout: 180_000 })
  await dialog.getByTestId("export-dismiss").click()
}

// ------------------------------------------------------------------- reading the sound

interface ClickReading {
  readonly lag: number
  readonly strength: number
  /** The largest |sample| within the 20 ms after the click's place. */
  readonly peak: number
}

interface Analysis {
  readonly length: number
  readonly sampleRate: number
  readonly maxAbs: number
  /** Where the loudest sample is, in samples. */
  readonly maxAt: number
  /**
   * The longest run of consecutive samples (either channel) that sit flat at the top: |x| ≥ 0.95
   * and within 1e-4 of the one before. A sine's crest is rounded (neighbours differ by far more),
   * so only a clipped, flat-topped wave makes a run.
   */
  readonly longestClippedRun: number
  readonly clicks: ClickReading[]
  /** The largest |sample| over each requested `[from, until)` range. */
  readonly ranges: number[]
}

/** Decodes the export with Web Audio in the page and measures it. */
async function analyseSound(
  page: Page,
  name: string,
  positions: readonly number[],
  ranges: readonly (readonly [number, number])[]
): Promise<Analysis> {
  return page.evaluate(
    async ({ file, rate, where, search, spans }) => {
      const directory = await navigator.storage.getDirectory()
      const blob = await (await directory.getFileHandle(file)).getFile()
      const context = new OfflineAudioContext(2, 1, rate)
      const decoded = await context.decodeAudioData(await blob.arrayBuffer())
      const channels = [0, 1].map((c) => decoded.getChannelData(c))
      const left = channels[0]!
      const length = Math.round(decoded.sampleRate * 0.02)
      const tone = new Float32Array(length)
      for (let i = 0; i < length; i++)
        tone[i] = Math.sin((2 * Math.PI * 1000 * i) / decoded.sampleRate)
      let ideal = 0
      for (let i = 0; i < length; i++) ideal += 0.6 * tone[i]! * tone[i]!

      let maxAbs = 0
      let maxAt = 0
      let longest = 0
      for (const data of channels) {
        let run = 0
        for (let i = 0; i < data.length; i++) {
          const a = Math.abs(data[i]!)
          if (a > maxAbs) {
            maxAbs = a
            maxAt = i
          }
          if (a >= 0.95 && i > 0 && Math.abs(data[i]! - data[i - 1]!) < 1e-4) {
            run += 1
            if (run > longest) longest = run
          } else run = 0
        }
      }

      const clicks = where.map((position) => {
        let best = Number.NEGATIVE_INFINITY
        let lag = 0
        for (let d = -search; d <= search; d++) {
          const start = position + d
          if (start < 0 || start + length > left.length) continue
          let score = 0
          for (let i = 0; i < length; i++) score += left[start + i]! * tone[i]!
          if (score > best) {
            best = score
            lag = d
          }
        }
        let peak = 0
        for (let i = 0; i < length; i++)
          peak = Math.max(peak, Math.abs(left[position + lag + i] ?? 0))
        return { lag, strength: best / ideal, peak }
      })

      const peaks = spans.map(([from, until]) => {
        let peak = 0
        for (const data of channels)
          for (let i = from; i < Math.min(until, data.length); i++)
            peak = Math.max(peak, Math.abs(data[i]!))
        return peak
      })

      return {
        length: decoded.length,
        sampleRate: decoded.sampleRate,
        maxAbs,
        maxAt,
        longestClippedRun: longest,
        clicks,
        ranges: peaks,
      }
    },
    {
      file: name,
      rate: RATE,
      where: [...positions],
      search: SEARCH,
      spans: ranges.map(([from, until]) => [from, until]),
    }
  )
}

/** The largest |sample| of the fixture's left channel within 20 ms of second `second`, by ffmpeg. */
function sourceClickPeak(fixture: string, second: number): number {
  const pcm = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(second - 0.01),
      "-t",
      "0.05",
      "-i",
      path.join(FIXTURES_DIR, fixture),
      "-map",
      "0:a:0",
      "-ac",
      "2",
      "-ar",
      String(RATE),
      "-f",
      "f32le",
      "-c:a",
      "pcm_f32le",
      "-",
    ],
    { maxBuffer: 1 << 26 }
  )
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4)
  // Interleaved stereo; the left channel, as the export is read.
  let peak = 0
  for (let i = 0; i < samples.length; i += 2) peak = Math.max(peak, Math.abs(samples[i]!))
  return peak
}

const decibels = (ratio: number) => 20 * Math.log10(ratio)
const sampleOf = (frame: number) => frameToSampleIndex(TIMEBASE, RATE, frame)

// ------------------------------------------------------------------------- AC-27

// The edited Timeline, built from one Clip `c0` (Source Frames 0–899 at Frames 0–899):
//
//   head Trim to Frame 30      c0 = [30, 900)  In 30 f   a Gap 0–29
//   tail Trim to Frame 300     c0 = [30, 300)
//   Split at 150               c0 = [30, 150) In 30 f, c1 = [150, 300) In 150 f
//   move c1 by +30             c1 = [180, 330)           a Gap 150–179
//   Split c1 at 250            c1 = [180, 250) In 150 f, c2 = [250, 330) In 220 f
//   move c2 by +20             c2 = [270, 350)           a Gap 250–269
//   Split c2 at 310            c2 = [270, 310), c3 = [310, 350) In 260 f
//   delete c2                  the Gap is now 250–309
//
// Each Clip's picture shows Source Frame `t − (start − In)`: c0 → t, c1 → t − 30, c3 → t − 50.
const GAPS: readonly (readonly [number, number])[] = [
  [0, 30],
  [150, 180],
  [250, 310],
]
const TOTAL = 350

function expectedCounter(frame: number): string | null {
  if (frame < 30) return null
  if (frame < 150) return counterText(frame)
  if (frame < 180) return null
  if (frame < 250) return counterText(frame - 30)
  if (frame < 310) return null
  return counterText(frame - 50)
}

/** Both sides of every Edit point and one Frame inside each Gap. */
const SAMPLED = [10, 29, 30, 149, 150, 165, 179, 180, 249, 250, 280, 309, 310, 349]

test("AC-27 / QG-1b: every Frame of an edited export matches the Preview, Gaps black and silent", async ({
  page,
}) => {
  test.setTimeout(240_000)
  const { picker, layout } = await openWithOneClip(page)
  const run = (...commands: Command[]) => runCommands(page, commands)

  await run({ type: "trim-clip", at: at(), clipId: layout.clipId, edge: "head", frame: 30 })
  await run({ type: "trim-clip", at: at(), clipId: layout.clipId, edge: "tail", frame: 300 })
  await run({
    type: "split-clips",
    at: at(),
    frame: 150,
    cuts: [{ clipId: layout.clipId, newClipId: "c1" }],
  })
  await run({ type: "move-clips", at: at(), clipIds: ["c1"], delta: 30, toTrackId: null })
  await run({
    type: "split-clips",
    at: at(),
    frame: 250,
    cuts: [{ clipId: "c1", newClipId: "c2" }],
  })
  await run({ type: "move-clips", at: at(), clipIds: ["c2"], delta: 20, toTrackId: null })
  await run({
    type: "split-clips",
    at: at(),
    frame: 310,
    cuts: [{ clipId: "c2", newClipId: "c3" }],
  })
  await run({ type: "delete-clips", at: at(), clipIds: ["c2"], ripple: false })
  // Where they sit, not what they show: the export is what is checked for the latter.
  expect(await storedClips(page, false)).toEqual([
    `0:${layout.clipId}:30+120`,
    "0:c1:180+70",
    "0:c3:310+40",
  ])

  const name = "editing-export-edited.mp4"
  await exportThroughTheDialog(page, picker, name)
  const track = await openExport(page, name)
  expect(track.timestamps).toHaveLength(TOTAL)

  const worst = { meanAbs: 0, counterMeanAbs: 0 }
  for (const frame of SAMPLED) {
    await parkAt(page, frame)
    const read = await exportedFrame(page, frame, TIMEBASE, { comparePreview: true })
    const where = `Frame ${frame}`
    const expected = expectedCounter(frame)

    if (expected === null) {
      // A Gap: black in the Preview and in the file — nothing is lit, nothing reads as a digit.
      expect(read.previewCounter?.text, `${where}: the Preview`).toBe("??????")
      expect(read.counter.text, `${where}: the export`).toBe("??????")
      expect(read.counter.margin, `${where}: the export is black`).toBeGreaterThan(110)
      expect(read.previewCounter?.margin, `${where}: the Preview is black`).toBeGreaterThan(110)
    } else {
      expect(read.previewCounter?.text, `${where}: the Preview`).toBe(expected)
      expect(read.counter.text, `${where}: the export`).toBe(expected)
    }
    // The export is the Preview's picture, not only its number.
    const likeness = read.likeness!
    expect(likeness.meanAbs, `${where}: whole-picture difference`).toBeLessThanOrEqual(0.1)
    expect(likeness.psnr, `${where}: PSNR`).toBeGreaterThanOrEqual(45)
    expect(likeness.counterMeanAbs, `${where}: inside the counter`).toBeLessThanOrEqual(2)
    expect(likeness.counterFlipped, `${where}: flipped counter pixels`).toBeLessThanOrEqual(0.005)
    worst.meanAbs = Math.max(worst.meanAbs, likeness.meanAbs)
    worst.counterMeanAbs = Math.max(worst.counterMeanAbs, likeness.counterMeanAbs)
  }

  // The sound: the Clips' clicks where the Timeline puts them (c0 → Timeline = Source; c1 and c3
  // sound where their own pictures show Source second `n`), and silence across every Gap.
  const clickFrames = [30, 60, 90, 120, 180, 210, 240, 320]
  const clickPositions = clickFrames.map(sampleOf)
  const quiet = GAPS.map(
    ([from, until]) => [sampleOf(from) + 2048, sampleOf(until) - 2048] as const
  )
  const sound = await analyseSound(page, name, clickPositions, quiet)
  expect(sound.length).toBe(sampleOf(TOTAL))
  sound.clicks.forEach((click, index) => {
    const where = `the click at Frame ${clickFrames[index]} (${clickPositions[index]})`
    expect(Math.abs(click.lag), `${where} is ${click.lag} samples off`).toBeLessThanOrEqual(
      TOLERANCE
    )
    expect(click.strength, `${where} is too faint`).toBeGreaterThan(0.5)
  })
  sound.ranges.forEach((peak, index) => {
    expect(peak, `Gap Frames ${GAPS[index]!.join("–")} are silent`).toBeLessThan(0.002)
  })

  test.info().annotations.push({
    type: "edited export",
    description:
      `${SAMPLED.length} Frames sampled; worst mean |Δ| ${worst.meanAbs.toFixed(3)}, counter ` +
      `${worst.counterMeanAbs.toFixed(3)}; Gap peaks ${sound.ranges.map((p) => p.toExponential(1)).join(", ")}`,
  })
})

// ------------------------------------------------------------------------- AC-23

// Lower Track: `a` (sync-1080p30.mp4, 0.43 per channel) = [0, 240) In 0 — a click at every second 0…7, on Timeline second = Source second.
// Upper Track, loud-1080p30.mp4 (0.85 per channel): `b1` = [60, 150) In 15 f — the Source's second n sounds at Timeline n + 1.5 s (2.5,
//   3.5, 4.5: between a's clicks), and `b2` = [150, 210) In 0 — the Source's second n at Timeline
//   n + 5 s (5.0 and 6.0: the same instants as a's clicks, so the two sum to 1.28 before the limiter).
// Where the Clips overlap (2–7 s) the picture is the upper Clip's: only the lower one is covered.
interface Click {
  readonly frame: number
  /** The counter on the picture the click belongs to, or `null` when it is covered. */
  readonly counter: number | null
  readonly together: boolean
  /** Whether the click is the loud Clip's (`loud-1080p30.mp4`) rather than the ordinary one's. */
  readonly loud?: boolean
  /** Whether to hold its level to the Source's; the file's first click sits in the encoder's ramp-in. */
  readonly level?: boolean
}
const CLICKS: readonly Click[] = [
  { frame: 0, counter: 0, together: false, level: false }, // a alone, at the file's very start
  { frame: 30, counter: 30, together: false }, // a alone
  { frame: 60, counter: null, together: false }, // a, under b1's first Frame: covered
  { frame: 75, counter: 30, together: false, loud: true }, // b1
  { frame: 90, counter: null, together: false }, // a, covered
  { frame: 105, counter: 60, together: false, loud: true }, // b1
  { frame: 120, counter: null, together: false }, // a, covered
  { frame: 135, counter: 90, together: false, loud: true }, // b1
  { frame: 150, counter: 0, together: true }, // a + b2
  { frame: 180, counter: 30, together: true }, // a + b2
  { frame: 210, counter: 210, together: false }, // a alone again
]

test("AC-23: two Clips with sound on two Tracks are mixed, level kept, no clipping, in sync", async ({
  page,
}) => {
  test.setTimeout(240_000)
  const { picker, layout } = await openWithOneClip(page)
  await picker.queue("loud-1080p30.mp4")
  await importFixture(page, 2)
  const loudSourceId = await page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    return store.useEditorStore.getState().project!.sources[1]!.id
  }, STORE_MODULE)
  const imported = await page.evaluate(async (specifier) => {
    const store = (await import(specifier)) as typeof EditorStore
    return store.useEditorStore
      .getState()
      .project!.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id))
  }, STORE_MODULE)
  const upperId = "track-upper"
  await runCommands(page, [
    { type: "delete-clips", at: at(), clipIds: imported, ripple: false },
    { type: "add-track", at: at(), track: { id: upperId, name: "Video 2" } },
    {
      type: "add-clip",
      at: at(),
      trackId: layout.trackId,
      clip: {
        id: "a",
        sourceId: layout.sourceId,
        startFrame: 0,
        durationFrames: 240,
        sourceInPoint: { numerator: 0, denominator: 1 },
      },
    },
    {
      type: "add-clip",
      at: at(),
      trackId: upperId,
      clip: {
        id: "b1",
        sourceId: loudSourceId,
        startFrame: 60,
        durationFrames: 90,
        sourceInPoint: { numerator: 1, denominator: 2 },
      },
    },
    {
      type: "add-clip",
      at: at(),
      trackId: upperId,
      clip: {
        id: "b2",
        sourceId: loudSourceId,
        startFrame: 150,
        durationFrames: 60,
        sourceInPoint: { numerator: 0, denominator: 1 },
      },
    },
  ])
  expect(await storedClips(page)).toEqual(["0:a:0+240@0/1", "1:b1:60+90@1/2", "1:b2:150+60@0/1"])

  const name = "editing-export-two-tracks.mp4"
  await exportThroughTheDialog(page, picker, name)
  const track = await openExport(page, name)
  expect(track.hasAudio).toBe(true)
  expect(track.timestamps).toHaveLength(240)

  const sound = await analyseSound(
    page,
    name,
    CLICKS.map((c) => sampleOf(c.frame)),
    []
  )
  expect(sound.length).toBe(sampleOf(240))

  // No distortion where the sum passes full scale: within range, and no flat-topped run. The two
  // loud clicks sum to about 1.28 before the limiter; the file measured ~1.07 at its loudest. That
  // is not hard clipping but the limiter being a ratio-20 compressor (ADR 0022: 1.28 in, ~1.01 out)
  // and the AAC decode overshooting a signal that sits at full scale. So the ceiling is full
  // scale plus that overshoot, far under the 1.28 an unlimited mix has, not 1.0 exactly.
  expect(
    sound.maxAbs,
    `the loudest sample, at ${(sound.maxAt / RATE).toFixed(4)} s`
  ).toBeLessThanOrEqual(CEILING)
  expect(sound.longestClippedRun, "consecutive samples at full scale").toBeLessThan(3)

  // Every click present at its own Timeline instant, in sync with its picture.
  const ordinaryPeak = sourceClickPeak("sync-1080p30.mp4", 1)
  const loudPeak = sourceClickPeak("loud-1080p30.mp4", 1)
  expect(ordinaryPeak).toBeGreaterThan(0.4)
  expect(loudPeak).toBeGreaterThan(0.8)
  const peaks: string[] = []
  for (const [index, click] of CLICKS.entries()) {
    const reading = sound.clicks[index]!
    const where = `the click at Frame ${click.frame}`
    expect(Math.abs(reading.lag), `${where} is ${reading.lag} samples off`).toBeLessThanOrEqual(
      TOLERANCE
    )
    expect(reading.strength, `${where} is too faint to be the click`).toBeGreaterThan(0.5)
    const measuredFrame = Math.floor((sampleOf(click.frame) + reading.lag) / (RATE / 30))
    expect(Math.abs(measuredFrame - click.frame), `${where}: Frames from its place`).toBeLessThan(1)

    if (click.counter !== null) {
      const read = await exportedFrame(page, measuredFrame, TIMEBASE)
      expect(read.counter.text, `${where} lands on its Clip's picture`).toBe(
        counterText(click.counter)
      )
    }
    if (!click.together && click.level !== false) {
      // Each at its own full level: a Clip alone (or beside another's click, not on it) comes out
      // at the level it had in the Source, to within 0.5 dB.
      const sourcePeak = click.loud === true ? loudPeak : ordinaryPeak
      const off = decibels(reading.peak / sourcePeak)
      peaks.push(`${click.frame}:${off.toFixed(2)}`)
      expect(
        Math.abs(off),
        `${where} is ${off.toFixed(2)} dB from the Source's`
      ).toBeLessThanOrEqual(0.5)
    } else if (click.together) {
      // Two clicks on one instant are heard together: louder than one, never past full scale.
      expect(reading.peak, `${where} is louder than one Clip`).toBeGreaterThan(loudPeak)
      expect(reading.peak, `${where} stays in range`).toBeLessThanOrEqual(CEILING)
    }
  }

  test.info().annotations.push({
    type: "mix",
    description:
      `source click peaks ${ordinaryPeak.toFixed(4)} and ${loudPeak.toFixed(4)}; max |sample| ${sound.maxAbs.toFixed(4)}; ` +
      `longest clipped run ${sound.longestClippedRun}; level vs Source (dB) ${peaks.join(" ")}; ` +
      `summed clicks ${sound.clicks
        .filter((_, i) => CLICKS[i]!.together)
        .map((c) => c.peak.toFixed(3))
        .join(", ")}`,
  })
})

// ------------------------------------------------------------------------- AC-26

test("AC-26: an edit made while an export runs is saved; the file is the Timeline at Start", async ({
  page,
}) => {
  test.setTimeout(240_000)
  const { picker, layout } = await openWithOneClip(page)
  const clip = page.locator(`[data-testid=timeline-clip][data-clip-id="${layout.clipId}"]`)
  await expect(clip).toHaveAttribute("data-duration-frames", "900")

  const dialog = await openDialog(page)
  const name = "editing-export-during-edit.mp4"
  await picker.queueSave(name)
  await dialog.getByTestId("export-start").click()
  await expect(dialog.getByTestId("export-progress")).toBeVisible()
  await expect(dialog.getByTestId("export-frames")).toContainText("of 900 Frames")

  // The edit: select the Clip and press Delete, while the export runs.
  await clip.click({ force: true, ...WAIT })
  await expect(clip).toHaveAttribute("data-selected", "true", WAIT)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press("Delete")
  await expect(page.getByTestId("timeline-clip")).toHaveCount(0, WAIT)

  // It happened during the export, not after it.
  await expect(dialog.getByTestId("export-progress")).toHaveAttribute("data-phase", "running")
  const progress = (await dialog.getByTestId("export-frames").textContent()) ?? ""
  const doneSoFar = Number(/^(\d+) of/.exec(progress)?.[1])
  expect(doneSoFar).toBeLessThan(900)

  // And it is saved, as usual.
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ specifier, id }) => {
            const projects = (await import(specifier)) as typeof import("../src/storage/projects")
            const stored = await projects.loadProject(id)
            return stored === undefined
              ? -1
              : stored.timeline.tracks.reduce((n, track) => n + track.clips.length, 0)
          },
          { specifier: PROJECT_STORE_MODULE, id: layout.projectId }
        ),
      { timeout: 15_000, message: "the stored Project to have lost the Clip" }
    )
    .toBe(0)

  await expect(dialog.getByTestId("export-done")).toBeVisible({ timeout: 180_000 })
  await dialog.getByTestId("export-dismiss").click()

  // The file is the Timeline at Start: 900 Frames, and the deleted Clip's picture is still there.
  const track = await openExport(page, name)
  expect(track.timestamps).toHaveLength(900)
  for (const frame of [0, 450, 899]) {
    const read = await exportedFrame(page, frame, TIMEBASE)
    expect(read.counter.text, `output Frame ${frame}`).toBe(counterText(frame))
  }
  const sound = await analyseSound(page, name, [sampleOf(450 - 450 + 30)], [])
  expect(
    sound.clicks[0]!.strength,
    "the deleted Clip's sound is still in the file"
  ).toBeGreaterThan(0.5)
  test.info().annotations.push({
    type: "edit during export",
    description: `Delete pressed with the export at Frame ${doneSoFar} of 900`,
  })
})
