// How many samples of its own this browser's audio encoder puts before the sound it is given.
//
// Measured, not assumed (Principle I). WebCodecs does not report it — the first
// `EncodedAudioChunk` is stamped 0 whatever came before it, and `decoderConfig` carries no delay —
// and it is the encoder's choice, not the codec's: Chrome on macOS encodes AAC through
// AudioToolbox, which primes with 2112 samples at 48 kHz (measured), and another platform's encoder
// may differ. So before an export the engine encodes one impulse through exactly the encoder the
// export will use, muxes it the same way, decodes it back, and reads off where the impulse came
// out. That is the delay a player sees when nothing in the file tells it otherwise, which is what
// the edit list (edit-list.ts) has to undo. It costs one short encode and decode, once per export.

import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  type AudioCodec,
} from "mediabunny"

import { secondsToTicks } from "@cutroom/model"

/** The export's sound settings, as `export-start` gives them. */
export interface SoundSettings {
  readonly codec: AudioCodec
  readonly bitrate: number
  readonly sampleRate: number
  readonly channels: number
}

/** The encoder an export's sound goes through. The measurement uses the same one, by this. */
export function soundSource(settings: SoundSettings): AudioSampleSource {
  return new AudioSampleSource({
    codec: settings.codec,
    quality: new Quality({ bitrate: settings.bitrate }),
  })
}

/**
 * Samples encoded for the measurement: an impulse, then silence. Long enough for any encoder delay
 * we know of (AAC 2112, Opus 312 at 48 kHz) to come out well inside it, short enough to cost
 * nothing.
 */
const PROBE_SAMPLES = 16_384

/** The impulse. Loud enough to stand far above a lossy codec's ringing, not so loud it clips. */
const IMPULSE = 0.5

/**
 * The encoder delay, in samples at `settings.sampleRate`: where an impulse given as sample 0 comes
 * out when the file is decoded with nothing to say otherwise. 0 for an encoder that adds none.
 */
export async function measureEncoderDelay(settings: SoundSettings): Promise<number> {
  const { sampleRate, channels } = settings
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const source = soundSource(settings)
  output.addAudioTrack(source)
  await output.start()

  const planar = new Float32Array(PROBE_SAMPLES * channels)
  for (let channel = 0; channel < channels; channel++) planar[channel * PROBE_SAMPLES] = IMPULSE
  const impulse = new AudioSample({
    data: planar,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate,
    timestamp: 0,
  })
  try {
    await source.add(impulse)
  } finally {
    impulse.close()
  }
  source.close()
  await output.finalize()
  if (target.buffer === null) throw new Error("measuring the encoder's delay produced no file")

  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(target.buffer) })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (track === null) throw new Error("measuring the encoder's delay produced no sound track")

    let peak = 0
    let at = -1
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        const first = secondsToTicks(sampleRate, sample.timestamp)
        const plane = new Float32Array(sample.numberOfFrames)
        sample.copyTo(plane, { planeIndex: 0, format: "f32-planar" })
        plane.forEach((value, index) => {
          if (Math.abs(value) > peak) {
            peak = Math.abs(value)
            at = first + index
          }
        })
      } finally {
        sample.close()
      }
    }

    // An impulse that came back faint, or too late to have been placed by a delay at all, is a
    // measurement that went wrong — and an edit list built on it would put the sound in the wrong
    // place in every file. Better to say so.
    if (peak < IMPULSE / 4 || at < 0 || at >= PROBE_SAMPLES / 2) {
      throw new Error(
        `could not measure the ${settings.codec} encoder's delay ` +
          `(impulse came back at sample ${at}, peak ${peak.toFixed(3)})`
      )
    }
    return at
  } finally {
    input.dispose()
  }
}
