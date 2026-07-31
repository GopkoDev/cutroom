# Cutroom

A browser-based multi-track video editor. Everything — decoding, compositing, encoding — happens on the user's machine; no media ever leaves the browser.

## Language

**Project**:
The whole unit of work a user opens and saves: a frame size, a Timebase, the media it draws on, and one Timeline.
_Avoid_: Composition, Document, Sequence

**Timeline**:
The arrangement of Clips over time that defines what the Project looks and sounds like at any Frame.
_Avoid_: Sequence, Edit

**Track**:
One horizontal lane of the Timeline holding non-overlapping Clips, stacked with other Tracks to define layering order.
_Avoid_: Layer, Lane

**Clip**:
A placement of part of a Source onto a Track — where it starts, how long it lasts, and which region of the Source it shows.
_Avoid_: Item, Segment, Element

**Source**:
Media brought into the Project, from which Clips take their picture and sound. A Source is never modified and never moves into the Project — it is addressed wherever it already lives, on the user's disk or in their cloud storage.
_Avoid_: Asset, Media, MediaItem, Footage, Origin, File

**Offline Source**:
A Source whose bytes are currently unreachable — the file moved, permission lapsed, or the machine has no link to it. Clips referring to it survive untouched; only the picture is missing.
_Avoid_: Missing media, Broken link, Unlinked

**Relink**:
Pointing an Offline Source at the bytes it lost, restoring every Clip that references it at once.
_Avoid_: Reconnect, Locate, Repair

**Frame**:
The atomic unit of time. A Frame is an integer index in the Project's timebase; there is no position between two Frames.
_Avoid_: Tick, Time, Timestamp

**Timebase**:
The Project's frame rate, held as an exact ratio (e.g. 30000/1001) so Frame indices convert to real time without drift.
_Avoid_: FPS, Frame rate

**Source Timebase**:
A Source's own rate, held as an exact ratio, which may differ from the Project's Timebase. It addresses time *inside* that Source and nothing else: no position on the Timeline is ever expressed in it, and a Source keeps it unchanged however the Project is set up.
_Avoid_: Source FPS, native frame rate, source frameRate

**Scene**:
What the Timeline looks like at render time, projected from the Project and sent to the engine: the Timebase, the frame size, and the Clips visible on it. Derived, never edited, never stored.
_Avoid_: Render tree, Display list, Frame graph

**Effect**:
Something applied to a Clip that changes how it looks or sounds, exposing a fixed set of named parameters.
_Avoid_: Filter, Adjustment, Modifier

**Keyframe**:
A parameter's value pinned to a Frame. Two or more Keyframes make the parameter a curve over time instead of a constant.
_Avoid_: Waypoint, Marker, Anchor

**Playhead**:
The Frame currently being shown in the Preview.
_Avoid_: Cursor, Scrubber, Current time

**Preview**:
The composited image of the Timeline at the Playhead, shown while editing.
_Avoid_: Viewer, Monitor, Canvas

**Export**:
Producing a finished media file from the whole Timeline.
_Avoid_: Render, Encode, Output, Publish

**Render**:
Compositing the Timeline at a single Frame into an image. Both Preview and Export are built from Renders.
_Avoid_: Draw, Paint
