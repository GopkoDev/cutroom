# Deferred by design

Things we have deliberately left out, with what we already worked out about each. This is not a
roadmap and nothing here is committed to — it exists so that a decision reached in conversation is
not re-derived from scratch six months later, and so that the cost of each addition is visible
before someone promises it.

An entry graduates from this file by becoming a spec under `specs/`, and a decision inside it
graduates by becoming an ADR. Until then, treat everything here as a considered opinion, not a
plan.

Each entry says what it touches in the Project Document, because that is what determines whether
it needs a schema version and a migration (ADR 0007).

---

## The next slice: editing

The first slice deliberately produces a viewer, not an editor — it proves the architecture rather
than serving a user. This is the sketch of what has to follow, written down now so it is not
re-derived later. It is **not** a spec: when the first slice closes, this becomes the input to
`/speckit-specify`, and what is learned building the first slice will change it.

**The user story it has to earn.** *"I can take three clips, cut out what I don't want, put them
in the order I want, and export the result."* That, and nothing more, is what turns this from a
proof into something a person can use.

**What it needs**

| | Why it is not trivial |
|---|---|
| Several Clips on a Track | The Scene projection already handles a list; the Timeline UI and the engine's per-Clip sinks do not. Decoding two Clips at once is the first time the streaming path is under real pressure. |
| Trim a Clip from either end | Changes `sourceInPoint` and `durationFrames` together. Trimming from the head moves the in-point *and* the start, which is the classic place to introduce a one-Frame error. |
| Split a Clip | One Clip becomes two sharing a Source, and undo must put them back as one. |
| Move a Clip, and reorder | Needs the overlap rule enforced during a drag, not just at the end, or the UI shows a state the model would refuse. |
| Delete, with and without closing the gap | "Ripple delete" shifts everything after it — one gesture, many Clips, one undo step. This is what the reducer's transaction API exists for. |
| Undo/redo in the interface | The machinery lands in the first slice; this is the keyboard shortcuts, the naming of actions, and the decision of what counts as one step. |
| A second Track, and audio | Layering order, and the audio graph gaining more than one input. |

**What can be deferred again**: text, transitions, effects, colour grading. All of them assume a
Timeline worth decorating, and the Timeline is not worth decorating until it can be edited.

**Two questions to settle before writing the spec**, both because they are hard to change once
users have habits:

1. **Does a trim ripple?** Trimming a Clip shorter either leaves a gap or pulls everything after
   it back. Editors differ; the choice shapes every other gesture.
2. **What is one undo step during a drag?** Every intermediate position, or the whole gesture? The
   transaction API can express both, and the answer decides how the Timeline reports its work.

**Rough cost**: 2–3 months for one person, on top of the first slice. Most of it is the Timeline
interface, not the model — the model already holds most of what editing needs.

---

## Images as Sources

**What we know.** An image does not need a Track kind of its own. In every editor a still sits on
a video Track — it is a picture that happens to have no duration of its own, the user chooses how
long it lasts. So the change is to `Source`, not to `Track`.

**Touches.** `Source.duration` becomes optional or gains a "still" address kind; the import path
stops refusing images; the engine's per-Source sink returns the same bitmap for every Frame rather
than decoding.

**Schema.** Yes — a new version, because a Source without a duration is a shape version 1 cannot
express.

**Currently.** Images are refused at import, with the reason stated (T040).

---

## Transitions

**What we know, and why this one is different.** A transition does not belong to a Clip. It lives
on the *boundary between two*, which means it cannot be a field on `Clip` without one of the two
Clips arbitrarily owning it. The shape that works is a list on the Track: which two Clips, how
long, which kind.

The part that will hurt is not the data — it is the time arithmetic. A transition consumes Frames
from both neighbours, so a Clip's visible length stops equalling its `durationFrames`, and every
piece of code that assumed "the Clip covers exactly its own Frames" has to learn otherwise. That
includes the Scene projection, the export loop and the Timeline's hit-testing.

**Touches.** `Track.transitions`; the Scene projection, which must emit two overlapping SceneClips
plus a mix factor for the overlap; the renderer.

**Schema.** Yes.

**Worth deciding before writing any of it.** Whether a transition's Frames are taken from the
Clips (the Clips shorten) or overlap them (the Clips keep their length and the timeline shortens).
Editors differ, users notice, and it is close to unchangeable afterwards.

---

## Effects and colour grading

**What we know.** Settled in ADR 0009: an Effect is a registry entry describing its parameters —
name, kind, range, default — plus the shader that applies them. A Clip stores only which Effects
it carries and their values. The Inspector builds its controls from the parameter schema, and any
numeric parameter can be replaced by a curve of Keyframes without the Effect participating.

Colour grading is not a separate feature: brightness, contrast, saturation, curves and LUTs are
Effects like any other.

**Touches.** `Clip.effects`; a new `packages/engine/src/effects/` registry; the Inspector.

**Schema.** Yes, once — adding the `effects` array. After that, adding an individual Effect needs
no schema change at all, which is the entire point of the registry.

**The hard part** is not the Effects, it is the parameter description language: it has to be
expressive enough for a chroma key's eyedropper and a mask's geometry, or those need an escape
hatch into bespoke UI. Design it when the second awkward Effect appears, not the first.

---

## Compositing: more Tracks, transform, blend modes

**What we know.** Layering is Track order — the Track above draws over the Track below. A Clip
gains a `transform` (position, scale, rotation, anchor) and a `blendMode`.

**Touches.** `Clip.transform`, `Clip.blendMode`; the Track kind union; the Scene projection and
the renderer.

**Schema.** Yes.

**Currently.** Version 1 has exactly one video Track, and the parser enforces it — not as a
product rule but because the schema defines no other kind. `SceneClip` deliberately carries no
`transform` either: a field that no Project can vary is a field a renderer cannot trust, so it
arrives with the Clip field rather than ahead of it. `packages/model/test/scene.test.ts` holds a
test that fails on the day `Clip` gains a transform, which is the reminder to widen the Scene in
the same change.

**Already settled, so it is not re-argued later.** `timeline.tracks[0]` is the **backmost** Track
and each later one draws over it. The Timeline displays Tracks the other way up — the topmost row
is the frontmost Track — so the reversal belongs in the interface, not in the model. This was
undetectable while there was one Track, which is exactly why it is written down before there are
two.

---

## Audio and text Tracks

**What we know.** Unlike images, these do need their own Track kinds: an audio Track has no
picture and text is generated rather than decoded. `TrackKind` was written as a union of one for
exactly this reason.

**Touches.** `TrackKind`; the Scene projection; the audio graph gains per-Track routing.

**Schema.** Yes.

---

## Sub-frame audio trimming

**What we know.** ADR 0002 places everything on Frame boundaries, and notes the one thing this
costs: audio cannot be trimmed finer than a Frame — 33 ms at 30 fps, which is audible on a hard
cut to a beat. The fix, when it is wanted, is an optional sample offset on the Clip. Positions
stay in Frames; only the in-point gains sub-Frame precision.

**Touches.** `Clip`, one optional field.

**Schema.** Yes, but a small one — and deliberately shaped so it does not disturb the Frame model.

---

## Cloud storage, accounts, templates

**What we know.** ADR 0005 already shapes this: a Source is *addressed*, and `SourceAddress` is a
discriminated union with `{ kind: "cloud-object", url }` as the second member. Mediabunny reads a
URL by byte range exactly as it reads a local file, so nothing below the address layer changes.

The Project Document is already plain portable JSON with a schema version (ADR 0007), and the
local Project library is deliberately shaped like the server that will replace it, so the editor's
load and save paths keep their shape.

**The consequence worth remembering:** cloud Sources are what make Safari work (ADR 0006). The one
capability missing elsewhere is the persisted local file handle, and a Source addressed by URL
does not need it.

**Schema.** The address union is designed for it; adding a member is still a version bump.

---

## Not decided, and not to be decided casually

- **Nested sequences / compound clips.** Powerful, and they change what "the Timeline" means.
- **Variable frame rate Sources.** Screen recordings are often VFR. Our model assumes a Source has
  one Timebase; VFR breaks that assumption rather than stretching it.
- **Collaboration.** Rejected once already (CRDTs, during the design interview) as a large amount
  of machinery for a product that renders entirely on one machine. Worth revisiting only if the
  backend makes shared editing a real requirement.
