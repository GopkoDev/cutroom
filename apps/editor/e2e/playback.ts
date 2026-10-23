// Driving playback from a spec, and watching the sound it schedules.
//
// Not a `*.spec.ts`, so Playwright does not collect it. Shared by the playback specs (T066–T068).
//
// ## Watching the sound
//
// What reaches the speakers cannot be read back from a page, but *when* each piece of it was told
// to play can: every `AudioBufferSourceNode` the audio graph makes is started with
// `start(when, offset, duration)` and possibly cut with `stop(when)`, on the context's own clock.
// `installAudioNodeLog` wraps those two methods before the app's first line runs and records every
// call, with the context's `currentTime` when it was made. From that log a spec can tell exactly
// which stretches of the audio clock were given sound — whether two overlap (sound heard twice) and
// whether there is a hole between them (a gap) — which is what US2 scenario 3 is about.

import { expect, type Page } from "@playwright/test"

import type * as EditorStore from "../src/store"

import { STORE_MODULE } from "./editor-fixtures"

/** One `AudioBufferSourceNode` the app started, as the wrapped methods saw it. */
export interface LoggedNode {
  readonly when: number
  readonly offset: number
  readonly duration: number
  /** The context's `currentTime` when `start` was called. */
  readonly calledAt: number
  /** Where the last `stop` cut it, on the context's clock (a stop "now" is `currentTime`), or `null`. */
  readonly stopAt: number | null
}

/** Records every `AudioBufferSourceNode.start` and `stop`. Call before `page.goto`. */
export async function installAudioNodeLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Entry {
      when: number
      offset: number
      duration: number
      calledAt: number
      stopAt: number | null
    }
    const log: Entry[] = []
    const entries = new WeakMap<AudioBufferSourceNode, Entry>()
    const scope = window as unknown as {
      __audioNodes: Entry[]
      __audioContext: BaseAudioContext | null
    }
    scope.__audioNodes = log
    scope.__audioContext = null

    const proto = AudioBufferSourceNode.prototype
    const start = proto.start
    const stop = proto.stop
    proto.start = function (this: AudioBufferSourceNode, when = 0, offset = 0, duration?: number) {
      // Only what is heard: the export's mix and the limiter's delay measurement start nodes in
      // an OfflineAudioContext, on a clock of their own, which is not Playback.
      if (!(this.context instanceof AudioContext)) {
        start.call(this, when, offset, duration)
        return
      }
      scope.__audioContext = this.context
      const entry: Entry = {
        when,
        offset,
        duration: duration ?? Number.POSITIVE_INFINITY,
        calledAt: this.context.currentTime,
        stopAt: null,
      }
      entries.set(this, entry)
      log.push(entry)
      start.call(this, when, offset, duration)
    }
    proto.stop = function (this: AudioBufferSourceNode, when = 0) {
      const entry = entries.get(this)
      if (entry !== undefined) entry.stopAt = Math.max(when, this.context.currentTime)
      stop.call(this, when)
    }
  })
}

export async function audioNodes(page: Page): Promise<LoggedNode[]> {
  return page.evaluate(() =>
    structuredClone((window as unknown as { __audioNodes: LoggedNode[] }).__audioNodes)
  )
}

/** The audio context's clock, or `null` before the graph has started any node. */
export async function audioClock(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      (window as unknown as { __audioContext: BaseAudioContext | null }).__audioContext
        ?.currentTime ?? null
  )
}

/** A half-open stretch of the audio clock that was given sound. */
export interface Sounded {
  readonly from: number
  readonly until: number
}

/** The stretch of the audio clock a node actually sounds over, or `null` if it never does. */
export function sounded(node: LoggedNode): Sounded | null {
  const until = Math.min(node.when + node.duration, node.stopAt ?? Number.POSITIVE_INFINITY)
  return until > node.when ? { from: node.when, until } : null
}

/** One sample at 48 kHz: how close two butted chunks' float instants may sit. */
export const SAMPLE_SECONDS = 1 / 48_000

/**
 * Merges stretches that butt or overlap into runs, and reports the overlaps — sound scheduled
 * twice for the same instant — beyond `tolerance`.
 */
export function runsOf(
  stretches: readonly Sounded[],
  tolerance = SAMPLE_SECONDS
): { runs: Sounded[]; overlaps: Sounded[] } {
  const sorted = [...stretches].sort((a, b) => a.from - b.from)
  const runs: Sounded[] = []
  const overlaps: Sounded[] = []
  for (const next of sorted) {
    const last = runs.at(-1)
    if (last !== undefined && next.from <= last.until + tolerance) {
      if (next.from < last.until - tolerance) {
        overlaps.push({ from: next.from, until: Math.min(last.until, next.until) })
      }
      runs[runs.length - 1] = { from: last.from, until: Math.max(last.until, next.until) }
    } else {
      runs.push(next)
    }
  }
  return { runs, overlaps }
}

// ---------------------------------------------------------------- driving the editor

export async function newProject(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await expect(page.getByTestId("import-source")).toBeEnabled()
}

export async function importFixture(page: Page, rows: number): Promise<void> {
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("source-row")).toHaveCount(rows, { timeout: 20_000 })
  await expect(page.getByTestId("import-refusal")).toHaveCount(0)
  await expect(page.getByTestId("source-status").nth(rows - 1)).toHaveText("Linked")
}

/** The Frame the Preview says it is showing, or `null` before the first one. */
export async function shownFrame(page: Page): Promise<number | null> {
  const text = (await page.getByTestId("preview-shown").textContent()) ?? ""
  const match = /showing Frame (\d+)/.exec(text)
  return match === null ? null : Number(match[1])
}

/** Waits until the Preview shows a Frame in `[from, until)`. */
export async function expectShownWithin(
  page: Page,
  from: number,
  until: number,
  timeout = 10_000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const frame = await shownFrame(page)
        return frame !== null && frame >= from && frame < until
      },
      { timeout, message: `the Preview to show a Frame in [${from}, ${until})` }
    )
    .toBe(true)
}

/** Sets the Playhead the way the Timeline does: the store's `setPlayhead`. */
export async function setPlayhead(page: Page, frame: number): Promise<void> {
  await page.evaluate(
    async ({ specifier, to }) => {
      const store = (await import(specifier)) as typeof EditorStore
      store.useEditorStore.getState().setPlayhead(to)
    },
    { specifier: STORE_MODULE, to: frame }
  )
}

/** Moves the Playhead to `frame` and waits until the Preview shows it (stopped). */
export async function parkAt(page: Page, frame: number): Promise<void> {
  await setPlayhead(page, frame)
  await expect(page.getByTestId("timeline-playhead")).toHaveAttribute("data-frame", String(frame))
  await expect(page.getByTestId("preview-shown")).toContainText(`showing Frame ${frame} of`)
}

export async function play(page: Page): Promise<void> {
  const button = page.getByTestId("transport")
  await expect(button).toHaveAttribute("aria-pressed", "false")
  await button.click()
  await expect(button).toHaveAttribute("aria-pressed", "true")
}

/** Stops and returns the Frame the Playhead was left on, once the Preview shows it. */
export async function stop(page: Page): Promise<number> {
  const button = page.getByTestId("transport")
  await button.click()
  await expect(button).toHaveAttribute("aria-pressed", "false")
  return settledFrame(page)
}

/** Once stopped: the Playhead's Frame, after waiting until the Preview shows that Frame too. */
export async function settledFrame(page: Page): Promise<number> {
  const frame = Number(await page.getByTestId("timeline-playhead").getAttribute("data-frame"))
  await expect(page.getByTestId("preview-shown")).toContainText(`showing Frame ${frame} of`)
  return frame
}
