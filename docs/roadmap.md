---
status: living
updated_at: "2026-10-23"
---

# Roadmap — Cutroom

> **A decomposition, not a promise.** The overall idea broken into incremental steps: what each
> step is, where it comes from, how big it is — or that nobody has looked at it yet — and in which
> order, and parallel lanes, we walk them. **No dates** (except shipped history), **no scores** —
> order is the prioritization. The *solution* for any step lives in its `docs/features/<slug>/`
> spec, not here.

## Destination

A person edits their own footage into a finished multi-track video — video, audio and text Tracks, Effects, colour and transitions — in an interface that looks and behaves like the Kino reference, and exports it, entirely in their browser, with no media ever leaving their machine.

## Steps

The interface target is the Kino prototype, recorded in [`docs/reference/README.md`](./reference/README.md). Rows anchored there take their scope from what the prototype shows. Where the prototype only draws a control, the row is `fog`: the picture says what it looks like, not how it behaves.

| # | Step | Source | Size | Status |
|---|---|---|:---:|---|
| 1 | Import, play, export: the user's own file becomes a Clip they can scrub, play in sync and export as an MP4 → [import-play-export](./features/import-play-export/spec.md) | `docs/features/import-play-export/spec.md` §1. Context | L | shipped |
| 2 | Editing: several Clips on a Track, trim from either end, split, move and reorder, duplicate and delete with and without closing the gap, multi-select, undo/redo in the interface, a second Track and audio | `docs/future.md` §The next slice: editing · `docs/reference/README.md` §Timeline editing | L | idea |
| 3 | Images as Sources → see [Not yet specified](#not-yet-specified) | `docs/future.md` §Images as Sources | fog | idea |
| 4 | Transitions → see [Not yet specified](#not-yet-specified) | `docs/future.md` §Transitions · `docs/reference/README.md` §Clip speed and other Clip commands | fog | idea |
| 5 | Effects and colour grading → see [Not yet specified](#not-yet-specified) | `docs/future.md` §Effects and colour grading · `docs/reference/README.md` §Inspector: effects and colour | fog | idea |
| 6 | Compositing: more Tracks, transform, crop, blend modes, Track order, lock and hide → see [Not yet specified](#not-yet-specified) | `docs/future.md` §Compositing: more Tracks, transform, blend modes · `docs/reference/README.md` §Inspector: transform, crop and blend · §Tracks | fog | idea |
| 7 | Audio and text Tracks, with levels, fades, pan, mute and basic text → see [Not yet specified](#not-yet-specified) | `docs/future.md` §Audio and text Tracks · `docs/reference/README.md` §Inspector: audio · §Inspector: text | fog | idea |
| 8 | Sub-frame audio trimming → see [Not yet specified](#not-yet-specified) | `docs/future.md` §Sub-frame audio trimming | fog | idea |
| 9 | Cloud storage, accounts, templates → see [Not yet specified](#not-yet-specified) | `docs/future.md` §Cloud storage, accounts, templates | fog | idea |
| 10 | Cutroom as a tool an agent drives → see [Not yet specified](#not-yet-specified) | `docs/future.md` §Cutroom as a tool an agent drives | fog | idea |
| 11 | An agent working the editor through the browser → see [Not yet specified](#not-yet-specified) | `docs/future.md` §An agent working the editor through the browser | fog | idea |
| 12 | Timeline ergonomics: snapping with its settings and guide line, marquee selection, nudge by Frame and second, zoom and pan, the shortcuts popover, a Clip context menu | `docs/reference/README.md` §Timeline editing | M | idea |
| 13 | Editor shell in the Kino layout, with transport: top bar, three resizable panels over the Timeline, the theme, jump to start and end, step one Frame | `docs/reference/README.md` §Layout · §Transport and preview | M | idea |
| 14 | Source library with drag and drop: Import button and drop zone, search, drag a Source onto a Track at a position or onto the preview | `docs/reference/README.md` §Library and drag and drop | M | idea |
| 15 | Frame size presets and safe area: change the Project's frame size from a preset menu, see title and action safe areas | `docs/reference/README.md` §Frame size and safe area | M | idea |
| 16 | Export settings: MP4 and WebM with their codecs, quality presets, custom size, frame rate and bitrate, an estimated size | `docs/reference/README.md` §Export dialog | M | idea |
| 17 | Keyframe animation → see [Not yet specified](#not-yet-specified) | `docs/reference/README.md` §Keyframes | fog | idea |
| 18 | Clip speed → see [Not yet specified](#not-yet-specified) | `docs/reference/README.md` §Clip speed and other Clip commands | fog | idea |
| 19 | Shapes, stickers and backgrounds as generated Sources → see [Not yet specified](#not-yet-specified) | `docs/reference/README.md` §Library and drag and drop · §Inspector: shapes | fog | idea |
| 20 | Audio effects: FX chain, ducking, noise reduction → see [Not yet specified](#not-yet-specified) | `docs/reference/README.md` §Inspector: audio | fog | idea |
| 21 | Text styling, animation and karaoke → see [Not yet specified](#not-yet-specified) | `docs/reference/README.md` §Inspector: text | fog | idea |
| 22 | More export formats and AI upscaling → see [Not yet specified](#not-yet-specified) | `docs/reference/README.md` §Export dialog | fog | idea |

## Not yet specified

| Area | What we'd have to learn | Blocks | How it gets sharpened |
|---|---|:---:|---|
| Images as Sources | How a still sits on a video Track. It changes `Source`, not `Track`. Does `Source.duration` become optional, or gain a "still" address kind? The import path stops refusing images, and the engine returns one bitmap for every Frame. This needs a schema version. | 3 | A recon pass over `Source`, the import refusal (T040) and the engine's per-Source sink |
| Transitions | Whether a transition takes its Frames from the Clips (the Clips shorten) or overlaps them (the Timeline shortens). Then the time arithmetic in the Scene projection, the export loop and the Timeline's hit-testing. This needs `Track.transitions` and a schema version. The reference shows only a cross-dissolve marker. | 4 | A conversation that settles the Frames question, which is close to unchangeable afterwards, then a recon of the Scene projection |
| Effects and colour grading | A parameter description language expressive enough for a chroma key's eyedropper and a mask's geometry, or an escape hatch into bespoke UI (ADR 0009). It adds `Clip.effects`, an `effects/` registry and the Inspector. One schema change adds the array. The reference draws an effects stack, colour wheels, HSL, curves, LUTs and an adjustment Track kind, none of it wired. | 5 | Design it when the second awkward Effect appears, not the first |
| Compositing | `Clip.transform` and `Clip.blendMode`, the Track kind union, and widening `SceneClip` in the same change. `packages/model/test/scene.test.ts` fails on the day `Clip` gains a transform. This needs a schema version. Track order in the Timeline is compositing order, and the reference's hide must actually hide. 3D perspective and crop are drawn in the reference; whether they belong here is open. | 6 | A recon of the Scene projection and the renderer once a second Track exists |
| Audio and text Tracks | Their own Track kinds (`TrackKind` is a union of one), the Scene projection, and per-Track routing in the audio graph. This needs a schema version. The reference adds per-Clip volume, fades and pan, Track mute, and a "detach audio" command for video Clips with sound. | 7 | A recon of the audio graph and the Scene projection |
| Sub-frame audio trimming | The optional sample offset on the Clip. Positions stay in Frames, and only the In-point gains sub-Frame precision (ADR 0002). This needs a small schema version. | 8 | Wait until someone needs a cut finer than a Frame (33 ms at 30 fps) |
| Cloud storage, accounts, templates | A second `SourceAddress` member `{ kind: "cloud-object", url }` (ADR 0005), the server that replaces the local Project library (ADR 0007), and what makes Safari work (ADR 0006). Adding the address member is a version bump. | 9 | A backend design pass |
| Cutroom as a tool an agent drives | The commands worth issuing, a compact read projection, and an intent-to-command adapter that mints ids and timestamps. Content it can reason about (a transcript, silence detection). It could be a tool server (MCP) or an in-editor panel, and a command registry instead of a closed union is an ADR. A new package. No schema change. | 10 | Prototype the read projection and the adapter after the editing slice |
| An agent working the editor through the browser | Commands for the edit and the screen for the seeing: a hybrid that exposes the store to an in-page caller, the same adapter as step 10. It has to fail loudly. No schema change. | 11 | Follows step 10's adapter |
| Keyframe animation | ADR 0009 says any numeric parameter can animate, but nothing models a keyframe yet: where keyframes live (per parameter on the Clip?), how easing is stored, and how the Scene projection samples them per Frame. The reference draws a strip for Position X, Scale and Opacity with an easing picker. It needs a schema version. | 17 | After compositing gives Clips parameters worth animating, a recon of the Scene projection |
| Clip speed | Speed changes a Clip's length in Frames and its mapping to Source time, which is `frameToSourceTime`'s job. Then reverse, preserve pitch (an audio time-stretch) and optical-flow interpolation, each a different cost. It needs a schema version. | 18 | A recon of `frameToSourceTime`, the decoder's seek path and the audio graph |
| Shapes, stickers and backgrounds | Sources that are generated rather than read from a file: whether they are a new `SourceAddress` kind, a Track kind, or an Effect on an empty Clip. Stickers in the reference are emoji dropped as text. Shape styling (fill, stroke, corner, shadow) follows. | 19 | Decide alongside images as Sources (3), which settles what a non-video Source is |
| Audio effects | An audio parameter model like the video one (ADR 0009), and where the processing runs. Ducking needs a sidechain between Tracks. Noise reduction may need a model that does not fit an `AudioWorklet` budget. | 20 | After audio Tracks, a research pass on Web Audio and worklet-based processing |
| Text styling, animation and karaoke | Fonts (which are available offline, and how a Project names one), outline, shadow and background box, in and out animations, and word-level karaoke that needs word timings from somewhere. Animation overlaps keyframes (17). | 21 | After text Tracks and keyframes, a recon of the PixiJS text path |
| More export formats and AI upscaling | Which of ProRes, image sequences and audio-only files can be written in a browser at all (WebCodecs and Mediabunny decide this), what "hardware encoding" means when the browser chooses the encoder, and whether AI upscaling can run client-side within ADR 0001. | 22 | A research pass on Mediabunny's muxers and WebCodecs encoders |

## Out of scope

- A server-side render path — every Frame is rendered client-side, and a second renderer would have to match every Effect pixel-for-pixel ([ADR 0001](./adr/0001-client-only-rendering-mediabunny-pixijs.md), constitution Principle I).
- Copying Sources into browser storage — Sources are addressed where they live ([ADR 0005](./adr/0005-sources-are-referenced-never-copied.md), Principle V).
- Building on the Lovable prototype's code — it is a visual reference, and its local copy is gitignored and unimportable ([ADR 0010](./adr/0010-the-lovable-prototype-is-a-reference-not-a-codebase.md), [`docs/reference/`](./reference/README.md)).
- A Save button — saves follow the Gesture, so the reference's Save has nothing to do ([ADR 0011](./adr/0011-saves-follow-the-gesture-and-commit-explicitly.md)).
- Overlapping Clips on one Track — the reference allows it, Cutroom's document refuses it ([data-model.md](./features/import-play-export/data-model.md)).

## Open decisions

| # | Question | Type | Owner | Blocks |
|---|---|:---:|:---:|:---:|
| D1 | Does an exported file of step 1 play correctly in VLC and in QuickTime Player itself (SC-006, the T096 check a script could not make)? | task | human | — |
| D2 | Does a trim ripple — does trimming a Clip shorter leave a gap or pull everything after it back? | grilling | human | 2 |
| D3 | What is one undo step during a drag — every intermediate position, or the whole Gesture? | grilling | human | 2 |
| D4 | Which time space is a Clip's In-point measured in (container presentation time, or time from the first sample)? It needs an ADR before trimming lands | grilling | human | 2 |
| D5 | Should nested sequences / compound clips exist at all? They change what "the Timeline" means | grilling | human | — |
| D6 | Should variable-frame-rate Sources be supported? The model assumes one Timebase per Source, and VFR breaks that assumption rather than stretching it | grilling | human | — |
| D7 | Is shared editing a real requirement? Collaboration (CRDTs) was rejected once as a large amount of machinery for a product that renders on one machine. Revisit only if the backend makes it one | grilling | human | 9 |
| D8 | The design canon: which design tool, the tokens taken from the Kino reference, and the component inventory — run `/sdd:design-system` | task | human | 13 |
| D9 | When the Project's frame size changes, how does a Source of another size sit in it by default — fit, fill or stretch? | grilling | human | 15 |
| D10 | What is the reference's "Magic Cut" meant to do? It has no behaviour and no description | grilling | human | — |

## Decisions so far

- Every Frame is rendered in the browser on Mediabunny + PixiJS → [`docs/adr/0001`](./adr/0001-client-only-rendering-mediabunny-pixijs.md)
- Timeline time is integer Frames in a rational Timebase → [`docs/adr/0002`](./adr/0002-timeline-time-is-integer-frames.md)
- The engine runs in a Worker; audio stays on the main thread and owns the clock → [`docs/adr/0003`](./adr/0003-engine-runs-in-a-worker.md), [`docs/adr/0008`](./adr/0008-audio-stays-on-the-main-thread.md)
- One reducer, with undo as inverse patches; saves follow the Gesture → [`docs/adr/0004`](./adr/0004-single-reducer-with-inverse-patches-for-undo.md), [`docs/adr/0011`](./adr/0011-saves-follow-the-gesture-and-commit-explicitly.md)
- Sources are addressed, never copied; Projects are portable versioned JSON → [`docs/adr/0005`](./adr/0005-sources-are-referenced-never-copied.md), [`docs/adr/0007`](./adr/0007-project-document-is-portable-versioned-json.md)
- Chromium first; cross-browser arrives with cloud Sources → [`docs/adr/0006`](./adr/0006-chromium-first-cross-browser-comes-from-the-cloud.md)
- Effects are registry entries → [`docs/adr/0009`](./adr/0009-effects-are-registry-entries-any-parameter-animates.md)
- The Kino prototype is the interface target, read from a committed record and never imported → [`docs/reference/README.md`](./reference/README.md), [`docs/adr/0010`](./adr/0010-the-lovable-prototype-is-a-reference-not-a-codebase.md)
- `timeline.tracks[0]` is the backmost Track; the Timeline shows Tracks the other way up → [`docs/future.md`](./future.md) §Compositing
- The rest of step 1's decisions → [`docs/features/import-play-export/sad.md`](./features/import-play-export/sad.md) §9

## Dependency graph

```mermaid
flowchart LR
  s1["1 · Import, play, export"] -->|"the model, Timeline and engine it edits"| s2["2 · Editing"]
  s1 -->|"the export pipeline it configures"| s16["16 · Export settings"]
  s1 -->|"the editor it lays out"| s13["13 · Editor shell + transport"]
  s2 -->|"needs a Timeline worth decorating"| s4["4 · Transitions"]
  s2 -->|"needs a Timeline worth decorating"| s5["5 · Effects and colour"]
  s2 -->|"text needs an editable Timeline"| s7["7 · Audio and text Tracks"]
  s2 -->|"a second Track lands in editing"| s6["6 · Compositing"]
  s2 -->|"agent work is blocked on the editing commands"| s10["10 · Agent tool"]
  s10 -->|"the same intent-to-command adapter"| s11["11 · Agent in the browser"]
  s2 -->|"snap, nudge and marquee act on the move, trim and selection it adds"| s12["12 · Timeline ergonomics"]
  s2 -->|"dropping at a position uses its place-a-Clip rules"| s14["14 · Source library + drag and drop"]
  s13 -->|"the library is the shell's left panel"| s14
  s13 -->|"the frame-size menu lives in the shell's top bar"| s15["15 · Frame size + safe area"]
  s2 -->|"speed changes a Clip's length, an edit"| s18["18 · Clip speed"]
  s6 -->|"keyframes animate the transform it adds"| s17["17 · Keyframes"]
  s7 -->|"audio effects process an audio Track"| s20["20 · Audio effects"]
  s7 -->|"styles and animates the text Track it adds"| s21["21 · Text styling, animation, karaoke"]
  s17 -->|"text animation is keyframed"| s21
  s3 -->|"settles what a non-video Source is"| s19["19 · Shapes, stickers, backgrounds"]
  s16 -->|"further formats extend its dialog"| s22["22 · More formats, AI upscaling"]
  s8["8 · Sub-frame audio trim"]
  s9["9 · Cloud, accounts, templates"]
```

## Execution path

| Wave | Steps | Zone per step (why parallel-safe) | Unlocks |
|:---:|---|---|---|
| 1 | 1 | `packages/model`, `packages/engine`, `apps/editor` (the whole slice; shipped) | 2, 13, 16 |
| 2 | 2 ‖ 16 | 2: `packages/model/src/commands`, `apps/editor/src/ui/Timeline.tsx`, `apps/editor/src/store/index.ts` · 16: `apps/editor/src/ui/ExportDialog.tsx`, `apps/editor/src/ui/export-settings.ts`, `apps/editor/src/store/export.ts`, `packages/engine/src/export` — no shared file | 12, 14 (with 13), 4, 5, 6, 7, 10, 18 (each once its fog is cleared) |
| 3 | 12 ‖ 13 | 12: `apps/editor/src/ui/Timeline.tsx`, `apps/editor/src/ui/timeline-scale.ts` · 13: `apps/editor/src/ui/EditorLayout.tsx`, `apps/editor/src/ui/TopBar.tsx`, `apps/editor/src/index.css`. 13 is kept out of wave 2 because its transport commands go through `apps/editor/src/store/index.ts`, which step 2 rewrites. 13 also waits on D8 | 14, 15 |
| 4 | 14 ‖ 15 | 14: `apps/editor/src/ui/SourcesPanel.tsx`, `apps/editor/src/store/import-source.ts` · 15: `packages/model/src/commands` (a frame-size command), `packages/engine/src/compose`, the frame-size menu in `apps/editor/src/ui/TopBar.tsx`. 15 also waits on D9 | — |

Steps 3–11 and 17–22 are `fog` and enter no wave until a recon pass sizes them.

## Shipped

| Step | Shipped | Link |
|---|---|---|
| 1 · Import, play, export | `7f5efea`–`a49c7f8` on `main` (date omitted by owner instruction; see `git log`) | No PR (committed to `main`). Record: [docs/features/import-play-export/](./features/import-play-export/spec.md). SC-006 still open (D1) |
