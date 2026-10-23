# Contract: main thread ↔ engine worker

The message protocol is a real interface, not an implementation detail (ADR 0003). Everything
here must survive `postMessage`. The worker owns pixels; the main thread owns state, sound and
the clock.

## Direction: main → worker

### `init`

```
{ type: "init", canvas: OffscreenCanvas, timebase: { numerator, denominator },
  frameSize: { width, height } }
```

Sent once, with the canvas transferred. The worker replies `ready` or `fatal`.

### `attach-source`

```
{ type: "attach-source", sourceId: string, file: File }
```

The main thread resolves the `FileSystemFileHandle` and its permission, then hands over a `File`.
The worker never touches handles or permissions. Replies `source-attached` with the metadata read
from the file, or `source-failed` with a reason.

Correlated by `sourceId` alone, so one Source cannot be attached twice concurrently — a second
attach while the first is in flight is refused by the client rather than guessed at. Should
concurrent attaches of one Source ever be wanted, this message needs a request id; a convention
will not do.

### `detach-source`

```
{ type: "detach-source", sourceId: string }
```

Closes decoders and releases memory. Sent when a Source goes Offline or is removed.

### `scene`

```
{ type: "scene", revision: number, scene: Scene }
```

Replaces the worker's picture of the Timeline. `revision` increases monotonically; the worker
ignores any scene older than the one it holds. Throttled during continuous gestures.

### `render-frame`

```
{ type: "render-frame", frame: integer, reason: "scrub" | "clock" }
```

Requests one Frame. `scrub` abandons any streaming iterators and uses random access; `clock`
continues the streaming path while the transport is `playing` (and is served by random access
while it is `stopped`). The worker may coalesce: if newer requests arrive while one is in flight,
older ones are dropped rather than queued (FR-012). Every request is answered by exactly one
`frame-rendered` or `frames-dropped`, unless it is lost outright (invariant 3). A `clock` request
is also how the worker learns where the Playhead is, which bounds how far ahead it decodes sound.

**This is not a request/response pair, and must not be implemented as one.** It carries no id and
gets no matching reply, because the whole point of FR-012 is that a request may be superseded and
never answered. A client that returns a promise per `render-frame` leaks one for every dropped
Frame — which, during playback on a loaded machine, is most of them.

The shape that works is a stream: the client posts the Frame it wants and returns nothing; the
worker renders the newest Frame it has been asked for and announces what it drew. Anything that
needs to know what is on screen listens for `frame-rendered` rather than awaiting a call. Messages
that *are* request/response — `attach-source`, `export-start` — say so by carrying a reply that
always comes.

### `transport`

```
{ type: "transport", state: "playing" | "stopped", fromFrame: integer }
```

Lets the worker open or close streaming iterators at the right moment, and start or stop
decoding sound (`audio-pcm`). `playing` starts a playback run from `fromFrame`: iterators and audio
decode from any earlier run are closed and both start again there. **A seek during playback is a
second `playing`** with the new `fromFrame` — that is how the worker tells a jump of the clock
from a lag. `stopped` closes everything.

### `export-start`

```
{ type: "export-start", scene: Scene, range: { fromFrame, toFrame },
  video: { codec, bitrate }, audio: { codec, bitrate, sampleRate, channels } | null,
  writable: FileSystemWritableFileStream }
```

Carries its own frozen `Scene`, so later edits cannot affect a running export (FR-019). The
writable stream is transferred.

### `export-audio-chunk`

```
{ type: "export-audio-chunk", channels: Float32Array[], startSample: number, final: boolean }
```

Mixed PCM produced on the main thread by `OfflineAudioContext`, transferred in chunks. The worker
wraps each chunk in an `AudioSample` and awaits the encoder's backpressure before acknowledging
with `export-audio-ack`.

### `export-cancel`

```
{ type: "export-cancel" }
```

The worker aborts encoding, closes the writable stream without finalizing, and replies
`export-cancelled`. No finished file is left behind (FR-018).

## Direction: worker → main

| Message | Payload | Meaning |
|---|---|---|
| `ready` | `{ capabilities }` | Init succeeded; carries the results of the `canEncode` probes. |
| `source-attached` | `{ sourceId, duration, timebase, dimensions, hasAudio, codecs }` | Metadata read from the file. `duration` and `timebase` are exact rationals in the Source's own timescale — the Principle II exception, and the only seconds that cross this boundary. |
| `source-failed` | `{ sourceId, reason }` | Undecodable or unreadable; the main thread reports it and leaves the Project unchanged (FR-003). |
| `frame-rendered` | `{ frame, revision, skipped }` | The canvas now shows this Frame of this Scene revision. An announcement, not a reply: it is not correlated to any one request. `skipped` is how many Frames playback passed over, never shown, to reach this one — the Frames strictly between the previous Frame rendered in this playback run (or the run's `fromFrame`) and this one; always 0 for `scrub`. It is carried here, not as a `frames-dropped`, so that every request still gets exactly one answer. |
| `frames-dropped` | `{ count }` | Diagnostic only; never surfaced as an error. Requests the worker was sent and did not render: displaced by a newer one while waiting (FR-012), or not servable at all — one asked for before any Scene arrived — since there is no Scene revision to name in a `frame-rendered`. Frames playback skipped without being asked for are `frame-rendered.skipped`. |
| `audio-pcm` | `{ sourceId, clipId, sampleRate, channels: Float32Array[], startSample }` | Decoded sound of one Clip for playback scheduling, transferred, sent during a playback run up to two seconds ahead of the Playhead. `startSample` is a position **on the Timeline**, on the grid `frameToSampleIndex(timebase, sampleRate, frame)` lays down: the Clip's start and in-point are already applied and the PCM is trimmed to the Frames the Clip covers, so the receiver maps nothing. `sampleRate` is the Source's own. The same `clipId` and `startSample` always carry the same sound, so PCM from a run a seek replaced is still right where it lands; a receiver schedules each sample of a Clip once. No end-of-stream marker: a Clip's sound ends where the Clip does. **Unbroken** (T070): for a Clip whose Source has sound, every sample from the run's first (`fromFrame`, or the Clip's start) to the Clip's end is sent, as silence where the track has none — it starts after the in-point, skips, or ends before the Clip — so a receiver can wait for the sound at the start of a run and know it is waiting for something that will come. A Source without sound sends nothing — silence is valid. |
| `export-audio-ack` | `{ startSample }` | The chunk was encoded; the main thread may send the next one. This is the backpressure signal — without it the mixer outruns the encoder. |
| `export-progress` | `{ framesDone, framesTotal }` | Drives the progress display. |
| `export-done` | `{ bytes }` | The stream was finalized and closed. |
| `export-cancelled` | `{}` | Aborted cleanly. |
| `export-failed` | `{ reason }` | No file is presented as complete. |
| `fatal` | `{ reason }` | The worker cannot continue; the UI must say so rather than appear frozen. |

## Invariants

1. The worker never mutates a Project and never sends one back. Its only outputs are pixels,
   decoded PCM, and status.
2. Every `Frame` in this protocol is an integer in the Project's Timebase. The only seconds that
   cross the boundary are Source-native ones — a Source's `duration` and `timebase`, and a Clip's
   `sourceInPoint` inside a `Scene` — which are exact rationals, never floats, and describe a
   position inside a Source rather than on the Timeline (Principle II's exception, ADR 0002).
3. A `render-frame` request may be answered late or not at all, and the main thread must never
   block on one. Sound never waits for a Frame (FR-011, FR-012). Frame delivery is a stream, not
   a call — see `render-frame`.
4. Backpressure is explicit: export audio chunks are acknowledged, so the main thread cannot
   outrun the encoder.
5. Errors are messages, not exceptions. An unhandled throw inside the worker must be caught at the
   boundary and forwarded as `fatal`, or it is invisible.
6. `init.timebase` and `init.frameSize` are a convenience for the first Render only. Every `Scene`
   carries its own, and the Scene's win: `export-start` sends a frozen Scene that must be
   self-contained (FR-019), so a Scene that leaned on a startup message would not be frozen in any
   useful sense.
