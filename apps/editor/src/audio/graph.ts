// The sound of the Timeline, on the main thread (ADR 0008, research R3).
//
// The worker decodes each Clip's audio and posts it here as PCM (`audio-pcm`); this module turns
// each chunk into an `AudioBufferSourceNode` started at the exact instant of the audio clock at
// which its first sample belongs, through a gain node per Clip. Nothing here decides *what* plays —
// that is the Scene — or *which Frame* is on screen — that is the clock (`clock.ts`), which reads
// the same `currentTime` against the same anchor, so sound and picture are measured on one clock.
//
// ## Scheduling at a fixed lookahead
//
// Chunks are queued as they arrive and turned into nodes once they start within `LOOKAHEAD_SECONDS`
// of `currentTime` (`pump`, called on every chunk and on every animation frame by the transport).
// A started node plays on the audio thread whatever the main thread is doing, so a React stall
// shorter than the lookahead costs nothing; a chunk not yet started is still only a buffer that a
// stop or a seek simply forgets, rather than a node to cancel. Each chunk is copied into its
// `AudioBuffer` when it arrives (or by `prepare`), not when it is scheduled, so turning chunks into
// nodes costs only the nodes: a start reads the clock for its anchor after the copying, and the
// margin it leaves has to cover nothing else (transport.ts, T070).
//
// ## What a chunk may be, and what the graph does about it
//
// A chunk's `startSample` is on the Timeline's own sample grid and the engine has already trimmed it
// to its Clip (events.md `audio-pcm`), so the same Clip and sample always carry the same
// sound. The graph relies on that address and on nothing about the chunk's timing. A chunk may be:
//
//   * **late**, its start already past — the part still ahead is played and the rest skipped, so
//     the sound stays on the clock rather than starting late and staying late (FR-011);
//   * **entirely past** — dropped;
//   * **already scheduled**, wholly or in part — PCM from a run a seek replaced, still in the
//     channel when the new run's PCM for the same samples arrives. Each sample of a Clip is
//     scheduled once per playback session, so nothing is heard twice (US2 scenario 3);
//   * **past its Clip's edges** — trimmed anyway, which costs nothing and keeps the silence past a
//     Clip the Timeline's rather than the decoder's;
//   * **for a Clip no longer in the Scene** — dropped;
//   * **from before the session's starting Frame** — trimmed, so stale PCM a seek left in the
//     channel cannot sound in the moment before the new position does.
//
// ## A seek: one session, re-anchored
//
// A seek during playback (`seek`, US2 scenario 3) is not a stop and a start. Stopping would cut the
// sound now and leave silence until the new position's first chunk sounds at the new anchor — the
// audible gap the spec forbids. Instead the nodes already started keep playing the *old* position
// up to the new anchor's instant and are cut exactly there (`stop(when)`), and the new position
// sounds from that same instant, so the hand-over is sample-exact on the audio clock: no gap, no
// overlap. Nothing from the old position plays after the hand-over.
//
// The samples dealt with are forgotten — a seek backwards is meant to play them again — but no
// decoded sound is: chunks still queued, and the chunks of nodes cut before they finished, stay in
// the queue and are placed again against the new anchor. Since a chunk's address is its Timeline
// position (ADR 0012), any of them that covers the new position is the right sound for it, and a
// short seek forwards plays from PCM already here rather than waiting for the worker's new run.
// The new run's PCM for the same samples is then deduplicated like any repeat.
//
// No rate arithmetic happens here (Principle II, R7). Every instant comes from `@cutroom/model`'s
// playback functions. What remains is comparing sample indices with sample indices, comparing two
// readings of the audio clock, and subtracting one reading from another to get the offset into a
// buffer — which is what `start(when, offset, duration)` takes.
//
// ## One construction for playback and export
//
// The graph is written against the part of `BaseAudioContext` it uses, not against `AudioContext`,
// so the export mix can build the same graph on an `OfflineAudioContext` (Principle III). The master
// bus below is part of that one construction, so Playback and Export mix alike.
//
// ## The master bus and the limiter (AC-23, ADR 0022)
//
// Every Clip's gain node feeds one `DynamicsCompressorNode`, set as a brick-wall limiter (`LIMITER`),
// and that feeds the destination. Two Clips that sound together on different Tracks are summed
// there, each at its own level; below full scale the limiter changes no level, and where the sum
// would pass it the limiter pulls it down instead of letting it clip. There is exactly one, made
// with the graph, so a Scene with no Clip yet still has its bus and the sum of any number of Clips
// meets the same limiter.
//
// The limiter looks ahead, so what it emits is late by a fixed delay that depends on the context's
// sample rate. The delay is measured, not assumed (`limiter-delay.ts`), and the graph is told it as
// `outputDelaySeconds` (or later `setOutputDelay`, once a measurement arrives). Every instant the
// graph schedules — a node's start, the instant a seek cuts the old position — is moved that many
// seconds earlier, so the sound leaves the limiter at the instant the clock and the picture say.
// Only instants move: the offset into a buffer stays what the unshifted placement would give, so
// the same samples sound. A chunk too late to start earlier starts now, further into its buffer.

import {
  frameToSampleIndex,
  timelineSampleToContextTime,
  type PlaybackAnchor,
  type Scene,
  type SceneClip,
  type Timebase,
} from "@cutroom/model"

/**
 * How far ahead of `currentTime` chunks are turned into playing nodes. Longer than any main-thread
 * stall worth surviving, short enough that a stop or a seek has little already committed.
 */
export const LOOKAHEAD_SECONDS = 0.5

/** One chunk of a Clip's sound, decoded by the engine (`audio-pcm`). */
export interface PcmChunk {
  readonly clipId: string
  /** Samples per second of `channels`. Web Audio resamples to the context's rate if they differ. */
  readonly sampleRate: number
  /** The first sample's index on the Timeline's sample grid at `sampleRate` (sample 0 = Frame 0). */
  readonly startSample: number
  /** One array per channel, all of one length. */
  readonly channels: readonly Float32Array[]
}

// The slice of Web Audio the graph uses. Structural, so a real `AudioContext` or
// `OfflineAudioContext` satisfies it and a test can supply a fake with a hand-driven clock.

export interface GraphNode {
  connect(destination: GraphNode): unknown
  disconnect(): void
}

export interface GraphGain extends GraphNode {
  readonly gain: { value: number }
}

/** The slice of `DynamicsCompressorNode` the graph sets. */
export interface GraphCompressor extends GraphNode {
  readonly threshold: { value: number }
  readonly knee: { value: number }
  readonly ratio: { value: number }
  readonly attack: { value: number }
  readonly release: { value: number }
}

/**
 * The master bus's limiter (ADR 0022): threshold 0 dBFS, no knee, ratio 20, attack 1 ms, release
 * 100 ms (seconds for the last two). The delay measurement renders through the same settings.
 */
export const LIMITER = { threshold: 0, knee: 0, ratio: 20, attack: 0.001, release: 0.1 } as const

/** Sets `compressor` to the limiter's settings. */
export function configureLimiter(compressor: GraphCompressor): void {
  compressor.threshold.value = LIMITER.threshold
  compressor.knee.value = LIMITER.knee
  compressor.ratio.value = LIMITER.ratio
  compressor.attack.value = LIMITER.attack
  compressor.release.value = LIMITER.release
}

export interface GraphBuffer {
  getChannelData(channel: number): Float32Array
}

export interface GraphBufferSource extends GraphNode {
  buffer: GraphBuffer | null
  start(when: number, offset: number, duration: number): void
  /** Stops at `when` on the audio clock, or now. A later call replaces an earlier one. */
  stop(when?: number): void
  onended: ((event: Event) => void) | null
}

export interface GraphContext {
  readonly currentTime: number
  readonly destination: GraphNode
  createGain(): GraphGain
  createDynamicsCompressor(): GraphCompressor
  createBufferSource(): GraphBufferSource
  createBuffer(channels: number, length: number, sampleRate: number): GraphBuffer
}

export interface AudioGraph {
  /**
   * Follows the Timeline: a gain node for every Clip in the Scene, and none for a Clip that left
   * it. Chunks are placed with this Scene's Timebase and Clips.
   */
  setScene(scene: Scene | null): void
  /** Begins a playback session at `anchor`, silencing and forgetting the last one. */
  start(anchor: PlaybackAnchor): void
  /**
   * Moves the session to `anchor` (a seek while playing): what is sounding plays on until
   * `anchor.contextSeconds` and is cut there, and the new position sounds from that instant.
   * Decoded sound is kept and placed again; the samples already dealt with are forgotten. With no
   * session running it is `start`.
   */
  seek(anchor: PlaybackAnchor): void
  /** Silences everything scheduled and forgets everything queued. */
  stop(): void
  /** Takes a decoded chunk. Ignored while stopped. */
  receive(chunk: PcmChunk): void
  /**
   * Copies chunks into audio buffers now, so that scheduling them later costs only starting a node.
   * A start does this before it reads the clock for its anchor (transport.ts).
   */
  prepare(chunks: readonly PcmChunk[]): void
  /** Turns queued chunks that start within the lookahead into playing nodes. */
  pump(): void
  /** Nodes scheduled and not yet ended, and chunks waiting. For tests and diagnostics. */
  pending(): { readonly scheduled: number; readonly queued: number }
  /**
   * The limiter's measured delay in seconds: chunks scheduled from now on start that much earlier
   * (ADR 0022). Nodes already started are not moved.
   */
  setOutputDelay(seconds: number): void
  /** Stops and disconnects everything. */
  dispose(): void
}

export interface AudioGraphOptions {
  readonly context: GraphContext
  readonly lookaheadSeconds?: number
  /** The limiter's delay in seconds, if already known. Default 0. */
  readonly outputDelaySeconds?: number
  /**
   * The audio-clock instant after which nothing is worth playing: no node runs past it and a node
   * that would start at or after it is not made. For a context that renders only up to there (an
   * export segment); a live context has none.
   */
  readonly endSeconds?: number
}

/** A half-open run of Timeline samples, `[from, until)`. */
interface Span {
  readonly from: number
  readonly until: number
}

/** The parts of `span` that none of `covered` (sorted, disjoint) already holds. */
function uncovered(span: Span, covered: readonly Span[]): Span[] {
  const gaps: Span[] = []
  let from = span.from
  for (const held of covered) {
    if (held.until <= from) continue
    if (held.from >= span.until) break
    if (held.from > from) gaps.push({ from, until: held.from })
    from = Math.max(from, held.until)
    if (from >= span.until) break
  }
  if (from < span.until) gaps.push({ from, until: span.until })
  return gaps
}

/** `covered` with `span` added, kept sorted and merged. */
function cover(covered: readonly Span[], span: Span): Span[] {
  const all = [...covered, span].sort((a, b) => a.from - b.from)
  const merged: Span[] = []
  for (const next of all) {
    const last = merged.at(-1)
    if (last !== undefined && next.from <= last.until) {
      merged[merged.length - 1] = { from: last.from, until: Math.max(last.until, next.until) }
    } else {
      merged.push(next)
    }
  }
  return merged
}

export function createAudioGraph({
  context,
  lookaheadSeconds = LOOKAHEAD_SECONDS,
  outputDelaySeconds = 0,
  endSeconds = Number.POSITIVE_INFINITY,
}: AudioGraphOptions): AudioGraph {
  // The master bus: every Clip's gain feeds this limiter, which feeds the destination.
  const limiter = context.createDynamicsCompressor()
  configureLimiter(limiter)
  limiter.connect(context.destination)
  let delay = outputDelaySeconds

  let timebase: Timebase | null = null
  const clips = new Map<string, SceneClip>()
  const gains = new Map<string, GraphGain>()

  let anchor: PlaybackAnchor | null = null
  let queue: PcmChunk[] = []
  // Every node started and not yet ended, with the chunk it plays (kept so a seek can place it
  // again) and the instant it is cut at, if a seek cut it.
  const scheduled = new Map<GraphBufferSource, { chunk: PcmChunk; cutAt: number | null }>()
  // Per Clip and sample rate, the Timeline samples already dealt with in this session.
  const done = new Map<string, Span[]>()
  // Each chunk's audio buffer, made once — on arrival, or by `prepare` — and reused by a seek.
  const buffers = new WeakMap<PcmChunk, GraphBuffer>()

  function bufferFor(chunk: PcmChunk): GraphBuffer {
    let buffer = buffers.get(chunk)
    if (buffer === undefined) {
      const length = chunk.channels[0]?.length ?? 0
      const made = context.createBuffer(chunk.channels.length, length, chunk.sampleRate)
      chunk.channels.forEach((channel, index) => {
        made.getChannelData(index).set(channel)
      })
      buffer = made
      buffers.set(chunk, buffer)
    }
    return buffer
  }

  function gainFor(clipId: string): GraphGain {
    let gain = gains.get(clipId)
    if (gain === undefined) {
      gain = context.createGain()
      // Unity until the model has a Clip volume; this node is what a volume or a fade will drive.
      gain.gain.value = 1
      gain.connect(limiter)
      gains.set(clipId, gain)
    }
    return gain
  }

  /** The samples of `clip` at `sampleRate`: from its first Frame's start to its end's. */
  function clipSpan(base: Timebase, clip: SceneClip, sampleRate: number): Span {
    return {
      from: frameToSampleIndex(base, sampleRate, clip.startFrame),
      until: frameToSampleIndex(base, sampleRate, clip.startFrame + clip.durationFrames),
    }
  }

  /** Plays whatever of `chunk` is inside its Clip, not yet dealt with, and still ahead. */
  function schedule(chunk: PcmChunk, clip: SceneClip, at: PlaybackAnchor, base: Timebase): void {
    const length = chunk.channels[0]?.length ?? 0
    const bounds = clipSpan(base, clip, chunk.sampleRate)
    // Nothing from before the session's starting Frame: the worker trims to it, and stale PCM from
    // a run a seek replaced is trimmed here, so it cannot sound before the new position does.
    const first = frameToSampleIndex(base, chunk.sampleRate, at.frame)
    const span = {
      from: Math.max(chunk.startSample, bounds.from, first),
      until: Math.min(chunk.startSample + length, bounds.until),
    }
    if (span.until <= span.from) return

    const key = `${clip.clipId}@${chunk.sampleRate}`
    const covered = done.get(key) ?? []
    const gaps = uncovered(span, covered)
    done.set(key, cover(covered, span))
    if (gaps.length === 0) return

    const now = context.currentTime
    const at0 = timelineSampleToContextTime(base, at, chunk.sampleRate, chunk.startSample) - delay

    for (const gap of gaps) {
      const begins = timelineSampleToContextTime(base, at, chunk.sampleRate, gap.from) - delay
      const ends = Math.min(
        timelineSampleToContextTime(base, at, chunk.sampleRate, gap.until) - delay,
        endSeconds
      )
      const from = Math.max(begins, now)
      // Entirely past on the clock is dropped. A piece that ends within the delay of now is still
      // started — for no time at all — so the placement of the pieces after it does not depend on
      // whether the delay swallowed one (a piece's node is never skipped for the delay alone).
      // A piece whose sound would emerge from the limiter after the end is not worth a node.
      if (begins + delay >= endSeconds || ends + delay <= from) continue

      const node = context.createBufferSource()
      node.buffer = bufferFor(chunk)
      node.connect(gainFor(clip.clipId))
      node.onended = () => {
        scheduled.delete(node)
        node.disconnect()
      }
      scheduled.set(node, { chunk, cutAt: null })
      node.start(from, from - at0, Math.max(0, ends - from))
    }
  }

  function silence(): void {
    for (const node of scheduled.keys()) {
      node.onended = null
      node.stop()
      node.disconnect()
    }
    scheduled.clear()
    queue = []
    done.clear()
  }

  const graph: AudioGraph = {
    setScene(scene) {
      timebase = scene?.timebase ?? null
      clips.clear()
      for (const clip of scene?.clips ?? []) clips.set(clip.clipId, clip)
      for (const [clipId, gain] of gains) {
        if (!clips.has(clipId)) {
          gain.disconnect()
          gains.delete(clipId)
        }
      }
      for (const clipId of clips.keys()) gainFor(clipId)
    },

    start(at) {
      silence()
      anchor = at
    },

    seek(at) {
      if (anchor === null) {
        graph.start(at)
        return
      }
      const kept = new Set(queue)
      for (const [node, entry] of scheduled) {
        // Cut where the new position begins. A node a previous seek already cut keeps the earlier
        // cut: a second seek must not let the first one's old sound back in.
        const cutAt = Math.min(entry.cutAt ?? Number.POSITIVE_INFINITY, at.contextSeconds - delay)
        entry.cutAt = cutAt
        node.stop(cutAt)
        kept.add(entry.chunk)
      }
      queue = [...kept]
      done.clear()
      anchor = at
      graph.pump()
    },

    stop() {
      silence()
      anchor = null
    },

    receive(chunk) {
      if (anchor === null || (chunk.channels[0]?.length ?? 0) === 0) return
      bufferFor(chunk)
      queue.push(chunk)
      graph.pump()
    },

    prepare(chunks) {
      for (const chunk of chunks) {
        if ((chunk.channels[0]?.length ?? 0) > 0) bufferFor(chunk)
      }
    },

    pump() {
      const at = anchor
      const base = timebase
      if (at === null || base === null || queue.length === 0) return
      const horizon = context.currentTime + lookaheadSeconds
      const waiting: PcmChunk[] = []
      for (const chunk of queue) {
        const clip = clips.get(chunk.clipId)
        if (clip === undefined) continue
        const begins =
          timelineSampleToContextTime(base, at, chunk.sampleRate, chunk.startSample) - delay
        if (begins < horizon) schedule(chunk, clip, at, base)
        else waiting.push(chunk)
      }
      queue = waiting
    },

    pending() {
      return { scheduled: scheduled.size, queued: queue.length }
    },

    setOutputDelay(seconds) {
      delay = seconds
    },

    dispose() {
      graph.stop()
      limiter.disconnect()
      for (const gain of gains.values()) gain.disconnect()
      gains.clear()
    },
  }

  return graph
}
