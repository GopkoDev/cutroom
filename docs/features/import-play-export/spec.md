---
status: Approved
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
---

# Spec — import-play-export

> **Glossary:** [CONTEXT](../../../CONTEXT.md). This is the repo-root glossary. The feature has no `CONTEXT.md` of its own.
> **Reference module / docs / channels used:** this spec was migrated from the Spec Kit feature `specs/001-import-play-export/`. It draws on that feature's `spec.md`, `plan.md` and `decisions.md`, read at `a49c7f8`. No SDD interview was run. Every Spec Kit identifier (FR-, SC-, user-story scenarios, edge cases, assumptions) is traced at the end of §5.
> **Original input** (Spec Kit, 2026-07-31): "Перший вертикальний зріз: імпорт медіафайлу → один Clip на таймлайні → відтворення зі звуком і синхроном → експорт MP4" (in English: "The first vertical slice: import a media file → one Clip on the timeline → playback with sound and sync → export MP4").

## 1. Context

A person editing video on their own machine cannot judge anything in the product until their own
footage is on screen. This first slice therefore takes the whole path once. A video file the user
picks becomes a Source and one Clip on the Timeline. The Preview shows any Frame the Playhead is
moved to. Playback runs with sound in sync, and an Export writes a file that matches what the
Preview showed. The slice is deliberately a viewer, not an editor. It proves the architecture
rather than serving an editing workflow ([docs/future.md](../../future.md) "The next slice:
editing").

The trigger is risk, not a deadline. The riskiest unknowns are all on this path:

- reading an arbitrary file the user chose, and showing a specific Frame from it on demand;
- keeping picture and sound together without drift;
- making the finished file agree with the Preview.

Audio/video synchronisation is the hardest thing to retrofit, because every later feature
assumes a correct clock. Exercising each layer end to end now is cheaper than discovering a
broken one under features built on top of it.

The committed approach:

- Each imported Source is placed whole as one Clip on a single video Track.
- The Project adopts the first Source's Timebase and picture size, so nothing has to be
  configured before the user sees a picture.
- Sound sets the pace of Playback and the picture yields.
- The whole Timeline exports as one MP4 file at the Project's frame size and Timebase, with only
  the settings this machine can actually produce on offer.
- Projects keep themselves between sessions. A Source whose file cannot be reached is a normal
  Offline state that Relink recovers.

Traceability context. Decisions taken while building the slice that the Spec Kit spec did not
settle. They were recorded in `decisions.md` and are now held here and in [sad.md](./sad.md) §4
and §11:

- Decision override: a second import adds a Clip — rationale: each imported Source becomes one Clip, the first at Frame 0 and each later one butt-joined where the first video Track ends, so a Source whose Timebase differs from the Project's can be seen and tested (user, 2026-10-23; T041).
- Decision override: Play at the end starts again from Frame 0 — rationale: with the Playhead on or past the last Frame, Play restarts from 0, as common editors and players do; the Spec Kit FR-010 was amended to match (user, 2026-10-23; T068).
- Decision override: the export mix is 48 kHz, not the Source's sample rate — rationale: no Source records its rate, a Timeline can mix rates, and Web Audio resamples anyway; 48 kHz is the video convention. 44.1 kHz and then Opus are tried before declaring that there is no sound encoder. This replaces the Spec Kit assumption "192 kbps stereo at the Source's sample rate" (agent proposal, accepted, 2026-10-23; T073).
- Decision override: a Timeline with no sound exports without an audio track and without asking — rationale: FR-024's explicit choice is for sound that would be lost, and here none would (agent proposal, accepted, 2026-10-23; T074).
- Decision override: saving the export over a Linked Source's own file is refused — rationale: exporting onto the file a Source reads from would destroy that Source mid-export (autonomous, 2026-10-23; T075).

## 2. Goals

- The user's own footage is on screen, Frame-accurate, as soon as it is picked. The product is
  already useful as a Frame-by-Frame viewer.
- Playback in which sound sets the pace and the picture yields under load. This is the property
  every later feature depends on.
- An exported file that matches what the Preview showed and played. It is the check that Preview
  and Export agree.
- Work survives between sessions without anyone saving it. A Source that goes missing is a normal
  state the user can recover from without rebuilding the Timeline.

## 3. Non-goals

- **Editing.** Trimming, moving, splitting and multiple Tracks are out of scope. The Timeline
  exists to prove the model end to end, not yet to edit with. Editing is the next slice.
- **Media other than video files.** Audio-only files, images, text, Effects and transitions are
  refused rather than partially handled. Each needs model work of its own
  ([docs/future.md](../../future.md)).
- **Export choices beyond one MP4.** Other formats, resolutions, frame rates and per-setting
  control are out of scope. A small fixed set of qualities proves the path.
- **Other browsers.** Chromium (Chrome, Edge) is the only supported browser, per the project
  constitution. The persisted local file handle exists only there (ADR 0006).
- **Cloud and sharing.** Cloud storage, accounts and sharing are out of scope. Sources live on
  the user's own machine.
- **Concurrency of work.** One Project is open at a time, and no more than one Export runs at a
  time.
- **Undo as a feature.** This slice exercises undo only as far as importing requires. The editing
  features that follow prove it.

## 4. User stories

### US-01: Bring a video in

**As a** user
**I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
**So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame

*Priority P1.* Nothing else in the product can be judged until the user's own footage is on
screen. It is also where the riskiest unknowns live: reading an arbitrary file the user chose,
and showing a specific Frame from it on demand.

*Independent test.* Choose a file and confirm that a Clip appears whose length matches the file.
Drag the Playhead to several positions and confirm that the Preview shows the matching picture.
The story delivers value on its own.

### US-02: Play it back with sound in sync

**As a** user
**I want** to press play and have picture and sound advance together from the Playhead, with the Playhead moving along the Timeline as it plays, and to press play again to stop at the current position
**So that** the Timeline behaves like an editor rather than a viewer, and when my machine cannot keep up the sound stays continuous and correct and only the picture suffers

*Priority P2.* Playback is what makes the Timeline an editor rather than a viewer.
Audio/video synchronisation is the hardest thing to retrofit, because every later feature
assumes a correct clock.

*Independent test.* Play a file with a clear audio/visual sync point, such as a clap or a
countdown. Confirm that sound and picture land together at the start, and again after several
minutes of playback.

### US-03: Export a finished file

**As a** user
**I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
**So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing

*Priority P3.* Export is what makes the work leave the product, and it is the check that Preview
and the finished file agree. It comes last because it can only be judged once the first two
stories are trustworthy.

*Independent test.* Export a Project containing one Clip and open the resulting file in an
ordinary video player. Confirm that the duration, picture and sound match the Preview.

### US-04: Come back to my work

**As a** user
**I want** my Project kept between sessions without being asked to save, listed so I can reopen it, and its Sources reattached — or shown as Offline with a way to Relink them
**So that** closing the tab, reloading or moving a file never costs me the Timeline I built

*Derived during the SDD migration.* The Spec Kit spec had no user story for persistence. This
story groups FR-020–FR-022, SC-008 and the persistence edge cases, which tasks T026–T028,
T037, T051, T052, T056 and T057 delivered.

### US-05: Know at once whether my browser can run it

**As a** user
**I want** to be told on arrival when my browser cannot run the product
**So that** I never meet a broken editor halfway through my work

*Derived during the SDD migration.* The Spec Kit spec had no user story here. This story holds
FR-023 and the "browser cannot run the product" edge case (T035).

## 5. Acceptance criteria

### AC-01 (US-01) — happy

**Given** an empty Project
**When** the user picks a video file from their own machine
**Then** the system reads the Source's duration, picture size and Source Timebase; a Source appears in the Source list with its name and duration; and one Clip covering the whole Source appears on the Timeline starting at Frame 0

### AC-02 (US-01) — happy

**Given** an empty Project
**When** the first Source is imported
**Then** the Project adopts that Source's Timebase and picture size as its own Timebase and frame size, and the user is not asked to configure the Project before seeing anything

### AC-03 (US-01) — happy

**Given** a Project that already holds a Clip on its video Track
**When** the user imports another video file
**Then** the new Source is placed whole as one more Clip, butt-joined where the video Track ends

### AC-04 (US-01) — happy

**Given** a Clip on the Timeline
**When** the user moves the Playhead to any Frame within it
**Then** the Preview shows the picture of that Frame

### AC-05 (US-01) — domain invariant

**Given** a Clip on the Timeline
**When** the user moves the Playhead past the end of the Clip, or to any Frame with no Clip under it
**Then** the Preview shows nothing for that Frame rather than the last Frame or a neighbouring one, because the Preview shows the composited result of the Timeline

### AC-06 (US-01) — domain invariant

**Given** any Project
**When** the user places or moves the Playhead, or the system stores a position on the Timeline
**Then** the position is a whole Frame; the system never presents or stores a position between two Frames

### AC-07 (US-01) — domain invariant

**Given** a Source whose own picture size or aspect differs from the Project's frame size
**When** the Preview shows one of its Frames
**Then** the picture is shown at the Project's frame size and aspect, regardless of the Source's own dimensions

### AC-08 (US-01) — domain invariant

**Given** a user importing a video file
**When** the import completes
**Then** the Source is addressed where it already lives and its contents are never copied into the product's own storage

### AC-09 (US-01) — error

**Given** any Project
**When** the user picks a file the product cannot decode
**Then** the system states plainly that the file cannot be used and why, and the Project is left unchanged

### AC-10 (US-01) — error

**Given** any Project
**When** the user picks an audio-only file or an image
**Then** the system refuses it clearly as outside what this slice supports, rather than half-supporting it, and the Project is left unchanged

### AC-11 (US-01) — cross-context

**Given** a Project whose Timebase was set by its first Source
**When** a Source with a different Source Timebase is placed on the Timeline (a 24 fps file in a 30 fps Project)
**Then** every Frame of the Timeline still shows the correct picture, and playback does not drift

### AC-12 (US-01) — happy

**Given** a Source over an hour long
**When** the user imports it
**Then** the Timeline shows its Clip about as promptly as for a short Source, because importing does not require reading the whole file

### AC-13 (US-02) — happy

**Given** the Playhead is inside a Clip
**When** the user starts playback
**Then** playback begins from the Playhead's current Frame; picture and sound advance together, and the Playhead moves in step with them

### AC-14 (US-02) — happy

**Given** the Playhead is on or past the Timeline's last Frame
**When** the user starts playback
**Then** playback starts again from Frame 0, as in common editors and players

### AC-15 (US-02) — happy

**Given** playback is running
**When** the user stops it
**Then** playback halts and the Playhead stays exactly on the Frame that was showing

### AC-16 (US-02) — happy

**Given** playback is running
**When** the user moves the Playhead elsewhere
**Then** playback continues from the new position without an audible gap or repeated sound

### AC-17 (US-02) — domain invariant

**Given** a machine too slow to produce every Frame in time
**When** playback runs
**Then** sound remains continuous and in time and sets the pace, and picture updates are skipped rather than delayed; the sound is never interrupted or slowed for the picture

### AC-18 (US-02) — domain invariant

**Given** a Source of any length with sound
**When** it plays from start to end
**Then** sound and picture stay in sync for the whole length, without cumulative drift

### AC-19 (US-02) — happy

**Given** a Source with no audio
**When** the user plays it
**Then** the picture plays normally, and the silence is treated as valid rather than as an error

### AC-20 (US-02) — domain invariant

**Given** playback reaches the end of the Timeline
**When** the last Frame has been shown
**Then** playback stops there rather than continuing into empty space

### AC-21 (US-03) — happy

**Given** a Project with one Clip
**When** the user exports and chooses where the file goes
**Then** a single MP4 file is written to the chosen location, containing every Frame of the Timeline and its sound, matching what the Preview showed

### AC-22 (US-03) — happy

**Given** the user opens Export on a Project
**When** the export choices are shown
**Then** three qualities are offered and no more — High, Standard and Draft, scaled to the Project's frame size (at 1080p 16, 8 and 4 Mbps, scaled by pixel count for other sizes) — with Standard preselected and one sound setting (192 kbps stereo), at the Project's frame size and Timebase

### AC-23 (US-03) — domain invariant

**Given** a machine that cannot produce some combination of format and quality
**When** the user opens Export
**Then** only the combinations this machine can actually produce are offered, determined at the moment of asking rather than assumed

### AC-24 (US-03) — happy

**Given** an Export is running
**When** the user watches it
**Then** progress is reported in terms they can act on: how much is done, and roughly how long remains

### AC-25 (US-03) — error

**Given** an Export is running
**When** the user cancels it
**Then** the Export stops promptly, and no partial file is left presented as finished

### AC-26 (US-03) — error

**Given** an Export is running
**When** it fails, or the destination runs out of space or stops accepting writes partway
**Then** the failure is reported plainly, and no partial file is presented as finished. This is one rule, and it covers every way an Export can end short: cancelled, failed or interrupted

### AC-27 (US-03) — error

**Given** a Timeline with sound, on a machine that can encode no sound at all
**When** the user opens Export
**Then** the system says so before the Export starts and requires an explicit choice to continue without sound; it never produces a silent file without the user having chosen that

### AC-28 (US-03) — happy

**Given** a Timeline with no sound
**When** the user exports it
**Then** the file is written without a sound track and without asking, because no sound would be lost

### AC-29 (US-03) — error

**Given** a Project whose Source reads from a file on the user's disk
**When** the user chooses that same file as the Export's destination
**Then** the system refuses to export over it and says why, and the Source's file is left untouched

### AC-30 (US-03) — cross-context

**Given** an Export is running
**When** the user keeps editing the Timeline
**Then** the exported file reflects the Timeline as it was when the Export started, unaffected by the later edits

### AC-31 (US-03) — happy

**Given** an exported file
**When** it is played in a common video player
**Then** its duration matches the Timeline, and its picture and sound are in sync throughout

### AC-32 (US-04) — happy

**Given** a user who has worked on a Project
**When** they leave and come back in a later session, including after a reload or a browser restart
**Then** the Project was kept without them being asked to save; the Project list shows it with its name and when it was last modified; and opening it shows the same Timeline

### AC-33 (US-04) — authorization

**Given** a reopened Project whose Sources the browser no longer has permission to read
**When** the Project opens
**Then** each such Source shows as Offline and says the browser needs the user's permission again; it reattaches only after the user grants access by their own action, with no prompt on load

### AC-34 (US-04) — error

**Given** a reopened Project whose Source file can no longer be reached (moved, renamed or deleted)
**When** the Project opens
**Then** that Source shows as Offline with the reason, and Relink is offered; picking the file again restores every Clip that references it at once

### AC-35 (US-04) — domain invariant

**Given** an Offline Source being relinked
**When** the user picks a file that is not the same file (a different size from the one recorded)
**Then** the Relink is refused, and the Source's existing link and its Clips are left as they were

### AC-36 (US-04) — cross-context

**Given** a Clip whose Source has become Offline
**When** the Timeline is shown or played
**Then** the Clip stays on the Timeline and shows nothing; it becomes usable again once the Source is reattached, without the user rebuilding the Timeline

### AC-37 (US-04) — cross-context

**Given** a Project open with a Frame showing
**When** the Source's file is moved or deleted and the Playhead moves
**Then** the Source is reported Offline from the next Frame the Preview is asked to draw, not only after a reload, and the Preview shows no stale picture

### AC-38 (US-04) — domain invariant

**Given** a Source that is Linked or Offline
**When** the user undoes or redoes an edit
**Then** the Source's Linked or Offline status is unchanged, because it belongs to the machine and the moment, not to the Project

### AC-39 (US-05) — error

**Given** a browser that lacks something the product cannot work without — picking a file, remembering that permission across sessions, compositing off the main thread, or decoding video
**When** the user arrives
**Then** the user is told so plainly on arrival, rather than failing later during use. Encoding is deliberately not among the checks, because AC-27 already handles a machine that cannot encode sound

### Traceability to the Spec Kit identifiers

The Spec Kit spec numbered its requirements FR-001–FR-024 and its success criteria
SC-001–SC-009. Those identifiers were stable and are still cited by the ADRs, code comments and
`_evidence/` records, so they are kept here verbatim with their new home.

| Spec Kit id | Verbatim text | New home |
|---|---|---|
| FR-001 | Users MUST be able to choose a video file from their own machine and add it to the Project as a Source. | AC-01 |
| FR-002 | The product MUST read the Source's duration, picture size and Source Timebase on import, and MUST show its name and duration in the Source list. | AC-01 |
| FR-003 | The product MUST reject a file it cannot decode, stating that it cannot be used, and MUST leave the Project unchanged when it does. | AC-09 |
| FR-004 | Importing MUST NOT copy the Source's contents into the product's own storage. | AC-08 |
| FR-005 | The product MUST create one Clip covering the whole Source, placed at the start of the Timeline, when a Source is imported into an empty Project. | AC-01 |
| FR-006 | Every position on the Timeline MUST be a whole Frame; the product MUST NOT present or store positions between Frames. | AC-06 |
| FR-007 | Users MUST be able to move the Playhead to any Frame of the Timeline and see that Frame in the Preview. | AC-04 |
| FR-008 | The Preview MUST show the composited result of the Timeline, so that a Frame with no Clip under it appears empty rather than showing a neighbouring Frame. | AC-05 |
| FR-009 | The Preview MUST show the picture at the Project's frame size and aspect, regardless of the Source's own dimensions. | AC-07 |
| FR-010 | Users MUST be able to start and stop playback, and playback MUST begin from the Playhead's current Frame — except when the Playhead is on or past the Timeline's last Frame, where Play starts again from Frame 0, as in common editors and players. | AC-13, AC-14, AC-15 |
| FR-011 | Sound MUST determine the pace of playback; picture MUST follow it. | AC-13, AC-17 |
| FR-012 | When the product cannot produce Frames fast enough, it MUST skip picture updates rather than interrupt or slow the sound. | AC-17 |
| FR-013 | Audio and picture MUST stay in sync for the length of a Source, without cumulative drift. | AC-18; §6 (SC-002) |
| FR-014 | Stopping playback MUST leave the Playhead on the Frame that was showing. | AC-15 |
| FR-015 | Users MUST be able to export the whole Timeline as a single MP4 file and choose where it is written. | AC-21 |
| FR-016 | The exported file MUST contain every Frame of the Timeline and the corresponding sound, matching what the Preview showed. | AC-21; §6 (SC-007) |
| FR-017 | The product MUST offer only export settings the current machine can actually produce, determined at the time of asking rather than assumed. | AC-23 |
| FR-018 | The product MUST report export progress and MUST let the user cancel. However an export ends short — cancelled, failed, or interrupted by a destination that has become unwritable — the product MUST NOT present a partial file as finished. This is one rule, and it covers every way an export can stop early. | AC-24, AC-25, AC-26 |
| FR-019 | Export MUST reflect the state of the Timeline at the moment it started, unaffected by edits made while it runs. | AC-30 |
| FR-020 | The product MUST keep the Project between sessions without the user being asked to save, and MUST list existing Projects so one can be reopened. | AC-32 |
| FR-021 | On reopening a Project, the product MUST reattach its Sources, and MUST show a Source as Offline when its file can no longer be reached. | AC-33, AC-34, AC-35 |
| FR-022 | A Clip MUST survive its Source becoming Offline, and MUST become usable again once the Source is reattached, without the user rebuilding the Timeline. | AC-36 |
| FR-023 | The product MUST tell a user whose browser it does not support, on arrival, rather than failing later during use. What is checked is what the product cannot work without: picking a file, remembering that permission across sessions, compositing off the main thread, and decoding video. Encoding is deliberately not among them — FR-024 already has a considered answer for a machine that cannot encode sound, and refusing entry for it would contradict that. | AC-39 |
| FR-024 | When the machine cannot encode sound at all, the product MUST say so before the export starts and MUST require an explicit choice to continue without sound. It MUST NOT produce a silent file without the user having chosen that. | AC-27 (AC-28 for a Timeline with no sound) |
| SC-001 … SC-009 | Success criteria, verbatim in the §6 table | §6 |
| US1 scenarios 1–4 | Spec Kit acceptance scenarios of User Story 1 | AC-01, AC-04, AC-05, AC-09 |
| US2 scenarios 1–6 | Spec Kit acceptance scenarios of User Story 2 | AC-13, AC-15, AC-16, AC-17, AC-19, AC-20 |
| US3 scenarios 1–6 | Spec Kit acceptance scenarios of User Story 3 | AC-21, AC-24, AC-25, AC-31, AC-23, AC-27 |
| Edge: Source Timebase differs from the Project's | "every Frame of the Timeline must still show the correct picture, and playback must not drift" | AC-11 |
| Edge: audio-only or image | "out of scope for this slice, and must be refused clearly rather than half-supported" | AC-10 |
| Edge: Source moved or deleted while open | "the Clip stays on the Timeline and the Preview reports the Source as unavailable instead of showing stale pictures — from the next Frame it is asked to draw, not only after a reload" | AC-37 |
| Edge: reload mid-edit | "the Project is still listed, and the Source either reattaches after the user re-grants access or is reported as Offline" | AC-32, AC-33 |
| Edge: Source over an hour | "importing must not require reading the whole file, and the Timeline must appear promptly" | AC-12 |
| Edge: keeps editing during export | "the export must reflect the Timeline as it was when the export started" | AC-30 |
| Edge: destination runs out of space or unwritable | "the failure is reported plainly, and FR-018's no-partial-file rule applies to this ending like any other" | AC-26 |
| Edge: browser cannot run the product | "the user is told so on arrival rather than meeting a broken editor" | AC-39 |
| Assumption: one Clip per Source, no trimming | first at Frame 0, each later one where the first video Track ends; trimming, moving, splitting and multiple Tracks out of scope | AC-01, AC-03; §3 |
| Assumption: video files only | audio-only files, images, text, effects and transitions refused | AC-10; §3 |
| Assumption: Project adopts the first Source's Timebase and picture size | a Source with a different Timebase must still display correctly | AC-02, AC-11 |
| Assumption: MP4 with H.264 video and AAC audio, three qualities, Standard preselected, 192 kbps stereo | "at the Source's sample rate" superseded by the 48 kHz decision (§1) | AC-22, AC-23; §1 |
| Assumption: one Project open, one export at a time | — | §3 |
| Assumption: undo not exercised beyond importing | — | §3 |
| Assumption: Chromium only | — | §3, AC-39 |
| Assumption: Sources on the user's own machine | — | §3 |
| Key entities: Project, Source, Timeline, Track, Clip, Playhead, Export | Spec Kit "Key Entities" list | [CONTEXT.md](../../../CONTEXT.md) and [data-model.md](./data-model.md) |

## 6. Non-functional requirements

Each Target cell is the Spec Kit success criterion, verbatim. The reference machine is the one
named in [_evidence/quickstart.md](./_evidence/quickstart.md#reference-machine):

- MacBook Air (Apple M4), 10 CPU cores and 8 GPU cores, 16 GB;
- macOS 26.6.2 and Google Chrome 156.0.8078.47 at the T096 walk.

T014 had named macOS 26.5.2 and Chrome 150. Results from other hardware are informative, not a
verdict. Measured results are in [sad.md](./sad.md) §10 and [test-plan.md](./test-plan.md).

| Aspect | Target | Measurement |
|---|---|---|
| SC-001 Time to first picture | A user can go from opening the product to a Clip visible on the Timeline in under 15 seconds. Measured from the page finishing load to the Preview showing Frame 0, with the time the user spends navigating their own file picker excluded — that is their disk, not our product. Everything else counts: worker start-up, reading the file, and the first Render. | `page-load-to-frame-0.spec.ts`; by hand once (see §8) |
| SC-002 A/V sync | Picture and sound stay in sync within one Frame over 10 minutes of continuous playback of a 1080p file. | `av-sync.spec.ts` (`@slow`) on the ten-minute fixture |
| SC-003 Scrub latency | Moving the Playhead to a new Frame shows that Frame within 300 ms for 1080p material, so scrubbing feels attached to the pointer. | `scrub-latency.spec.ts`; long-GOP measurements in [_evidence/performance-baseline.md](./_evidence/performance-baseline.md) |
| SC-004 Sustained playback | A 1080p 30 fps Source of up to 10 minutes plays back at full rate on the reference machine named in quickstart.md, with no audio interruption. | `playback-rate.spec.ts` (`@slow`), counting skipped Frames (ADR 0013) |
| SC-005 Export throughput | Exporting one minute of 1080p 30 fps material completes in under two minutes on that same machine. | `export-throughput.spec.ts` |
| SC-006 Player compatibility | An exported file opens and plays correctly in three named players — the operating system's own player (QuickTime on the reference machine), VLC, and Chrome — with the same duration as the Timeline. All three are checked; two passing is a failure. | `export-duration.spec.ts` plus the manual check in [_evidence/validation.md](./_evidence/validation.md) |
| SC-007 Export fidelity | Every Frame of an exported file matches the Preview of that Frame, verified by comparing sampled Frames. | `export-fidelity.spec.ts` |
| SC-008 Reopen correctness | A Project reopened after a browser restart shows the same Timeline, and its Sources either reattach or are clearly marked Offline — never silently wrong. | `reopen-and-relink.spec.ts` |
| SC-009 Cancel latency | Cancelling an export stops it within 2 seconds. | `export-cancel.spec.ts` |

## 6.1 Security / privacy

This section was derived during the SDD migration from the constitution, ADR 0005, ADR 0006 and
the code. The Spec Kit spec had no security section.

- **Data classification:** confidential. The user's own media and Projects never leave their
  machine. Nothing is uploaded, because there is no server in this slice.
- **Personal data touched:** none collected. The Project Document stores each Source's file name,
  size and last-modified time (`fingerprint`), on the user's own machine only.
- **AuthZ/AuthN impact:** no accounts. The one permission is the browser's read permission for
  each Source's file. It is asked for behind a user gesture and never silently on load (ADR 0005).
  File handles live in a device-local table, never in the Project Document.
- **Abuse cases:**
  - Overwriting a Source by exporting onto its file: refused (AC-29).
  - A Project Document carrying device handles off the machine: impossible by construction,
    because saves write the model's own rebuild of the document (ADR 0005, ADR 0007).
  - A Relink binding Clips to different footage: refused by the size check (AC-35).
  - A mistaken Relink pick costing the good link: the link is written only on success (AC-35).
- **Security review:** N/A. The slice is client-only, with no network surface, no accounts and no
  data leaving the machine. TODO(sdd-migration): this verdict was derived during the migration,
  not given by a reviewer; the owner should confirm it.

## 7. Metrics / KPIs

TODO(sdd-migration): the Spec Kit spec defined no product KPIs (usage or adoption metrics with a
baseline and a target). Its measurable outcomes are the success criteria, now in §6. Nothing in
the sources supports a KPI, so none is invented here. The owner should decide whether this slice
needs any.

## 8. Open questions

- [ ] Does an exported file play correctly in VLC and in QuickTime Player itself (SC-006)? Default now: SC-006 is **not closed**. Chrome passes, QuickTime passes only by an AVFoundation proxy, and VLC was not installed; only VLC's decoder library (ffmpeg) was checked ([_evidence/validation.md](./_evidence/validation.md), T096). — owner: repo owner (a person at the reference machine), due: before the slice's definition of done is claimed, and before `/sdd:specify` of the editing slice
- [ ] Does Chrome's real save picker empty an existing file the moment it is picked? Default now: the overwrite guard (`isSameEntry`) runs after the picker answers. If Chrome empties the file at pick time, the fix is to warn by name before the picker can be accepted. — owner: repo owner (manual walk in a visible Chrome), due: before the next release of the export path
- [ ] What makes `engine-worker.spec.ts` "a Scene older than the one the worker holds is ignored" fail intermittently (once in the T096 full run, 5/5 passes alone)? Default now: undiagnosed. It may be a race in the test's pixel read, or the worker briefly showing a canvas size from a Scene it should have ignored. It keeps `pnpm test:e2e` from being reliably green. — owner: Tech Lead, due: before the next feature's `/sdd:implement`
- [ ] Which time space is a Clip's In-point measured in: the container's presentation time, or time from the first sample? Default now: container time (In-point 0 at the container's zero), which is right for every file in this slice. It is hard to reverse once real Projects carry non-zero In-points. — owner: Architect, due: an ADR before trimming lands (the editing slice's `/sdd:design`)
- [ ] Should SC-003 be reworded, or a keyframe preview built, for backward steps and far jumps on long-GOP 1080p (301–313 ms worst against 300 ms)? Default now: accepted as met for forward gestures only on 1080p GOP 300 (ADR 0017). — owner: repo owner, due: the spec work for ADR 0017's keyframe-preview item
- [ ] The remaining "Needs a human" checks in [_evidence/validation.md](./_evidence/validation.md): real open picker and permission prompts (including "Don't allow"), a Finder rename, listening through speakers (also at 20× CPU), and SC-001 timed by hand. Default now: each passed through stand-ins or by measurement, but not by a person. — owner: repo owner, due: with the SC-006 check above
- [ ] Which role names belong in the glossary? Default now: the stories use "user", as the Spec Kit spec did. CONTEXT.md defines no role, and "editor" would collide with the app's own name. TODO(sdd-migration). — owner: repo owner, due: before `/sdd:specify` of the next feature
