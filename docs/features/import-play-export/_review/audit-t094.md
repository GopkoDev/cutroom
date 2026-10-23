# T094 audit: did the standing rule hold?

Audited 2026-10-23 against `main` at `34d6197` (Phases 1–5). The rule (constitution, Development
Workflow; tasks.md, "Implementation strategy"): a decision that is **hard to reverse, surprising
without context, and the result of a real trade-off** gets an ADR *before* the code depending on
it lands, and a domain term enters `CONTEXT.md` *in the same change* that introduces it.

This file records lapses. It writes no ADR and adds no term; each entry ends with a
recommendation for the owner to accept or reject.

Method: every task done note in tasks.md (T001–T089) and every entry in decisions.md was read for
decisions, and each candidate judged against all three parts of the bar. For terms, the code under
`packages/model/src`, `packages/engine/src`, `apps/editor/src` and `apps/editor/e2e` was searched
for every `_Avoid_` word in CONTEXT.md and for domain nouns that CONTEXT.md does not define, and
`git log -S` gave the commit each one entered. CONTEXT.md has changed three times in its history
(`35a3596`, `f554804` — Source Timebase and Scene, `0cf95a9` — Project Document); nothing has been
added since Phase 2 began.

A note on granularity: Phases 3, 4 and 5 each landed as one commit (`7f5efea`, `90b0009`,
`34d6197`) that holds both the code and any ADR written for it. "Before the code" cannot be
judged from git history at that size; the judgement below follows the task notes, which say when
a decision was taken.

## ADRs

### Already recorded

| ADR | Decision | Code |
| --- | --- | --- |
| 0011 | Saves follow the gesture; every write commits explicitly | `7f5efea`, `apps/editor/src/store/index.ts`, `storage/projects.ts` (T034 fix) |
| 0012 | Playback sound is placed on the Timeline by the worker | `90b0009`, `packages/engine/src/sources/audio.ts`, `apps/editor/src/audio/graph.ts` (T059/T060) |
| 0012 amendment | Playback starts when its sound is in hand | `90b0009`, `apps/editor/src/audio/start-gate.ts`, `transport.ts` (T070) |
| 0013 | The worker counts the Frames playback skips | `90b0009`, `packages/engine/src/playback/scheduler.ts` (T064) |
| 0014 | Exported AAC carries an edit list | `34d6197`, `packages/engine/src/export/edit-list.ts`, `encoder-delay.ts` (T084) |

### New lapses

**A1. Export has its own canvas, renderer and decoders — and ADR 0003 says otherwise.**
Entered in `34d6197`, `packages/engine/src/export/run.ts` and `sources/canvas-sink.ts`
(`createSinkSet`, `previewSinks`), T078. ADR 0003 states that "Preview and Export … share not
just the same code but the same thread and the same GPU context", and research R4 has the
`CanvasSource` over "the renderer's `OffscreenCanvas`". The export now builds a second
`OffscreenCanvas`, a second Pixi renderer and a second sink set, so the Preview keeps scrubbing
during an export. Meets the bar: surprising to anyone holding ADR 0003, a real trade-off (an
editor usable during an export against a second GPU context, second decoders and roughly double
the decode memory while exporting), and hard to reverse once the UI promises editing during
export (T076, T088). Principle III's "same code" still holds; only the ADR's stronger claim does
not. The deviation is recorded only in a task note and in worker-protocol.md.
*Recommendation*: amend ADR 0003 now, marked after the fact — same code and same thread, separate
context and decoders per consumer, and why.

**A2. An exported file is finished only when `export-done` and `committed` have both arrived.**
Entered in `34d6197`, `packages/engine/src/export/writable.ts` (`forwardingWritable`, exported from
`@cutroom/engine`), `apps/editor/src/store/export.ts`, T075/T078/T084. Chrome refuses to transfer
a `FileSystemWritableFileStream`, so the worker writes into a plain `WritableStream` that forwards
to the file on the main thread, and the commit happens there, outside the worker's view. The worker
also commits only on the close inside `finalize` and aborts on every other ending. The transfer
itself was forced by Chrome, but where completion is decided was a choice: two signals instead of
one, and a protocol where `export-done` alone no longer means "the file exists". Surprising, and
it changed a protocol contract that the backend will one day have to speak too. It is written in
worker-protocol.md and the task notes, and in no ADR.
*Recommendation*: write it as an after-the-fact record; it can share an ADR with A1 ("how an
Export reaches the disk"), since both came out of T078.

**A3. The Source Timebase is measured from the first 120 Frames.**
Entered in `7f5efea`, `packages/engine/src/sources/attach.ts` and `timebaseFromTicks` in
`packages/model/src/timebase.ts`, T039. No container stores a frame rate, so it is computed as
Frames × tick rate over the tick span of the first 120 Frames, reduced. It meets the bar more
weakly than A1 and A2, but it meets it: the result is **stored in the Project document** and, for
the first Source, becomes the Project's Timebase, which no command in this slice can change — so a
mismeasured rate, or a different rule later, is a migration of every stored number (ADR 0002's
own consequence), not a code change. The trade-off is real (read 136 packets against reading the
whole index, exact average of the opening against the whole file, behaviour on variable-rate
files), and "measured, not read" surprises anyone who expects the container's fps field. Recorded
in model-api.md and the T039 note only.
*Recommendation*: write an after-the-fact ADR, or, if you judge it not hard to reverse, record
here that it was judged and fell below the bar.

### Candidates judged below the bar (no lapse)

- **Per-Clip sinks, not per Source** (T043). Research R1 had already decided "per active Clip"
  before any code; only the task line said "per Source". Internal to the engine, easy to change.
- **Wall-clock timecode, not SMPTE** (T050). Surprising and a real trade-off, but display only:
  nothing stores or exports it, so it is easy to reverse. Recorded in model-api.md. It will cross
  the bar the day timecode is written into a file (EDL, burn-in, metadata) — the ADR belongs to
  that change.
- **One scheduler for scrub and clock** (T064). Engine-internal serialisation; easy to reverse.
- **Main-thread export-quality probe** (T073). decisions.md already names the better home (a
  `probe-export` message); moving it is a contained change. Not hard to reverse.
- **48 kHz export mix** (T073). One constant with a fallback list; nothing stored depends on it.
- **Play at the end restarts from Frame 0** (T068). Product behaviour, settled by amending
  FR-010 — the spec is the right home, not an ADR.
- **Offline mix in segments ending on whole seconds** (T077). Surprising, but internal to one
  module, its reasoning is in the module header, and ADR 0008's shared graph construction still
  holds.
- Others read and judged below the bar: transactions join rather than nest (T034); a new Project
  has no document until the first import (T037); the client's latest-wins guard and its 2 s
  valve (T049); no output-latency compensation (T061); `@slow` on a fresh server (decisions.md);
  refusing to export over a Source (T075).

### Open, not yet a lapse

- **What space `sourceInPoint` is measured in** (T045's open question). It is stored in the
  document, so whether it is the container's presentation time (where an AAC priming packet sits
  at −0.0213 s, T069) or time from the first sample is hard to reverse once real Projects carry
  in-points other than 0. Today every in-point is 0. This needs an ADR *before* trimming lands.

## Terms

### Avoided words used in identifiers

The constitution: identifiers "MUST NOT use a term listed under `_Avoid_`".

| Term | Avoided for | Where | Entered | Recommendation |
| --- | --- | --- | --- | --- |
| `importSequence` | Project, Timeline ("Sequence") | `packages/model/src/commands/import.ts`, exported from `@cutroom/model`, used in `apps/editor/src/store/import-source.ts` and seven test files | `7f5efea` (T041) | Rename the code, e.g. `importCommands`. It means "a list of commands", but "Sequence" is the one word an editor's users read as a Timeline, which is why CONTEXT.md avoids it. |
| `framesPerSecond(timebase)` | Timebase ("FPS", "Frame rate") | `packages/model/src/timebase.ts`, used in `packages/engine/src/export/run.ts` | `34d6197` (T079) | Rename the code, e.g. `timebaseAsNumber`, or accept it and say in CONTEXT.md that it names Mediabunny's float `frameRate` at one boundary. It is the float the Timebase exists to avoid, spelled as the word the glossary avoids. |
| `anchor` (clock anchor, `anchorAtTimelineSample`) | Keyframe ("Anchor") | `apps/editor/src/audio/clock.ts`, `graph.ts`, `transport.ts`, `offline-mix.ts`; `packages/model/src/timebase.ts` | `90b0009` (T061) | Low priority. The avoided sense is a pinned parameter value; this is the clock's origin, a different thing. Either rename (`origin` is also avoided, for Source — `clockStart`?) or add a line to CONTEXT.md saying the avoid entry is about Keyframes. |
| `segment` (offline mix) | Clip ("Segment") | `apps/editor/src/audio/offline-mix.ts` (`SEGMENT_SECONDS`), `packages/model/src/timebase.ts` comments | `34d6197` (T077) | Low priority, same shape as `anchor`: not a Clip, but the avoided word. Rename to `mixWindow` / `window`, or leave and note it. (`segmentDuration` in `export/edit-list.ts` is the MP4 `elst` field's own name and should stay.) |
| `FPS` / `fps` constants | Timebase | `apps/editor/e2e/av-sync.spec.ts`, `playback-rate.spec.ts`, `degrades-picture-not-sound.spec.ts`, `playback-probe.ts` | `7f5efea` / `90b0009` | Derive from the fixture's Timebase instead of a bare `FPS = 30`. Test code, lowest priority. |

Prose uses of "media", "30 fps", "encode" and "draw" in comments and UI strings were read and left
alone: they describe container media time, fixture rates, encoder capability and canvas drawing,
not the concepts the glossary names. One UI string is borderline — `capability-check.ts`'s
"running the media engine at all" — and could say "the engine".

### Domain terms the code uses that CONTEXT.md does not define

Each of these is a noun the user sees on screen or that names a concept in the protocol or the
store; none has ever been in CONTEXT.md.

| Term | Where it shows | Entered | Recommendation |
| --- | --- | --- | --- |
| **Linked** (the opposite of Offline), and Source status with its reasons `needs-permission`, `never-linked-here`, `unreachable`, `unreadable` | Sources panel rows, `store/source-status.ts`, data-model.md | `ee962d5` (storage); on screen in `7f5efea` (T038, T051) | Add **Linked** next to Offline Source; the reasons can stay in data-model.md. |
| **Timecode** (wall-clock `HH:MM:SS:FF`, not SMPTE) | TopBar, `frameToTimecode`, `ui/timecode.ts` | `7f5efea` (T050) | Add. The "not SMPTE" meaning is exactly what a glossary is for. |
| **Scrub** | `render-frame` `reason: "scrub"`, `playback/scrub.ts`, scheduler, tests | `c9f21d2` (protocol), `7f5efea` | Add (moving the Playhead without playing; random-access Render). CONTEXT.md avoids "Scrubber" for the Playhead but never defines the verb. |
| **Playback / Transport** (Play, Stop, the clock-driven run) | TopBar Play/Stop, `audio/transport.ts`, `transport` message, store `transport` | `c9f21d2` (protocol), `90b0009` | Add one term (Playback, with "transport" as the code's name for its state, or the reverse). |
| **Skipped Frame** vs **dropped Frame** | `frame-rendered.skipped`, `frames-dropped`, ADR 0013, SC-004 | `90b0009` (T064) | Add both: ADR 0013 gives them different meanings and the spec measures one of them. |
| **Gesture** (one undo step; `transact`, `beginTransaction`) | `apps/editor/src/store/index.ts`, ADRs 0004 and 0011 | `bd0cf89` / `f1a8687` (Phase 2) | Add **Gesture**: ADR 0011 makes it the save boundary as well as the undo boundary. |
| **Export quality** (High, Standard, Draft) | Export dialog, `ui/export-settings.ts`, spec assumptions | `34d6197` (T073) | Add, or decide it is UI copy rather than domain. |
| **In-point** (`sourceInPoint`) | Project document, Scene, mapping | `748e8a6` (Phase 2) | Add. The Clip entry describes it ("which region of the Source it shows") without naming it, and the open question above is about this field. |
| **Project list / library** | Project list screen, ADR 0007 | `ee962d5` (Phase 2) | Add one name, or leave it as UI. |

Words like *sink*, *stream*, *link table*, *start gate*, *mix* and *butt join* are engineering or
editing vocabulary internal to one module and are not counted as lapses.

## Summary

- ADRs: three new lapses — **A1** (export's own renderer and decoders contradict ADR 0003),
  **A2** (completion is `export-done` + `committed`), **A3** (measured Source Timebase). Seven
  listed candidates and six others judged below the bar. One decision (`sourceInPoint`'s time
  space) is open and should get its ADR before trimming.
- Terms: five identifiers use avoided words (`importSequence` and `framesPerSecond` worth fixing;
  `anchor`, `segment` and the test `FPS` constants low priority), and nine domain terms are used
  without a CONTEXT.md entry — Linked, Timecode, Scrub, Playback/Transport, skipped vs dropped
  Frame, Gesture, Export quality, In-point, Project list. No term has entered CONTEXT.md since
  `0cf95a9`, before Phase 2's store, engine and editor shell were written.
