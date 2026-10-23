# Exported AAC carries an edit list, measured per export

An exported MP4's AAC track carries an `edts/elst` whose `media_time` is the encoder's priming delay and whose `segment_duration` is the Timeline's exact sample count, plus an AAC `roll` sample group (`sgpd`/`sbgp`, distance −1). The engine writes them by rewriting the `moov` Mediabunny produces, in place at the end of the file, just before the file is committed. The priming delay is not hard-coded: before each export the engine encodes an impulse through the same encoder settings, decodes it and reads off where it lands.

Chrome's AAC encoder adds 2112 priming samples and WebCodecs does not report them — the first chunk is stamped 0 and the decoder config is the bare AudioSpecificConfig. Mediabunny (1.52) writes an edit list only for a positive start offset, rejects negative timestamps, and has no encoder-delay option, so without this every export played its sound 44 ms late, with a tail past the picture. An edit list alone is not enough: without the `roll` group, AVFoundation trims its own assumed 2112 on top of the edit and plays 44 ms early. Both Apple's and ffmpeg's muxers write the pair, and with it Mediabunny, Web Audio, ffmpeg and AVFoundation all decode the clicks on the exact sample.

## Consequences

- SC-006 holds in ordinary players, which is what "open the output in an ordinary player" (US3) means.
- The output must be written with `fastStart: false`, so the `moov` is last and can be rewritten without moving chunk offsets. The code checks that the `moov` ends the file and fails the export rather than commit an out-of-sync file.
- The rewrite is ours to maintain. It throws if Mediabunny ever writes an `edts` or `sgpd` itself, so the day it learns priming edits, the overlap shows up as a failing export rather than a doubled trim — and the rewrite can go.
- Opus, the fallback when AAC cannot be encoded, gets no edit: its pre-skip is in `dOps` and is honoured everywhere except AVFoundation (6.5 ms late), which is accepted for a fallback.
- Recorded after the fact: this was found and fixed after the T078–T084 code landed; T094 records the lapse.
