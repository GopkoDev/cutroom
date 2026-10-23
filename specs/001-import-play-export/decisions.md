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

## Language and records (T094)

- **After-the-fact ADRs 0015 and 0016 written** (autonomous, 2026-10-23). The T094 audit found
  three decisions at the ADR bar with no ADR: the Export's own renderer and decoders, the
  commit-once rule for the destination, and the measured Source Timebase. They are written now as
  marked after-the-fact records, the same treatment as 0011–0014, because a decision with no
  record is worse than a late one; the lapse itself stays recorded in T094.
- **Missing terms added to CONTEXT.md** (autonomous, 2026-10-23): Linked Source, In-point,
  Timecode, Scrub, Playback, Transport, Skipped Frame, Dropped Frame, Gesture, Project list,
  Export quality — each with words to avoid.
- **Avoided words renamed in code**: `importSequence` ("Sequence") and `framesPerSecond` ("FPS")
  are renamed once the Phase 6 agents have finished touching those files.
- **`anchor` (clock) and `segment` (offline mix) are kept** (autonomous, 2026-10-23). They name
  a clock reference point and a slice of mix time, not a Keyframe or a Clip, and live only inside
  `apps/editor/src/audio/`; renaming them would cost clarity there for no gain in the domain.
- **The time space of `sourceInPoint` is left open** (autonomous, 2026-10-23). It is container
  time today (In-point 0 at the container's zero), which is right for every file in this slice;
  an ADR settles it before trimming lands, because trimming is where it starts to matter.

## Scrub latency (T092)

- **Forward scrubs reuse the decoder's position; keyframe preview and proxies are next**
  (autonomous, 2026-10-23). T092 found SC-003 missed on 1080p H.264 with GOP 300 (307 ms) and by
  ≈2× on 4K. Within this slice only the forward-walk is built, because it is the common gesture,
  it fixes the 1080p miss, and it reuses a rule streaming already has. Showing the keyframe while
  the pointer moves changes SC-003's promise and a proxy reverses "nothing derived is kept", so
  both wait for their own spec work. ADR 0017.
- **SC-003 accepted as met for forward gestures only on 1080p GOP 300** (autonomous,
  2026-10-23). After ADR 0017, backward steps and far jumps on 1080p H.264 with a keyframe every
  300 Frames still measure 301–313 ms worst, just over 300 ms; on the fixtures and on GOP 250 or
  HEVC every gesture is inside it. Two attempts to shave the iterator-open cost made it worse.
  Closing this gap needs the keyframe-preview item of ADR 0017, which changes what SC-003
  promises, so it is left for that spec work rather than chased here.
- **A stopped Preview keeps its scrub decoder for 3 s** (autonomous, 2026-10-23). The parked
  iterator is what makes the next step cost 1 ms instead of 300, and holds about 45 decoded
  Frames (≈140 MB at 1080p, ≈560 MB at 4K); 3 s idle releases it. This relaxes T090's "a stopped
  Preview holds no decoder" to "after 3 s".
