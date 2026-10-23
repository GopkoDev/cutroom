import { expect, test, type Page } from "@playwright/test"

import { installFilePicker, type Fixture } from "./file-picker"

// T071 (SC-003): moving the Playhead to a new Frame shows that Frame within 300 ms for 1080p
// material. Measured, not inferred, and on the worst move rather than the average one:
//
//   * **where the clock runs** — in the page, on the page's clock. It starts at the `timeStamp` of
//     the input event that moves the Playhead (a `keydown` or a `pointerdown` on the Timeline,
//     caught in the capture phase, so the moment the browser says the user acted, not the moment a
//     handler got round to it), and stops when the engine's `frame-rendered` **for that exact
//     Frame** arrives on the main thread. That message is caught by a listener the Worker wrapper
//     below adds before the engine client adds its own, so React's re-render is not in the number.
//     The first animation frame after it is recorded too, as the nearest the page can get to
//     "on screen", and the burned-in counter is read back off the canvas afterwards to prove the
//     Frame the engine reported is the picture the user sees;
//   * **which moves** — small steps (→ and Shift+→, the way a user nudges), a far jump forward and
//     one backward (a click on the Timeline), and the worst case the fixtures' GOP structure
//     allows. `make-fixtures.ts` puts a keyframe every 60 Frames (2 s at 30/1, checked with
//     ffprobe: 15 keyframes in the 30 s file and 300 in the 10 min one, every one on a multiple of
//     60), so a random-access seek to Frame 60k − 1 decodes the most: the whole GOP from 60(k − 1).
//     Those targets are reached by a single click from far away, so no decoder state left by a
//     neighbouring Frame can help;
//   * **which footage** — `sync-1080p30.mp4`, the 1080p fixture SC-003 names, and
//     `sync-1080p30-10min.mp4` with far seeks into minute 9, where an index lookup or a seek that
//     scales with position would show.
//
// Every number is recorded as an annotation; the assertion is on the worst one.

const BUDGET_MS = 300

/** A move that has not produced its Frame after this long has failed outright, not been slow. */
const GIVE_UP_MS = 5_000

const GOP = 60

// ---------------------------------------------------------------- the clock in the page
//
// The engine's Worker is wrapped so its messages can be stamped on arrival. Only listening and
// stamping: the message, the transfer list and the Worker itself are the engine's own.

const PROBE = "__cutroomScrubProbe"

interface WorkerEvent {
  readonly kind: "posted" | "rendered" | "dropped"
  readonly frame?: number
  readonly at: number
}

interface MoveTiming {
  /** Input event → `frame-rendered` for the target Frame, as it reaches the main thread. */
  readonly renderedMs: number
  /** Input event → the first animation frame after that. */
  readonly paintedMs: number
  /** Input event → the `render-frame` for the target being posted to the Worker. */
  readonly postedMs: number | null
  /** `frames-dropped` answers seen between the input and the target's Frame. */
  readonly dropped: number
}

function installProbe({ key, giveUpMs }: { key: string; giveUpMs: number }): void {
  const events: WorkerEvent[] = []
  let notify: (() => void) | null = null
  const NativeWorker = window.Worker
  class ProbedWorker extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options)
      // Added in the constructor, so before the engine client's listener: stamped first.
      this.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as { type?: string; frame?: number } | null
        if (data?.type === "frame-rendered") {
          events.push({ kind: "rendered", frame: data.frame, at: performance.now() })
        } else if (data?.type === "frames-dropped") {
          events.push({ kind: "dropped", at: performance.now() })
        } else return
        notify?.()
      })
    }
    override postMessage(message: unknown, transfer?: unknown): void {
      const data = message as { type?: string; frame?: number } | null
      if (data?.type === "render-frame") {
        events.push({ kind: "posted", frame: data.frame, at: performance.now() })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- both overloads, passed through
      ;(super.postMessage as any)(message, transfer)
    }
  }
  Object.defineProperty(window, "Worker", {
    configurable: true,
    writable: true,
    value: ProbedWorker,
  })

  /**
   * Starts watching for one Playhead move to `target`. The clock starts at the next keydown or
   * pointerdown on the Timeline; the answer settles when the Frame is rendered and painted.
   */
  function arm(target: number): Promise<MoveTiming> {
    return new Promise((resolve, reject) => {
      const body = document.querySelector("[data-testid=timeline-body]")
      if (body === null) {
        reject(new Error("the Timeline is not on the page"))
        return
      }
      let start: number | null = null
      let from = 0
      const onInput = (event: Event) => {
        if (start !== null) return
        start = event.timeStamp
        from = events.length
        body.removeEventListener("keydown", onInput, true)
        body.removeEventListener("pointerdown", onInput, true)
      }
      body.addEventListener("keydown", onInput, true)
      body.addEventListener("pointerdown", onInput, true)
      const timer = setTimeout(() => {
        notify = null
        reject(new Error(`Frame ${target} was not rendered within the give-up time`))
      }, giveUpMs)
      notify = () => {
        if (start === null) return
        const since = events.slice(from)
        const done = since.find((e) => e.kind === "rendered" && e.frame === target)
        if (done === undefined) return
        notify = null
        clearTimeout(timer)
        const began = start
        const posted = since.find((e) => e.kind === "posted" && e.frame === target)
        const upTo = since.slice(0, since.indexOf(done))
        requestAnimationFrame(() => {
          resolve({
            renderedMs: done.at - began,
            paintedMs: performance.now() - began,
            postedMs: posted === undefined ? null : posted.at - began,
            dropped: upTo.filter((e) => e.kind === "dropped").length,
          })
        })
      }
    })
  }

  Object.defineProperty(window, key, { configurable: true, value: { arm } })
}

// ---------------------------------------------------------------- reading the counter back
//
// The reader from import-and-scrub.spec.ts (T053), copied rather than imported: importing a spec
// file would register its tests here too. Glyphs and geometry are `scripts/make-fixtures.ts`'s.

const GLYPHS: Record<number, string[]> = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
}

const DIGITS = 6

async function readCounter(page: Page): Promise<{ text: string; margin: number }> {
  const samples = await page.evaluate(async (digits) => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid=preview-canvas]")
    if (element === null) throw new Error("the Preview canvas is not on the page")
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))

    const bitmap = await createImageBitmap(element)
    const probe = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = probe.getContext("2d")
    if (context === null) throw new Error("no 2d context to read the Frame back through")
    context.drawImage(bitmap, 0, 0)

    const h = bitmap.height
    const scale = Math.max(6, Math.round((h / 1080) * 16 * 0.5) * 2)
    const pad = scale / 2
    const cellWidth = 5 * scale + pad * 2
    const margin = Math.round(h / 27)
    const inset = Math.floor(scale / 4)
    const side = scale - inset * 2

    const lumas: number[][] = []
    for (let i = 0; i < digits; i++) {
      const cell: number[] = []
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          const x = margin + i * cellWidth + pad + gx * scale + inset
          const y = margin + pad + gy * scale + inset
          const { data } = context.getImageData(x, y, side, side)
          let sum = 0
          for (let p = 0; p < data.length; p += 4) {
            sum += 0.2126 * data[p]! + 0.7152 * data[p + 1]! + 0.0722 * data[p + 2]!
          }
          cell.push(sum / (side * side))
        }
      }
      lumas.push(cell)
    }
    return lumas
  }, DIGITS)

  let weakest = Number.POSITIVE_INFINITY
  let text = ""
  for (const cell of samples) {
    const pattern = cell
      .map((luma) => {
        weakest = Math.min(weakest, Math.abs(luma - 127.5))
        return luma > 127.5 ? "1" : "0"
      })
      .join("")
    const digit = Object.entries(GLYPHS).find(([, rows]) => rows.join("") === pattern)
    text += digit === undefined ? "?" : digit[0]
  }
  return { text, margin: Math.round(weakest) }
}

// ---------------------------------------------------------------- driving the editor

async function openWith(page: Page, fixture: Fixture, frames: number): Promise<void> {
  const picker = await installFilePicker(page)
  await page.addInitScript(installProbe, { key: PROBE, giveUpMs: GIVE_UP_MS })
  await page.goto("/")
  await page.getByTestId("new-project").click()
  await expect(page.getByTestId("engine-renderer")).toHaveText("engine: webgl", { timeout: 20_000 })
  await picker.queue(fixture)
  await page.getByTestId("import-source").click()
  await expect(page.getByTestId("source-status")).toHaveText("Linked", { timeout: 20_000 })
  const clip = page.getByTestId("timeline-clip")
  await expect(clip).toHaveAttribute("data-start-frame", "0")
  await expect(clip).toHaveAttribute("data-duration-frames", String(frames))
  await expect(page.getByTestId("preview-shown")).toContainText("showing Frame 0 of")
}

type Move = { readonly key: string; readonly to: number } | { readonly click: number }

const targetOf = (move: Move): number => ("click" in move ? move.click : move.to)

interface Measured extends MoveTiming {
  readonly label: string
  readonly from: number
  readonly to: number
}

/**
 * Makes one move and measures it. A click lands on the centre of the target Frame's pixels — the
 * Timeline snaps to the nearest Frame (T048), so the centre of Frame n is `n × pxPerFrame` from its
 * start — at a fractional position where a Frame is narrower than a pixel.
 */
async function measure(page: Page, label: string, move: Move): Promise<Measured> {
  const playhead = page.getByTestId("timeline-playhead")
  const from = Number(await playhead.getAttribute("data-frame"))
  const to = targetOf(move)
  expect(to, `${label}: a move must change the Frame`).not.toBe(from)

  const body = page.getByTestId("timeline-body")
  const timing = page.evaluate(
    ({ key, target }) =>
      (window as unknown as Record<string, { arm(t: number): Promise<MoveTiming> }>)[key]!.arm(
        target
      ),
    { key: PROBE, target: to }
  )
  // `arm` attaches its listeners synchronously; this round trip makes sure it has run.
  await page.evaluate(() => undefined)

  if ("click" in move) {
    const box = await body.boundingBox()
    if (box === null) throw new Error("the Timeline has no box")
    const shown = Number(await body.getAttribute("aria-valuemax")) + 1
    await page.mouse.click(box.x + (move.click * box.width) / shown, box.y + box.height / 2)
  } else {
    await body.press(move.key)
  }

  const measured = await timing
  await expect(playhead).toHaveAttribute("data-frame", String(to))
  await expect(page.getByTestId("preview-shown")).toContainText(`showing Frame ${to} of`)
  // The picture is the Frame the engine reported: a 30/1 Source in a 30/1 Project, so Source Frame
  // equals Project Frame.
  const counter = await readCounter(page)
  expect(counter.text, `${label}: counter read with a weakest margin of ${counter.margin}`).toBe(
    String(to).padStart(DIGITS, "0")
  )
  expect(counter.margin).toBeGreaterThan(48)
  return { label, from, to, ...measured }
}

function summarise(results: readonly Measured[]): void {
  const groups = new Map<string, Measured[]>()
  for (const r of results) groups.set(r.label, [...(groups.get(r.label) ?? []), r])
  for (const [label, rs] of groups) {
    const sorted = rs.map((r) => r.renderedMs).sort((a, b) => a - b)
    const median = sorted[Math.floor((sorted.length - 1) / 2)]!
    const worst = sorted.at(-1)!
    const detail = rs
      .map(
        (r) =>
          `${r.from}→${r.to} ${r.renderedMs.toFixed(1)} ms` +
          ` (posted +${r.postedMs?.toFixed(1) ?? "?"}, painted ${r.paintedMs.toFixed(1)}` +
          `${r.dropped > 0 ? `, ${r.dropped} dropped` : ""})`
      )
      .join("; ")
    test.info().annotations.push({
      type: `scrub ${label}`,
      description: `n=${rs.length}, median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms — ${detail}`,
    })
  }
  const worst = results.reduce((a, b) => (b.renderedMs > a.renderedMs ? b : a))
  test.info().annotations.push({
    type: "scrub worst",
    description: `${worst.label} ${worst.from}→${worst.to}: ${worst.renderedMs.toFixed(1)} ms to frame-rendered, ${worst.paintedMs.toFixed(1)} ms to the next paint`,
  })
}

function expectWithinBudget(results: readonly Measured[]): void {
  const worst = results.reduce((a, b) => (b.renderedMs > a.renderedMs ? b : a))
  expect(
    worst.renderedMs,
    `worst move ${worst.label} ${worst.from}→${worst.to} took ${worst.renderedMs.toFixed(1)} ms`
  ).toBeLessThan(BUDGET_MS)
}

// ---------------------------------------------------------------- the tests

test("every Playhead move on the 30 s 1080p fixture shows its Frame within 300 ms", async ({
  page,
}) => {
  await openWith(page, "sync-1080p30.mp4", 900)
  const results: Measured[] = []
  const run = async (label: string, move: Move) => results.push(await measure(page, label, move))

  // Small steps from Frame 0: the nudge a user makes Frame by Frame, then ten at a time.
  for (let i = 1; i <= 5; i++) await run("step +1", { key: "ArrowRight", to: i })
  for (let i = 1; i <= 5; i++) await run("step +10", { key: "Shift+ArrowRight", to: 5 + 10 * i })

  // A far jump forward and one back, to Frames in the middle of a GOP.
  await run("far forward", { click: 790 })
  await run("far backward", { click: 130 })

  // The GOP's worst case, 60k − 1, each reached from far away, and the last Frame (End), which
  // ends the last GOP.
  await run("GOP worst", { click: 8 * GOP - 1 }) // 479, from 130
  await run("GOP worst", { click: GOP - 1 }) // 59, backward
  await run("GOP worst", { click: 14 * GOP - 1 }) // 839, forward
  await run("GOP worst", { click: 5 * GOP - 1 }) // 299, backward
  await run("GOP worst", { key: "End", to: 899 })

  summarise(results)
  expectWithinBudget(results)
})

test("far seeks into minute 9 of the 10 min 1080p fixture show their Frame within 300 ms", async ({
  page,
}) => {
  // 10 min at 30/1: 18 000 Frames. Minute 9 starts at Frame 16 200, itself a keyframe.
  await openWith(page, "sync-1080p30-10min.mp4", 18_000)
  const results: Measured[] = []
  const run = async (label: string, move: Move) => results.push(await measure(page, label, move))

  await run("far forward", { click: 16_200 + 25 }) // into minute 9, mid-GOP
  await run("step +1", { key: "ArrowRight", to: 16_226 })
  await run("step +10", { key: "Shift+ArrowRight", to: 16_236 })
  await run("far backward", { click: 1_000 })
  await run("GOP worst", { click: 16_200 + GOP - 1 }) // 16 259, the Frame before 16 260
  await run("GOP worst", { click: 2 * GOP - 1 }) // 119, backward across nine minutes
  await run("GOP worst", { click: 16_200 + 10 * GOP - 1 }) // 16 799
  await run("GOP worst", { key: "End", to: 17_999 })

  summarise(results)
  expectWithinBudget(results)
})
