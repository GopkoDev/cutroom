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

## Cutroom as a tool an agent drives

**The idea.** Expose the editor to a language model the way a plugin exposes itself to a host: a
declared set of operations, a way to read the current state, and a way to be told "no". A person
says *"take these twelve files, drop the first two seconds of each, and lay them end to end"*, and
the agent does it by issuing the same commands the interface issues.

**Why the architecture is already most of the way there.** This is not a new subsystem; it is a
second caller of an interface that exists.

- `Command` is plain data with no behaviour, so the union in `packages/model/src/commands/index.ts`
  translates into a tool declaration almost mechanically. A model that emits one emits JSON, not
  code, and nothing it emits touches React, the worker or the disk.
- `applyCommand` refuses **before** it writes, and `CommandError` carries a sentence a human wrote
  ("Clips must not overlap", "import it first"). Handed back to the model, that is a correction
  loop rather than a crash: the refusal names what was wrong and the Project the caller holds is
  untouched, so a wrong attempt costs nothing.
- The reducer is pure and takes no clock and no id generator (Principle IV), so the same package
  runs under Node with no browser at all. A tool server can apply real commands to a real Project
  Document without Chrome anywhere in the picture.
- `transact(label, body)` makes one instruction one undo step, which is the whole difference
  between a usable feature and an unusable one. Whatever the agent did, Ctrl+Z takes it back once.
- `projectScene` plus the engine's `render-frame` give the agent both descriptions and pictures: it
  can be told what is on the Timeline, and shown the Render at a Frame to check it.

**What is actually missing**, in the order it bites:

1. **Commands worth issuing.** Four commands is import-and-place. An agent that cannot `trim`,
   `split`, `move`, `remove-clip` or ripple-delete can only append, which is not editing. This is
   the same list as "The next slice: editing" above, and that is the point: *the agent work is
   blocked on the editing slice and should not be started before it.*
2. **A read side shaped for a reader that pays by the word.** Handing over the whole Project
   Document is expensive and mostly noise. What is wanted is a compact projection — Tracks, Clips,
   their Frame ranges, which Source each draws on, which Sources are Offline — derived like the
   Scene is, and never stored.
3. **A layer between intent and command.** The reducer's refusal to mint ids or read a clock is
   right and must not be relaxed for this; a model asked to invent a UUID will invent one that
   collides or one that is not a UUID. So the agent's operations take *intent* ("split the Clip
   under the Playhead") and a thin adapter mints `crypto.randomUUID()` and `new Date()` and builds
   the command. That adapter, not the `Command` union, is the surface the model sees.
4. **Content it can reason about.** "Cut the pauses", "keep the part where they talk about pricing"
   need a transcript and silence detection. Nothing in this repository produces either. It is a
   separate capability with its own cost, and worth keeping separate — the command layer should not
   learn to be a transcriber.

**Two shapes this can take, and they are not the same product.**

*A tool server (MCP), for the person building or batch-processing.* A Node process over
`@cutroom/model`, operating on Project Documents as files: generate a rough assembly, restructure a
Timeline, migrate a batch. Cheap, because the model package already runs headless. Its limit is
structural rather than incidental: Sources are addressed, never copied (ADR 0005), and a local file
handle lives in the browser's link table and cannot be handed to a separate process. So a tool
server can compose a Timeline out of Sources it is told about, and cannot open the files to check
its work. Anything interactive needs a bridge back to the tab.

*A panel inside the editor, for the user.* The model runs against the store, calls the same
adapter the interface calls, and every action is a transaction with a name. This one can see —
`render-frame` gives it the picture, and the Preview shows the user the same thing. It is a real
feature with real costs the tool server does not have: an API key has to live somewhere, which for
a product that promises media never leaves the machine is a promise that needs re-reading, and the
user needs to see and reverse what was done rather than be told about it.

**Making it a plugin, not a wired-in feature.** The tempting shortcut is to hard-code the tool list
against today's `Command` union. The version worth having is a registry: something declares an
operation, its schema and a sentence about when to use it, and the layer that talks to the model
builds its tool list from what is registered. The same registry then serves effects and any later
extension. The cost is honest and should be counted before promising it: `Command` is a closed
discriminated union today, and that closedness is what makes `applyCommand`'s exhaustive switch and
its patch guarantees hold. A registry means runtime validation for anything not in the union, and
that is a real architectural decision — an ADR, not a refactor.

**Touches.** Nothing in the Project Document. A new package (`packages/agent`, say) holding the
read projection and the intent-to-command adapter, with the tool server and the in-app panel as two
callers of it.

**Schema.** No.

---

## An agent working the editor through the browser

**The idea.** Distinct from the entry above and worth writing down separately, because it is the
version that needs no new interface at all: an agent drives the *interface* — clicking, dragging,
reading the screen — the way a person does.

**What we know.** Two things make it more attractive here than it usually is.

- The editor is Chromium-only by choice (ADR 0006), which is the same ground browser automation
  stands on. There is no cross-browser matrix to satisfy.
- There is already a test harness that reaches inside a running editor: `apps/editor/e2e` drives
  real Playwright sessions against the store, including `undo-and-transactions.spec.ts` and
  `engine-worker.spec.ts`. Whatever an agent needs to observe and provoke, the tests needed first.

And one thing makes it worse than it usually is. A video editor's real work is a **drag** — trim a
handle by four Frames, move a Clip to butt against another. Pixel-accurate dragging against a
zoomable Timeline is exactly what pointer-level automation is worst at, and a miss is not a failed
click but a Timeline that looks nearly right. Reading a Frame count off a canvas is guesswork where
the store already holds the number.

**The conclusion this points to.** Screen-level driving is the wrong primitive for editing, and the
right one for the things around it — walking a user through the interface, reproducing a bug from a
description, checking that what the model *thinks* it did matches what the Preview shows. The
editing itself should go through commands even when the agent is nominally "in the browser". The
useful build is therefore a hybrid: commands for the edit, the screen for the seeing. Which makes
this entry less a feature of its own than a reason to expose the store to an in-page caller — and
that is the same adapter the entry above needs.

**Worth remembering.** If this is ever built, it wants a way to fail loudly. An agent that
mis-drags produces a plausible Timeline, and a plausible wrong edit is the expensive kind. The
model's refusals are the only thing that turns a wrong instruction into a message instead of a
silent mess, which is one more argument for the command path over the pointer.

**Touches.** Nothing in the Project Document.

**Schema.** No.

---

## Not decided, and not to be decided casually

- **Nested sequences / compound clips.** Powerful, and they change what "the Timeline" means.
- **Variable frame rate Sources.** Screen recordings are often VFR. Our model assumes a Source has
  one Timebase; VFR breaks that assumption rather than stretching it.
- **Collaboration.** Rejected once already (CRDTs, during the design interview) as a large amount
  of machinery for a product that renders entirely on one machine. Worth revisiting only if the
  backend makes shared editing a real requirement.
