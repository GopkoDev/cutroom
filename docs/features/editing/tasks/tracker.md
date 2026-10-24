# Tracker — editing

> Status of every task in the epic. `implement` updates **Status** and **Step** after every
> subagent it runs (and commits them with the task), so this table shows where the run is right now.
> Status: `todo` · `in_progress` · `blocked` · `review` · `done`.
> Step: `SELECT` · `RED` · `GREEN` · `REFACTOR` · `GATE` · `REVIEW` · `COMMIT` (`—` before the task starts).
> A `blocked` row carries its reason in Step, e.g. `GATE — lint red after 3 retries`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status | Step |
|---|---|---|---|---|---|---|---|
| T001 | Diagnose and fix the flaky engine-worker e2e check before any feature work | tests | Dmytro Hopko | M | — | done | COMMIT |
| T002 | Give CommandError a machine-readable refusal reason across every existing refusal | domain | Dmytro Hopko | S | — | done | COMMIT |
| T003 | Refuse Clips outside their Source and a Timeline with no Track when a Project loads | domain | Dmytro Hopko | S | — | done | COMMIT |
| T004 | Add wholeFramesIn, the trimRange rule and the trim-clip command | domain | Dmytro Hopko | M | T002 | done | COMMIT |
| T005 | Add the splitTargets rule and the split-clips command | domain | Dmytro Hopko | S | T004 | done | COMMIT |
| T006 | Add the checkMove placement rule and the move-clips command | domain | Dmytro Hopko | M | T005 | done | COMMIT |
| T007 | Add the rippleShifts rule and the delete-clips command, plain and ripple | domain | Dmytro Hopko | S | T006 | done | COMMIT |
| T008 | Add the duplicateDelta rule and the duplicate-clips command | domain | Dmytro Hopko | S | T007 | done | COMMIT |
| T009 | Add the add-track and remove-track commands with the two-Track limit | domain | Dmytro Hopko | S | T008 | done | COMMIT |
| T010 | Add placeSourceCommand and make importCommands reuse it | domain | Dmytro Hopko | S | T009 | done | COMMIT |
| T011 | Pin Frame accuracy and rule-command pairing with model property tests | tests | Dmytro Hopko | M | T010, T003 | done | COMMIT |
| T012 | Cap history at 200 named steps and add the Selection, pruned after undo and redo | app | Dmytro Hopko | M | — | done | COMMIT |
| T013 | Add the drag-preview slice and retire the open-Gesture save debounce | app | Dmytro Hopko | M | T012, T010 | done | COMMIT |
| T014 | Write one store function per Gesture, stopping Playback first, with refusal wording | app | Dmytro Hopko | M | T013 | done | COMMIT |
| T015 | Mix every Clip through one limiter with its measured delay, in Playback and Export | app | Dmytro Hopko | L | — | done | COMMIT |
| T016 | Rebuild the Timeline as Track rows of selectable Clip views with Track headers | ui | Dmytro Hopko | M | T014, T001 | done | COMMIT |
| T017 | Drive Trim and move drags from Clip handles and bodies through the drag slice | ui | Dmytro Hopko | M | T016 | done | COMMIT |
| T018 | Add the edit toolbar, named Undo and Redo, keyboard shortcuts and the Place action | ui | Dmytro Hopko | M | T017 | done | COMMIT |
| T019 | Prove the edited Export matches the Preview at every Edit point, with both sounds mixed | tests | Dmytro Hopko | M | T018, T015 | done | COMMIT |
| T020 | Measure the drag, Preview, undo and two-Track playback budgets on a heavy Project | tests | Dmytro Hopko | M | T019 | todo | — |

**Total:** 20 tasks, ~16.5 person-days.
