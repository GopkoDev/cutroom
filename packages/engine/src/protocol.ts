// The interface between the main thread and the engine worker (ADR 0003,
// contracts/worker-protocol.md).
//
// This module is the reason a message shape cannot drift. Both sides import these declarations —
// `apps/editor` posts a `ToEngine` and narrows an `EngineEvent`, the worker narrows a `ToEngine`
// and posts an `EngineEvent` — so a field renamed on one side stops compiling on the other. A
// protocol described twice is a protocol with two slightly different versions, and `postMessage`
// would report neither.
//
// Three rules the shapes below are held to.
//
// **Everything here survives `postMessage`.** Plain data, plus the four transferable things the
// contract names: an `OffscreenCanvas`, a `File`, `Float32Array`s and a
// `FileSystemWritableFileStream`. No class instances of ours, no functions, no `Date`.
//
// **The domain types are imported, never redeclared.** `Scene`, `SceneClip`, `Timebase`,
// `Rational`, `Frame` and `PixelSize` all come from `@cutroom/model`, which is the only place in
// Cutroom entitled to say what they are. A second declaration of `Scene` here would be a second
// idea of what crosses the boundary — exactly the drift this file exists to prevent — so it is not
// re-exported either: a caller naming a `Scene` imports it from the model, as the worker does.
//
// **Every `Frame` is an integer in the Project's Timebase** (invariant 2). The only seconds that
// cross are Source-native ones — a Source's `duration` and `timebase` in `source-attached`, and a
// `SceneClip`'s `sourceInPoint` inside a `Scene` — which are exact `Rational`s, never floats. No
// rate arithmetic happens in this package at all; `packages/model` owns every conversion (R7).

import type { AudioCodec, VideoCodec } from "mediabunny"

import type { Codecs, Frame, PixelSize, Rational, Scene, Timebase } from "@cutroom/model"

// ---------------------------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------------------------

/**
 * What the browser said when asked whether it can encode one video codec.
 *
 * `codec` is Mediabunny's own name for it (`"avc"`, `"vp9"`, …) and the list of codecs probed is
 * Mediabunny's own `VIDEO_CODECS`, not a list of ours: Principle I makes codec availability a
 * runtime question, and a hardcoded list is a claim about a machine we have not met.
 *
 * The two answers differ and both are worth carrying. `encodable` is `canEncode` — is there an
 * encoder for this codec at all. `atFrameSize` is `canEncodeVideo` at the Project's frame size —
 * the same question for the pictures this Project would actually hand it, which is the one an
 * export dialog must not guess at: hardware encoders decline sizes, not codecs.
 */
export interface VideoCodecCapability {
  readonly codec: VideoCodec
  readonly encodable: boolean
  readonly atFrameSize: boolean
}

/**
 * What the browser said when asked whether it can encode one audio codec, over Mediabunny's own
 * `AUDIO_CODECS`.
 *
 * There is one answer rather than two, and the asymmetry with video is deliberate. The video probe
 * has a parameter it can commit to at `init` — the Project's frame size, which is in the `init`
 * message. Audio has none: sample rate and channel count are export settings chosen later, and
 * `canEncodeAudio` with no options asks exactly what `canEncode` asks. Inventing a sample rate to
 * probe with would produce an answer about a configuration nobody had asked for yet.
 */
export interface AudioCodecCapability {
  readonly codec: AudioCodec
  readonly encodable: boolean
}

/**
 * What this browser, on this machine, turned out to be able to do — measured, never assumed
 * (Principle I). Carried in `ready`, and the whole basis on which an export dialog offers
 * anything.
 */
export interface EngineCapabilities {
  /**
   * The backend PixiJS actually got inside the worker — `"webgl"`, `"webgpu"` or `"canvas"`,
   * whatever it reports as its own name.
   *
   * Not a codec, and here anyway. It is the one fact about the engine that the main thread cannot
   * observe for itself: the canvas has been transferred, so from the outside a worker that
   * composites on the GPU and a worker that failed to and is quietly doing nothing look identical
   * (ADR 0003 — "errors in the worker need explicit forwarding to be visible at all"). Reported
   * once, at the only moment it is established.
   */
  readonly renderer: string

  /** One entry per codec Mediabunny knows about, in its order. Unsupported ones are kept, with
   * `encodable: false` — "we asked and the answer was no" and "we never asked" are different
   * things, and only the first lets the UI say why a codec is not on offer. */
  readonly video: readonly VideoCodecCapability[]
  readonly audio: readonly AudioCodecCapability[]

  /** The frame size `atFrameSize` was probed with, so the answer can be read for what it is. */
  readonly frameSize: PixelSize
}

// ---------------------------------------------------------------------------------------------
// Direction: main → worker
// ---------------------------------------------------------------------------------------------

/**
 * Sent once, with `canvas` transferred. The worker replies `ready` or `fatal`.
 *
 * The Timebase and frame size arrive before any `Scene` does, so the worker can stand up a
 * renderer of the right size before there is anything to show in it.
 */
export interface InitMessage {
  readonly type: "init"
  readonly canvas: OffscreenCanvas
  readonly timebase: Timebase
  readonly frameSize: PixelSize
}

/**
 * The main thread has resolved a `FileSystemFileHandle` and its permission and hands over the
 * bytes. The worker never touches handles or permissions (ADR 0005) — it receives a `File` and
 * knows nothing about where it came from.
 *
 * Replies `source-attached` or `source-failed`.
 */
export interface AttachSourceMessage {
  readonly type: "attach-source"
  readonly sourceId: string
  readonly file: File
}

/** Closes decoders and releases memory. Sent when a Source goes Offline or is removed. */
export interface DetachSourceMessage {
  readonly type: "detach-source"
  readonly sourceId: string
}

/**
 * Replaces the worker's picture of the Timeline. A whole snapshot, never a diff, so the worker
 * cannot drift out of sync (ADR 0003).
 *
 * `revision` increases monotonically and the worker ignores any Scene older than the one it holds.
 * That matters because these are throttled during continuous gestures: a drag posts Scenes faster
 * than they can be consumed, and without the revision an out-of-order delivery would leave the
 * Preview showing a Timeline the user has already moved past, with nothing to correct it.
 */
export interface SceneMessage {
  readonly type: "scene"
  readonly revision: number
  readonly scene: Scene
}

/**
 * Requests one Frame.
 *
 * `scrub` abandons any streaming iterators and uses random access; `clock` continues the streaming
 * path. The worker may coalesce: if newer requests arrive while one is in flight, the older ones
 * are dropped rather than queued, because a Frame the user has already scrubbed past is work
 * nobody is waiting for (FR-012). A request may therefore be answered late or not at all, and the
 * main thread must not block on it (invariant 3).
 */
export interface RenderFrameMessage {
  readonly type: "render-frame"
  readonly frame: Frame
  readonly reason: "scrub" | "clock"
}

/** Lets the worker open or close streaming iterators at the right moment. */
export interface TransportMessage {
  readonly type: "transport"
  readonly state: "playing" | "stopped"
  readonly fromFrame: Frame
}

/**
 * Starts an export. Carries its own `Scene` — frozen, sharing no object with the Project — so that
 * edits made while it runs cannot reach it (FR-019). `writable` is transferred.
 *
 * `audio` is `null` when the export has no sound, which is a different thing from an export whose
 * audio settings have not been chosen.
 */
export interface ExportStartMessage {
  readonly type: "export-start"
  readonly scene: Scene
  readonly range: { readonly fromFrame: Frame; readonly toFrame: Frame }
  readonly video: { readonly codec: VideoCodec; readonly bitrate: number }
  readonly audio: {
    readonly codec: AudioCodec
    readonly bitrate: number
    readonly sampleRate: number
    readonly channels: number
  } | null
  readonly writable: FileSystemWritableFileStream
}

/**
 * Mixed PCM produced on the main thread by `OfflineAudioContext` (ADR 0008), transferred in
 * chunks. The worker wraps each chunk in an `AudioSample` and awaits the encoder's backpressure
 * before answering `export-audio-ack` (invariant 4).
 *
 * `channels` is one `Float32Array` per channel, all of the same length; `startSample` is the index
 * of the first sample in the whole exported stream, not within this chunk.
 */
export interface ExportAudioChunkMessage {
  readonly type: "export-audio-chunk"
  readonly channels: readonly Float32Array[]
  readonly startSample: number
  readonly final: boolean
}

/**
 * Aborts encoding. The worker closes the writable stream without finalizing and replies
 * `export-cancelled`; no finished file is left behind (FR-018).
 */
export interface ExportCancelMessage {
  readonly type: "export-cancel"
}

/** Everything the main thread may send. */
export type ToEngine =
  | InitMessage
  | AttachSourceMessage
  | DetachSourceMessage
  | SceneMessage
  | RenderFrameMessage
  | TransportMessage
  | ExportStartMessage
  | ExportAudioChunkMessage
  | ExportCancelMessage

/** The `type` of any message the main thread may send. */
export type ToEngineType = ToEngine["type"]

// ---------------------------------------------------------------------------------------------
// Direction: worker → main
// ---------------------------------------------------------------------------------------------

/** Init succeeded, and here is what this machine turned out to be able to do. */
export interface ReadyEvent {
  readonly type: "ready"
  readonly capabilities: EngineCapabilities
}

/**
 * The metadata read from the file itself.
 *
 * `duration` and `timebase` are exact rationals in the **Source's own** timescale — Principle II's
 * one exception, and the only seconds that cross this boundary (invariant 2). They are not
 * renumbered into the Project's Frames here, or anywhere.
 */
export interface SourceAttachedEvent {
  readonly type: "source-attached"
  readonly sourceId: string
  readonly duration: Rational
  readonly timebase: Timebase
  readonly dimensions: PixelSize
  readonly hasAudio: boolean
  readonly codecs: Codecs
}

/**
 * Undecodable or unreadable. The main thread reports it and leaves the Project unchanged
 * (FR-003) — a Source that cannot be attached is not an edit.
 */
export interface SourceFailedEvent {
  readonly type: "source-failed"
  readonly sourceId: string
  readonly reason: string
}

/**
 * The canvas now shows this Frame of this Scene revision.
 *
 * `revision` is carried because the answer can arrive after the Scene it was rendered from has
 * been replaced; without it the main thread could not tell a current Preview from a stale one.
 */
export interface FrameRenderedEvent {
  readonly type: "frame-rendered"
  readonly frame: Frame
  readonly revision: number
}

/** Diagnostic only, never surfaced as an error: dropping Frames nobody is waiting for is the
 * design working (FR-012), not a failure. */
export interface FramesDroppedEvent {
  readonly type: "frames-dropped"
  readonly count: number
}

/** Decoded audio for playback scheduling on the main thread (ADR 0008), transferred. */
export interface AudioPcmEvent {
  readonly type: "audio-pcm"
  readonly sourceId: string
  readonly channels: readonly Float32Array[]
  readonly startSample: number
}

/**
 * The chunk was encoded; the main thread may send the next one. This is the backpressure signal —
 * without it the mixer outruns the encoder and memory grows without bound (invariant 4).
 */
export interface ExportAudioAckEvent {
  readonly type: "export-audio-ack"
  readonly startSample: number
}

/** Drives the progress display. */
export interface ExportProgressEvent {
  readonly type: "export-progress"
  readonly framesDone: number
  readonly framesTotal: number
}

/** The stream was finalized and closed. */
export interface ExportDoneEvent {
  readonly type: "export-done"
  readonly bytes: number
}

/** Aborted cleanly. */
export interface ExportCancelledEvent {
  readonly type: "export-cancelled"
}

/** No file is presented as complete. */
export interface ExportFailedEvent {
  readonly type: "export-failed"
  readonly reason: string
}

/**
 * The worker cannot continue, and the UI must say so rather than appear frozen.
 *
 * Errors are messages, not exceptions (invariant 5). An unhandled throw inside a worker is
 * invisible from the outside — no rejected promise, no console the user will look at, just a tab
 * that stops answering — so every throw is caught at the boundary and forwarded as one of these.
 * `reason` is for a person to read; `stack` is for whoever has to find it.
 */
export interface FatalEvent {
  readonly type: "fatal"
  readonly reason: string
  readonly stack?: string
}

/** Everything the worker may send. */
export type EngineEvent =
  | ReadyEvent
  | SourceAttachedEvent
  | SourceFailedEvent
  | FrameRenderedEvent
  | FramesDroppedEvent
  | AudioPcmEvent
  | ExportAudioAckEvent
  | ExportProgressEvent
  | ExportDoneEvent
  | ExportCancelledEvent
  | ExportFailedEvent
  | FatalEvent

/** The `type` of any message the worker may send. */
export type EngineEventType = EngineEvent["type"]
