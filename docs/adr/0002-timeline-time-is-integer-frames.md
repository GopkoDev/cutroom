# Timeline time is measured in integer frames

Every position and length on the Timeline — clip placement, trims, markers, keyframes, the playhead — is an integer frame number in the Project's timebase, which is stored as a rational frame rate (e.g. 30000/1001) rather than a float. Seconds and sample indices exist only at the boundary where we talk to a decoder, to WebAudio, or to the muxer, and the conversion lives in a single module.

We chose this over float seconds because the editor's output is a frame grid regardless: with float seconds, "round this to a frame" has to be re-decided at every layer. OpenReel — a mature client-side editor built on float seconds — ends up repeating `Math.round(time * frameRate) / frameRate` in its frame cache, its render bridge and its motion timing independently, and its snapping never lands on the frame grid at all.

## Consequences

- Clip adjacency is integer equality, so butt-joined clips cannot develop sub-millisecond gaps.
- Audio is placed and trimmed on frame boundaries; sample-accurate work (fades, volume envelopes) lives *inside* a Clip and is rendered by WebAudio automation. Sub-frame audio trimming, if we ever want it, is an optional sample offset on the Clip — it does not change the timeline's unit.
- Changing a Project's frame rate is a migration of every stored number, not a setting toggle.
- A Source's own time — how long it is, and where in it a Clip begins — stays in the Source's timescale as an exact rational of seconds, and is stored that way in the Project document. That media time is not ours to renumber into a timebase the Source has never heard of, and rounding it to the Project's frame grid at import would bake a conversion into the document that we could never undo. It is an address, not a position: nothing on the Timeline is expressed in it, no editing operation computes with it, and turning it into a Frame happens in the conversion module like every other boundary crossing. This is the exception Principle II names, and the only one.
