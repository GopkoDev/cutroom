// What the export dialog offers, and whether this machine can produce each of it (T073, T074).
//
// The choices are fixed and few, as the spec's assumptions set them: an MP4 with H.264 picture at
// the Project's frame size and Timebase, in three qualities — High, Standard and Draft, 16, 8 and
// 4 Mbps at 1080p and scaled by pixel count for any other size — and one sound setting, 192 kbps
// stereo. Standard is preselected. What is *not* fixed is whether the machine can make any of it,
// and that is asked here, every time the dialog opens, with the exact parameters the export would
// use (FR-017, research R5, Principle I).
//
// ## Why the dialog asks again rather than reading `ready`
//
// The engine's `ready` capabilities (T032) are a startup probe: one `canEncodeVideo` per codec at
// the frame size `init` carried and Mediabunny's default bitrate. That answers a different
// question. `init` is sent before any Project exists, so its frame size is the shell's 1920×1080
// placeholder for most sessions (EditorLayout's `BEFORE_ANY_PROJECT`), and a hardware encoder that
// takes 1080p at 1 Mbps may still refuse 4K at 32 Mbps — encoders decline sizes and rates, not
// codec names. FR-017 says "determined at the time of asking", so each quality is asked about at
// the moment the dialog opens, at its own bitrate and at the Project's own frame size.
//
// ## Why the main thread may ask, and what that costs
//
// The question is put to WebCodecs directly — `VideoEncoder.isConfigSupported` and
// `AudioEncoder.isConfigSupported` — from the window. Principle I requires that nothing be
// rendered off the user's machine and that codec availability be discovered at runtime and never
// written down as a list; asking the browser at the moment of the dialog is exactly that, and
// nothing is rendered here. Mediabunny's `canEncodeVideo` is itself a thin wrapper over the same
// call. Asking from the window rather than the worker is sound on Chromium because WebCodecs is
// one implementation exposed to both, and asking here keeps the protocol unchanged.
//
// The cost is that this module has to build the configuration Mediabunny will build in the
// worker, or it answers a neighbouring question. It mirrors Mediabunny 1.52's own construction
// (`buildVideoEncoderConfigs` / `buildAudioEncoderConfig`): the H.264 High profile at the lowest
// level whose macroblock and bitrate limits cover the export, variable bitrate, `avc` framing and
// odd sizes refused. Should the two ever disagree, the export does not produce a quietly broken
// file — the encoder's refusal arrives as `export-failed` and is shown as a failure (T083). The
// better home for this question is the engine, beside the encoder that will answer it; that is a
// protocol change (a `probe-export` request) left for when the protocol next moves.
//
// ## Sound
//
// The sound setting is AAC-LC, the spec's choice, at 192 kbps stereo. Should AAC be unavailable,
// Opus (which an MP4 can carry) is asked next, so that "this machine cannot encode sound at all"
// (FR-024) is only ever said when it is true. The mix is made at 48 kHz, or 44.1 kHz where an
// encoder refuses 48. The spec's wording is "at the Source's sample rate", and this is a stated
// departure from it: no Source's sample rate is recorded (neither the Project Document nor
// `source-attached` carries one), a Timeline can hold Sources at different rates, and the mix
// resamples every one of them to its own rate exactly as playback's `AudioContext` does — so there
// is no single Source rate to honour, and 48 kHz is the rate video sound is made at.
//
// A Project none of whose Clips has sound is exported **with no sound track and without asking**.
// FR-024 protects the user from losing sound the Timeline has; a Timeline with none has nothing to
// lose, and the Preview was silent too, so the file is what was seen and heard. The dialog says so
// rather than presenting a choice with only one answer.
//
// No time is converted here. Bitrates scale by pixel count, and the only rates in this module are
// sample rates handed to an encoder, never used to turn a Frame into anything (Principle II).

import type { ExportStartMessage } from "@cutroom/engine/protocol"
import type { PixelSize, Project } from "@cutroom/model"

/** The three qualities on offer, best first, as the dialog lists them. */
export type ExportQuality = "high" | "standard" | "draft"

export const EXPORT_QUALITIES: readonly ExportQuality[] = ["high", "standard", "draft"]

/** Which quality is selected when the dialog opens, if the machine can produce it. */
export const PRESELECTED_QUALITY: ExportQuality = "standard"

/**
 * When the preselected quality is unavailable, the first of these that is available is selected
 * instead: a lower bitrate is the likelier to be accepted, so Draft is tried before High.
 */
const FALLBACK_ORDER: readonly ExportQuality[] = ["standard", "draft", "high"]

export const QUALITY_LABEL: Readonly<Record<ExportQuality, string>> = {
  high: "High",
  standard: "Standard",
  draft: "Draft",
}

/** The spec's bitrates, in bits per second, at the reference size below. */
export const BITRATE_AT_1080P: Readonly<Record<ExportQuality, number>> = {
  high: 16_000_000,
  standard: 8_000_000,
  draft: 4_000_000,
}

/** The size the spec's bitrates are stated for. Other sizes scale by pixel count. */
export const REFERENCE_FRAME_SIZE: PixelSize = { width: 1920, height: 1080 }

export type ExportVideoCodec = ExportStartMessage["video"]["codec"]
export type ExportAudioSettings = NonNullable<ExportStartMessage["audio"]>
export type ExportAudioCodec = ExportAudioSettings["codec"]

/** The picture is always H.264 in this slice (spec assumptions). */
export const VIDEO_CODEC: ExportVideoCodec = "avc"

export const AUDIO_BITRATE = 192_000
export const AUDIO_CHANNELS = 2

/** Asked in order; the first an encoder accepts is the one used. AAC is the spec's choice. */
export const AUDIO_CODEC_PREFERENCE: readonly ExportAudioCodec[] = ["aac", "opus"]

/** Asked in order, for each codec; see the header for why not the Source's own. */
export const MIX_SAMPLE_RATES: readonly number[] = [48_000, 44_100]

/**
 * The bitrate one quality means at one frame size: the spec's 1080p figure, scaled by how many
 * pixels the frame has against 1920×1080, to a whole bit per second (an encoder takes integers).
 */
export function videoBitrate(quality: ExportQuality, frameSize: PixelSize): number {
  const pixels = frameSize.width * frameSize.height
  const reference = REFERENCE_FRAME_SIZE.width * REFERENCE_FRAME_SIZE.height
  return Math.max(1, Math.round((BITRATE_AT_1080P[quality] * pixels) / reference))
}

// ---------------------------------------------------------------------------------------------
// Asking the machine
// ---------------------------------------------------------------------------------------------

export interface VideoQuestion {
  readonly codec: ExportVideoCodec
  readonly width: number
  readonly height: number
  readonly bitrate: number
}

export interface AudioQuestion {
  readonly codec: ExportAudioCodec
  readonly sampleRate: number
  readonly channels: number
  readonly bitrate: number
}

/** Whether this machine can encode one exact configuration. Replaced only in unit tests. */
export interface EncoderSupport {
  video(question: VideoQuestion): Promise<boolean>
  audio(question: AudioQuestion): Promise<boolean>
}

/**
 * H.264 levels as Mediabunny 1.52 chooses among them (`AVC_LEVEL_TABLE` in its `codec.ts`): the
 * first whose frame size in macroblocks and whose bitrate both cover the export. These are the
 * limits of the H.264 standard's Table A-1, so they are facts about the codec, not opinions.
 */
const AVC_LEVELS: readonly { maxMacroblocks: number; maxBitrate: number; level: number }[] = [
  { maxMacroblocks: 99, maxBitrate: 64_000, level: 0x0a },
  { maxMacroblocks: 396, maxBitrate: 192_000, level: 0x0b },
  { maxMacroblocks: 396, maxBitrate: 384_000, level: 0x0c },
  { maxMacroblocks: 396, maxBitrate: 768_000, level: 0x0d },
  { maxMacroblocks: 396, maxBitrate: 2_000_000, level: 0x14 },
  { maxMacroblocks: 792, maxBitrate: 4_000_000, level: 0x15 },
  { maxMacroblocks: 1620, maxBitrate: 4_000_000, level: 0x16 },
  { maxMacroblocks: 1620, maxBitrate: 10_000_000, level: 0x1e },
  { maxMacroblocks: 3600, maxBitrate: 14_000_000, level: 0x1f },
  { maxMacroblocks: 5120, maxBitrate: 20_000_000, level: 0x20 },
  { maxMacroblocks: 8192, maxBitrate: 20_000_000, level: 0x28 },
  { maxMacroblocks: 8192, maxBitrate: 50_000_000, level: 0x29 },
  { maxMacroblocks: 8704, maxBitrate: 50_000_000, level: 0x2a },
  { maxMacroblocks: 22_080, maxBitrate: 135_000_000, level: 0x32 },
  { maxMacroblocks: 36_864, maxBitrate: 240_000_000, level: 0x33 },
  { maxMacroblocks: 36_864, maxBitrate: 240_000_000, level: 0x34 },
  { maxMacroblocks: 139_264, maxBitrate: 240_000_000, level: 0x3c },
  { maxMacroblocks: 139_264, maxBitrate: 480_000_000, level: 0x3d },
  { maxMacroblocks: 139_264, maxBitrate: 800_000_000, level: 0x3e },
]

/** The codec string Mediabunny will configure the H.264 encoder with: High profile, fitting level. */
export function avcCodecString(width: number, height: number, bitrate: number): string {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16)
  const fitting =
    AVC_LEVELS.find(
      (entry) => macroblocks <= entry.maxMacroblocks && bitrate <= entry.maxBitrate
    ) ?? AVC_LEVELS[AVC_LEVELS.length - 1]
  return `avc1.6400${fitting.level.toString(16).padStart(2, "0")}`
}

/** The codec string for the sound, as Mediabunny builds it at the rates this module asks about. */
function audioCodecString(codec: ExportAudioCodec, sampleRate: number, channels: number): string {
  if (codec === "aac") {
    if (sampleRate <= 24_000) return channels >= 2 ? "mp4a.40.29" : "mp4a.40.5"
    return "mp4a.40.2"
  }
  return codec
}

interface ConfigSupportScope {
  readonly VideoEncoder?: {
    isConfigSupported(config: VideoEncoderConfig): Promise<{ supported?: boolean }>
  }
  readonly AudioEncoder?: {
    isConfigSupported(config: AudioEncoderConfig): Promise<{ supported?: boolean }>
  }
}

/** A refusal to answer is an answer: `isConfigSupported` rejects what it finds malformed (T032). */
async function asked(question: () => Promise<{ supported?: boolean }>): Promise<boolean> {
  try {
    return (await question()).supported === true
  } catch {
    return false
  }
}

/** The machine's own answers, through WebCodecs in this window. */
export function webCodecsSupport(scope: object = globalThis): EncoderSupport {
  const { VideoEncoder, AudioEncoder } = scope as ConfigSupportScope
  return {
    async video({ codec, width, height, bitrate }) {
      if (VideoEncoder === undefined || codec !== "avc") return false
      // Mediabunny refuses odd sizes for H.264 before it asks, and so must we, or we would offer
      // what the worker will decline.
      if (width % 2 === 1 || height % 2 === 1) return false
      const config: VideoEncoderConfig & { avc: { format: "avc" } } = {
        codec: avcCodecString(width, height, bitrate),
        width,
        height,
        bitrate,
        bitrateMode: "variable",
        alpha: "discard",
        avc: { format: "avc" },
      }
      return asked(() => VideoEncoder.isConfigSupported(config))
    },
    async audio({ codec, sampleRate, channels, bitrate }) {
      if (AudioEncoder === undefined) return false
      const config: AudioEncoderConfig & Record<string, unknown> = {
        codec: audioCodecString(codec, sampleRate, channels),
        numberOfChannels: channels,
        sampleRate,
        bitrate,
        ...(codec === "aac" ? { aac: { format: "aac" } } : {}),
        ...(codec === "opus" ? { opus: { format: "opus" } } : {}),
      }
      return asked(() => AudioEncoder.isConfigSupported(config))
    },
  }
}

// ---------------------------------------------------------------------------------------------
// What the dialog offers
// ---------------------------------------------------------------------------------------------

export interface QualityOffer {
  readonly quality: ExportQuality
  readonly bitrate: number
  /** What the machine said when asked with exactly these parameters. */
  readonly available: boolean
}

/**
 * The sound, as the dialog has to present it.
 *
 *   * `silent-timeline` — no Clip on the Timeline has sound; the file has no sound track and
 *     nobody is asked (see the header).
 *   * `available` — these settings were accepted.
 *   * `no-encoder` — the Timeline has sound and the machine cannot encode any of it. FR-024: say
 *     so, and require an explicit choice before a silent file is made.
 */
export type SoundOffer =
  | { readonly kind: "silent-timeline" }
  | { readonly kind: "available"; readonly settings: ExportAudioSettings }
  | { readonly kind: "no-encoder" }

export interface ExportOffer {
  readonly frameSize: PixelSize
  readonly qualities: readonly QualityOffer[]
  readonly sound: SoundOffer
  /** Standard when available, otherwise the first available fallback, otherwise `null`. */
  readonly preselected: ExportQuality | null
}

/**
 * Whether any Clip on the Timeline takes its picture from a Source that has sound.
 *
 * Read from the Project rather than the Scene, because "has sound" is a fact about a Source and
 * the Scene deliberately carries none (scene.ts). A Source that is Offline still counts: whether
 * its bytes are reachable is runtime state, and it has sound the moment it is Relinked.
 */
export function timelineHasSound(project: Project): boolean {
  const withSound = new Set(
    project.sources.filter((source) => source.hasAudio).map((source) => source.id)
  )
  return project.timeline.tracks.some((track) =>
    track.clips.some((clip) => withSound.has(clip.sourceId))
  )
}

async function soundOffer(support: EncoderSupport): Promise<SoundOffer> {
  for (const codec of AUDIO_CODEC_PREFERENCE) {
    for (const sampleRate of MIX_SAMPLE_RATES) {
      const settings: ExportAudioSettings = {
        codec,
        bitrate: AUDIO_BITRATE,
        sampleRate,
        channels: AUDIO_CHANNELS,
      }
      if (await support.audio(settings)) return { kind: "available", settings }
    }
  }
  return { kind: "no-encoder" }
}

/**
 * Asks the machine about every quality, and about the sound if the Timeline has any — all at once,
 * since each is an independent round trip the user is waiting on.
 */
export async function probeExportOffer(
  frameSize: PixelSize,
  hasSound: boolean,
  support: EncoderSupport
): Promise<ExportOffer> {
  const [qualities, sound] = await Promise.all([
    Promise.all(
      EXPORT_QUALITIES.map(async (quality): Promise<QualityOffer> => {
        const bitrate = videoBitrate(quality, frameSize)
        const available = await support.video({
          codec: VIDEO_CODEC,
          width: frameSize.width,
          height: frameSize.height,
          bitrate,
        })
        return { quality, bitrate, available }
      })
    ),
    hasSound ? soundOffer(support) : Promise.resolve<SoundOffer>({ kind: "silent-timeline" }),
  ])

  const isAvailable = (quality: ExportQuality) =>
    qualities.some((offer) => offer.quality === quality && offer.available)
  const preselected = FALLBACK_ORDER.find(isAvailable) ?? null

  return {
    frameSize: { width: frameSize.width, height: frameSize.height },
    qualities,
    sound,
    preselected,
  }
}

/** What the user has chosen in the dialog. */
export interface ExportChoice {
  readonly quality: ExportQuality | null
  /** FR-024's explicit choice. Only consulted when the offer's sound is `no-encoder`. */
  readonly withoutSound: boolean
}

/** The encoder settings an export is started with — everything but the Scene and destination. */
export interface ExportSettings {
  readonly video: ExportStartMessage["video"]
  readonly audio: ExportAudioSettings | null
}

export type Readiness =
  | { readonly ok: true; readonly settings: ExportSettings }
  | { readonly ok: false; readonly why: string }

/**
 * Whether an export can start with this choice, and with what — or, if not, why, in words for the
 * user. The Export button is enabled exactly when this says `ok`.
 */
export function readiness(
  offer: ExportOffer,
  choice: ExportChoice,
  durationFrames: number
): Readiness {
  if (durationFrames <= 0) {
    return { ok: false, why: "The Timeline is empty, so there is nothing to export." }
  }
  const quality = offer.qualities.find((entry) => entry.quality === choice.quality)
  if (quality === undefined) {
    return offer.qualities.some((entry) => entry.available)
      ? { ok: false, why: "Choose a quality." }
      : {
          ok: false,
          why: "This machine cannot encode H.264 at this Project's frame size in any of the qualities offered.",
        }
  }
  if (!quality.available) {
    return {
      ok: false,
      why: `This machine cannot encode ${QUALITY_LABEL[quality.quality]} quality at this frame size.`,
    }
  }

  const video = { codec: VIDEO_CODEC, bitrate: quality.bitrate }
  switch (offer.sound.kind) {
    case "available":
      return { ok: true, settings: { video, audio: offer.sound.settings } }
    case "silent-timeline":
      return { ok: true, settings: { video, audio: null } }
    case "no-encoder":
      return choice.withoutSound
        ? { ok: true, settings: { video, audio: null } }
        : {
            ok: false,
            why: "This machine cannot encode sound. Choose to export without sound to continue.",
          }
  }
}

// ---------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------

/**
 * How much longer the export should take, in milliseconds of wall-clock time, from how long the
 * Frames done so far took. `null` until there is a Frame to estimate from. Wall-clock arithmetic,
 * not media time: nothing here is a position on the Timeline.
 */
export function estimateRemainingMs(
  elapsedMs: number,
  framesDone: number,
  framesTotal: number
): number | null {
  if (framesDone <= 0 || framesTotal <= 0) return null
  const left = Math.max(0, framesTotal - framesDone)
  return (elapsedMs / framesDone) * left
}

/** A wall-clock duration as `m:ss`, or `h:mm:ss` past an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const ss = String(seconds).padStart(2, "0")
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`
}

/** Mbps with at most one decimal, for a bitrate the user reads. */
export function formatBitrate(bitrate: number): string {
  const mbps = bitrate / 1_000_000
  return `${Number.isInteger(mbps) ? mbps : mbps.toFixed(1)} Mbps`
}
