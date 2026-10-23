// When a playback start has its sound in hand (T070, FR-012).
//
// Playback is anchored on the audio clock only once the main thread holds the sound it is about to
// play: for every Clip expected to sound, contiguous PCM from the starting Frame (or the Clip's
// first Frame, if it begins later) to `windowFrames` past the start or the Clip's end. Until then
// the gate holds the chunks that arrive, and the transport keeps the clock still.
//
// Why a window and not just the first chunk: what was lost under load was not only the first chunk
// but the second — the engine's 43 ms first chunk arrived in time and the next one did not. The
// window is the graph's lookahead, so a start begins in the position steady playback is always in:
// that much sound already in hand, whatever the main thread does next.
//
// The engine sends a Clip's sound unbroken — silence where its track has none (worker-protocol,
// `audio-pcm`) — so coverage is decidable: a window not covered is sound not arrived yet, never
// sound that does not exist. Positions are compared on the Timeline's sample grid, through the
// model (R7); nothing here computes a time.

import { frameToSampleIndex, type Frame, type SceneClip, type Timebase } from "@cutroom/model"

import type { PcmChunk } from "./graph"

export interface StartGate {
  /** Keeps a chunk that arrived while starting. */
  hold(chunk: PcmChunk): void
  /** Whether every expected Clip's sound for the window is in hand. */
  ready(): boolean
  /** Everything held, in arrival order. */
  held(): readonly PcmChunk[]
}

export interface StartGateOptions {
  readonly timebase: Timebase
  readonly fromFrame: Frame
  /** How far past `fromFrame` the sound must be in hand. */
  readonly windowFrames: number
  /** The Clips expected to send sound. Those not overlapping the window are not waited for. */
  readonly clips: readonly SceneClip[]
}

export function createStartGate({
  timebase,
  fromFrame,
  windowFrames,
  clips,
}: StartGateOptions): StartGate {
  const until = fromFrame + windowFrames
  const waitedFor = clips.filter(
    (clip) => clip.startFrame < until && clip.startFrame + clip.durationFrames > fromFrame
  )
  const chunks: PcmChunk[] = []

  /** Whether `clip`'s chunks cover its part of the window, at the rate its first chunk came in. */
  function covered(clip: SceneClip): boolean {
    const own = chunks.filter((chunk) => chunk.clipId === clip.clipId)
    const sampleRate = own[0]?.sampleRate
    if (sampleRate === undefined) return false
    let from = frameToSampleIndex(timebase, sampleRate, Math.max(fromFrame, clip.startFrame))
    const to = frameToSampleIndex(
      timebase,
      sampleRate,
      Math.min(until, clip.startFrame + clip.durationFrames)
    )
    const spans = own
      .filter((chunk) => chunk.sampleRate === sampleRate)
      .map((chunk) => ({
        from: chunk.startSample,
        until: chunk.startSample + (chunk.channels[0]?.length ?? 0),
      }))
      .sort((a, b) => a.from - b.from)
    for (const span of spans) {
      if (span.from > from) break
      from = Math.max(from, span.until)
      if (from >= to) return true
    }
    return from >= to
  }

  return {
    hold(chunk) {
      chunks.push(chunk)
    },
    ready() {
      return waitedFor.every(covered)
    },
    held() {
      return chunks
    },
  }
}
