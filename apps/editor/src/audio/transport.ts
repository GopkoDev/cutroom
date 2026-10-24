// Play and stop: the clock driving the Preview (T062, FR-010, FR-014).
//
// ## Who asks for Frames, and when
//
// There are two ways a Frame is asked of the engine, and they take turns rather than compete:
//
//   * **Stopped**, the shell's one effect in `EditorLayout` asks for the Frame under the Playhead
//     with `reason: "scrub"` whenever the Playhead, the Scene or a Source's status moves (T049).
//   * **Playing**, this module asks, once per animation frame, for the Frame the audio clock
//     reports, with `reason: "clock"` — and only when that Frame changed, so a 60 Hz display over a
//     30 fps Timeline posts each Frame once. The shell's effect stands aside while the store's
//     `transport` is `"playing"`, so a Playhead that follows the picture does not echo back as a
//     scrub (which would tell the worker to abandon the very iterators playback runs on).
//
// Both go through the engine client's latest-wins guard, which is exactly the coalescing playback
// wants: one request in flight, and the newest clock Frame waiting behind it. A slow Render drops
// the Frames in between rather than queueing them, and the picture catches up to the sound instead
// of lagging behind it (FR-012).
//
// ## The Playhead while playing
//
// The Playhead is the Frame the Preview is showing (CONTEXT.md), so it follows `frame-rendered`, not
// the clock: on a machine that drops Frames the two differ, and the Playhead must name the picture.
// Stopping therefore leaves it on the last Frame the engine said it drew during this playback, or
// where playback started if it drew none (FR-014). The shell's scrub request on the way out asks
// for that same Frame by random access, so the picture that stays on screen is the one the
// Playhead names even if a clock Frame was still being drawn when stop was pressed.
//
// The Playhead is runtime state, not part of the Project (ADR 0004): none of this touches the
// document or the undo history.
//
// ## Starting when the sound is ready (T070, FR-012)
//
// Play does not anchor the clock at a fixed delay after the press. It *holds* the starting Frame —
// the clock reports it, the engine is asked for its picture — and anchors only once the sound for
// the start is in hand: for every Clip expected to sound (its Source has audio and is not Offline),
// PCM from the starting Frame for the graph's lookahead (`start-gate.ts`). The anchor is then
// `START_MARGIN_SECONDS` ahead of `currentTime`, in the same task that schedules the PCM, so every
// first node is started ahead of the audio thread. A fixed delay (0.1 s, before T070) was a bet
// that the engine's first PCM would reach the main thread in time; on a starved main thread the
// first two chunks did not, and the start of the sound was cut — the one place sound yielded.
// On an idle machine the sound is in hand a few milliseconds after the press, so a start is
// quicker than the fixed delay was; under load it waits as long as the load makes it, picture and
// sound together. `START_WAIT_LIMIT_MS` is the safety valve for sound that never comes (a Source
// detached mid-decode): after it, playback starts with whatever is in hand.
//
// The start also waits for the master limiter's delay (ADR 0022). It is measured once per live
// context (`limiter-delay.ts`, a few milliseconds of offline render) and handed to the graph, which
// schedules every chunk that much earlier so the limited sound lands on the clock. A start anchored
// before it is known would be out of step by the delay, so `tryToStart` holds until it is — or
// until the same `START_WAIT_LIMIT_MS` passes, after which playback goes ahead uncompensated rather
// than not at all (a failed measurement counts as 0). Where there is no `OfflineAudioContext` to
// measure with (unit tests, node), the delay is known to be 0 at once.
//
// ## A seek while playing (T066, US2 scenario 3)
//
// A Playhead moved while playing — a click or a drag on the Timeline, Home, an arrow key — is
// noticed here as a write this module did not make. It is a seek, not a stop and a start: the clock
// holds the new Frame while the sound already playing carries on; once the new position's sound is
// in hand, the clock and the graph are re-anchored on it a start margin ahead, the old sound is cut
// exactly at that instant, and the new position sounds from the same instant (graph.ts, "A seek"),
// so there is neither a gap nor a moment of both. The engine is
// told with a second `transport: playing` from the new Frame, which is how it tells a seek from a
// lag: it closes the run's iterators and audio decode and opens new ones there. The Playhead stays
// where the user put it until a Frame of the new run is drawn.
//
// ## Silence (T067, US2 scenario 5)
//
// A Source with no audio needs nothing of its own. The clock reads `currentTime`, which a running
// context advances whether or not any sound is scheduled, so picture plays against a silent clock
// exactly as against a loud one; the engine sends no PCM for it and the graph schedules nothing.
//
// ## The end of the Timeline (T068, US2 scenario 6)
//
// The Timeline's last Frame is `durationFrames − 1`. Playback stops when the clock reaches
// `durationFrames` — the instant the last Frame has been on screen for its whole duration and the
// last of the sound has played — and leaves the Playhead on the last Frame, which the shell then
// draws by scrub. That is FR-014's "the Frame that was showing" for a run that played to the end:
// it is the Frame the clock last showed, and the scrub makes it the picture too, even if the
// engine had dropped it. Play with the Playhead on or past the end — where there is nothing left to
// play — starts again from Frame 0 (FR-010); a seek to there during playback ends playback with the
// Playhead where it was put.

import type { AudioPcmEvent } from "@cutroom/engine/protocol"
import { framesForDuration, type Frame, type SceneClip } from "@cutroom/model"

import type { EngineClient } from "@/engine-client"
import type { EditorStore } from "@/store"

import { createAudioClock, type AudioClock, type ClockContext } from "./clock"
import { createAudioGraph, type AudioGraph, type GraphContext, type PcmChunk } from "./graph"
import { measureBrowserLimiterDelay } from "./limiter-delay"
import { createStartGate, type StartGate } from "./start-gate"

/**
 * How much sound must be in hand, from the starting Frame, before playback is anchored: half a
 * second, exactly — the graph's `LOOKAHEAD_SECONDS`, so a start begins as steady playback runs.
 */
const START_WINDOW = { numerator: 1, denominator: 2 } as const

/**
 * How long a start waits for sound before going ahead without it, in milliseconds of the main
 * thread's clock (the audio clock may not be running yet). Only sound that never comes waits this
 * long; under the heaviest load measured (CDP 50× on the page) the sound was in hand in ~0.25 s.
 */
export const START_WAIT_LIMIT_MS = 1_000

/** Everything the transport needs of an audio context: the graph's slice, the clock's, and resume. */
export interface TransportAudioContext extends GraphContext, ClockContext {
  readonly sampleRate: number
  resume(): Promise<void>
  close(): Promise<void>
}

/** Where decoded sound comes from. The engine in the app, a stand-in in a test. */
export interface PcmSource {
  subscribe(listener: (chunk: PcmChunk) => void): () => void
}

/** `requestAnimationFrame`, injectable so a test can step it. */
export interface AnimationFrames {
  request(callback: () => void): number
  cancel(handle: number): void
}

export type TransportEngine = Pick<EngineClient, "renderFrame" | "setTransport" | "on">

export interface TransportOptions {
  readonly store: Pick<EditorStore, "getState" | "subscribe">
  readonly engine: TransportEngine
  /**
   * Makes the audio context, on the first play — inside the user's gesture, which is what lets
   * Chrome start it running. Replaced in tests.
   */
  readonly createContext?: () => TransportAudioContext
  /** Defaults to the engine's `audio-pcm` events. */
  readonly pcm?: PcmSource
  readonly animationFrames?: AnimationFrames
  /** The main thread's clock in milliseconds, for the start's wait limit. `performance.now`. */
  readonly now?: () => number
  /**
   * The limiter's delay in seconds at a sample rate, measured once per live context. Default: the
   * browser's measurement, or an immediate 0 where there is no `OfflineAudioContext`.
   */
  readonly measureDelay?: (sampleRate: number) => Promise<number>
}

export interface Transport {
  /**
   * Starts from the Playhead — or from Frame 0 with the Playhead on or past the Timeline's last
   * Frame (FR-010). Does nothing while playing or with no Scene to play.
   */
  play(): void
  /** Stops, leaving the Playhead on the Frame that was showing. Does nothing while stopped. */
  stop(): void
  toggle(): void
  /** Stops and lets go of the audio context. */
  dispose(): void
}

/** An `audio-pcm` event as the chunk the graph schedules: the same address, without the envelope. */
export function chunkFromPcmEvent(event: AudioPcmEvent): PcmChunk {
  return {
    clipId: event.clipId,
    sampleRate: event.sampleRate,
    startSample: event.startSample,
    channels: event.channels,
  }
}

/** The engine's decoded sound, as a PCM source. */
export function pcmFromEngine(engine: Pick<EngineClient, "on">): PcmSource {
  return {
    subscribe(listener) {
      return engine.on("audio-pcm", (event) => {
        listener(chunkFromPcmEvent(event))
      })
    },
  }
}

const browserAnimationFrames: AnimationFrames = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => {
    cancelAnimationFrame(handle)
  },
}

interface Playing {
  /** Where this run began, or where the last seek took it. */
  fromFrame: Frame
  /** The last Frame the engine drew during this playback: where the Playhead is. */
  shown: Frame
  /** The last Frame asked for, so a Frame is asked for once however many display frames show it. */
  requested: Frame | null
  tick: number | null
  /** While the sound for `fromFrame` is not yet in hand: what has arrived, and since when. */
  starting: { readonly gate: StartGate; readonly since: number } | null
}

export function createTransport({
  store,
  engine,
  createContext = () => new AudioContext(),
  pcm = pcmFromEngine(engine),
  animationFrames = browserAnimationFrames,
  now = () => performance.now(),
  measureDelay,
}: TransportOptions): Transport {
  let audio: {
    context: TransportAudioContext
    graph: AudioGraph
    clock: AudioClock
    /** Whether the limiter's delay has been measured (or given up on) yet. */
    delayKnown: boolean
    /** The limiter's delay in seconds, applied at the next anchor — never during a run. */
    delay: number
  } | null = null
  let playing: Playing | null = null
  // The last Playhead this module wrote, so a write it did not make can be told apart (T066).
  let written: Frame | null = null

  function ensureAudio() {
    if (audio === null) {
      const context = createContext()
      const graph = createAudioGraph({ context })
      graph.setScene(store.getState().scene)
      const made = {
        context,
        graph,
        clock: createAudioClock({ context }),
        delayKnown: false,
        delay: 0,
      }
      audio = made
      const measure =
        measureDelay ??
        (typeof OfflineAudioContext === "undefined" ? null : measureBrowserLimiterDelay)
      // The delay is applied when Playback is next anchored, not when the measurement lands: a
      // run already sounding without it (the start waited as long as it may) would otherwise have
      // its later chunks moved earlier than its earlier ones, which is sound given twice.
      const known = (seconds: number) => {
        if (made.delayKnown) return
        made.delayKnown = true
        made.delay = seconds
        if (audio === made) tryToStart()
      }
      if (measure === null) {
        made.delayKnown = true
      } else {
        measure(context.sampleRate).then(known, () => known(0))
      }
    }
    return audio
  }

  /** One past the Timeline's last Frame: where playback ends. 0 with no Project. */
  function timelineEnd(): Frame {
    return store.getState().project?.timeline.durationFrames ?? 0
  }

  /** The Clips whose sound a start waits for: their Source has audio and is not Offline. */
  function soundingClips(): SceneClip[] {
    const state = store.getState()
    const audible = new Set(
      (state.project?.sources ?? [])
        .filter((source) => source.hasAudio && state.sourceStatus[source.id] !== "offline")
        .map((source) => source.id)
    )
    return (state.scene?.clips ?? []).filter((clip) => audible.has(clip.sourceId))
  }

  /** Holds the clock on `fromFrame` until its sound is in hand, keeping anything already held. */
  function beginStarting(target: Playing, fromFrame: Frame): void {
    const scene = store.getState().scene
    if (audio === null || scene === null) return
    const gate = createStartGate({
      timebase: scene.timebase,
      fromFrame,
      windowFrames: framesForDuration(scene.timebase, START_WINDOW),
      clips: soundingClips(),
    })
    for (const chunk of target.starting?.gate.held() ?? []) gate.hold(chunk)
    target.starting = { gate, since: now() }
    audio.clock.hold(fromFrame)
    tryToStart()
  }

  /** Anchors playback once its sound is in hand, or once it has waited long enough. */
  function tryToStart(): void {
    const scene = store.getState().scene
    if (playing?.starting == null || audio === null || scene === null) return
    const { gate, since } = playing.starting
    const waited = now() - since >= START_WAIT_LIMIT_MS
    if (!(gate.ready() && audio.delayKnown) && !waited) return
    playing.starting = null
    // The copying first, then the clock: between reading it and the last node started there is
    // nothing left but starting nodes, which is what the margin has to cover. With no session
    // running (a fresh start) `seek` is `start`.
    audio.graph.prepare(gate.held())
    audio.graph.setOutputDelay(audio.delay)
    audio.graph.seek(audio.clock.start(scene.timebase, playing.fromFrame))
    for (const chunk of gate.held()) audio.graph.receive(chunk)
  }

  function tick(): void {
    if (playing === null || audio === null) return
    tryToStart()
    const frame = audio.clock.frame()
    const end = timelineEnd()
    if (frame !== null && frame >= end) {
      // The last Frame has had its whole duration on screen (T068).
      finish(Math.max(0, end - 1))
      return
    }
    if (frame !== null && frame !== playing.requested) {
      playing.requested = frame
      engine.renderFrame(frame, "clock")
    }
    audio.graph.pump()
    playing.tick = animationFrames.request(tick)
  }

  /**
   * Ends playback here and in the engine, with the Playhead to be left at `at` — by default the
   * Frame that was showing. Returns that Frame, or `null` if nothing was playing.
   */
  function halt(at?: Frame): Frame | null {
    if (playing === null) return null
    const ended = playing
    playing = null
    if (ended.tick !== null) animationFrames.cancel(ended.tick)
    audio?.graph.stop()
    audio?.clock.stop()
    const left = at ?? ended.shown
    engine.setTransport("stopped", left)
    return left
  }

  /** Stops, leaving the Playhead on `at`, in one task — so the shell scrubs exactly that Frame. */
  function finish(at?: Frame): void {
    const left = halt(at)
    if (left === null) return
    written = left
    store.getState().setPlayhead(left)
    store.getState().setTransport("stopped")
  }

  /** Re-anchors a running playback on `to`, a Frame the user moved the Playhead to (T066). */
  function seek(to: Frame): void {
    const state = store.getState()
    if (playing === null || audio === null || state.scene === null) return
    if (to >= timelineEnd()) {
      // Nothing to play there: playback ends, and the Playhead stays where it was put.
      finish(to)
      return
    }
    if (playing.tick !== null) animationFrames.cancel(playing.tick)
    playing.fromFrame = to
    playing.shown = to
    playing.requested = null
    playing.tick = null
    written = to
    engine.setTransport("playing", to)
    // The sound playing now carries on until the new position's is in hand (`tryToStart`).
    beginStarting(playing, to)
    tick()
  }

  function play(): void {
    const state = store.getState()
    const end = timelineEnd()
    if (playing !== null || state.scene === null || end === 0) return
    const { context, graph } = ensureAudio()
    // A context made outside a gesture, or one the browser suspended, starts suspended; resuming it
    // inside the press is what starts it. Its clock stands still until then, and so does ours.
    void context.resume().catch(() => {})

    // On or past the last Frame there is nothing left to play: Play starts again from the top.
    const fromFrame = state.playheadFrame >= end - 1 ? 0 : state.playheadFrame
    // Moved before playback exists, so the store's listener below sees no seek in it.
    if (fromFrame !== state.playheadFrame) state.setPlayhead(fromFrame)
    graph.setScene(state.scene)
    graph.stop()
    const started: Playing = {
      fromFrame,
      shown: fromFrame,
      requested: null,
      tick: null,
      starting: null,
    }
    playing = started
    written = fromFrame

    state.setTransport("playing")
    engine.setTransport("playing", fromFrame)
    beginStarting(started, fromFrame)
    tick()
  }

  function stop(): void {
    // The Playhead is left on the Frame that was showing (FR-014).
    finish()
  }

  const stopWatchingFrames = engine.on("frame-rendered", (event) => {
    if (playing === null || audio === null) return
    // Only a Frame of this playback counts: one from before the start (a scrub still in flight when
    // play was pressed) or past the clock (impossible today, cheap to refuse) does not move the
    // Playhead.
    const clockFrame = audio.clock.frame() ?? playing.fromFrame
    if (event.frame < playing.fromFrame || event.frame > clockFrame) return
    playing.shown = event.frame
    written = event.frame
    store.getState().setPlayhead(event.frame)
  })

  const stopWatchingPcm = pcm.subscribe((chunk) => {
    // While a seek waits, the old position's session is still sounding and takes what fits it.
    audio?.graph.receive(chunk)
    if (playing?.starting != null) {
      playing.starting.gate.hold(chunk)
      tryToStart()
    }
  })

  const stopWatchingStore = store.subscribe((state, previous) => {
    if (state.scene !== previous.scene) audio?.graph.setScene(state.scene)
    if (playing === null) return

    if (state.scene === null || state.transport === "stopped") {
      // Something other than `stop` ended playback — the Project was closed, or the last Clip went.
      halt()
      return
    }
    if (state.playheadFrame !== previous.playheadFrame && state.playheadFrame !== written) {
      seek(state.playheadFrame)
    }
  })

  return {
    play,
    stop,
    toggle() {
      if (playing === null) play()
      else stop()
    },
    dispose() {
      stop()
      stopWatchingFrames()
      stopWatchingPcm()
      stopWatchingStore()
      if (audio !== null) {
        audio.graph.dispose()
        void audio.context.close().catch(() => {})
        audio = null
      }
    },
  }
}
