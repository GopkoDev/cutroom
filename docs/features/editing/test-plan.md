---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-23"
feature_size: "L"
---

# Test plan — editing

A User trims, splits, moves, duplicates and deletes Clips on up to two video Tracks, and undoes
and redoes each Gesture. The exported file matches the Preview at every Edit point, with every
Clip's sound mixed. This plan maps every spec §5 acceptance criterion to at least one test before
any test exists. `implement` writes the red tests against it. Each row names the task that owns
the test ([tasks/](./tasks/_epic.md)).

The levels were chosen by the agent on the owner's delegation, 2026-10-23, using the skill's
default heuristic:

- a rule in `packages/model` gets a unit test;
- a store behaviour gets a unit test over a stand-in saver and transport;
- a user-story flow gets an e2e-through-UI test in the real target browser;
- anything that decodes, plays or encodes is tested in the real browser, as in step 1, because
  media cannot be meaningfully faked.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | `packages/model`: the rule functions (`trimRange`, `checkMove`, `duplicateDelta`, `splitTargets`, `rippleShifts`), the seven commands and `placeSourceCommand`, `wholeFramesIn`, the load checks, and property tests over random Timebases. `apps/editor`: the history cap and labels, the Selection, the drag-preview slice, the Gesture functions, the refusal wording, the master bus and the measured limiter delay | Model: a node environment with no DOM, with plain literals run through `parseProject`. Editor: the store with a stand-in saver and transport, and the audio graph on the existing fake audio context. Property tests use the repo's generator library, or add one |
| Integration | The save path against a real IndexedDB: one write per Gesture, no write while a drag is open, and step-1 Projects still loading | Runs in the real target browser, because the node environment has no IndexedDB. Each spec uses its own fresh origin storage |
| Contract | <!-- N/A: the worker protocol does not change (contracts/events.md); the library-sdk surface is pinned by the model unit tests that assert the public-api.md signatures and refusal reasons --> | — |
| E2E | — | Covered by E2E-through-UI: every flow is driven through the real editor |
| Load | The numeric spec §6 NFRs on a heavy Project | Timed in the page against generated fixtures with a burned-in Frame counter. The repo's existing measurement harness is used, as in step 1 |
| Component *(UI surface only)* | <!-- N/A: the repo has no component harness; the screens.md states are asserted through E2E-through-UI by their data-testid / data-* attributes --> | — |
| Visual-regression *(web UI only)* | <!-- N/A: no visual baselines are kept beyond step 1's shell snapshot; drag ghosts and refusal marks are asserted by attributes (data-drop, data-reason, data-at-limit, aria-selected) --> | — |
| E2E-through-UI *(UI surface only)* | One spec per group of user stories, driven by pointer and keyboard, following the ux-flows.md flows and the screens.md SCR-02 states | The real editor in the real target browser. Fixtures are imported through the stand-in file picker from step 1. IndexedDB is read directly where an AC concerns what was saved |

## AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 happy | head and tail Trim land on the exact Source Frame (T004, T011) | unit | Clip ends N Frames earlier and starts M later; In-point advanced by exactly M Frames; no other Clip moved |
| AC-01 happy | dragging both edges trims the Clip and the Preview shows the new first Frame (T017) | e2e-through-UI | The burned-in counter at the Clip's new start reads the old start + M |
| AC-02 domain invariant | Trim stops at the Source's own beginning and end (T004) | unit | `trimRange` stops at In-point 0 and at the import's ceiling; a command past it is refused as out of Source |
| AC-02 domain invariant | a loaded Clip outside its Source is refused (T003) | unit | `parseProject` refuses and names the field |
| AC-02 domain invariant | an edge dragged past the Source end is held there (T017) | e2e-through-UI | The edge shows the limit mark and the Clip length stops growing |
| AC-03 domain invariant | Trim stops at a neighbour, at Frame 0 and one Frame short (T004) | unit | Each limit holds; commands past it are refused with overlap, before-start or too-short |
| AC-03 domain invariant | an edge dragged into a neighbour is held at its edge (T017) | e2e-through-UI | No overlap on release; the Clip is at least one Frame long |
| AC-04 happy | Split of a selected Clip cuts at the Playhead with exact halves (T005) | unit | Two Clips meet at the Playhead; the second's In-point is advanced by the offset |
| AC-04 happy | S splits the selected Clip and the second half is selected (T018) | e2e-through-UI | Two Clips meet at the Playhead; the second is selected; Playback across the cut shows consecutive counter Frames |
| AC-05 error | Split with nothing under the Playhead says why (T005, T014) | unit | `splitTargets` returns none with the right reason; no command; no history entry |
| AC-05 error | Split in a Gap or off the Selection shows the notice and changes nothing (T018) | e2e-through-UI | The refusal notice names which case it is; the Timeline is unchanged; Undo still names the previous step |
| AC-06 happy | moving C into a Gap before A reorders the Track (T006) | unit | Order C, A, B; C on a whole Frame; inverse patches put C back |
| AC-06 happy | dragging C before A and undoing it (T017) | e2e-through-UI | The Track plays C, A, B; one undo restores it |
| AC-07 domain invariant | an overlapping or before-Frame-0 move is refused (T006, T013) | unit | `checkMove` says no with a reason; releasing in that state sends no command and records no history |
| AC-07 domain invariant | a drag over an occupied place shows it cannot land, and the Clips go back on release (T017) | e2e-through-UI | The ghost is marked refused while the pointer is there; after release every Clip is where it started; no undo step |
| AC-08 happy | a Clip moves onto the upper Track (T006) | unit | The Clip is on the upper Track with the same id |
| AC-08 happy | a Clip dragged onto the upper Track covers the lower picture (T017) | e2e-through-UI | The Preview shows the upper Clip's counter, not the lower one's |
| AC-09 happy | several Clips move together, all or none, and a two-Track Selection stays on its Tracks (T006) | unit | Same delta for all; refused if any cannot land; a target Track given with two Tracks is refused |
| AC-09 happy | dragging an unselected Clip moves it alone; dragging a selected one moves the whole Selection (T017) | e2e-through-UI | Relative positions are kept; an unselected press replaces the Selection |
| AC-10 happy | a plain delete leaves a Gap (T007) | unit | B gone; A and C unchanged |
| AC-10 happy | Delete leaves a black, silent Gap (T018) | e2e-through-UI | A and C stay; Preview frames inside the Gap are black; the mix is silent there |
| AC-11 happy | a Ripple delete closes each Track's own Gaps (T007) | unit | Later Clips on the same Track shift back by the total deleted before them; the other Track does not move; inverse patches restore everything |
| AC-11 happy | Shift+Delete closes the Gap and one undo restores it (T018) | e2e-through-UI | C moves back by B's length; the other Track does not move; one undo restores all |
| AC-12 happy | a Duplicate lands directly after the Selection (T008) | unit | The copy or block sits directly after the Selection, keeping spacing; the copies have new ids |
| AC-12 happy | ⌘D places the copy after the original and selects it (T018) | e2e-through-UI | The copy shows the same Source part; the copy is the Selection |
| AC-13 domain invariant | a Duplicate with no room goes after the last Clip (T008) | unit | The block goes after the last Clip on the spanned Tracks; it never overlaps |
| AC-13 domain invariant | ⌘D with a neighbour directly after places the copy at the Track's end (T018) | e2e-through-UI | No overlap; the copy is after the last Clip |
| AC-14 happy | Selection actions record no history and no save (T012) | unit | The Selection changes; `past` is unchanged; the saver is not called |
| AC-14 happy | click, modifier-click, ⌘A and clear mark the Clips without saving (T016) | e2e-through-UI | The selected marks follow each step; the stored Project's modified time is unchanged |
| AC-15 domain invariant | undo and redo prune the Selection (T012) | unit | No selected id is missing from the Timeline after undoing a Split, Duplicate or place, or redoing a delete |
| AC-16 happy | the history labels name the next undo and redo (T012) | unit | The labels follow the Gestures in order |
| AC-16 happy | three undos then three redos, by key and by button (T018) | e2e-through-UI | Each step reverses one Gesture; the Undo and Redo labels name the next step |
| AC-17 domain invariant | a drag is one history entry and one save (T013) | unit | One entry; the saver is called once, on release |
| AC-17 domain invariant | the stored Project never holds an intermediate drag position (T017) | integration | Stored records read during the drag equal the pre-drag Project; after release it is the end position; after undo, the start position |
| AC-18 error | undo and redo are unavailable while a drag is open or the history is empty (T013) | unit | Both report unavailable; calling them changes nothing |
| AC-18 error | the controls show they are unavailable mid-drag and on an empty history (T018) | e2e-through-UI | Buttons disabled with their reason; ⌘Z changes nothing |
| AC-19 happy | Escape cancels a drag with no trace (T013) | unit | The preview is dropped; no command; no save |
| AC-19 happy | Escape during a drag puts the Clips back (T017) | e2e-through-UI | Clips back; no undo step; the stored Project is unchanged |
| AC-20 happy | add-track appends an empty Track on top (T009) | unit | `tracks[1]` exists and is empty |
| AC-20 happy | Add Track shows an upper Track whose Clips cover the lower one and whose Gaps show it (T016) | e2e-through-UI | The Preview shows the lower Clip through a Gap and the upper Clip where it has one |
| AC-21 happy | remove-track removes the Track and its Clips, restored by one undo (T009) | unit | The inverse patches restore the Track and its Clips in order |
| AC-21 happy | Remove Track and undo it (T016) | e2e-through-UI | The Track and its Clips are gone, then all back |
| AC-22 domain invariant | removing the only Track is refused (T009, T003) | unit | Refused as last Track; a loaded Project with zero Tracks is refused |
| AC-22 domain invariant | Remove on the only Track shows the notice (T016) | e2e-through-UI | The notice says a Project always keeps at least one Track; nothing changes |
| AC-23 happy | every Clip feeds one limiter with its delay compensated (T015) | unit | The graph wiring goes Clip, master bus, limiter, destination; chunks start earlier by the measured delay; a segmented export matches a continuous render across a seam |
| AC-23 happy | two loud overlapping Clips are heard together without clipping, in sync, in Playback and the file (T019) | e2e-through-UI | Both tones are present; peak ≤ full scale; A/V within one Frame; a single Clip's level matches step 1 |
| AC-24 happy | placeSourceCommand puts the whole Source after the last Clip on the bottom Track (T010) | unit | `add-clip` at the recorded length, In-point 0, on `tracks[0]` |
| AC-24 happy | Place on a Source row adds the Clip and selects it, without reading the file (T018) | e2e-through-UI | A new Clip at the bottom Track's end, selected; no file read is requested |
| AC-25 authorization | editing commands never need the file (T004, T010, T014) | unit | Trim and place compute from the recorded Source duration; no handle or permission call is made |
| AC-25 authorization | editing an Offline Source's Clip asks for no permission (T017) | e2e-through-UI | Trim, Split, move, Duplicate and delete succeed; no permission prompt; the picture stays empty until relinked |
| AC-26 cross-context | editing during an Export does not reach the file (T014, T019) | e2e-through-UI | The edit is saved; the exported file is the Timeline at Start |
| AC-27 cross-context | the edited Export matches the Preview at every Edit point and Gap (T019) | e2e-through-UI | The Frames on both sides of every Edit point, and one Frame in each Gap, match the Preview; the Gap is black and silent |
| AC-28 cross-context | a reload or reopen restores the last Gesture with an empty history (T012, T018) | e2e-through-UI | The Timeline equals the state before the reload; Undo and Redo are unavailable |
| AC-29 happy | with no Selection, Split cuts every Clip under the Playhead on both Tracks (T005) | unit | Both Clips are cut; one command; inverse patches restore both |
| AC-29 happy | S with nothing selected cuts both Tracks, and one undo restores them (T018) | e2e-through-UI | Two cuts; the second halves are selected; one undo restores both |
| AC-30 domain invariant | add-track beyond two is refused (T009) | unit | Refused as over the Track limit |
| AC-30 domain invariant | Add Track at two Tracks shows the notice (T016) | e2e-through-UI | The notice says a Project has at most two video Tracks for now; nothing changes |
| AC-31 cross-context | every Gesture function stops Playback first (T014) | unit | The transport's stop is called before the command; a Split cuts at the Frame reached |
| AC-31 cross-context | a drag or Split during Playback stops it on the Frame reached (T017) | e2e-through-UI | Playback stops; the cut is at the Frame shown at that moment |
| AC-32 domain invariant | a no-op command gives empty patches (T011) | unit | Empty patches and inverse patches for a drop where it started, a Trim at its limit, and an empty delete or Duplicate |
| AC-32 domain invariant | a no-op Gesture records nothing and saves nothing (T014) | unit | `past` and the saver are untouched; the Undo label still names the previous step |

## Edge cases / error paths

The error and authorization ACs (AC-05, AC-18, AC-25) and every domain invariant each have their
own rows above. These further cases are implied by the spec and the contract:

- Playhead on a Clip's first Frame, nothing selected → expected: no Clip is under the Playhead; nothing changes.
- The same Clip id twice in one command → expected: refused as malformed; nothing written.
- A command naming a Clip that is not on the Timeline → expected: refused as an unknown Clip; the Selection is pruned so the interface never sends one.
- A rule-approved command refused anyway (a bug) → expected: nothing changes; the generic refusal notice appears with the reason under Details.
- The 201st Gesture → expected: the oldest history entry is dropped; 200 undos still work.
- A reload in the middle of a drag → expected: the stored Project is the one before the drag (sad §10 QG-2b).
- A step-1 Project with Clips exactly at the import's ceiling → expected: still loads under the new Source-bounds check.
- A shortcut key pressed while a text field has focus → expected: ignored.
- A Ripple delete of Clips on both Tracks → expected: each Track closes only its own Gaps.
- An export segment seam inside a loud two-Track stretch → expected: no click, and the same samples as a continuous render.

## Test data

- **Seed strategy.** Model tests build Projects as plain literals run through `parseProject`
  (`data-model.md` §Test fixtures):
  - a two-Track Project with Gaps;
  - a Clip at its Source's end, and Clips at In-point 0 and at a non-zero In-point;
  - documents that must be refused;
  - step-1 Project literals for `sync-1080p30.mp4`, `sync-1080p2997.mp4` and
    `silent-720p24.mp4`.
- **Property generators.** Random Project Timebases (including 30000/1001), Source Timebases,
  In-points and offsets.
- **E2E media.** Media comes from `pnpm fixtures`. A loud-tone fixture is added if none fits
  AC-23. The edited export Project and the heavy Project (two Tracks, 100 Clips) are built in the
  test through the editing interface or the store, not stored as files.
- **Integration dependency.** The real IndexedDB of a throwaway browser context per spec, never a
  mocked store and never a real User's database.
- **Cleanup boundary.** Unit tests are per test, with a fresh store from `createEditorStore` each
  time. E2E specs are per test, each with a fresh browser context and its own origin storage, so
  no stored Project leaks between runs.

## NFR validation (load)

All of these run in the page against the generated fixtures. The thresholds are spec §6 verbatim.
They are measured on the machine running the suite, and that machine is recorded with each result.
A run that is not on the reference machine (MacBook Air M4) carries that caveat, and the owner
re-runs it there.

- **Drag feedback.** A scripted move drag and a Trim drag of 60 pointer moves on the heavy Project.
  Assert p95 time per pointer move ≤ 16.7 ms and no main-thread long task during the drag (T020).
- **Preview after an edit.** 20 Gestures on the heavy Project. Assert p95 time from release to the
  Preview's new Frame ≤ 300 ms on the 2-second-keyframe fixtures. Long-GOP is recorded without
  gating, as sad §10 QG-3b closes the SC-003 item (T020).
- **Playback across Edit points.** An Edit point every 2 s, played for 2 minutes. Assert ≤ 1%
  skipped Frames at the Edit points and A/V within one Frame, which is SC-002's bar (T020).
- **Two Tracks at full rate.** Two overlapping 1080p 30 fps Clips played for 60 s. Assert ≤ 1%
  skipped Frames and zero audio underruns (T020).
- **Undo depth.** A unit test for the cap of 200 and the drop order (T012). In the browser, 20
  undos and 20 redos on the heavy Project, each with p95 ≤ 100 ms from the key press to the
  settled Timeline (T020).
- **Export fidelity at Edit points.** The edited fixture is always sampled at `edit − 1` and `edit`
  for every Edit point, plus one Frame in each Gap. Assert every sample matches the Preview, which
  extends SC-007 (T019).
- **Frame accuracy.** Model property tests at the generator's default run count. Assert zero
  one-Frame errors (T011).

## CI placement

- **On every PR:** the unit suites (`pnpm test`), lint with `check:docs`, and typecheck.
- **Pre-merge on the feature branch:** the full e2e-through-UI and integration suite
  (`pnpm test:e2e`), which is this feature's implement gate.
- **Pre-release, on the reference machine:** the long measurements, meaning the 2-minute
  Edit-point Playback, the 60 s two-Track run, and any spec tagged slow (`pnpm test:e2e:slow`).
