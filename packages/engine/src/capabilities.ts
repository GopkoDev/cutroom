// What this browser, on this machine, can actually encode — asked, not assumed.
//
// Principle I makes codec availability a runtime question. WebCodecs support varies by browser,
// by operating system and by whether a hardware encoder is present, so a hardcoded list of
// "supported" codecs is a claim about a machine we have not met; the first honest moment to find
// out is when the engine starts, and the answer is carried back in `ready`.
//
// Two things this module deliberately does not do.
//
// **It does not choose.** No preference order, no "best" codec, no fallback. It reports every
// codec Mediabunny knows about and what the browser said about each one, and leaves the choosing
// to the export dialog, which is where the user is (R5). A probe that quietly picked a winner
// would make "AAC is unavailable" indistinguishable from "we preferred Opus".
//
// **It does not keep a list of codecs.** The lists probed are Mediabunny's own `VIDEO_CODECS` and
// `AUDIO_CODECS`. The day Mediabunny learns a new one, it is probed here without this file
// changing — and, more to the point, a codec cannot be missing from the dialog because someone
// forgot to add it to a list of ours.

import {
  AUDIO_CODECS,
  VIDEO_CODECS,
  canEncode,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny"

import type { PixelSize } from "@cutroom/model"

import type { AudioCodecCapability, EngineCapabilities, VideoCodecCapability } from "./protocol"

/**
 * Runs one probe and reads a thrown error as "no".
 *
 * A support query is allowed to be answered with an exception: `VideoEncoder.isConfigSupported`
 * rejects a configuration it considers malformed rather than returning `false`, and which
 * configurations those are differs between browsers. The question being asked is "can this machine
 * encode it", and an implementation that refuses the question has answered it. What is not
 * acceptable is letting one codec's refusal take down `init` — that would turn an unsupported
 * codec into an engine that never starts, which is the least diagnosable version of the same fact.
 */
async function probe(ask: () => Promise<boolean>): Promise<boolean> {
  try {
    return await ask()
  } catch {
    return false
  }
}

/**
 * One video codec, asked twice.
 *
 * `canEncode` is the general question — is there an encoder for this codec at all. `canEncodeVideo`
 * at the Project's frame size is the question that decides whether an export can be offered:
 * hardware encoders decline *sizes*, not codecs, so a browser that answers yes to `avc` may still
 * refuse 3840×2160, and an export dialog built on the first answer alone would fail at the first
 * Frame instead of at the dialog.
 */
async function probeVideoCodec(
  codec: VideoCodec,
  frameSize: PixelSize
): Promise<VideoCodecCapability> {
  const [encodable, atFrameSize] = await Promise.all([
    probe(() => canEncode(codec)),
    probe(() => canEncodeVideo(codec, { width: frameSize.width, height: frameSize.height })),
  ])
  return { codec, encodable, atFrameSize }
}

/**
 * One audio codec, asked once — through `canEncodeAudio`, which is the audio half of `canEncode`
 * and answers the identical question when it is given no parameters.
 *
 * There is nothing to parameterise it with yet. Sample rate and channel count are export settings,
 * chosen in the dialog long after `init`; probing at a rate nobody has asked for would produce a
 * confident answer about a configuration that may never exist. When those settings are known, the
 * dialog asks again with them (R5).
 */
async function probeAudioCodec(codec: AudioCodec): Promise<AudioCodecCapability> {
  return { codec, encodable: await probe(() => canEncodeAudio(codec)) }
}

/**
 * Everything `ready` reports.
 *
 * `renderer` is passed in rather than discovered here: it is established when the PixiJS renderer
 * initialises against the transferred canvas, and this module has no business standing one up to
 * find out. It travels with the codec answers because it is the same kind of fact — something
 * about this machine that was measured once, at startup, and that the main thread cannot observe
 * for itself.
 *
 * Every codec is probed concurrently. Each one is an independent `isConfigSupported` round trip,
 * and doing them in sequence would put twenty-odd of them on the critical path between the worker
 * starting and the editor being usable.
 */
export async function probeCapabilities(options: {
  readonly renderer: string
  readonly frameSize: PixelSize
}): Promise<EngineCapabilities> {
  const [video, audio] = await Promise.all([
    Promise.all(VIDEO_CODECS.map((codec) => probeVideoCodec(codec, options.frameSize))),
    Promise.all(AUDIO_CODECS.map((codec) => probeAudioCodec(codec))),
  ])

  return {
    renderer: options.renderer,
    video,
    audio,
    frameSize: { width: options.frameSize.width, height: options.frameSize.height },
  }
}
