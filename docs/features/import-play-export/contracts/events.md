---
status: Approved
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
---

# Events — import-play-export (main thread ↔ engine worker)

This is the `worker` surface's contract ([sad.md](../sad.md) frontmatter `target_surfaces`). SDD's
events template is shaped for a message bus. This contract is the `postMessage` protocol between
the editor's main thread and the engine Web Worker, so it keeps its own message-by-message form
below. The template's head is filled in here. Migrated from the Spec Kit
`contracts/worker-protocol.md`, with the body unchanged.

## Channel: `postMessage` (main thread ↔ `@cutroom/engine/worker`)

- **Producer:** both directions. The editor posts `ToEngine` messages and the worker posts
  `EngineEvent`s. Both are typed once in `packages/engine/src/protocol.ts:252-262` and
  `packages/engine/src/protocol.ts:433-446`.
- **Consumers:** the worker's single message switch (`packages/engine/src/worker.ts:294`). The
  editor's typed client (`apps/editor/src/engine-client/index.ts`).
- **Delivery:** structured-clone `postMessage`, with transfers for the canvas, PCM and the
  writable stream. `render-frame` is a latest-wins stream: a request may be superseded and never
  answered (invariant 3). `attach-source` and `export-start` always get exactly one reply.
- **Ordering:** `scene` carries a monotonically increasing `revision`, and the worker ignores an
  older one.
- **Versioning:** none on the wire. Both ends are built from the same `protocol.ts`, so a shape
  cannot drift between them.

## Message reference (Contract: main thread ↔ engine worker)

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

Requests one Frame. `scrub` is the Playhead moved by hand, `clock` is playback. Both are rendered
from each visible Clip's decoder: walked forward from where it stands when the Frame is ahead of
it within `STEP_LIMIT` Frames or in the same GOP, and reopened at the Frame otherwise — a backward
step or a far jump (ADR 0017). The worker may coalesce: if newer requests arrive while one is in flight,
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
decoding sound (`audio-pcm`). `playing` starts a playback run from `fromFrame`: audio decode from
any earlier run is closed and starts again there, and so is every picture iterator, except one
that can walk forward to `fromFrame` under the same rule as `render-frame` (ADR 0017). **A seek
during playback is a second `playing`** with the new `fromFrame` — that is how the worker tells a
jump of the clock from a lag. `stopped` closes everything.

### `export-start`

```
{ type: "export-start", scene: Scene, range: { fromFrame, toFrame },
  video: { codec, bitrate }, audio: { codec, bitrate, sampleRate, channels } | null,
  writable: WritableStream }
```

Carries its own frozen `Scene`, so later edits cannot affect a running export (FR-019). Answered
by exactly one of `export-done`, `export-cancelled`, `export-failed`; one export runs at a time,
and a second `export-start` while one runs is a `fatal`.

`range` is **half-open**, like a Clip's `startFrame + durationFrames`: `fromFrame` is the first
Frame exported and `toFrame` the first one not, so the whole Timeline is `{ 0, durationFrames }`.
The file starts at its own zero — Frame `fromFrame` is at 0 s.

`writable` is **not** the `FileSystemWritableFileStream`: Chrome refuses to transfer one
(`DataCloneError`, measured). The main thread keeps the file stream and transfers a plain
`WritableStream` forwarding to it — `forwardingWritable(file)` from `@cutroom/engine` returns it as
`.writable`, together with `.committed`, a promise that resolves once the file stream's own
`close()` has committed the file and rejects if it was discarded or a write or the commit failed.
The worker closes the stream only after a finished export and aborts it on every other ending, so
nothing but a finished export commits the file.

The export renders through the same `renderScene` as the Preview (Principle III) but on a renderer,
canvas and decoders of its own, so a Preview being scrubbed or played beside it is undisturbed.

### `export-audio-request`

```
{ type: "export-audio-request", toFrame: integer }
```

Asks for the decoded sound of the running export's Clips — its frozen Scene's, not the Preview's —
for the main thread to mix (ADR 0008: the engine owns the Sources, the main thread owns
`OfflineAudioContext`). Answered by one `export-audio-pcm` naming the same `toFrame`. Sent with
`toFrame` increasing. Ignored when no export is running.

### `export-audio-chunk`

```
{ type: "export-audio-chunk", channels: Float32Array[], startSample: number, final: boolean }
```

Mixed PCM produced on the main thread by `OfflineAudioContext`, transferred in chunks. The worker
wraps each chunk in an `AudioSample` and awaits the encoder's backpressure before acknowledging
with `export-audio-ack`.

`channels` are `export-start.audio.channels` planes at its `sampleRate`, all one length.
`startSample` counts from the start of the exported stream: its sample 0 is the Timeline's sample
`frameToSampleIndex(timebase, sampleRate, fromFrame)`, and the stream holds exactly
`frameToSampleIndex(…, toFrame) − frameToSampleIndex(…, fromFrame)` samples. Chunks are contiguous
and the last is `final`; a gap, an overlap, a wrong channel count or a stream that ends short fails
the export (`export-failed`), and samples past the end are dropped. Ignored when no export is
running — a mixer still posting for an export that has just ended.

### `export-cancel`

```
{ type: "export-cancel" }
```

The worker stops the Frame loop, **aborts** the writable stream — which discards everything written
to it — and replies `export-cancelled`. No finished file is left behind (FR-018). (Closing it would
commit a truncated file, which is why Mediabunny's own `output.cancel()` is not what ends it.) With
no export running there is nothing to cancel and nothing is said.

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
| `export-audio-pcm` | `{ toFrame, chunks: { sourceId, clipId, sampleRate, channels, startSample }[] }` | The answer to `export-audio-request`: every chunk of the export Clips' decoded sound not sent in an earlier answer that starts before `toFrame` (and possibly some beyond it — the decode runs up to two seconds ahead). Each chunk is exactly what `audio-pcm` carries — Timeline-positioned, unbroken, at the Source's rate — from the Frame before `fromFrame` to each Clip's end. Transferred; may be empty. |
| `export-progress` | `{ framesDone, framesTotal }` | Drives the progress display. Sent at most every 100 ms, and always for the first (0) and last Frame. |
| `export-done` | `{ bytes }` | The worker finalized the file and closed its stream; `bytes` is its size. A finished file is this **and** `forwardingWritable(...).committed` resolving: the commit happens on the main thread, and a write or commit failing there can reach the worker too late or never (measured: a destination whose every write failed still produced `export-done`). |
| `export-cancelled` | `{}` | Aborted cleanly: the stream was aborted, so nothing was committed. |
| `export-failed` | `{ reason }` | No file is presented as complete: the stream was aborted. Covers an encoder error, a destination that stopped accepting writes, a malformed audio stream, and a Source that went Offline or was relinked mid-export (the file would no longer be the Timeline as it stood at the start). |
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
