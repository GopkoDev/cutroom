# Decisions log: Import, Play, Export

Decisions taken while implementing this slice that the spec, plan or contracts did not settle.
Each says who decided, why, and where it shows. Decisions marked **autonomous** were taken
without asking, under the standing instruction (2026-10-23) to decide what is missing and keep
going rather than stop when a phase is not fully green. Revisit any of them by editing the spec
and the code together.

## Product behaviour

- **A second import adds a Clip** (user, 2026-10-23). Each imported Source becomes one Clip, the
  first at Frame 0, each later one butt-joined where the first video Track ends, so a Source
  whose Timebase differs from the Project's can be seen and tested. Spec assumption "One Clip per
  Source"; T041.
- **Play at the end starts again from Frame 0** (user, 2026-10-23). With the Playhead on or past
  the last Frame, Play restarts from 0, as common editors and players do. FR-010 amended; T068.

## Test thresholds

- **T070 main-thread test allows the stop to be noticed up to 3 Frames late** (autonomous,
  2026-10-23). Under a 20× CDP throttle the end-of-Timeline check runs on an animation frame the
  throttle delays (measured 1.22 Frames late); the sound itself always spanned exactly 30.000 s.
  FR-012 is about sound continuity, which stays strict; the stop Frame under extreme main-thread
  load is not what it protects. The engine-load test keeps 1 Frame. A stricter end needs an end
  detector that does not wait for an animation frame — not worth its complexity in this slice.

## Deferred

- **No timer fallback for clock Frame requests** (autonomous, 2026-10-23). The transport asks
  for clock Frames only on animation frames, so a compositor-side stall with the main thread idle
  can still skip one Frame (one 50 ms gap was seen before T072's fix; none in two ten-minute runs
  after it). A `setTimeout` at each Frame boundary would cover it, at the price of a second
  requester the latest-wins guard has to reconcile with the first. Deferred: SC-004 holds as
  measured, and the fallback is a small, contained change if a later measurement shows the gap.
- **`@slow` measurements always run on a fresh dev server** (autonomous, 2026-10-23). The reused
  server hot-reloads into the page under test, which corrupted earlier numbers;
  `CUTROOM_E2E_SLOW` now picks port 5191 and never reuses a server, and `CUTROOM_E2E_PORT` gives
  any run a fresh one.

## Export

- **The export mix is 48 kHz, not the Source's sample rate** (agent, accepted, 2026-10-23). No
  Source records its rate, a Timeline can mix rates, and Web Audio resamples anyway; 48 kHz is
  the video convention. 44.1 kHz and then Opus are tried before declaring no sound encoder. T073.
- **Export qualities are probed on the main thread when the dialog opens** (agent, accepted,
  2026-10-23). The engine's `ready` probe runs before a Project exists, at the wrong size and
  bitrate. Mirroring Mediabunny's encoder config is the cost; a `probe-export` engine message is
  the better long-term home. T073.
- **A Timeline with no sound exports without an audio track and without asking** (agent,
  accepted, 2026-10-23). FR-024's explicit choice is for sound that would be lost; here none would.
  T074.
- **Saving over a linked Source is refused** (autonomous, 2026-10-23). Exporting onto the file a
  Source reads from would destroy the Source mid-export. The save handle is compared with every
  Source's handle through `FileSystemHandle.isSameEntry` before the export starts. T075.
- **Opus exports carry no edit list** (autonomous, 2026-10-23). Opus is only the fallback when
  AAC cannot be encoded; its pre-skip is honoured by Chrome and ffmpeg, and AVFoundation's 6.5 ms
  lateness is accepted for a fallback rather than adding an Opus edit path. ADR 0014.
- **Open risk: Chrome's save picker and existing files** (autonomous, 2026-10-23). The
  overwrite guard runs after the save picker answers. If real Chrome empties an existing file the
  moment it is picked, a Source chosen as destination would already be damaged. The picker
  stand-in cannot show this; T096's manual walk checks it in real Chrome, and if it does, the
  answer is to compare against Sources by name before the picker can be accepted (a
  `startIn`/suggested-name warning) — recorded here rather than guessed at.
