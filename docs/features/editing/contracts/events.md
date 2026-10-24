---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-23"
feature_size: "L"
---

# Events — editing (main thread ↔ engine worker)

This is the contract of the `worker` surface ([sad.md](../sad.md) frontmatter `target_surfaces`).
**The protocol does not change.** No message, field or reply is added, removed or renamed. The
contract stands as [import-play-export/contracts/events.md](../../import-play-export/contracts/events.md)
states it, typed in `packages/engine/src/protocol.ts`.

A Scene with Clips on two Tracks is already a valid Scene, and every Clip's sound already travels
as its own `audio-pcm` (sad §5). What editing changes is **when** the existing messages are sent,
and what the worker must sustain while receiving them. Those expectations are below, with the flow
or quality scenario that sets each one.

## Channel: `postMessage` (main thread ↔ `@cutroom/engine/worker`)

Producer, consumers, delivery, ordering and versioning are unchanged. Async flows: none. No
message here is retried, and there is no queue, webhook or dead letter (sad §6, "No flow is
asynchronous").

## Expectations editing adds to existing messages

### `scene`

- **Posted once per Gesture, after the command.** It is not posted on any pointer move during a
  drag. A drag preview never reaches the worker (ADR 0020, sad §8 "Drag preview"). After undo and
  redo it is posted once per step (sad Flow 7). A Gesture that produced no patches posts nothing
  (AC-32).
- **Two Tracks.** `clips` lists every Track's Clips back to front, `tracks[0]` backmost. The worker
  draws in that order, so the upper Track covers the lower one and a Gap on it shows the lower Track
  through (AC-08, AC-20). This is the step-1 ordering rule, now exercised.
- **Ids survive a move.** A moved Clip keeps its `clipId`, including onto the other Track, so the
  worker's per-Clip state, keyed by `clipId`, carries over (ADR 0019). A Split's second half and a
  copy arrive as new `clipId`s that share their original's `sourceId`.
- **An Export is not affected.** A `scene` posted during an Export updates the Preview only. The
  Export keeps the Scene frozen at `export-start` (AC-26, ADR 0015).

### `render-frame` / `frame-rendered`

- After a Gesture, the next Frame at the Playhead is requested as in step 1. Spec §6 requires it
  within 300 ms p95 of release (QG-3b), measured on the generated fixtures.

### `audio-pcm`

- Sent per Clip, as in step 1. With two Tracks, two Clips can be sounding at once. The main thread
  sums them on one master bus with a limiter whose delay it measures (ADR 0022). The worker needs
  no new message.

### `export-audio-request` / `export-audio-pcm` / `export-audio-chunk`

- Unchanged. The worker returns the sound of every Clip in the segment, the main thread mixes it
  offline through the same graph with a pre-roll for the limiter, and the mixed chunk goes back
  under acknowledgement backpressure (sad cross-cutting flow, ADR 0022).

### `frames-dropped`

- The Skipped Frame counter is read across Edit points (QG-3c) and with two Tracks (QG-3d): no more
  than 1% of Frames skipped. If QG-3c misses, the step's one planned engine change is to pre-open
  the next Clip's stream inside the worker (sad §11). That is internal, with no message change.
