import { expect, test, type Page } from "@playwright/test"

import { timebaseAsNumber, type Timebase } from "@cutroom/model"

import { counterText, readCounter } from "./burned-in-counter"
import { installFilePicker } from "./file-picker"
import { importFixture, newProject, parkAt, play, settledFrame } from "./playback"
import {
  firstRun,
  installPlaybackProbe,
  measureSound,
  percentile,
  pictureAgainstSound,
  probeLog,
  type WorkerLoad,
} from "./playback-probe"

// T070 (FR-012, quickstart's US2 step 9): "When the product cannot produce Frames fast enough, it
// MUST skip picture updates rather than interrupt or slow the sound." The property is only tested
// if the picture really cannot keep up, so each test first proves that it did not — Frames were
// skipped (`sum(frame-rendered.skipped) > 0`, ADR 0013; `frames-dropped` is counted separately and
// only reported) — and then that the sound was untouched by it.
//
// ## Making the picture degrade, honestly
//
// Measured on an Apple M4 with 16 GB (quickstart's reference chip; macOS 26.6.2 and Chrome 156
// rather than the 26.5.2 and 150 it names), playing `sync-1080p30.mp4` from 0 to the end:
//
//   * DevTools' CPU throttling through CDP (`Emulation.setCPUThrottlingRate` on the page's session)
//     slows the page's main thread only. At quickstart's 6×, and at 10×, not one Frame was skipped:
//     the engine's Worker is not throttled, and the main thread's share of playback — one rAF tick
//     and a `currentTime` read per display frame — is light enough to survive it. At 20× the main
//     thread itself becomes the bottleneck (the clock is asked late) and some Frames are skipped.
//   * CDP refuses to throttle the Worker directly: attaching to the worker target and sending
//     `Emulation.setCPUThrottlingRate` answers "Operation is only supported for pages, not
//     workers".
//
// So there are two tests, one per thread that can starve:
//
//   1. **the engine's thread** — the realistic case, a machine too slow to decode and composite
//      1080p in time. The probe starts the engine inside a bootstrap module worker that runs a
//      duty-cycle busy loop on the worker's own thread (100 ms busy, then a 10 ms yield; about 90 %
//      of the thread) and then runs the engine's real module unchanged. The decoders, the
//      compositor *and the audio decode* share what is left — the audio decode living in the
//      worker (T059) is exactly why this is the test that matters;
//   2. **the main thread** — CDP throttling at 20×, the lowest rate that degraded the picture here.
//      This is where the transport's clock is read and every `AudioBufferSourceNode` is scheduled
//      (ADR 0008), so it tests the graph's lookahead rather than the engine.
//
// ## What "the sound is untouched" means here
//
// Read off the `AudioBufferSourceNode`s the graph started (playback-probe.ts):
//
//   * **not interrupted** — every node's stretch of the audio clock merges into one run, with no
//     instant given sound twice, and no node started late (a late chunk is cut short at the front,
//     which is a gap);
//   * **not slowed** — the run begins at the anchor and ends exactly 30 s of audio clock later,
//     every node sits on the Timeline's sample grid, and every whole-second click of the fixture
//     sounds once, on its second, at the same sample of it — second 0 included (until the engine
//     decoded the AAC priming packet, the first ~600 samples from Frame 0 came out as zeros and
//     a fade-in);
//   * **not cut at the start** — the transport anchors once the start's sound is in hand, so the
//     first nodes are as early as any: a start margin after the press at least, never late. Under
//     the main-thread load this was the one place sound yielded, with the old fixed 0.1 s delay;
//   * **picture follows rather than holds the sound back** — the Frames shown only ever move
//     forwards, none is ever ahead of the sound, the lag does not accumulate (the last seconds lag
//     no more than the first), and the transport stops on the sound's last instant with the
//     Timeline's last Frame on screen.

const FIXTURE = "sync-1080p30.mp4"
const FRAMES = 900
/** The fixture's Timebase (scripts/make-fixtures.ts). */
const TIMEBASE: Timebase = { numerator: 30, denominator: 1 }
const SECONDS = FRAMES / timebaseAsNumber(TIMEBASE)

/** 90 % of the engine's thread: spin 100 ms, yield 10 ms. */
const ENGINE_LOAD: WorkerLoad = { busyMs: 100, idleMs: 10 }
/** The lowest page throttling rate that degraded the picture on the reference machine. */
const MAIN_THREAD_THROTTLE = 20

async function openAndPark(page: Page, workerLoad?: WorkerLoad): Promise<void> {
  await installPlaybackProbe(page, workerLoad === undefined ? {} : { workerLoad })
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE)
  await importFixture(page, 1)
  await parkAt(page, 0)
}

/**
 * How late, in Frames past the end, the transport may notice it. It notices on an animation frame,
 * so on an idle main thread that is under one Frame; under the page throttle an animation frame
 * itself comes late (measured: up to 1.22 Frames past the end in 1 of 20 runs). The sound is not
 * what is late — it ends exactly 30 s after the anchor, asserted above — only the stop's post.
 */
const STOP_SLACK_FRAMES = { engine: 1, mainThread: 3 } as const

async function playToTheEndAndCheck(
  page: Page,
  load: string,
  stopSlackFrames: number
): Promise<void> {
  await play(page)
  await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "false", {
    timeout: (SECONDS + 15) * 1_000,
  })
  const log = await probeLog(page)
  const run = firstRun(log)
  const sound = measureSound(run.nodes)
  const stoppedAt = run.stoppedAt?.contextTime ?? null
  if (stoppedAt === null || run.playingAt.contextTime === null) {
    throw new Error("the run's transport posts carry no audio clock reading")
  }
  const shown = pictureAgainstSound(run.rendered, {
    anchor: sound.anchor,
    timebase: TIMEBASE,
    fromFrame: 0,
    endsAt: stoppedAt,
  })

  const skipped = run.rendered.reduce((sum, r) => sum + r.skipped, 0)
  const dropped = run.dropped.reduce((sum, d) => sum + d.count, 0)
  const lags = shown.filter((s) => s.soundAtArrival >= 0).map((s) => s.lag)
  const lagIn = (from: number, until: number) =>
    shown
      .filter(
        (s) =>
          s.soundAtArrival >= from * timebaseAsNumber(TIMEBASE) &&
          s.soundAtArrival < until * timebaseAsNumber(TIMEBASE)
      )
      .map((s) => s.lag)
  const early = lagIn(1, 6)
  const late = lagIn(SECONDS - 5, SECONDS)
  const deviations = sound.clicks.map((c) => Math.abs(c.deviation))
  // Where a click is first heard inside its second; the same for every second, Frame 0's too.
  const onset = sound.clicks[1]?.deviation ?? Number.NaN
  const stopPosition = (stoppedAt - sound.anchor) * timebaseAsNumber(TIMEBASE)
  const firstLeads = run.nodes.slice(0, 3).map((n) => ((n.when - n.calledAt) * 1_000).toFixed(1))

  test.info().annotations.push(
    { type: "load", description: load },
    {
      type: "picture",
      description:
        `${shown.length} Frames shown of ${FRAMES}, sum(skipped) ${skipped}` +
        ` (${((100 * skipped) / FRAMES).toFixed(1)} %), longest skip ${Math.max(...shown.map((s) => s.skipped))}` +
        `, frames-dropped ${dropped}, clock requests ${run.requested.length}` +
        (log.loadSpins === null ? "" : `, busy-loop spins ${log.loadSpins}`),
    },
    {
      type: "picture lag (Frames after its own start)",
      description:
        `p50 ${percentile(lags, 50).toFixed(2)}, p99 ${percentile(lags, 99).toFixed(2)}, max ${Math.max(...lags).toFixed(2)}` +
        `; seconds 1–6 p50 ${percentile(early, 50).toFixed(2)}, last 5 s p50 ${percentile(late, 50).toFixed(2)}` +
        `; worst drift ${Math.max(...shown.map((s) => s.drift)).toFixed(2)} Frames`,
    },
    {
      type: "sound",
      description:
        `${sound.nodes} nodes in ${sound.runs.length} run(s), ${sound.overlaps.length} overlaps, ${sound.lateNodes} late` +
        ` (least lead ${(sound.leastLeadSeconds * 1_000).toFixed(1)} ms)` +
        `, span ${((sound.runs.at(-1)!.until - sound.runs[0]!.from) * 1_000).toFixed(3)} ms` +
        `, grid residual ${sound.worstGridResidual.toExponential(1)} samples` +
        `, ${sound.clicks.length} clicks, seconds 0–${SECONDS - 1} at most ${Math.max(...deviations).toFixed(3)} samples off the second` +
        ` (second 0 at ${sound.clicks[0]?.deviation.toFixed(3)})`,
    },
    {
      type: "start",
      description:
        `anchor ${((sound.anchor - run.playingAt.contextTime) * 1_000).toFixed(1)} ms after the press` +
        `; first nodes' leads ${firstLeads.join(", ")} ms` +
        `; stop noticed at sound position ${stopPosition.toFixed(2)} Frames (end ${FRAMES})`,
    }
  )

  // The load did what it is for: the picture could not keep up and skipped Frames.
  expect(skipped, "the picture did not degrade: no Frame was skipped").toBeGreaterThan(0)

  // Sound: one unbroken run, nothing twice, nothing late, from the anchor for exactly 30 s.
  const tolerance = 1 / sound.sampleRate
  expect(sound.overlaps, "instants given sound twice").toEqual([])
  expect(sound.runs, "the sound broke into separate runs").toHaveLength(1)
  expect(sound.lateNodes, "nodes started too late to play from their start").toBe(0)
  expect(Math.abs(sound.runs[0]!.from - sound.anchor)).toBeLessThan(tolerance)
  expect(Math.abs(sound.runs[0]!.until - (sound.anchor + SECONDS))).toBeLessThan(tolerance)
  expect(sound.worstGridResidual).toBeLessThan(0.01)
  // The anchor is the transport's: once the start's sound was in hand, the start margin (0.05 s)
  // ahead, so never sooner than that after the press. How much later is the load's business.
  // The nodes are scheduled the limiter's measured delay early so that they are *heard* on the
  // anchor (ADR 0022); the margin is about when sound is heard, so the delay is added back.
  const limiterDelay = await page.evaluate(
    async ({ specifier, rate }) => {
      const module = (await import(specifier)) as {
        measureBrowserLimiterDelay(sampleRate: number): Promise<number>
      }
      return module.measureBrowserLimiterDelay(rate)
    },
    { specifier: "/src/audio/limiter-delay.ts", rate: sound.sampleRate }
  )
  expect(sound.anchor + limiterDelay - run.playingAt.contextTime).toBeGreaterThanOrEqual(
    0.05 - 0.005
  )
  // Every whole-second click, once, within a millisecond of its second, and all at the same sample
  // of it, second 0 included. (On the fixture each is first above the threshold at sample +7, as
  // ffmpeg decodes it.)
  expect(sound.clicks.map((c) => c.second)).toEqual(Array.from({ length: SECONDS }, (_, i) => i))
  expect(Math.max(...deviations)).toBeLessThan(sound.sampleRate / 1_000)
  for (const click of sound.clicks) expect(Math.abs(click.deviation - onset)).toBeLessThan(0.01)

  // Picture follows the sound: forwards only, never ahead, lag not accumulating.
  for (let i = 1; i < shown.length; i++) {
    expect(shown[i]!.frame, "the picture went backwards").toBeGreaterThan(shown[i - 1]!.frame)
  }
  const ahead = shown.filter((s) => s.soundAtArrival >= 0 && s.lag < -0.01)
  expect(ahead, "Frames shown before their sound").toEqual([])
  expect(percentile(late, 50)).toBeLessThanOrEqual(percentile(early, 50) + 1)

  // It stopped on the sound's last instant, with the last Frame on screen.
  expect(stopPosition).toBeGreaterThanOrEqual(FRAMES)
  expect(stopPosition).toBeLessThan(FRAMES + stopSlackFrames)
  expect(await settledFrame(page)).toBe(FRAMES - 1)
  expect((await readCounter(page)).text).toBe(counterText(FRAMES - 1))
}

test("with the engine's thread ~90 % busy, the picture skips Frames and the sound does not break", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await openAndPark(page, ENGINE_LOAD)
  await playToTheEndAndCheck(
    page,
    `engine worker busy loop: ${ENGINE_LOAD.busyMs} ms busy, ${ENGINE_LOAD.idleMs} ms idle`,
    STOP_SLACK_FRAMES.engine
  )
})

test("with the main thread CPU-throttled 20×, the picture skips Frames and the sound does not break", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await openAndPark(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: MAIN_THREAD_THROTTLE })
  try {
    await playToTheEndAndCheck(
      page,
      `CDP Emulation.setCPUThrottlingRate ${MAIN_THREAD_THROTTLE}× on the page`,
      STOP_SLACK_FRAMES.mainThread
    )
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  }
})
