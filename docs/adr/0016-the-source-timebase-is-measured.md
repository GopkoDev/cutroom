# The Source Timebase is measured, not read

A Source's Timebase is measured from its packets when it is attached: Frames × the track's clock rate over the clock span of its first 120 Frames in presentation order, reduced to an exact ratio. No container stores a frame rate a player is obliged to honour — MP4 stores a clock and per-sample durations, Matroska a millisecond clock — so reading a "frame rate" field would be reading a guess someone else made.

120 Frames keeps the NTSC rates (24000/1001, 30000/1001, 60000/1001) exact even on a millisecond clock, and 16 extra packets are read so B-frame reordering cannot cut the sample short. A variable-rate file gets the exact average of its opening Frames.

## Consequences

- The first Source imported sets the Project's Timebase (FR-005), and the measured value is stored in the Project Document. Changing the measuring rule later changes what new Projects get but not what old ones hold; re-measuring an existing Project's Sources would be a migration (ADR 0007).
- A file whose rate changes after its first 120 Frames is mapped at the opening rate; this slice accepts that.
- Recorded after the fact (T094, audit A3): settled while building T039 and landed with the code.
