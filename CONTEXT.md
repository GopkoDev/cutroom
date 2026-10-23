---
status: Living
updated_at: "2026-10-23"
---

# Domain Context — Cutroom

A browser-based multi-track video editor. Everything — decoding, compositing, encoding — happens on the user's machine; no media ever leaves the browser.

This is the project-wide glossary: the canonical terms the specs, the SAD and the code use. Identifiers in code follow it, and never use a word from an entry's avoid list (`docs/constitution.md`, Development Workflow). Each entry is `term — definition`, then `NOT …` naming the words that get confused with it; those are the entry's _Avoid_ list, kept exactly as the original glossary had it. A feature-scoped term would go in `docs/features/<slug>/CONTEXT.md`; none exists yet.

## Glossary

- Project — The whole unit of work a user opens and saves: a frame size, a Timebase, the media it draws on, and one Timeline. NOT Composition, Document, Sequence (_Avoid_ these words for it).
- Project Document — The serialized form of a Project: plain versioned JSON, the thing that is saved, loaded, migrated and one day uploaded. Distinct from the Project itself, which is what the editor holds while you work. "Document" on its own is still the wrong name for a Project — it is only ever this. NOT Save file, Doc, Project file (_Avoid_ these words for it).
- Timeline — The arrangement of Clips over time that defines what the Project looks and sounds like at any Frame. NOT Sequence, Edit (_Avoid_ these words for it).
- Track — One horizontal lane of the Timeline holding non-overlapping Clips, stacked with other Tracks to define layering order. NOT Layer, Lane (_Avoid_ these words for it).
- Clip — A placement of part of a Source onto a Track — where it starts, how long it lasts, and which region of the Source it shows. NOT Item, Segment, Element (_Avoid_ these words for it).
- Source — Media brought into the Project, from which Clips take their picture and sound. A Source is never modified and never moves into the Project — it is addressed wherever it already lives, on the user's disk or in their cloud storage. NOT Asset, Media, MediaItem, Footage, Origin, File (_Avoid_ these words for it).
- Offline Source — A Source whose bytes are currently unreachable — the file moved, permission lapsed, or the machine has no link to it. Clips referring to it survive untouched; only the picture is missing. NOT Missing media, Broken link, Unlinked (_Avoid_ these words for it).
- Linked Source — A Source whose bytes this machine can read right now. Linked and Offline are a Source's only two statuses; the status belongs to the machine and the moment, not to the Project, so it is never saved and never undone. NOT Online, Connected, Available (_Avoid_ these words for it).
- Relink — Pointing an Offline Source at the bytes it lost, restoring every Clip that references it at once. NOT Reconnect, Locate, Repair (_Avoid_ these words for it).
- Frame — The atomic unit of time. A Frame is an integer index in the Project's timebase; there is no position between two Frames. NOT Tick, Time, Timestamp (_Avoid_ these words for it).
- In-point — Where in its Source a Clip begins, as a time in the Source. A Clip shows its Source from the In-point for as many Frames as it lasts. NOT Offset, Trim start, Source start (_Avoid_ these words for it).
- Timebase — The Project's frame rate, held as an exact ratio (e.g. 30000/1001) so Frame indices convert to real time without drift. NOT FPS, Frame rate (_Avoid_ these words for it).
- Source Timebase — A Source's own rate, held as an exact ratio, which may differ from the Project's Timebase. It addresses time *inside* that Source and nothing else: no position on the Timeline is ever expressed in it, and a Source keeps it unchanged however the Project is set up. NOT Source FPS, native frame rate, source frameRate (_Avoid_ these words for it).
- Scene — What the Timeline looks like at render time, projected from the Project and sent to the engine: the Timebase, the frame size, and the Clips visible on it. Derived, never edited, never stored. NOT Render tree, Display list, Frame graph (_Avoid_ these words for it).
- Effect — Something applied to a Clip that changes how it looks or sounds, exposing a fixed set of named parameters. NOT Filter, Adjustment, Modifier (_Avoid_ these words for it).
- Keyframe — A parameter's value pinned to a Frame. Two or more Keyframes make the parameter a curve over time instead of a constant. NOT Waypoint, Marker, Anchor (_Avoid_ these words for it).
- Playhead — The Frame currently being shown in the Preview. NOT Cursor, Scrubber, Current time (_Avoid_ these words for it).
- Timecode — A Frame written for people as hours, minutes, seconds and Frames (`HH:MM:SS:FF`), counted on the wall clock: at 30000/1001 a second holds 30 or 29 Frames. Display only — nothing is ever addressed by Timecode. NOT SMPTE, Time display (_Avoid_ these words for it).
- Scrub — Moving the Playhead by hand, Frame by Frame or by jumping, with the Preview showing each Frame it lands on. NOT Seek (outside playback), Jog (_Avoid_ these words for it).
- Playback — The Timeline played in real time from the Playhead, picture following sound. Sound sets the pace; the picture skips Frames rather than make the sound wait. NOT Preview playback, Run (_Avoid_ these words for it).
- Transport — What starts and stops Playback — the Play/Stop control and the state it drives. A Playhead moved during Playback is a seek, not a stop and a start. NOT Player, Controls (_Avoid_ these words for it).
- Skipped Frame — A Frame Playback passed over to keep up with the sound. Counted by the engine; the visible form of picture yielding to sound. NOT Lost Frame (_Avoid_ these words for it).
- Dropped Frame — A request for a Frame that got no picture because a newer request replaced it before it was drawn. Distinct from a Skipped Frame. NOT Missed Frame (_Avoid_ these words for it).
- Preview — The composited image of the Timeline at the Playhead, shown while editing. NOT Viewer, Monitor, Canvas (_Avoid_ these words for it).
- Gesture — One thing the user did — an import, a drag, a delete — however many commands it takes. A Gesture is one undo step and one save. NOT Transaction (in the interface), Action (_Avoid_ these words for it).
- Project list — The Projects stored in this browser, shown when no Project is open. NOT Library, Recent files, Dashboard (_Avoid_ these words for it).
- Export — Producing a finished media file from the whole Timeline. NOT Render, Encode, Output, Publish (_Avoid_ these words for it).
- Export quality — One of High, Standard and Draft — a bitrate that scales with the Project's frame size — offered only if this machine can encode it when the export dialog opens. NOT Preset, Profile (_Avoid_ these words for it).
- Render — Compositing the Timeline at a single Frame into an image. Both Preview and Export are built from Renders. NOT Draw, Paint (_Avoid_ these words for it).
- User — The one person working in this browser on their own Projects and Sources. There are no accounts and no other roles yet; an agent or a collaborator would be a new role. NOT Editor (the app's own name), Owner, Admin, Customer (_Avoid_ these words for it).
- Selection — The Clips the User has picked out on the Timeline, which the next edit command acts on. It belongs to the session: it is never saved and never undone. NOT Focus, Active clip, Highlight (_Avoid_ these words for it).
- Gap — A stretch of a Track between two Clips, or before the first, where no Clip is. A Frame where every Track has a Gap renders black and silent. NOT Hole, Blank, Empty Clip (_Avoid_ these words for it).
- Trim — Moving one end of a Clip so it shows more or less of its Source. Trimming the head moves the In-point and the start together; neither end ever moves a neighbouring Clip. NOT Resize, Crop, Cut (_Avoid_ these words for it).
- Split — Cutting one Clip into two at a Frame, the pair showing exactly what the one did. NOT Cut, Razor, Slice (_Avoid_ these words for it).
- Ripple delete — Removing Clips and closing the Gap they leave by pulling everything after them on the same Track back by that length. NOT Lift, Extract, Magnetic delete (_Avoid_ these words for it).
- Edit point — The boundary on a Track where one Clip ends and the next begins, made by a Split or by placing Clips end to end. Picture and sound change there from one Frame to the next with nothing repeated or lost. NOT Cut, Splice, Join (_Avoid_ these words for it).
