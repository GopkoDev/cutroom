# Scrubbing reuses the decoder's position; long-GOP footage gets a proxy later

Measured in T092, the time to show a scrubbed Frame grows linearly with its distance from the previous keyframe, because every scrub request decodes from that keyframe — even a one-Frame step. On realistic camera-like H.264 at 1080p with a keyframe every 300 Frames this misses SC-003's 300 ms (a step late in the GOP took 307 ms), and at 4K it misses by about 2× on every file tried. This is the stop-and-reconsider signal the plan named, so it is decided here before more is built on the scrub path.

**In this slice**: a scrub request for a Frame ahead of where a Clip's decoder already stands, within the same GOP, walks forward from that position instead of starting again at the keyframe — the way streaming playback already walks short gaps. This makes the common case, dragging forward or stepping with the arrow key, cost one Frame's decode rather than a GOP's, and brings 1080p GOP 300 inside SC-003. Backward steps and far jumps still decode from the keyframe; at 1080p their worst case measured 293 ms, inside the budget with little margin.

**Next, not in this slice**:

1. While the pointer is moving, show the nearest already-decodable Frame (the keyframe) and replace it with the exact Frame when the pointer rests, with the Preview saying so. This changes what SC-003 promises and needs its wording settled with it.
2. For footage whose GOP makes even that too slow — 4K camera files — an all-intra or short-GOP proxy kept in origin-private storage. It is the only option that bounds latency for any input, and it reverses this slice's "nothing derived is kept" stance, so it needs its own ADR squared with ADR 0005.

A cache of decoded Frames around the Playhead was considered for backward steps and left out: at 1080p each Frame is 8 MB, so a useful window costs hundreds of megabytes.

## Consequences

- SC-003 is met for 1080p material in the common scrub gestures; backward steps late in a long GOP remain close to the limit and 4K long-GOP remains outside it until (1) and (2).
- The scrub and stream paths share one rule — walk forward when it is cheaper than seeking — which keeps them from diverging.
- Written when the finding was made (T092), before the code that answers it.
- Implemented 2026-10-23: one walk rule for scrubs and playback (continue a Clip's iterator when the Frame is ahead of it, within 30 Frames or anywhere in the same GOP; reopen otherwise). On 1080p H.264 GOP 300 forward steps went from about 296 to about 1 ms and a slow drag shows every Frame; backward steps and far jumps still decode from the keyframe and measured 301–313 ms worst, slightly **over** SC-003 rather than the 293 ms hoped for — so SC-003 holds for forward gestures only on that material until (1) lands. A scrub parks its iterator (about 45 decoded Frames per visible Clip) and a stopped Preview closes it after 3 s idle.
