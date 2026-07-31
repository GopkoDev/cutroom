# Feature Specification: Import, Play, Export

**Feature Branch**: `001-import-play-export`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "Перший вертикальний зріз: імпорт медіафайлу → один Clip на таймлайні → відтворення зі звуком і синхроном → експорт MP4"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bring a video in and see it (Priority: P1)

An editor opens the product, picks a video file from their own machine, and immediately sees it:
the file appears as a Source in the Source list, a Clip covering the whole file appears on the
Timeline, and the Preview shows the picture at the Playhead. Moving the Playhead along the
Timeline shows the corresponding Frame.

**Why this priority**: Nothing else in the product can be judged until the user's own footage is
on screen. It is also where the riskiest unknowns live — reading an arbitrary file the user
chose, and showing a specific Frame from it on demand.

**Independent Test**: Choose a file, confirm a Clip appears whose length matches the file, drag
the Playhead to several positions and confirm the Preview shows the matching picture. Delivers
value on its own: the product can already be used to inspect footage Frame by Frame.

**Acceptance Scenarios**:

1. **Given** an empty Project, **When** the user picks a video file, **Then** a Source appears in
   the Source list with its name and duration, and a Clip covering the whole Source appears on the
   Timeline starting at Frame 0.
2. **Given** a Clip on the Timeline, **When** the user moves the Playhead to any Frame within it,
   **Then** the Preview shows the picture of that Frame.
3. **Given** a Clip on the Timeline, **When** the user moves the Playhead past the end of the
   Clip, **Then** the Preview shows nothing rather than the last Frame.
4. **Given** a file the product cannot decode, **When** the user picks it, **Then** the product
   states plainly that the file cannot be used and why, and the Project is left unchanged.

---

### User Story 2 - Play it back with sound in sync (Priority: P2)

The editor presses play. Picture and sound advance together from the Playhead, the Playhead moves
along the Timeline as it plays, and pressing play again stops at the current position. If the
machine cannot keep up, the sound stays continuous and correct and the picture is what suffers.

**Why this priority**: Playback is what makes the Timeline an editor rather than a viewer, and
audio/video synchronisation is the hardest thing to retrofit — every later feature assumes a
correct clock.

**Independent Test**: Play a file with a clear audio/visual sync point (a clap, a countdown) and
confirm they land together, at the start and again after several minutes of playback.

**Acceptance Scenarios**:

1. **Given** the Playhead is inside a Clip, **When** the user starts playback, **Then** picture
   and sound advance together and the Playhead moves in step with them.
2. **Given** playback is running, **When** the user stops it, **Then** playback halts and the
   Playhead stays exactly where it stopped, showing that Frame.
3. **Given** playback is running, **When** the user moves the Playhead elsewhere, **Then**
   playback continues from the new position without an audible gap or repeated sound.
4. **Given** a machine too slow to decode every Frame in time, **When** playback runs, **Then**
   sound remains continuous and in time, and picture updates are skipped rather than delayed.
5. **Given** a Source with no audio, **When** the user plays it, **Then** picture plays normally
   and silence is treated as valid, not as an error.
6. **Given** playback reaches the end of the Timeline, **When** the last Frame has been shown,
   **Then** playback stops there rather than continuing into empty space.

---

### User Story 3 - Export a finished file (Priority: P3)

The editor asks to export, chooses where the file goes, and receives an MP4 of the whole Timeline
whose picture and sound match what they saw and heard while editing. Progress is visible
throughout, and the export can be cancelled.

**Why this priority**: Export is what makes the work leave the product, and it is the check that
Preview and the finished file agree. It comes last because it can only be judged once the first
two stories are trustworthy.

**Independent Test**: Export a Project containing one Clip, open the resulting file in an
ordinary video player, and confirm the duration, picture and sound match the Preview.

**Acceptance Scenarios**:

1. **Given** a Project with one Clip, **When** the user exports, **Then** a single MP4 file is
   written to the chosen location containing every Frame of the Timeline with its sound.
2. **Given** an export is running, **When** the user watches it, **Then** progress is reported in
   terms they can act on (how much is done, roughly how long remains).
3. **Given** an export is running, **When** the user cancels it, **Then** the export stops
   promptly and no partial file is left presented as finished.
4. **Given** an exported file, **When** it is played in a common video player, **Then** its
   duration matches the Timeline and its picture and sound are in sync throughout.
5. **Given** the machine cannot produce the requested combination of format and quality,
   **When** the user opens export, **Then** only combinations the machine can actually produce
   are offered.
6. **Given** the machine can encode no audio at all, **When** the user opens export, **Then** the
   product says so and offers exporting without sound as an explicit choice rather than doing it
   quietly.

---

### Edge Cases

- The Source Timebase differs from the Project's Timebase (a 24 fps file in a 30 fps Project):
  every Frame of the Timeline must still show the correct picture, and playback must not drift.
- The chosen file is audio-only, or is an image: out of scope for this slice, and must be
  refused clearly rather than half-supported.
- The Source file is moved or deleted while the Project is open: the Clip stays on the Timeline
  and the Preview reports the Source as unavailable instead of showing stale pictures — from the
  next Frame it is asked to draw, not only after a reload.
- The user reloads the page mid-edit: the Project is still listed, and the Source either
  reattaches after the user re-grants access or is reported as Offline.
- A very long Source (over an hour) is imported: importing must not require reading the whole
  file, and the Timeline must appear promptly.
- The user starts an export and keeps editing: the export must reflect the Timeline as it was
  when the export started.
- The export destination runs out of space or becomes unwritable partway: the failure is reported
  plainly, and FR-018's no-partial-file rule applies to this ending like any other.
- The browser cannot run the product at all: the user is told so on arrival rather than meeting a
  broken editor.

## Requirements *(mandatory)*

### Functional Requirements

Identifiers are stable: they are never renumbered or reused, because plan.md, tasks.md and
quickstart.md all cite them. FR-024 was added after the first numbering, so it sits with the
Exporting requirements it belongs to rather than in numeric order at the end.

**Importing**

- **FR-001**: Users MUST be able to choose a video file from their own machine and add it to the
  Project as a Source.
- **FR-002**: The product MUST read the Source's duration, picture size and Source Timebase on
  import, and MUST show its name and duration in the Source list.
- **FR-003**: The product MUST reject a file it cannot decode, stating that it cannot be used,
  and MUST leave the Project unchanged when it does.
- **FR-004**: Importing MUST NOT copy the Source's contents into the product's own storage.
- **FR-005**: The product MUST create one Clip covering the whole Source, placed at the start of
  the Timeline, when a Source is imported into an empty Project.

**Timeline and Preview**

- **FR-006**: Every position on the Timeline MUST be a whole Frame; the product MUST NOT present
  or store positions between Frames.
- **FR-007**: Users MUST be able to move the Playhead to any Frame of the Timeline and see that
  Frame in the Preview.
- **FR-008**: The Preview MUST show the composited result of the Timeline, so that a Frame with
  no Clip under it appears empty rather than showing a neighbouring Frame.
- **FR-009**: The Preview MUST show the picture at the Project's frame size and aspect,
  regardless of the Source's own dimensions.

**Playback**

- **FR-010**: Users MUST be able to start and stop playback, and playback MUST begin from the
  Playhead's current Frame.
- **FR-011**: Sound MUST determine the pace of playback; picture MUST follow it.
- **FR-012**: When the product cannot produce Frames fast enough, it MUST skip picture updates
  rather than interrupt or slow the sound.
- **FR-013**: Audio and picture MUST stay in sync for the length of a Source, without cumulative
  drift.
- **FR-014**: Stopping playback MUST leave the Playhead on the Frame that was showing.

**Exporting**

- **FR-015**: Users MUST be able to export the whole Timeline as a single MP4 file and choose
  where it is written.
- **FR-016**: The exported file MUST contain every Frame of the Timeline and the corresponding
  sound, matching what the Preview showed.
- **FR-017**: The product MUST offer only export settings the current machine can actually
  produce, determined at the time of asking rather than assumed.
- **FR-018**: The product MUST report export progress and MUST let the user cancel. However an
  export ends short — cancelled, failed, or interrupted by a destination that has become
  unwritable — the product MUST NOT present a partial file as finished. This is one rule, and it
  covers every way an export can stop early.
- **FR-019**: Export MUST reflect the state of the Timeline at the moment it started, unaffected
  by edits made while it runs.
- **FR-024**: When the machine cannot encode sound at all, the product MUST say so before the
  export starts and MUST require an explicit choice to continue without sound. It MUST NOT
  produce a silent file without the user having chosen that.

**Project persistence**

- **FR-020**: The product MUST keep the Project between sessions without the user being asked to
  save, and MUST list existing Projects so one can be reopened.
- **FR-021**: On reopening a Project, the product MUST reattach its Sources, and MUST show a
  Source as Offline when its file can no longer be reached.
- **FR-022**: A Clip MUST survive its Source becoming Offline, and MUST become usable again once
  the Source is reattached, without the user rebuilding the Timeline.

**Environment**

- **FR-023**: The product MUST tell a user whose browser it does not support, on arrival, rather
  than failing later during use.

### Key Entities

- **Project**: the unit of work: a frame size, a Timebase, its Sources and one Timeline. Listed
  and reopened by the user; persists between sessions.
- **Source**: media brought into the Project, addressed where it already lives. Carries name,
  duration, picture size and its own Source Timebase, which may differ from the Project's. May be
  Offline when its file cannot be reached.
- **Timeline**: the arrangement of Clips over time that defines what the Project looks and sounds
  like at any Frame.
- **Track**: one lane of the Timeline holding non-overlapping Clips. This slice needs one video
  Track and its sound.
- **Clip**: a placement of part of a Source onto a Track — where it starts, how long it lasts,
  and which region of the Source it shows.
- **Playhead**: the Frame currently being shown in the Preview.
- **Export**: a finished media file produced from the whole Timeline.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening the product to a Clip visible on the Timeline in under
  15 seconds. Measured from the page finishing load to the Preview showing Frame 0, with the time
  the user spends navigating their own file picker excluded — that is their disk, not our
  product. Everything else counts: worker start-up, reading the file, and the first Render.
- **SC-002**: Picture and sound stay in sync within one Frame over 10 minutes of continuous
  playback of a 1080p file.
- **SC-003**: Moving the Playhead to a new Frame shows that Frame within 300 ms for 1080p
  material, so scrubbing feels attached to the pointer.
- **SC-004**: A 1080p 30 fps Source of up to 10 minutes plays back at full rate on the reference
  machine named in quickstart.md, with no audio interruption.
- **SC-005**: Exporting one minute of 1080p 30 fps material completes in under two minutes on
  that same machine.
- **SC-006**: An exported file opens and plays correctly in three named players — the operating
  system's own player (QuickTime on the reference machine), VLC, and Chrome — with the same
  duration as the Timeline. All three are checked; two passing is a failure.
- **SC-007**: Every Frame of an exported file matches the Preview of that Frame, verified by
  comparing sampled Frames.
- **SC-008**: A Project reopened after a browser restart shows the same Timeline, and its Sources
  either reattach or are clearly marked Offline — never silently wrong.
- **SC-009**: Cancelling an export stops it within 2 seconds.

## Assumptions

- **One Clip, no trimming.** This slice places the whole Source as one Clip. Trimming, moving,
  splitting and multiple Clips or Tracks are out of scope; the Timeline exists to prove the model
  end to end, not yet to edit with.
- **Video files only.** Audio-only files, images, text, effects and transitions are out of scope
  and are refused rather than partially handled.
- **The Project adopts the first Source's Timebase and picture size** as its own Timebase and
  frame size, so the user is not asked to configure a Project before seeing anything. A Source
  whose Timebase differs from an established Project Timebase must still display correctly.
- **Export produces MP4 with H.264 video and AAC audio** when the machine supports it, at the
  Project's frame size and Timebase. Three quality choices are offered and no more, scaled to the
  Project's frame size — at 1080p they are High (16 Mbps), Standard (8 Mbps) and Draft (4 Mbps),
  each scaled by pixel count for other sizes — alongside one audio setting, 192 kbps stereo at the
  Source's sample rate. Standard is preselected. A choice is offered only if the machine reports it
  can actually produce it (FR-017). Other formats, resolutions, frame rates and per-setting control
  are out of scope for this slice.
- **One Project at a time is open**, and no more than one export runs at a time.
- **Undo is not exercised** by this slice beyond what importing requires; it is proven by the
  editing features that follow.
- **Chromium (Chrome, Edge) is the only supported browser**, per the project constitution.
- **Sources live on the user's own machine.** Cloud storage, accounts and sharing are out of
  scope.
