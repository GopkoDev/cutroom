import { expect, test } from "@playwright/test"

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

// T072 (SC-004): "A 1080p 30 fps Source of up to 10 minutes plays back at full rate on the
// reference machine named in quickstart.md, with no audio interruption."
//
// `sync-1080p30-10min.mp4` is played unthrottled from Frame 0 to the end (T068 stops it), and every
// Frame is accounted for from the engine's own words: each `frame-rendered` is a Frame shown, its
// `skipped` the Frames playback passed over to reach it (ADR 0013 — the measure of a picture that
// cannot keep up), and `frames-dropped` the requests that got no picture at all, counted
// separately.
//
// ## Full rate, defined
//
// Decided before the first ten-minute run, not fitted to it:
//
//   * **in every minute, at most one Frame skipped** (≤ 1 of 1 800, 0.06 %) — so a decoder that
//     leaks or a queue that grows cannot hide in an average: minute 9 is judged on its own, against
//     the same bar as minute 0;
//   * **never two Frames in a row** (`skipped ≤ 1` on every `frame-rendered`) — one missed
//     thirtieth is a held Frame nobody sees; two is a visible hitch;
//   * **no `frames-dropped`** — every clock request was drawn;
//   * **every Frame accounted for** — the Frames shown plus the Frames skipped are exactly
//     0 … 17 999, ending on the Timeline's last Frame;
//   * **and no audio interruption** — the sound is one unbroken run of exactly 600 s, nothing
//     scheduled twice, nothing scheduled late.
//
// The exact counts are annotations per minute, so a reader who wants "zero, full stop" can see
// whether it was. So are the Frame interval (arrival to arrival, p50/p99/max) and the lag of each
// Frame after its own start on the audio clock, per minute — the numbers a slow leak would move
// first, before it costs a Frame.
//
// Measured on this machine only: quickstart.md names the reference, and a number from different
// hardware is informative, not a verdict.

const FIXTURE = "sync-1080p30-10min.mp4"
const FRAMES = 18_000
const FPS = 30
const SECONDS = FRAMES / FPS
const MINUTE = 60 * FPS
const MINUTES = FRAMES / MINUTE

/** At most this many Frames skipped in any one minute. */
const SKIPPED_PER_MINUTE = 1
/** At most this many Frames skipped in a row. */
const LONGEST_SKIP = 1

test(
  "ten minutes of 1080p30 play at full rate with no break in the sound",
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
    const stoppedAt = run.stoppedAt?.contextTime ?? null
    if (stoppedAt === null) throw new Error("the stop carries no audio clock reading")
    const shown = pictureAgainstSound(run.rendered, {
      anchor: sound.anchor,
      fps: FPS,
      fromFrame: 0,
      endsAt: stoppedAt,
    })

    // ---- every Frame, attributed to its minute: shown, or skipped on the way to one
    const frameShown = new Set(shown.map((s) => s.frame))
    const skippedFrames: number[] = []
    for (const s of shown) for (let f = s.frame - s.skipped; f < s.frame; f++) skippedFrames.push(f)
    const minuteOf = (frame: number) => Math.floor(frame / MINUTE)
    const droppedByMinute = new Array<number>(MINUTES).fill(0)
    for (const d of run.dropped) {
      const at = d.contextTime === null ? 0 : (d.contextTime - sound.anchor) * FPS
      droppedByMinute[Math.min(MINUTES - 1, Math.max(0, minuteOf(at)))]! += d.count
    }

    const perMinute = Array.from({ length: MINUTES }, (_, m) => {
      const inMinute = run.rendered.filter((r) => minuteOf(r.frame) === m)
      // Arrival to arrival, from Frame 1: Frame 0 is drawn at the press, before the sound starts.
      const paced = inMinute.filter((r) => r.frame > 0)
      const intervals = paced.slice(1).map((r, i) => r.at - paced[i]!.at)
      const lags = shown
        .filter((s) => minuteOf(s.frame) === m && s.soundAtArrival >= 0)
        .map((s) => s.lag)
      return {
        minute: m,
        shown: inMinute.length,
        skipped: skippedFrames.filter((f) => minuteOf(f) === m).length,
        longestSkip: Math.max(0, ...inMinute.map((r) => r.skipped)),
        dropped: droppedByMinute[m]!,
        intervals,
        lags,
      }
    })
    for (const m of perMinute) {
      test.info().annotations.push({
        type: `minute ${m.minute}`,
        description:
          `shown ${m.shown}, skipped ${m.skipped} (longest ${m.longestSkip}), frames-dropped ${m.dropped}` +
          `; Frame interval p50 ${percentile(m.intervals, 50).toFixed(1)} p99 ${percentile(m.intervals, 99).toFixed(1)}` +
          ` max ${Math.max(...m.intervals).toFixed(1)} ms` +
          `; lag p50 ${percentile(m.lags, 50).toFixed(2)} p99 ${percentile(m.lags, 99).toFixed(2)} Frames`,
      })
    }
    const totalSkipped = skippedFrames.length
    // Where a skip came from: a Frame the transport never asked for was passed over on the main
    // thread (no animation frame ran while it was current); one asked for and not drawn, in the
    // engine.
    const asked = new Set(run.requested.map((r) => r.frame))
    const neverAsked = skippedFrames.filter((f) => !asked.has(f))
    test.info().annotations.push({
      type: "skipped Frames",
      description:
        skippedFrames.length === 0
          ? "none"
          : `${skippedFrames.join(", ")}; ${neverAsked.length} of them never requested by the transport`,
    })
    const totalDropped = run.dropped.reduce((n, d) => n + d.count, 0)
    test.info().annotations.push(
      {
        type: "total",
        description:
          `${shown.length} shown + ${totalSkipped} skipped of ${FRAMES} Frames` +
          `; frames-dropped ${totalDropped}; ${run.requested.length} clock requests` +
          `; last Frame shown ${shown.at(-1)?.frame}`,
      },
      {
        type: "sound",
        description:
          `${sound.nodes} nodes in ${sound.runs.length} run(s), ${sound.overlaps.length} overlaps, ${sound.lateNodes} late` +
          ` (least lead ${(sound.leastLeadSeconds * 1_000).toFixed(1)} ms)` +
          `; span ${(sound.runs.at(-1)!.until - sound.runs[0]!.from).toFixed(6)} s`,
      }
    )

    // ---- no audio interruption
    const sample = 1 / sound.sampleRate
    expect(sound.overlaps, "instants given sound twice").toEqual([])
    expect(sound.runs, "the sound broke into separate runs").toHaveLength(1)
    expect(sound.lateNodes, "nodes started too late to play from their start").toBe(0)
    expect(Math.abs(sound.runs[0]!.from - sound.anchor)).toBeLessThan(sample)
    expect(Math.abs(sound.runs[0]!.until - (sound.anchor + SECONDS))).toBeLessThan(sample)

    // ---- every Frame accounted for, once
    expect(shown.length, "a Frame was reported shown twice").toBe(frameShown.size)
    expect(new Set(skippedFrames).size + frameShown.size).toBe(FRAMES)
    expect(shown.at(-1)?.frame).toBe(FRAMES - 1)
    expect(shown[0]?.frame).toBe(0)

    // ---- full rate, minute by minute
    expect(totalDropped, "clock requests that got no picture").toBe(0)
    for (const m of perMinute) {
      expect(m.skipped, `Frames skipped in minute ${m.minute}`).toBeLessThanOrEqual(
        SKIPPED_PER_MINUTE
      )
      expect(m.longestSkip, `longest skip in minute ${m.minute}`).toBeLessThanOrEqual(LONGEST_SKIP)
    }

    expect(await settledFrame(page)).toBe(FRAMES - 1)
  }
)
