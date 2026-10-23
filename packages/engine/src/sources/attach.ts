// `attach-source`: what a Source is, read from the file itself — or why it cannot be one
// (FR-002, FR-003, contracts/worker-protocol.md).
//
// The main thread has resolved a handle and its permission and hands over a `File`; this module
// never sees a handle (ADR 0005). It opens a Mediabunny `Input` over a `BlobSource`, which reads
// the file lazily and in ranges, so attaching an hour of footage reads its index and a few dozen
// packet headers rather than an hour of footage (spec edge case, T055). Nothing is decoded here.
//
// **Every attach is answered.** `attach-source` is request/response, so there are exactly two
// ways out: `source-attached` with the metadata, or `source-failed` with a reason a person can
// read. Anything that goes wrong while *reading the file* — an unrecognised format, a damaged
// index, a file that vanished from disk between the handle and the read — is the file's answer and
// becomes `source-failed`; none of it is a `fatal`, because none of it means the engine cannot
// continue.
//
// **Refusal is a first-class answer, not an accident** (T040). This slice imports video files and
// nothing else (spec, "Video files only"), so an audio-only file and an image are refused by name
// rather than falling through to a generic error, and so is a file whose video — or whose sound —
// this browser cannot decode: a Source that plays silently because its audio was undecodable is
// exactly the "half-supported" the spec rules out.
//
// **Time stays in the Source's own timescale** (Principle II's exception, ADR 0002). `duration`
// and the Source Timebase are exact rationals built from the track's integer ticks; nothing here
// knows the Project's Timebase, and nothing is renumbered into its Frames. This module reads the
// clock and the ticks out of Mediabunny; the arithmetic on them — recovering ticks from seconds,
// ticks to a ratio of seconds, a tick span to a Timebase — is the model's Timebase module (R7).

import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny"

import {
  secondsToTicks,
  ticksToSeconds,
  timebaseFromTicks,
  type Codecs,
  type PixelSize,
  type Rational,
  type Timebase,
} from "@cutroom/model"

import type { AttachSourceMessage, SourceAttachedEvent, SourceFailedEvent } from "../protocol"

// ---------------------------------------------------------------------------------------------
// The attached Sources
// ---------------------------------------------------------------------------------------------

/**
 * One Source the worker can read from: the open `Input`, and the tracks the metadata was read
 * from. What later stages (a picture sink, audio decode) are built on, so they open the same
 * tracks this module vetted rather than choosing again.
 */
export interface AttachedSource {
  readonly input: Input<BlobSource>
  readonly video: InputVideoTrack
  readonly audio: InputAudioTrack | null
}

const attached = new Map<string, AttachedSource>()

/** The Source attached under `sourceId`, if one is. */
export function getAttachedSource(sourceId: string): AttachedSource | undefined {
  return attached.get(sourceId)
}

/**
 * Forgets a Source and disposes its `Input`, which closes any decoders and sinks built on it.
 * A Source that was never attached is not an error: `detach-source` is sent when a Source goes
 * Offline, which can happen to one that never got as far as attaching.
 */
export function releaseSource(sourceId: string): void {
  const held = attached.get(sourceId)
  if (held === undefined) return
  attached.delete(sourceId)
  held.input.dispose()
}

// ---------------------------------------------------------------------------------------------
// Refusal
// ---------------------------------------------------------------------------------------------

/**
 * A reason the file cannot be a Source, stated for a person as a clause that follows the file's
 * name ("… has no video track."). Thrown inside `inspect` and caught in
 * `attachSource` — the class exists only so a deliberate refusal is told apart from an error
 * Mediabunny raised while reading, which is reworded as "could not be read".
 */
class Refusal extends Error {}

/** Renders a thrown value without throwing on its own account. */
function describe(value: unknown): string {
  if (value instanceof Error) {
    return value.message ? `${value.name}: ${value.message}` : value.name
  }
  try {
    return typeof value === "string" ? value : (JSON.stringify(value) ?? String(value))
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/** Says why a file Mediabunny does not recognise was refused. An image says so by name.
 * Like every `Refusal`, a clause that follows the file's name. */
function unrecognised(file: File): string {
  if (file.type.startsWith("image/")) {
    return `is an image (${file.type}), not a video file. Only video files can be imported.`
  }
  const kind = file.type === "" ? "" : ` (${file.type})`
  return `is not in a video format Cutroom can read${kind}.`
}

// ---------------------------------------------------------------------------------------------
// Exact time from a track's ticks
// ---------------------------------------------------------------------------------------------

/**
 * How many packets the Source Timebase is measured over, and how many extra are read to absorb
 * B-frame reordering (packets arrive in decode order; the span is measured in presentation order).
 *
 * 120 because a container whose clock is coarser than the rate — Matroska's usual millisecond
 * ticks, say — stores rounded timestamps, and the span of N Frames only comes out exact when N
 * Frames last a whole number of ticks. 120 Frames of 24000/1001, 30000/1001 and 60000/1001 all do
 * (5005, 4004 and 2002 ms), so the NTSC rates survive a millisecond clock exactly; in a container
 * with a fine clock (an MP4 track's timescale) any N would.
 */
const TIMEBASE_SAMPLE = 120
const REORDER_ALLOWANCE = 16

/**
 * The grid a track's timestamps lie on, in ticks per second.
 *
 * Mediabunny promises every timestamp and duration of a track is an integer multiple of
 * `1 / getTimeResolution()` — for an MP4 that is the track's own timescale. Should a format ever
 * report a resolution that is not an integer, microseconds stand in for it: the rationals are then
 * exact at microsecond precision rather than at the container's.
 */
async function tickGrid(track: InputVideoTrack): Promise<number> {
  const resolution = await track.getTimeResolution()
  return Number.isSafeInteger(resolution) && resolution > 0 ? resolution : 1_000_000
}

/**
 * Runs one of the Timebase module's tick conversions, turning its refusal of a value it cannot
 * represent exactly into a `Refusal` about the file: an absurd timestamp is something wrong with
 * this file, not with the engine.
 */
function exactly<T>(what: string, convert: () => T): T {
  try {
    return convert()
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Refusal(`cannot be used: its ${what} cannot be represented exactly.`)
    }
    throw error
  }
}

/**
 * The Source Timebase: Frames per second as an exact ratio, measured from the first
 * `TIMEBASE_SAMPLE` Frames, by `timebaseFromTicks` (Frames × grid / span-in-ticks, reduced, in the
 * model's Timebase module — R7). A constant-rate track gives its
 * exact rate (30000/1001 in a timescale of 30000 or of 90000 alike); a variable-rate one gives
 * the exact average of its opening seconds, which is the only rate such a file has to offer.
 *
 * Only packet metadata is read, so this costs the index lookups for about four seconds of video
 * whatever the length of the file.
 */
async function readTimebase(track: InputVideoTrack, grid: number): Promise<Timebase> {
  const starts: number[] = []
  let end = Number.NEGATIVE_INFINITY

  const sink = new EncodedPacketSink(track)
  for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
    const start = exactly("timing", () => secondsToTicks(grid, packet.timestamp))
    starts.push(start)
    end = Math.max(end, start + exactly("timing", () => secondsToTicks(grid, packet.duration)))
    if (starts.length >= TIMEBASE_SAMPLE + 1 + REORDER_ALLOWANCE) break
  }

  if (starts.length === 0) throw new Refusal("cannot be used: its video track contains no Frames.")
  starts.sort((a, b) => a - b)

  // With more than a sample's worth of Frames, the span runs from the first Frame to the start of
  // the one after the sample; a shorter track is measured whole, to the end of its last Frame.
  const first = starts[0]!
  const whole = starts.length <= TIMEBASE_SAMPLE
  const frames = whole ? starts.length : TIMEBASE_SAMPLE
  const span = whole ? end - first : starts[TIMEBASE_SAMPLE]! - first

  if (span <= 0) {
    throw new Refusal(
      "cannot be used: its Frames carry no timing, so its Source Timebase is unknown."
    )
  }
  return exactly("Source Timebase", () => timebaseFromTicks(grid, frames, span))
}

/**
 * How long the Source is: the end of its video track's last Frame, in the track's own ticks.
 *
 * The video track's end rather than the whole file's: a Source here is footage, and its one Clip
 * covers the picture (FR-005). An audio track that runs a few milliseconds past the last Frame
 * would otherwise lengthen the Clip into a stretch with no picture to show.
 */
async function readDuration(track: InputVideoTrack, grid: number): Promise<Rational> {
  const seconds = await track.computeDuration()
  const ticks = exactly("duration", () => secondsToTicks(grid, seconds))
  if (ticks <= 0) throw new Refusal("cannot be used: its video track has no duration.")
  return exactly("duration", () => ticksToSeconds(grid, ticks))
}

// ---------------------------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------------------------

/** A track's codec as the full parameter string (`avc1.640028`), for diagnostics; the short
 * Mediabunny name where there is no string; `undefined` when the codec is unknown entirely. */
async function codecName(track: InputVideoTrack | InputAudioTrack): Promise<string | undefined> {
  return (await track.getCodecParameterString()) ?? (await track.getCodec()) ?? undefined
}

interface Inspected {
  readonly event: Omit<SourceAttachedEvent, "type" | "sourceId">
  readonly video: InputVideoTrack
  readonly audio: InputAudioTrack | null
}

/** Reads everything `source-attached` carries, or throws a `Refusal` saying why it cannot. */
async function inspect(input: Input<BlobSource>, file: File): Promise<Inspected> {
  if (!(await input.canRead())) throw new Refusal(unrecognised(file))

  const video = await input.getPrimaryVideoTrack()
  const audio = await input.getPrimaryAudioTrack()

  if (video === null) {
    if (audio !== null) {
      const sound = (await codecName(audio)) ?? "audio"
      throw new Refusal(
        `has no video track — it contains only sound (${sound}). Audio-only files cannot be imported; only video files can.`
      )
    }
    // A container with no tracks at all is not a file without video, it is a file without an
    // index — an MP4 cut short before its `moov` reads exactly like this — and saying "no video
    // track" would send the user looking for the wrong problem.
    if ((await input.getTracks()).length === 0) {
      throw new Refusal(
        "could not be read: it describes no tracks at all, so it is probably damaged or incomplete."
      )
    }
    throw new Refusal("has no video track. Only video files can be imported.")
  }

  const videoCodec = await codecName(video)
  if (videoCodec === undefined) {
    throw new Refusal("cannot be used: its video is in a codec Cutroom does not recognise.")
  }
  if (!(await video.canDecode())) {
    throw new Refusal(
      `cannot be used: its video is encoded as ${videoCodec}, which this browser cannot decode.`
    )
  }

  let audioCodec: string | undefined
  if (audio !== null) {
    audioCodec = await codecName(audio)
    if (audioCodec === undefined) {
      throw new Refusal("cannot be used: its sound is in a codec Cutroom does not recognise.")
    }
    if (!(await audio.canDecode())) {
      throw new Refusal(
        `cannot be used: its sound is encoded as ${audioCodec}, which this browser cannot decode.`
      )
    }
  }

  const dimensions: PixelSize = {
    width: await video.getDisplayWidth(),
    height: await video.getDisplayHeight(),
  }
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Refusal("cannot be used: its video track reports no picture size.")
  }

  const grid = await tickGrid(video)
  const codecs: Codecs =
    audioCodec === undefined ? { video: videoCodec } : { video: videoCodec, audio: audioCodec }

  return {
    event: {
      duration: await readDuration(video, grid),
      timebase: await readTimebase(video, grid),
      dimensions,
      hasAudio: audio !== null,
      codecs,
    },
    video,
    audio,
  }
}

/**
 * Answers one `attach-source`: `source-attached` with the file's metadata, or `source-failed`
 * naming what was wrong. Never throws for anything about the file.
 *
 * On success the Source is held under its id for the stages that read from it, and a Source
 * attached under the same id before — a Relink — is released, since its `Input` reads a `File`
 * that has just been superseded. On failure nothing held changes: a refused file is not an edit
 * (FR-003), here any more than in the Project.
 */
export async function attachSource(
  message: AttachSourceMessage
): Promise<SourceAttachedEvent | SourceFailedEvent> {
  const { sourceId, file } = message
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })

  try {
    const { event, video, audio } = await inspect(input, file)
    releaseSource(sourceId)
    attached.set(sourceId, { input, video, audio })
    return { type: "source-attached", sourceId, ...event }
  } catch (error) {
    input.dispose()
    const reason =
      error instanceof Refusal
        ? `"${file.name}" ${error.message}`
        : `"${file.name}" could not be read — it may be damaged or incomplete (${describe(error)}).`
    return { type: "source-failed", sourceId, reason }
  }
}
