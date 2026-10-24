import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { timebaseAsNumber, type Timebase } from "@cutroom/model"

import type * as EditorStore from "../src/store"

import { STORE_MODULE } from "./editor-fixtures"
import { installFilePicker } from "./file-picker"
import { importFixture, newProject, parkAt, play } from "./playback"
import {
  firstRun,
  installPlaybackProbe,
  measureSound,
  percentile,
  pictureAgainstSound,
  probeLog,
  limiterDelay,
} from "./playback-probe"

// T020 (AC-16, AC-17, AC-23; spec §6): the drag, Preview, undo and two-Track playback budgets,
// measured on a heavy Project ("two video Tracks holding 100 Clips in total, taken from 1080p
// 30 fps Sources") rather than assumed. Nothing here is a threshold of this file's own choosing:
// every bar is spec §6 verbatim, and a miss is recorded as a miss, not argued with.
//
// ## What is timed, and on which clock
//
// All in the page, on `performance.now()`, started at the `timeStamp` of the input event the
// browser says the user made (caught in the capture phase on `window`, as scrub-latency.spec.ts
// does), so React's handler queue is inside the number:
//
//   * **drag feedback** — pointermove → the first animation frame at which the dragged Clip's
//     ghost (move) or live edge (Trim) shows the Frame that pointer position means;
//   * **Preview after an edit** — pointerup (drags) or keydown (Split) → the `preview-shown` text
//     naming the Playhead's Frame of a Scene newer than the one before the edit;
//   * **undo / redo** — keydown → the first animation frame at which the affected Clip's
//     `data-start-frame` is the one the step restores / re-applies.
//
// A page watcher is armed for one event at a time and the next move waits for its answer, so no
// two samples overlap. Long tasks come from a PerformanceObserver over the whole drag.
//
// ## The evidence file
//
// Each test records its numbers in `_evidence/performance.json` (merged, so the regular and the
// `@slow` runs add to each other) and the after-all hook renders `_evidence/performance.md`.

test.describe.configure({ timeout: 180_000 })

const WAIT = { timeout: 5_000 }
const TIMEBASE: Timebase = { numerator: 30, denominator: 1 }
const FPS = timebaseAsNumber(TIMEBASE)
const FIXTURE = "sync-1080p30.mp4"
const SOURCE_FRAMES = 900

// Spec §6, verbatim.
const DRAG_P95_MS = 16.7
const LONG_TASK_MS = 50
const PREVIEW_P95_MS = 300
const UNDO_P95_MS = 100
const SKIPPED_MAX = 0.01

// ---------------------------------------------------------------- the evidence

interface Section {
  readonly title: string
  readonly target: string
  readonly pass: boolean
  readonly numbers: Record<string, string | number>
  readonly notes?: string
}

interface Evidence {
  machine: Record<string, string | number>
  sections: Record<string, Section & { ranAt: string; load?: string }>
}

const EVIDENCE_DIR = path.resolve(process.cwd(), "../../docs/features/editing/_evidence")
const EVIDENCE_JSON = path.join(EVIDENCE_DIR, "performance.json")
const EVIDENCE_MD = path.join(EVIDENCE_DIR, "performance.md")
const recorded: Record<string, Section & { ranAt: string; load: string }> = {}
let machine: Record<string, string | number> = {}

/** The 1-, 5- and 15-minute load averages, as `uptime` prints them. */
const loadNow = (): string =>
  os
    .loadavg()
    .map((n) => n.toFixed(2))
    .join(" / ")

async function describeMachine(page: Page): Promise<void> {
  machine = {
    cpu: os.cpus()[0]?.model ?? "unknown",
    cores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 2 ** 30),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    chrome: page.context().browser()?.version() ?? "unknown",
    loadAverageAtStart: loadNow(),
  }
}

function record(key: string, section: Section): void {
  // The load as the measurement ends, next to its numbers: a miss under load is provisional.
  recorded[key] = { ...section, ranAt: new Date().toISOString(), load: loadNow() }
  test.info().annotations.push({
    type: key,
    description: `${section.pass ? "PASS" : "MISS"} — ${JSON.stringify(section.numbers)}`,
  })
}

function render(evidence: Evidence): string {
  const lines: string[] = [
    "# Editing performance — measured against spec §6",
    "",
    "Written by `apps/editor/e2e/editing-performance.spec.ts` (T020). The bars are spec §6 verbatim;",
    "a miss is recorded as a miss and the threshold is not adjusted.",
    "",
    "> **Caveat: this is not the reference machine.** Spec §6 names a MacBook Air M4 with Chrome.",
    "> The machine below is whatever ran the suite, with the load it was under when each run began.",
    "> The owner re-runs this on the reference machine; these numbers are not a verdict on it.",
    "",
    "## Machine (last run)",
    "",
    ...Object.entries(evidence.machine).map(([k, v]) => `- ${k}: ${String(v)}`),
    "",
    "## Results",
    "",
    "| Budget | Target | Result | Load (1 / 5 / 15 min) |",
    "|---|---|---|---|",
    ...Object.values(evidence.sections).map(
      (s) =>
        `| ${s.title} | ${s.target} | ${s.pass ? "pass" : "**MISS**"} | ${s.load ?? "not recorded"} |`
    ),
  ]
  for (const s of Object.values(evidence.sections)) {
    lines.push(
      "",
      `### ${s.title}`,
      "",
      `Target: ${s.target}. Result: ${s.pass ? "pass" : "MISS"}.`
    )
    lines.push("", "| Measure | Value |", "|---|---|")
    for (const [k, v] of Object.entries(s.numbers)) lines.push(`| ${k} | ${String(v)} |`)
    lines.push("", `Run: ${s.ranAt}, load ${s.load ?? "not recorded"}`)
    if (s.notes !== undefined) lines.push("", s.notes)
    if (!s.pass)
      lines.push(
        "",
        "**Miss.** The threshold was not changed. The load the run began under is in Machine " +
          "above; a miss under load is re-run on a quiet machine, and then on the reference " +
          "machine, before it is decided on (sad §11)."
      )
  }
  lines.push(
    "",
    "## History",
    "",
    "Playback across Edit points first missed SC-002's bar: the first Frame of each next Clip",
    "arrived 1.1–1.6 Frames late at most cuts (3 of 3 runs, no Frame skipped, sound unbroken).",
    "The sad §11 mitigation followed: the engine now prepares the Clips starting within half a",
    "second — sink built, stream opened at their first Frame — while playing",
    "(`packages/engine/src/playback/stream.ts`, `PREPARE_AHEAD_FRAMES`). It has passed since.",
    "The picture/sound comparisons measure against the sound as heard: the anchor plus the",
    "limiter's measured delay (ADR 0022).",
    "",
    "On 2026-10-24 one run of Playback across Edit points under a load of 32.74 / 21.21 / 17.96",
    "(a background spike that began during the run) missed on its last Frame only: 3597 of 3600",
    "Frames drawn, Frame 3596 held 3.42 Frames past its interval until the stop at the end, no",
    "Frame skipped before it. Re-run at load 5.74 → 2.48 it passed (3600 drawn, worst drift 0.42",
    "Frames). Treated as provisional, caused by the load, not as a failure of the bar.",
    "",
    "The same day, inside the full e2e suite at load 22.30 / 16.15 / 16.11, the move drag missed",
    "with p95 17.2 ms (5 of 60 moves over 16.7 ms, no long task). Re-run at load 6.16 it passed",
    "(p95 13.9 ms). Also treated as provisional, caused by the load."
  )
  lines.push(
    "",
    "## Inherited: the ten-minute specs (open item, not this feature's)",
    "",
    "T020 re-ran the two `@slow` ten-minute specs its fixes touched (the picture is now measured",
    "against the sound as heard, ADR 0022). av-sync.spec.ts (SC-002) failed once with the load",
    "unrecorded, then passed at load 2.5 rising to 24.6. playback-rate.spec.ts (SC-004: at most one",
    "Frame skipped per minute) failed on every run: 2 Frames skipped in minute 1 (Frames 3597–3598,",
    "at load 2.9) and 2 in minute 5 (Frames 9019–9020, at load 20) on this branch. The same spec",
    "on `main` (69d805d), at load 2.5–5.5 through minute 1, failed the same way: Frames 3597–3599",
    "skipped. In both, the transport never requested those Frames, so the main thread stalled",
    "about 120 ms near the two-minute mark. The stall predates editing. It is recorded as an open",
    "item against import-play-export's SC-004 and was not fixed here; the bar was not changed.",
    "Decided by the agent on the owner's delegation, 2026-10-24."
  )
  lines.push(
    "",
    "## Long-GOP (SC-003)",
    "",
    "Not measured here. Per sad §10 QG-3b the long-GOP backward jumps (301–313 ms, ADR 0017) are",
    "accepted and do not gate merge; this closes spec §8's SC-003 item for this feature.",
    ""
  )
  return lines.join("\n")
}

test.afterAll(() => {
  if (Object.keys(recorded).length === 0) return
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  let evidence: Evidence = { machine, sections: {} }
  try {
    evidence = JSON.parse(readFileSync(EVIDENCE_JSON, "utf8")) as Evidence
  } catch {
    // first run
  }
  evidence.machine = machine
  Object.assign(evidence.sections, recorded)
  writeFileSync(EVIDENCE_JSON, JSON.stringify(evidence, null, 2) + "\n")
  writeFileSync(EVIDENCE_MD, render(evidence))
})

const ms = (n: number): string => `${n.toFixed(1)} ms`

function stats(values: readonly number[]): Record<string, string | number> {
  return {
    samples: values.length,
    p50: ms(percentile(values, 50)),
    p95: ms(percentile(values, 95)),
    max: ms(Math.max(...values)),
  }
}

// ---------------------------------------------------------------- the page watcher

type Watch =
  | { kind: "attr"; selector: string; attr: string; value: string }
  | { kind: "preview"; above: number }

interface Perf {
  arm(on: "pointermove" | "pointerup" | "keydown", watch: Watch): void
  wait(): Promise<number | null>
  now(): number
  longTasks(since: number): number[]
}

async function installWatcher(page: Page): Promise<void> {
  await page.evaluate(() => {
    const long: { start: number; duration: number }[] = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) long.push({ start: e.startTime, duration: e.duration })
    }).observe({ type: "longtask" })

    interface Armed {
      on: string
      watch: Watch
      started: boolean
      resolve: (value: number | null) => void
      result: Promise<number | null>
    }
    let armed: Armed | null = null
    const perf: Perf = {
      arm(on, watch) {
        let resolve: (value: number | null) => void = () => undefined
        const result = new Promise<number | null>((r) => (resolve = r))
        armed = { on, watch, started: false, resolve, result }
      },
      wait: () => armed!.result,
      now: () => performance.now(),
      longTasks: (since) => long.filter((e) => e.start >= since).map((e) => e.duration),
    }
    ;(window as unknown as { __perf: Perf }).__perf = perf

    for (const type of ["pointermove", "pointerup", "keydown"] as const) {
      window.addEventListener(
        type,
        (event) => {
          const a = armed
          if (a === null || a.started || a.on !== type) return
          a.started = true
          const t0 = event.timeStamp
          const watch = a.watch
          const giveUp = t0 + 5_000
          if (watch.kind === "attr") {
            const reflects = () =>
              document.querySelector(watch.selector)?.getAttribute(watch.attr) === watch.value
            const poll = () =>
              requestAnimationFrame(() => {
                const now = performance.now()
                if (reflects()) a.resolve(now - t0)
                else if (now > giveUp) a.resolve(null)
                else poll()
              })
            poll()
          } else {
            const target = document.querySelector("[data-testid=preview-shown]")!
            // A press on a Clip also moves the Playhead; the Frame to wait for is the one it is on
            // at the moment of the release or key press.
            const playhead = Number(
              document.querySelector("[data-testid=timeline-playhead]")!.getAttribute("data-frame")
            )
            const names = () => {
              const m = /Frame (\d+) of Scene (\d+)/.exec(target.textContent ?? "")
              return m !== null && Number(m[2]) > watch.above && Number(m[1]) === playhead
            }
            const observer = new MutationObserver(() => {
              if (names()) {
                observer.disconnect()
                a.resolve(performance.now() - t0)
              }
            })
            observer.observe(target, { childList: true, characterData: true, subtree: true })
            setTimeout(() => {
              observer.disconnect()
              a.resolve(null)
            }, 5_000)
          }
        },
        true
      )
    }
  })
}

async function arm(page: Page, on: "pointermove" | "pointerup" | "keydown", watch: Watch) {
  await page.evaluate(
    ({ on, watch }) => (window as unknown as { __perf: Perf }).__perf.arm(on, watch),
    { on, watch }
  )
}

async function answer(page: Page, what: string): Promise<number> {
  const value = await page.evaluate(() => (window as unknown as { __perf: Perf }).__perf.wait())
  const shown = value === null ? await page.getByTestId("preview-shown").textContent() : ""
  expect(
    value,
    `${what}: the page never showed the result within 5 s (Preview: ${shown})`
  ).not.toBeNull()
  return value!
}

async function longTasksSince(page: Page, since: number): Promise<number[]> {
  await page.waitForTimeout(300) // the observer delivers its entries asynchronously
  return page.evaluate((t) => (window as unknown as { __perf: Perf }).__perf.longTasks(t), since)
}

async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __perf: Perf }).__perf.now())
}

// ---------------------------------------------------------------- building the Project

interface Ids {
  readonly sourceId: string
  readonly lowerTrackId: string
  readonly lowerClipId: string
}

interface ClipSpec {
  readonly id: string
  readonly start: number
  readonly duration: number
  readonly inFrames: number
  readonly track: 0 | 1
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

async function openWithOneClip(page: Page): Promise<Ids> {
  await page.setViewportSize({ width: 2560, height: 1200 })
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE)
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

async function addTrack(page: Page): Promise<void> {
  await page.getByTestId("track-add").click(WAIT)
  await expect(page.getByTestId("timeline-track")).toHaveCount(2, WAIT)
}

/** Replaces the imported Clip by exactly `specs`, through the editing commands. */
async function layout(page: Page, ids: Ids, specs: readonly ClipSpec[]): Promise<void> {
  const wire = specs.map((spec) => {
    const divisor = gcd(spec.inFrames, 30) || 1
    return {
      id: spec.id,
      start: spec.start,
      duration: spec.duration,
      numerator: spec.inFrames / divisor,
      denominator: 30 / divisor,
      track: spec.track,
    }
  })
  await page.evaluate(
    async ({ specifier, sourceId, original, clips }) => {
      const store = (await import(specifier)) as typeof EditorStore
      store.useEditorStore.getState().run({
        type: "delete-clips",
        at: new Date().toISOString(),
        clipIds: [original],
        ripple: false,
      })
      for (const clip of clips) {
        const track = store.useEditorStore.getState().project!.timeline.tracks[clip.track]!
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

const CLIP = 18
const STRIDE = 20
/** Clips 0–47 of each Track sit at i × 20; Frames 960–1400 are then free for the Gestures. */
const REGULAR = 48
const ENDER_AT = 1400
const SLOT = (k: number) => 970 + 25 * k

/** Two Tracks, 50 Clips each, of 18 Frames with 2-Frame Gaps, from the 1080p fixture. */
function heavyClips(): ClipSpec[] {
  const specs: ClipSpec[] = []
  for (const track of [0, 1] as const) {
    const prefix = track === 0 ? "l" : "u"
    for (let i = 0; i < REGULAR; i++)
      specs.push({
        id: `${prefix}${i}`,
        start: i * STRIDE,
        duration: CLIP,
        inFrames: (i * 20) % 700,
        track,
      })
    for (let i = 0; i < 2; i++)
      specs.push({
        id: `${prefix}E${i}`,
        start: ENDER_AT + i * STRIDE,
        duration: CLIP,
        inFrames: i * 20,
        track,
      })
  }
  return specs
}

async function heavyProject(page: Page): Promise<void> {
  const ids = await openWithOneClip(page)
  await addTrack(page)
  await layout(page, ids, heavyClips())
  await installWatcher(page)
}

// ---------------------------------------------------------------- driving the mouse

interface Point {
  readonly x: number
  readonly y: number
}

function clipById(page: Page, id: string): Locator {
  return page.locator(`[data-testid=timeline-clip][data-clip-id="${id}"]`)
}

async function pxPerFrame(page: Page): Promise<number> {
  const body = page.getByTestId("timeline-body")
  const box = (await body.boundingBox())!
  return box.width / (Number(await body.getAttribute("aria-valuemax")) + 1)
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function press(page: Page, key: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press(key)
}

/** The Scene revision the Preview currently shows. */
async function revision(page: Page): Promise<number> {
  const text = (await page.getByTestId("preview-shown").textContent()) ?? ""
  const match = /Scene (\d+)/.exec(text)
  if (match === null) throw new Error(`the Preview says "${text}"`)
  return Number(match[1])
}

async function startOf(page: Page, id: string): Promise<number> {
  return Number(await clipById(page, id).getAttribute("data-start-frame"))
}

// ---------------------------------------------------------------- drag feedback

const DRAG_MOVES = 60

async function measuredDrag(
  page: Page,
  kind: "move" | "trim",
  id: string
): Promise<{ times: number[]; long: number[] }> {
  const scale = await pxPerFrame(page)
  const clip = clipById(page, id)
  const from =
    kind === "move" ? await centerOf(clip) : await centerOf(clip.getByTestId("clip-tail-handle"))
  const start = await startOf(page, id)
  const stepPx = Math.max(4, Math.ceil(2 * scale))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const since = await pageNow(page)
  const times: number[] = []
  for (let i = 1; i <= DRAG_MOVES; i++) {
    const x = from.x + i * stepPx
    const delta = Math.round((x - from.x) / scale)
    await arm(
      page,
      "pointermove",
      kind === "move"
        ? {
            kind: "attr",
            selector: `[data-testid=clip-ghost][data-clip-id="${id}"]`,
            attr: "data-start-frame",
            value: String(start + delta),
          }
        : {
            kind: "attr",
            selector: `[data-testid=timeline-clip][data-clip-id="${id}"]`,
            attr: "data-preview-duration-frames",
            value: String(CLIP + delta),
          }
    )
    await page.mouse.move(x, from.y)
    times.push(await answer(page, `${kind} pointer move ${i}`))
  }
  await page.mouse.up()
  return { times, long: await longTasksSince(page, since) }
}

for (const kind of ["move", "trim"] as const) {
  test(`drag feedback: a ${kind} drag of ${DRAG_MOVES} pointer moves on the heavy Project`, async ({
    page,
  }) => {
    await describeMachine(page)
    await heavyProject(page)
    const { times, long } = await measuredDrag(page, kind, kind === "move" ? "l47" : "u47")
    const p95 = percentile(times, 95)
    const longOver = long.filter((d) => d > LONG_TASK_MS)
    const pass = p95 <= DRAG_P95_MS && longOver.length === 0
    record(`drag-${kind}`, {
      title: `Drag feedback — ${kind} drag`,
      target: `p95 per pointer move ≤ ${DRAG_P95_MS} ms; no long task (> ${LONG_TASK_MS} ms) during the drag`,
      pass,
      numbers: {
        ...stats(times),
        "first move": ms(times[0]!),
        "pointer moves over 16.7 ms": times.filter((t) => t > DRAG_P95_MS).length,
        "long tasks": long.length ? long.map(ms).join(", ") : "none",
      },
      notes:
        "Pointermove (event timeStamp) → first animation frame at which the dragged Clip's " +
        (kind === "move" ? "ghost start Frame" : "live edge") +
        " shows the Frame that pointer position means. 100 Clips on two Tracks, 2560×1200 window.",
    })
    expect.soft(p95, "p95 per pointer move").toBeLessThanOrEqual(DRAG_P95_MS)
    expect.soft(longOver, "long tasks during the drag").toEqual([])
  })
}

// ---------------------------------------------------------------- Preview after an edit

test("Preview after an edit: 20 Gestures on the heavy Project", async ({ page }) => {
  await describeMachine(page)
  await heavyProject(page)
  const times: number[] = []
  const kinds: string[] = []
  const scale = await pxPerFrame(page)

  const measure = async (
    playhead: number,
    on: "pointerup" | "keydown",
    act: () => Promise<void>
  ) => {
    await parkAt(page, playhead)
    const before = await revision(page)
    await arm(page, on, { kind: "preview", above: before })
    await act()
    times.push(await answer(page, `Gesture ${times.length + 1}`))
  }

  // 8 moves into the free stretch, each Clip to its own slot.
  for (let k = 0; k < 8; k++) {
    const id = `l${REGULAR - 1 - k}`
    kinds.push("move")
    const delta = SLOT(k) - (await startOf(page, id))
    await measure(SLOT(k) + 5, "pointerup", async () => {
      const from = await centerOf(clipById(page, id))
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(from.x + delta * scale, from.y, { steps: 4 })
      await page.mouse.up()
    })
  }
  // 6 tail/head Trims on the upper Track, each keeping the Playhead inside the Clip.
  for (let k = 0; k < 6; k++) {
    const id = `u${REGULAR - 1 - k}`
    const edge = k % 2 === 0 ? "tail" : "head"
    kinds.push(`trim ${edge}`)
    const start = await startOf(page, id)
    await measure(start + 8, "pointerup", async () => {
      const from = await centerOf(clipById(page, id).getByTestId(`clip-${edge}-handle`))
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(from.x + (edge === "tail" ? -5 : 4) * scale, from.y, { steps: 4 })
      await page.mouse.up()
    })
  }
  // 6 splits by key on the lower Track's first Clips.
  for (let k = 0; k < 6; k++) {
    const id = `l${k}`
    kinds.push("split")
    const start = await startOf(page, id)
    await clipById(page, id).click(WAIT)
    await measure(start + 9, "keydown", async () => press(page, "s"))
    await expect(
      page.locator(`[data-testid=timeline-clip][data-start-frame="${start + 9}"]`)
    ).toHaveCount(1, WAIT)
  }

  expect(times).toHaveLength(20)
  const p95 = percentile(times, 95)
  const byKind = (k: string) => times.filter((_, i) => kinds[i]!.startsWith(k))
  record("preview-after-edit", {
    title: "Preview after an edit — 20 Gestures",
    target: `p95 from release / key press to the edited Frame in the Preview ≤ ${PREVIEW_P95_MS} ms`,
    pass: p95 <= PREVIEW_P95_MS,
    numbers: {
      ...stats(times),
      "moves p95 (8)": ms(percentile(byKind("move"), 95)),
      "trims p95 (6)": ms(percentile(byKind("trim"), 95)),
      "splits p95 (6)": ms(percentile(byKind("split"), 95)),
      "all samples": times.map((t) => t.toFixed(0)).join(" "),
    },
    notes:
      "Release (pointerup) or key press (S) → the `preview-shown` text naming the Playhead's Frame " +
      "of a Scene newer than before the edit. Keyframe-every-2 s fixture; long-GOP not measured here.",
  })
  expect.soft(p95, "p95 Gesture → Preview").toBeLessThanOrEqual(PREVIEW_P95_MS)
})

// ---------------------------------------------------------------- undo and redo

test("undo and redo: 20 of each on the heavy Project", async ({ page }) => {
  await describeMachine(page)
  await heavyProject(page)

  // 20 steps made through the same command the move Gesture sends: 10 per Track.
  const steps: { id: string; from: number; to: number }[] = []
  for (let k = 0; k < 20; k++) {
    const j = k % 10
    steps.push({
      id: `${k < 10 ? "l" : "u"}${REGULAR - 1 - j}`,
      from: (REGULAR - 1 - j) * STRIDE,
      to: SLOT(j),
    })
  }
  await page.evaluate(
    async ({ specifier, steps }) => {
      const store = (await import(specifier)) as typeof EditorStore
      for (const s of steps)
        store.useEditorStore.getState().run({
          type: "move-clips",
          at: new Date().toISOString(),
          clipIds: [s.id],
          delta: s.to - s.from,
          toTrackId: null,
        })
    },
    { specifier: STORE_MODULE, steps }
  )
  await expect(clipById(page, steps[19]!.id)).toHaveAttribute(
    "data-start-frame",
    String(steps[19]!.to),
    WAIT
  )

  const undos: number[] = []
  const redos: number[] = []
  for (let i = 0; i < 20; i++) {
    const step = steps[19 - i]!
    await arm(page, "keydown", {
      kind: "attr",
      selector: `[data-testid=timeline-clip][data-clip-id="${step.id}"]`,
      attr: "data-start-frame",
      value: String(step.from),
    })
    await press(page, "Meta+z")
    undos.push(await answer(page, `undo ${i + 1}`))
  }
  for (let i = 0; i < 20; i++) {
    const step = steps[i]!
    await arm(page, "keydown", {
      kind: "attr",
      selector: `[data-testid=timeline-clip][data-clip-id="${step.id}"]`,
      attr: "data-start-frame",
      value: String(step.to),
    })
    await press(page, "Shift+Meta+z")
    redos.push(await answer(page, `redo ${i + 1}`))
  }
  const all = [...undos, ...redos]
  const p95 = percentile(all, 95)
  record("undo-redo", {
    title: "Undo and redo — 20 of each",
    target: `p95 key press → settled Timeline ≤ ${UNDO_P95_MS} ms`,
    pass: percentile(undos, 95) <= UNDO_P95_MS && percentile(redos, 95) <= UNDO_P95_MS,
    numbers: {
      "undo p50": ms(percentile(undos, 50)),
      "undo p95": ms(percentile(undos, 95)),
      "undo max": ms(Math.max(...undos)),
      "redo p50": ms(percentile(redos, 50)),
      "redo p95": ms(percentile(redos, 95)),
      "redo max": ms(Math.max(...redos)),
      "all 40 p95": ms(p95),
    },
    notes:
      "Meta+Z / Shift+Meta+Z keydown (event timeStamp) → first animation frame at which the " +
      "affected Clip's `data-start-frame` is the one the step restores or re-applies.",
  })
  expect.soft(percentile(undos, 95), "undo p95").toBeLessThanOrEqual(UNDO_P95_MS)
  expect.soft(percentile(redos, 95), "redo p95").toBeLessThanOrEqual(UNDO_P95_MS)
})

// ---------------------------------------------------------------- playback (slow)

async function playAndRead(page: Page, seconds: number) {
  await play(page)
  await expect(page.getByTestId("transport")).toHaveAttribute("aria-pressed", "false", {
    timeout: (seconds + 60) * 1_000,
  })
  const log = await probeLog(page)
  const run = firstRun(log)
  const sound = measureSound(run.nodes)
  const stoppedAt = run.stoppedAt?.contextTime ?? null
  if (stoppedAt === null) throw new Error("the run's stop carries no audio clock reading")
  // av-sync.spec.ts anchors on the earliest node's origin (`when − offset`), which for one Clip
  // at Frame 0 with In-point 0 is the instant Timeline sample 0 sounds. With several Clips each
  // node's offset is its In-point, so origins differ per Clip and the minimum is not Frame 0's
  // instant. The anchor here is where the sound itself begins: the first stretch of the audio
  // clock given sound, which starts at Timeline Frame 0.
  // ...as heard: the nodes are put the limiter's measured delay earlier (ADR 0022).
  const anchor = sound.runs[0]!.from + (await limiterDelay(page, sound.sampleRate))
  const shown = pictureAgainstSound(run.rendered, {
    anchor,
    timebase: TIMEBASE,
    fromFrame: 0,
    endsAt: stoppedAt,
  })
  return { log, run, sound, shown, anchor }
}

test(
  "playback across Edit points: an Edit point every 2 s for 2 minutes",
  { tag: "@slow" },
  async ({ page }) => {
    test.setTimeout(8 * 60_000)
    await describeMachine(page)
    await page.setViewportSize({ width: 1600, height: 1000 })
    await installPlaybackProbe(page)
    const picker = await installFilePicker(page)
    await newProject(page)
    await picker.queue(FIXTURE)
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
    // The 30 s Clip split every 60 Frames and laid end to end four times: 60 Clips of 2 s,
    // each continuing the Source where the one before stopped (the wrap every 30 s is a jump).
    const PIECE = 60
    const PIECES = 60
    const specs: ClipSpec[] = Array.from({ length: PIECES }, (_, j) => ({
      id: `p${j}`,
      start: j * PIECE,
      duration: PIECE,
      inFrames: (j % (SOURCE_FRAMES / PIECE)) * PIECE,
      track: 0,
    }))
    await layout(page, ids, specs)
    const total = PIECES * PIECE
    await parkAt(page, 0)

    const { run, sound, shown } = await playAndRead(page, total / FPS)
    const skipped = run.rendered.reduce((n, r) => n + r.skipped, 0)
    const atEdit = run.rendered
      .filter((r) => r.frame % PIECE < 15 && r.frame >= PIECE)
      .reduce((n, r) => n + r.skipped, 0)
    const editFrames = (PIECES - 1) * 15
    const worstDrift = Math.max(...shown.map((s) => s.drift))
    const outOfSync = shown.filter((s) => s.drift >= 1).length
    const ratio = skipped / total
    const edgeRatio = atEdit / editFrames
    record("playback-edit-points", {
      title: "Playback across Edit points — 2 min, Edit point every 2 s",
      target: "skipped Frames ≤ 1%; picture and sound within one Frame (SC-002)",
      pass: ratio <= SKIPPED_MAX && edgeRatio <= SKIPPED_MAX && worstDrift < 1,
      numbers: {
        "Timeline Frames": total,
        "Edit points": PIECES - 1,
        "Frames shown": shown.length,
        "skipped Frames (all)": `${skipped} (${(100 * ratio).toFixed(2)} %)`,
        "skipped within 15 Frames after an Edit point": `${atEdit} of ${editFrames} (${(100 * edgeRatio).toFixed(2)} %)`,
        "worst A/V drift": `${worstDrift.toFixed(3)} Frames (bar: < 1)`,
        "Frames out of sync by a Frame or more": outOfSync,
        "first out-of-sync Frames": shown
          .filter((s) => s.drift >= 1)
          .slice(0, 8)
          .map((s) => `${s.frame} (${s.drift.toFixed(2)})`)
          .join(", "),
        "sound runs / overlaps / late nodes": `${sound.runs.length} / ${sound.overlaps.length} / ${sound.lateNodes}`,
        "frames-dropped": run.dropped.reduce((n, d) => n + d.count, 0),
      },
      notes:
        "Gated on the whole run (stricter than 'at the Edit points') and on the 15 Frames after " +
        "each Edit point; A/V as av-sync.spec.ts measures it (picture against the sound's own anchor).",
    })
    expect.soft(ratio, "skipped share of all Frames").toBeLessThanOrEqual(SKIPPED_MAX)
    expect
      .soft(edgeRatio, "skipped share of Frames at Edit points")
      .toBeLessThanOrEqual(SKIPPED_MAX)
    expect.soft(worstDrift, "worst picture/sound drift in Frames").toBeLessThan(1)
  }
)

test(
  "two Tracks at full rate: two overlapping 1080p 30 fps Clips for 60 s",
  { tag: "@slow" },
  async ({ page }) => {
    test.setTimeout(6 * 60_000)
    await describeMachine(page)
    await page.setViewportSize({ width: 1600, height: 1000 })
    await installPlaybackProbe(page)
    const picker = await installFilePicker(page)
    await newProject(page)
    await picker.queue(FIXTURE)
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
    await addTrack(page)
    // The 30 s Source twice per Track, end to end: both Tracks play a 1080p Clip at every instant.
    await layout(page, ids, [
      { id: "l0", start: 0, duration: SOURCE_FRAMES, inFrames: 0, track: 0 },
      { id: "l1", start: SOURCE_FRAMES, duration: SOURCE_FRAMES, inFrames: 0, track: 0 },
      { id: "u0", start: 0, duration: SOURCE_FRAMES, inFrames: 0, track: 1 },
      { id: "u1", start: SOURCE_FRAMES, duration: SOURCE_FRAMES, inFrames: 0, track: 1 },
    ])
    const total = 2 * SOURCE_FRAMES
    await parkAt(page, 0)

    const { run, sound, shown } = await playAndRead(page, total / FPS)
    const skipped = run.rendered.reduce((n, r) => n + r.skipped, 0)
    const ratio = skipped / total
    const underruns = sound.runs.length - 1
    record("two-tracks-full-rate", {
      title: "Two Tracks at full rate — 60 s",
      target: "skipped Frames ≤ 1%; zero audio underruns",
      pass: ratio <= SKIPPED_MAX && underruns === 0 && sound.lateNodes === 0,
      numbers: {
        "Timeline Frames": total,
        "Frames shown": shown.length,
        "skipped Frames": `${skipped} (${(100 * ratio).toFixed(2)} %)`,
        "audio underruns (gaps between node runs)": underruns,
        "late nodes": sound.lateNodes,
        "worst A/V drift": `${Math.max(...shown.map((s) => s.drift)).toFixed(3)} Frames`,
        "frames-dropped": run.dropped.reduce((n, d) => n + d.count, 0),
      },
      notes:
        "An underrun is a gap in the audio clock between consecutive scheduled nodes, as " +
        "degrades-picture-not-sound.spec.ts reads it (both Tracks' sound overlaps by design).",
    })
    expect.soft(ratio, "skipped share of all Frames").toBeLessThanOrEqual(SKIPPED_MAX)
    expect.soft(underruns, "audio underruns").toBe(0)
    expect.soft(sound.lateNodes, "nodes started too late").toBe(0)
  }
)
