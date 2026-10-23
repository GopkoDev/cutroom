import { expect, test } from "@playwright/test"

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
} from "./playback-probe"

// T069 (SC-002, FR-011, FR-013): "Picture and sound stay in sync within one Frame over 10 minutes
// of continuous playback of a 1080p file."
//
// `sync-1080p30-10min.mp4` — one Clip, Frames 0–17 999 at 30/1 — is played from Frame 0 straight
// to the end, where the transport stops by itself (T068). Not looped, not stitched from Clips, not
// restarted: one anchor for ten minutes, so any cumulative error has the whole run to show.
//
// ## Against what
//
// Sync is a relation between two things, so each is measured on its own and only then compared,
// on the one clock both are played against — the transport's `AudioContext.currentTime`, which
// the probe holds from the constructor (playback-probe.ts):
//
//   * **the sound** — where it was put. The anchor is the origin of the run's first
//     `AudioBufferSourceNode` (the instant Timeline sample 0 sounds), and is then checked rather
//     than trusted: every node over the ten minutes must sit on the Timeline's 48 kHz sample grid
//     from it, they must butt into one unbroken run with nothing twice, the run must end exactly
//     600 s of audio clock after it, and the fixture's click on every whole second must sound on
//     its second. So "where Frame f sounds" is `anchor + f/30`, established by the sound itself;
//   * **the picture** — what the engine said it drew. Every `frame-rendered` is stamped with
//     `currentTime` as it reaches the main thread. While Frame f is the one showing — from its
//     arrival until the next Frame's — the sound must stay within one Frame of f's own interval
//     `[f, f + 1)`: the *drift* of `pictureAgainstSound`, checked at its worst moment (just before
//     the next Frame replaces it, or on arrival if the picture were early). Under 1 at every one of
//     the ~18 000 samples, and at the finish.
//
// Also checked, because a picture can only follow a clock that is right: every `render-frame`
// the transport posted with `reason: "clock"` names the Frame the sound was in when it was posted.
//
// What this does not see: the compositor's present after `frame-rendered` (up to a display frame,
// ~0.5 Frame here) and the output device's latency (`outputLatency`, recorded) — `currentTime` is
// the sample being rendered, slightly ahead of the one being heard. Both are constant offsets,
// not drift; both are annotated.

const FIXTURE = "sync-1080p30-10min.mp4"
const FRAMES = 18_000
/** The fixture's Timebase (scripts/make-fixtures.ts). */
const TIMEBASE: Timebase = { numerator: 30, denominator: 1 }
const SECONDS = FRAMES / timebaseAsNumber(TIMEBASE)
const MINUTE = 60 * timebaseAsNumber(TIMEBASE)

test(
  "picture and sound stay within one Frame for ten minutes of continuous playback",
  { tag: "@slow" },
  async ({ page }) => {
    test.setTimeout(13 * 60_000)
    await installPlaybackProbe(page)
    const picker = await installFilePicker(page)
    await newProject(page)
    await picker.queue(FIXTURE)
    await importFixture(page, 1)
    await expect(page.getByTestId("timeline-clip")).toHaveAttribute(
      "data-duration-frames",
      String(FRAMES)
    )
    await parkAt(page, 0)

    await play(page)
    await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "false", {
      timeout: (SECONDS + 60) * 1_000,
    })

    const log = await probeLog(page)
    const run = firstRun(log)
    const sound = measureSound(run.nodes)
    const playedAt = run.playingAt.contextTime
    const stoppedAt = run.stoppedAt?.contextTime ?? null
    if (playedAt === null || stoppedAt === null) {
      throw new Error("the run's transport posts carry no audio clock reading")
    }
    const position = (t: number) => (t - sound.anchor) * timebaseAsNumber(TIMEBASE)
    const shown = pictureAgainstSound(run.rendered, {
      anchor: sound.anchor,
      timebase: TIMEBASE,
      fromFrame: 0,
      endsAt: stoppedAt,
    })

    // ---- numbers, per minute and overall
    const sounding = shown.filter((s) => s.soundAtArrival >= 0)
    for (let m = 0; m < SECONDS / 60; m++) {
      const inMinute = sounding.filter((s) => s.frame >= m * MINUTE && s.frame < (m + 1) * MINUTE)
      const lags = inMinute.map((s) => s.lag)
      test.info().annotations.push({
        type: `minute ${m}`,
        description:
          `${inMinute.length} Frames shown; lag p50 ${percentile(lags, 50).toFixed(2)}` +
          ` p99 ${percentile(lags, 99).toFixed(2)} max ${Math.max(...lags).toFixed(2)} Frames;` +
          ` worst drift ${Math.max(...inMinute.map((s) => s.drift)).toFixed(2)} Frames`,
      })
    }
    const requests = run.requested.filter(
      (r): r is typeof r & { contextTime: number; frame: number } =>
        r.contextTime !== null && r.frame !== undefined && position(r.contextTime) >= 0
    )
    const requestErrors = requests.map((r) => position(r.contextTime) - r.frame)
    const worst = shown.reduce((a, b) => (b.drift > a.drift ? b : a))
    const stopPosition = position(stoppedAt)
    const deviations = sound.clicks.map((c) => Math.abs(c.deviation))
    // Where a click is first heard inside its second; the same for every second, Frame 0's too.
    const onset = sound.clicks[1]?.deviation ?? Number.NaN
    test.info().annotations.push(
      {
        type: "drift",
        description:
          `worst ${worst.drift.toFixed(3)} Frames (Frame ${worst.frame}), over ${shown.length} Frames shown` +
          `; stopped at sound position ${stopPosition.toFixed(3)} Frames (end ${FRAMES})`,
      },
      {
        type: "clock requests",
        description:
          `${requests.length} clock Frames posted; sound position − requested Frame` +
          ` min ${Math.min(...requestErrors).toFixed(3)} max ${Math.max(...requestErrors).toFixed(3)}`,
      },
      {
        type: "sound",
        description:
          `${sound.nodes} nodes in ${sound.runs.length} run(s), ${sound.overlaps.length} overlaps, ${sound.lateNodes} late` +
          `; span ${(sound.runs.at(-1)!.until - sound.runs[0]!.from).toFixed(6)} s` +
          `; grid residual ${sound.worstGridResidual.toExponential(1)} samples` +
          `; ${sound.clicks.length} clicks, seconds 0–${SECONDS - 1} at most ${Math.max(...deviations).toFixed(3)} samples off` +
          ` (second 0 at ${sound.clicks[0]?.deviation.toFixed(3)})` +
          `; anchor ${((sound.anchor - playedAt) * 1_000).toFixed(2)} ms after the press`,
      },
      {
        type: "not measured, constant",
        description:
          `outputLatency ${log.outputLatency} s, baseLatency ${log.baseLatency} s` +
          `, context rate ${log.contextSampleRate} Hz; skipped ${shown.reduce((n, s) => n + s.skipped, 0)}` +
          `, frames-dropped ${run.dropped.reduce((n, d) => n + d.count, 0)}`,
      }
    )

    // ---- the sound is where the anchor says, for all ten minutes
    const sample = 1 / sound.sampleRate
    expect(sound.overlaps, "instants given sound twice").toEqual([])
    expect(sound.runs, "the sound broke into separate runs").toHaveLength(1)
    expect(sound.lateNodes, "nodes started too late to play from their start").toBe(0)
    expect(Math.abs(sound.runs[0]!.from - sound.anchor)).toBeLessThan(sample)
    expect(Math.abs(sound.runs[0]!.until - (sound.anchor + SECONDS))).toBeLessThan(sample)
    expect(sound.worstGridResidual, "a node off the Timeline's sample grid").toBeLessThan(0.01)
    // The anchor is the transport's: once the start's sound was in hand, START_MARGIN_SECONDS
    // (0.05 s) ahead — never sooner than that after the press, and on an idle machine soon after.
    expect(sound.anchor - playedAt).toBeGreaterThanOrEqual(0.05 - 0.005)
    expect(sound.anchor - playedAt).toBeLessThan(0.05 + 0.1)
    // Every whole-second click, once, each within 1 ms of its second and all at the same sample
    // of it — second 0 included, which before T070's fix lost its first ~600 samples to the AAC
    // decoder's cold start (the priming packet skipped).
    expect(sound.clicks.map((c) => c.second)).toEqual(Array.from({ length: SECONDS }, (_, i) => i))
    expect(Math.max(...deviations)).toBeLessThan(sound.sampleRate / 1_000)
    for (const click of sound.clicks) expect(Math.abs(click.deviation - onset)).toBeLessThan(0.01)

    // ---- the clock asked for the Frame the sound was in
    const offClock = requests.filter(
      (_, i) => requestErrors[i]! < -0.01 || requestErrors[i]! >= 1.01
    )
    expect(offClock.slice(0, 10), `${offClock.length} clock requests off the sound`).toEqual([])
    expect(run.requested.at(-1)?.frame).toBe(FRAMES - 1)

    // ---- the picture stayed within one Frame of the sound, at every sample and at the finish
    const outOfSync = shown.filter((s) => s.drift >= 1)
    expect(
      outOfSync.slice(0, 10),
      `${outOfSync.length} Frames out of sync by a Frame or more`
    ).toEqual([])
    expect(stopPosition).toBeGreaterThanOrEqual(FRAMES)
    expect(stopPosition).toBeLessThan(FRAMES + 1)
    expect(shown.at(-1)?.frame).toBe(FRAMES - 1)
    expect(await settledFrame(page)).toBe(FRAMES - 1)
    expect((await readCounter(page)).text).toBe(counterText(FRAMES - 1))
  }
)
