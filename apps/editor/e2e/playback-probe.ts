// Measuring a playback run: what the engine drew, when, and what sound was scheduled against what.
//
// Not a `*.spec.ts`, so Playwright does not collect it. Shared by the measuring specs of US2 —
// `av-sync.spec.ts` (T069, SC-002), `degrades-picture-not-sound.spec.ts` (T070, FR-012) and
// `playback-rate.spec.ts` (T072, SC-004).
//
// ## What the probe records, and on which clock
//
// One init script, installed before the app's first line, wraps three things and records only:
//
//   * **the `AudioContext` constructor**, so the probe holds the transport's own context — the one
//     whose `currentTime` is the master clock (ADR 0008) — from the moment it exists, rather than
//     finding it later through a node;
//   * **the engine's `Worker`**: a listener added in the constructor, so before the engine client's,
//     stamps every `frame-rendered` (Frame, `skipped`) and `frames-dropped` with that context's
//     `currentTime` and `performance.now()` as it reaches the main thread, and every `render-frame`
//     and `transport` the app posts. Messages, transfer lists and the Worker are the engine's own;
//   * **`AudioBufferSourceNode.start`/`stop`**, as `installAudioNodeLog` does (playback.ts), plus
//     what the node's buffer holds: its length and rate, and where in the part that plays the
//     fixtures' click begins. Every moving fixture carries a 1 kHz tone gated to the first 20 ms of
//     every second (`scripts/make-fixtures.ts`), so a click's onset is a second boundary of the
//     Source — which, for one Clip at Frame 0 with in-point 0, is a second boundary of the
//     Timeline.
//
// ## The reference: where the sound says Frame 0 is
//
// The graph starts each chunk with `start(when, offset, duration)` where `when − offset` is the
// context instant of the chunk's first sample (graph.ts), so that difference — a node's *origin* —
// says where the sound itself has been put on the audio clock. The specs anchor on the first
// node's origin (the chunk at Timeline sample 0) and then check that anchor rather than trust it:
// every later origin must sit on the Timeline's sample grid from it, every click must land on a
// whole second from it, and it must sit at least `START_MARGIN_SECONDS` after the `transport:
// playing` post (the transport anchors once the start's sound is in hand, that margin ahead).
// The picture is then measured against that anchor, i.e. against the sound, not against the
// transport's clock object (which would be measuring the clock against itself).
//
// ## An optional load on the engine's thread (T070)
//
// CPU throttling through CDP slows the page's main thread but, measured in this repository, not
// the engine's Worker. `workerLoad` instead starts the engine inside a bootstrap module worker
// that first installs a duty-cycle busy loop on the worker's own thread — `busyMs` of spinning,
// then a yield of `idleMs` — and then imports the engine's real module, so the engine runs exactly
// as shipped on a thread that only gets the gaps. That is a slower CPU for the worker, which is
// the resource FR-012 is about: the decoders, the compositor and the audio decode all share it.

import type { Page } from "@playwright/test"

import { timebaseAsNumber, type Timebase } from "@cutroom/model"

import { runsOf, sounded, type Sounded } from "./playback"

export const PROBE_KEY = "__cutroomPlaybackProbe"

/** A duty-cycle busy loop on the engine's thread: spin `busyMs`, yield `idleMs`, repeat. */
export interface WorkerLoad {
  readonly busyMs: number
  readonly idleMs: number
}

export interface ProbeOptions {
  readonly workerLoad?: WorkerLoad
}

/** A `frame-rendered` as it reached the main thread. */
export interface RenderedEvent {
  readonly frame: number
  readonly skipped: number
  /** The transport's `currentTime` on arrival, or `null` before the context existed. */
  readonly contextTime: number | null
  readonly at: number
}

export interface DroppedEvent {
  readonly count: number
  readonly contextTime: number | null
  readonly at: number
}

export interface PostedEvent {
  readonly type: "render-frame" | "transport"
  readonly frame?: number
  readonly reason?: string
  readonly state?: string
  readonly fromFrame?: number
  readonly contextTime: number | null
  readonly at: number
}

/** One `AudioBufferSourceNode`, as `start`/`stop` saw it, with what its buffer holds. */
export interface ProbedNode {
  readonly when: number
  readonly offset: number
  readonly duration: number
  readonly calledAt: number
  readonly stopAt: number | null
  readonly sampleRate: number
  readonly length: number
  /** Buffer indices, inside the part that plays, where a click begins (channel 0 above 0.3). */
  readonly onsets: readonly number[]
}

export interface ProbeLog {
  readonly rendered: RenderedEvent[]
  readonly dropped: DroppedEvent[]
  readonly posted: PostedEvent[]
  readonly nodes: ProbedNode[]
  readonly outputLatency: number | null
  readonly baseLatency: number | null
  readonly contextSampleRate: number | null
  /** Busy-loop spins the worker load has completed (reported every 250 ms). `null` without one. */
  readonly loadSpins: number | null
  /** Channel 0 of the first buffer started, as it plays: the first 1 200 samples of the run. */
  readonly firstSamples: number[]
}

function installProbe({ key, workerLoad }: { key: string; workerLoad: WorkerLoad | null }): void {
  interface Node {
    when: number
    offset: number
    duration: number
    calledAt: number
    stopAt: number | null
    sampleRate: number
    length: number
    onsets: number[]
  }
  const state = {
    context: null as AudioContext | null,
    rendered: [] as unknown[],
    dropped: [] as unknown[],
    posted: [] as unknown[],
    nodes: [] as Node[],
    loadSpins: null as number | null,
    firstSamples: [] as number[],
  }
  Object.defineProperty(window, key, { configurable: true, value: state })
  const clock = () => state.context?.currentTime ?? null

  // ---- the transport's AudioContext
  const NativeContext = window.AudioContext
  class ProbedContext extends NativeContext {
    constructor(options?: AudioContextOptions) {
      super(options)
      state.context = this
    }
  }
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: ProbedContext,
  })

  // ---- the engine's Worker
  if (workerLoad !== null) {
    new BroadcastChannel(`${key}Load`).onmessage = (event: MessageEvent<number>) => {
      state.loadSpins = event.data
    }
  }
  const NativeWorker = window.Worker
  class ProbedWorker extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      let target: string | URL = url
      if (workerLoad !== null) {
        if (options?.type !== "module") throw new Error("the worker load needs a module worker")
        const engine = new URL(url, location.href).href
        // A static import, so the engine's module — and its message listener — is evaluated before
        // the worker starts delivering the app's messages; a dynamic one would lose the first.
        const source = [
          `import ${JSON.stringify(engine)};`,
          `const busyMs = ${workerLoad.busyMs}, idleMs = ${workerLoad.idleMs};`,
          `let spins = 0;`,
          `function spin() {`,
          `  const end = performance.now() + busyMs;`,
          `  while (performance.now() < end) {}`,
          `  spins++;`,
          `  setTimeout(spin, idleMs);`,
          `}`,
          `setTimeout(spin, idleMs);`,
          // Reported on a side channel: the engine's own port carries only the engine's messages.
          `const report = new BroadcastChannel(${JSON.stringify(`${key}Load`)});`,
          `setInterval(() => report.postMessage(spins), 250);`,
        ].join("\n")
        target = URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
      }
      super(target, options)
      this.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as {
          type?: string
          frame?: number
          skipped?: number
          count?: number
        } | null
        if (data?.type === "frame-rendered") {
          state.rendered.push({
            frame: data.frame,
            skipped: data.skipped,
            contextTime: clock(),
            at: performance.now(),
          })
        } else if (data?.type === "frames-dropped") {
          state.dropped.push({ count: data.count, contextTime: clock(), at: performance.now() })
        }
      })
    }
    override postMessage(message: unknown, transfer?: unknown): void {
      const data = message as {
        type?: string
        frame?: number
        reason?: string
        state?: string
        fromFrame?: number
      } | null
      if (data?.type === "render-frame" || data?.type === "transport") {
        state.posted.push({
          type: data.type,
          frame: data.frame,
          reason: data.reason,
          state: data.state,
          fromFrame: data.fromFrame,
          contextTime: clock(),
          at: performance.now(),
        })
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

  // ---- the sound scheduled
  const CLICK_LEVEL = 0.3
  // Clicks are a second apart and 20 ms long: anything hot within 0.1 s of the last hot sample is
  // the same click.
  const SAME_CLICK = 0.1
  const entries = new WeakMap<AudioBufferSourceNode, Node>()
  const proto = AudioBufferSourceNode.prototype
  const start = proto.start
  const stop = proto.stop
  proto.start = function (this: AudioBufferSourceNode, when = 0, offset = 0, duration?: number) {
    // Playback only: the limiter's delay measurement and the export's mix start nodes in an
    // OfflineAudioContext, on a clock of their own (ADR 0022), and they are not what is heard.
    if (!(this.context instanceof AudioContext)) {
      start.call(this, when, offset, duration)
      return
    }
    const buffer = this.buffer
    const rate = buffer?.sampleRate ?? this.context.sampleRate
    const length = buffer?.length ?? 0
    const onsets: number[] = []
    if (buffer !== null) {
      const data = buffer.getChannelData(0)
      const first = Math.max(0, Math.floor(offset * rate))
      const last =
        duration === undefined ? length : Math.min(length, Math.ceil((offset + duration) * rate))
      const gap = SAME_CLICK * rate
      let hot = Number.NEGATIVE_INFINITY
      for (let i = first; i < last; i++) {
        if (Math.abs(data[i]!) > CLICK_LEVEL) {
          if (i - hot > gap) onsets.push(i)
          hot = i
        }
      }
    }
    const entry: Node = {
      when,
      offset,
      duration: duration ?? Number.POSITIVE_INFINITY,
      calledAt: this.context.currentTime,
      stopAt: null,
      sampleRate: rate,
      length,
      onsets,
    }
    entries.set(this, entry)
    if (state.nodes.length === 0 && buffer !== null) {
      const first = Math.max(0, Math.floor(offset * rate))
      state.firstSamples = Array.from(buffer.getChannelData(0).subarray(first, first + 1_200))
    }
    state.nodes.push(entry)
    start.call(this, when, offset, duration)
  }
  proto.stop = function (this: AudioBufferSourceNode, when = 0) {
    const entry = entries.get(this)
    if (entry !== undefined) entry.stopAt = Math.max(when, this.context.currentTime)
    stop.call(this, when)
  }
}

/** Installs the probe. Call before `page.goto`. */
export async function installPlaybackProbe(page: Page, options: ProbeOptions = {}): Promise<void> {
  await page.addInitScript(installProbe, { key: PROBE_KEY, workerLoad: options.workerLoad ?? null })
}

/** Everything recorded so far. */
/**
 * The limiter's delay at `sampleRate`, as the app measures it (ADR 0022). The graph schedules every
 * node this much before its sound is to be heard, so a node's origin is the instant it is *put*,
 * and origin + this delay the instant it is *heard*. A spec comparing the picture with the sound
 * compares it with the heard instant.
 */
export async function limiterDelay(page: Page, sampleRate: number): Promise<number> {
  return page.evaluate(
    async ({ specifier, rate }) => {
      const module = (await import(specifier)) as {
        measureBrowserLimiterDelay(sampleRate: number): Promise<number>
      }
      return module.measureBrowserLimiterDelay(rate)
    },
    { specifier: "/src/audio/limiter-delay.ts", rate: sampleRate }
  )
}

export async function probeLog(page: Page): Promise<ProbeLog> {
  return page.evaluate((key) => {
    const scope = window as unknown as Record<string, unknown>
    const state = scope[key] as {
      context: AudioContext | null
      rendered: RenderedEvent[]
      dropped: DroppedEvent[]
      posted: PostedEvent[]
      nodes: ProbedNode[]
      loadSpins: number | null
      firstSamples: number[]
    }
    return structuredClone({
      rendered: state.rendered,
      dropped: state.dropped,
      posted: state.posted,
      nodes: state.nodes,
      outputLatency: state.context?.outputLatency ?? null,
      baseLatency: state.context?.baseLatency ?? null,
      contextSampleRate: state.context?.sampleRate ?? null,
      loadSpins: state.loadSpins,
      firstSamples: state.firstSamples,
    })
  }, PROBE_KEY)
}

// ---------------------------------------------------------------- reading a run

/** A node's origin: the context instant its buffer's first sample is placed at (graph.ts). */
export const originOf = (node: ProbedNode): number => node.when - node.offset

/** The probe's records between one `transport: playing` post and the `stopped` that ends it. */
export interface Run {
  readonly fromFrame: number
  readonly playingAt: PostedEvent
  readonly stoppedAt: PostedEvent | null
  readonly rendered: RenderedEvent[]
  readonly dropped: DroppedEvent[]
  /** `render-frame` posts with `reason: "clock"` during the run. */
  readonly requested: PostedEvent[]
  readonly nodes: ProbedNode[]
}

/** The first playback run in the log. */
export function firstRun(log: ProbeLog): Run {
  const playingIndex = log.posted.findIndex((p) => p.type === "transport" && p.state === "playing")
  if (playingIndex < 0) throw new Error("no transport: playing was posted")
  const playingAt = log.posted[playingIndex]!
  const stoppedAt =
    log.posted
      .slice(playingIndex + 1)
      .find((p) => p.type === "transport" && p.state === "stopped") ?? null
  const begin = playingAt.at
  const end = stoppedAt?.at ?? Number.POSITIVE_INFINITY
  const within = (e: { at: number }) => e.at >= begin && e.at <= end
  return {
    fromFrame: playingAt.fromFrame ?? 0,
    playingAt,
    stoppedAt,
    rendered: log.rendered.filter(within),
    dropped: log.dropped.filter(within),
    requested: log.posted.filter(
      (p) => p.type === "render-frame" && p.reason === "clock" && within(p)
    ),
    // Nodes carry no performance.now() stamp; a fresh page runs one session, so all of them.
    nodes: log.nodes,
  }
}

/** Percentile of a sorted copy, nearest-rank. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank]!
}

// ---------------------------------------------------------------- the sound side

/** What the sound of one run was, measured from its nodes alone. */
export interface SoundReport {
  /** The context instant the run's starting Frame sounds at: the earliest node's origin. */
  readonly anchor: number
  readonly sampleRate: number
  readonly nodes: number
  /** Merged stretches of the audio clock given sound; one, for an unbroken run. */
  readonly runs: readonly Sounded[]
  /** Instants scheduled twice. */
  readonly overlaps: readonly Sounded[]
  /** The worst distance of any node's origin from the Timeline sample grid, in samples. */
  readonly worstGridResidual: number
  /** Nodes started with less than 1 ms to spare before their first instant: late, cut short. */
  readonly lateNodes: number
  /** The least time any node was started ahead of the instant it begins to sound, in seconds. */
  readonly leastLeadSeconds: number
  /** Click onsets, as the second they belong to and how far off that second they sit, in samples. */
  readonly clicks: readonly { readonly second: number; readonly deviation: number }[]
}

/** Measures the sound of a run (a fresh page, one session) from its scheduled nodes. */
export function measureSound(nodes: readonly ProbedNode[]): SoundReport {
  if (nodes.length === 0) throw new Error("no AudioBufferSourceNode was started")
  const sampleRate = nodes[0]!.sampleRate
  const anchor = Math.min(...nodes.map(originOf))
  let worstGridResidual = 0
  for (const node of nodes) {
    const samples = (originOf(node) - anchor) * sampleRate
    worstGridResidual = Math.max(worstGridResidual, Math.abs(samples - Math.round(samples)))
  }
  const stretches = nodes.map(sounded).filter((s): s is Sounded => s !== null)
  const { runs, overlaps } = runsOf(stretches)
  const leads = nodes.map((n) => n.when - n.calledAt)
  const clicks: { second: number; deviation: number }[] = []
  for (const s of clickOnsets(nodes, anchor)) {
    const second = Math.round(s / sampleRate)
    clicks.push({ second, deviation: s - second * sampleRate })
  }
  return {
    anchor,
    sampleRate,
    nodes: nodes.length,
    runs,
    overlaps,
    worstGridResidual,
    lateNodes: leads.filter((lead) => lead < 0.001).length,
    leastLeadSeconds: Math.min(...leads),
    clicks,
  }
}

/** Sorted, merged click onsets as fractional Timeline samples counted from `anchor`. */
export function clickOnsets(nodes: readonly ProbedNode[], anchor: number): number[] {
  const all: number[] = []
  for (const node of nodes) {
    const base = (originOf(node) - anchor) * node.sampleRate
    for (const i of node.onsets) all.push(base + i)
  }
  all.sort((a, b) => a - b)
  const merged: number[] = []
  for (const s of all) {
    const last = merged.at(-1)
    // A click a chunk boundary splits shows up again at the start of the next buffer: same click.
    if (last !== undefined && s - last < 4_800) continue
    merged.push(s)
  }
  return merged
}

// ---------------------------------------------------------------- the picture against the sound

/** One Frame the picture showed, measured against where the sound was. */
export interface ShownFrame {
  readonly frame: number
  readonly skipped: number
  /** Where the sound was when the Frame arrived, in Frames from the anchor (fractional). */
  readonly soundAtArrival: number
  /**
   * How far the picture was from the sound while this Frame was the one showing, in Frames: 0 while
   * the sound is inside this Frame's own interval `[frame, frame + 1)`, otherwise the distance to
   * it, at the worst moment — just before the next Frame replaced it (picture behind) or on
   * arrival (picture ahead). Measured only once the sound has begun.
   */
  readonly drift: number
  /** `soundAtArrival − frame`: how late the Frame arrived after its own start, in Frames. */
  readonly lag: number
}

/**
 * Pairs each `frame-rendered` of a run with the sound's position on the audio clock, in the
 * Timeline's `timebase` (context time is seconds); `fromFrame` sounds at `anchor`. The last
 * Frame is held until `endsAt` (the `stopped` post's context time).
 */
export function pictureAgainstSound(
  rendered: readonly RenderedEvent[],
  {
    anchor,
    timebase,
    fromFrame,
    endsAt,
  }: { anchor: number; timebase: Timebase; fromFrame: number; endsAt: number }
): ShownFrame[] {
  const at = (t: number) => fromFrame + (t - anchor) * timebaseAsNumber(timebase)
  const timed = rendered.filter(
    (r): r is RenderedEvent & { contextTime: number } => r.contextTime !== null
  )
  return timed.map((r, i) => {
    const arrived = at(r.contextTime)
    const replacedAt = at(timed[i + 1]?.contextTime ?? endsAt)
    const ahead = r.frame - Math.max(arrived, fromFrame)
    const behind = replacedAt - (r.frame + 1)
    // A Frame replaced before the sound began never showed against any sound.
    const drift = replacedAt <= fromFrame ? 0 : Math.max(0, ahead, behind)
    return {
      frame: r.frame,
      skipped: r.skipped,
      soundAtArrival: arrived,
      drift,
      lag: arrived - r.frame,
    }
  })
}
