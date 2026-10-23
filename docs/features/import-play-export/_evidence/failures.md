# Failures the user can hit (T093)

> **Migrated record.** This is the Spec Kit file `specs/001-import-play-export/failures.md`, moved unchanged into SDD's feature folder as supporting evidence (the T093 failure inventory). References inside it to other Spec Kit files mean those files as they stood at `a49c7f8`. Where its content lives now: Spec Kit `spec.md` FR-/SC- ids → [spec.md](../spec.md) §5 traceability table and §6; `plan.md` and `research.md` → [sad.md](../sad.md); `decisions.md` → spec §1 and sad.md §4/§8/§11; `tasks.md` → [tasks/](../tasks/_epic.md) (task ids unchanged); `quickstart.md` and `validation.md` → [_evidence/](../_evidence/quickstart.md); `.specify/memory/constitution.md` → [docs/constitution.md](../../../constitution.md).

Every way this slice can fail in front of the user, what they are told, what they are offered, and
the test that holds it there. The rule each row follows (Principle V; spec edge cases; FR-003,
FR-018, FR-020–FR-024):

- **A plain statement first**, in the product's terms — Source, Clip, Project, Timeline; never
  "media" — naming what happened, not the exception that said so.
- **The action that helps, beside it**, when there is one: Relink (*Allow access*, *Find the
  file…*), *Try again*, *Choose another name…*, *Choose another file…*, *Reload*.
- **The technical detail last, folded under "Details"** — the platform's or the engine's own words,
  kept for a bug report, never the first thing read, never `[object Object]`
  (`technicalDetail` in `apps/editor/src/ui/failure-wording.ts`).
- **Nothing silent.** A failure that only reached the console before T093 is now on screen.

Every failure is rendered by one component, `apps/editor/src/ui/Notice.tsx` (`data-testid` = the id
in the table, `<id>-title`, `<id>-details`), in red for something that did not happen and amber for
a state that needs attention (an Offline Source is a normal state, not an error — Principle V). The
words for storage, files and exports come from `failure-wording.ts`, unit-tested on their own.

"Changed in T093" marks a row whose wording, placement or action was changed here; the rest were
already plain and are recorded so the inventory is whole.

## Arrival

| Failure | Trigger | What the user sees | Action | Covered by |
| --- | --- | --- | --- | --- |
| Unsupported browser | A capability FR-023 names is missing (`showOpenFilePicker`, `queryPermission`, `transferControlToOffscreen`, WebCodecs decode, …) | `capability-gate`: "Cutroom cannot run in this browser", what is missing and what each is for; the editor is not rendered | Use Chrome or Edge on the desktop (stated) | `capability-gate.spec.ts`, `capability-check.test.ts` |
| Insecure context | Served over plain `http` from anywhere but `localhost` | `capability-insecure`: "This page is not being served over a secure connection…" | Open over `https://` or `localhost` (stated) | `capability-check.test.ts` |

## The Project list and storage

| Failure | Trigger | What the user sees | Action | Covered by |
| --- | --- | --- | --- | --- |
| Storage cannot be opened | IndexedDB `open` throws or errors (profile damage, storage disabled) | `project-list-failed`: "Your Projects could not be read from this browser's storage." + why (`storageProblem`), Details. **Changed in T093**: was the title followed by the raw message, no action | *Try again* (lists again), *Reload* | `failures-are-legible.spec.ts` "storage that cannot be opened…" |
| Storage held by another tab | IndexedDB `blocked`: an older Cutroom tab holds the database during an upgrade | `storage-blocked` (amber): "Your Projects cannot be opened while another Cutroom tab is open." + "close every other Cutroom tab… Nothing has been lost." **Changed in T093**: was a `console.warn` and an endless "Looking for your Projects…" | *Reload* | `storage/db.test.ts`. Unreachable in this build (database version 1 has nothing to upgrade from); wired for the first upgrade |
| A Project saved by a newer Cutroom | `schemaVersion` above this build's | The row is listed, disabled, `project-row-unopenable`: "Saved by a newer version of Cutroom (schema version N). This build cannot open it, and your work is still here." | None possible in this build (stated that nothing is lost) | `project-list.spec.ts`, `reopen-and-relink.spec.ts` |
| A Project that cannot be opened | `migrateProject` refuses the stored document (damaged) | `open-failure`: "*Name* could not be opened." + "What is saved for it is damaged, or was written in a way this version of Cutroom does not understand. It has been left exactly as it is.", Details = the model's reason. **Changed in T093**: was "The Project stored as *uuid* could not be opened. migrateProject: …" | None possible; the list stays usable | `failures-are-legible.spec.ts` "a Project that cannot be opened…", `store/index.test.ts` |
| A Project gone from storage | Deleted in another tab, or site data cleared, after the list was drawn | `open-failure`: "*Name* is no longer in this browser's storage." + where it may have gone. **Changed in T093**: now names the Project | — (the list is the next step) | `project-list.spec.ts`, `store/index.test.ts` |
| Opening a Project hits a storage error | IndexedDB fails during `loadProject` | `open-failure`: "*Name* could not be opened." + `storageProblem` + "Try again.", Details | Click the row again (stated) | `store/index.test.ts` (wording via `failure-wording.test.ts`) |
| A save fails | IndexedDB refuses the write (quota, storage gone) | `save-failure` across the top of the editor: "Your latest changes could not be saved." + why + "Your edits are still here in this tab… closing or reloading this tab would lose them, so the way back to Projects stays closed." Details. The page asks before unloading. **Changed in T093**: was `console.error` only — the user found out after a reload | *Try again* (writes again; the notice goes once a write lands, and any later edit retries too). *Projects* is disabled meanwhile | `failures-are-legible.spec.ts` "a save that fails…", `store/index.test.ts` |

## Importing (FR-001–FR-005)

| Failure | Trigger | What the user sees | Action | Covered by |
| --- | --- | --- | --- | --- |
| The file cannot be decoded (FR-003) | `broken.mp4`, `audio-only.m4a`, `still.png`, an unsupported codec: the engine's `source-failed` | `import-refusal`: "*file* cannot be used." + the engine's reason (it names the file and what is wrong) + "Nothing was added to the Project." Project unchanged. **Changed in T093**: action added, shared `Notice` | *Choose another file…* | `refuses-unusable-files.spec.ts`, `import-source.test.ts` |
| The file cannot be read at all | `getFile()` on the picked handle throws (`NotAllowedError`, `NotFoundError`, `NotReadableError`) | `import-refusal`: "*file* cannot be used." + `fileProblem` (e.g. "The browser did not give Cutroom permission to read it."), Details. **Changed in T093**: was "It could not be read. *raw message*" | *Choose another file…* | `import-source.test.ts` |
| A Source too short for one Frame | The model's `importCommands` refuses | `import-refusal`: "It cannot be placed on the Timeline: "*file*" is too short to cover a single Frame." Details = `CommandError: importCommands: …`. **Changed in T093**: the function name no longer leads | *Choose another file…* | `import-source.test.ts` |
| The handle cannot be remembered | The link-table write fails | `import-refusal`: "Cutroom could not remember where this file is, so it would be lost on reload." + `storageProblem`, Details | *Choose another file…* | `import-source.test.ts` |
| The file picker fails | `showOpenFilePicker` throws (lost gesture, picker unavailable) | `import-picker-failed`: "The file picker could not be opened." + "Nothing was imported.", Details. **Changed in T093**: was shown as "The file cannot be used. *raw*", blaming a file nobody picked | *Try again* | `failures-are-legible.spec.ts` "an import whose picker fails…" |
| The engine stopped during an import | `fatal` while `attach-source` is in flight | `import-failed`: "*file* was not imported." + "Cutroom's engine has stopped, so the file could not be read. Reload the page, then import it again.", Details. **Changed in T093**: was "*file* cannot be used. The Cutroom engine stopped: …" | *Reload*; *Import…* is disabled while the engine is stopped | `store/engine-fatal.test.ts`, `import-source.test.ts` |

## Sources Offline and Relink (FR-021, FR-022)

Offline is a state, not an error (Principle V): amber, beside the Preview, the Timeline untouched.

| Failure | Trigger | What the user sees | Action | Covered by |
| --- | --- | --- | --- | --- |
| Permission lapsed (every Source after a reload) | `queryPermission` is not `granted` | `relink-source`: "*Source* is Offline. The browser needs your permission to read it again. Its Clips stay on the Timeline and show nothing until it is back." | *Allow access*, *Find the file…* | `reopen-and-relink.spec.ts`, `import-smoke.spec.ts`, `source-status.test.ts` |
| Never linked in this browser | No handle in the link table | "…This browser has never been told where the file is." | *Find the file…* | `source-links.spec.ts`, `source-status.test.ts` |
| Moved, renamed or deleted (mid-session too) | `getFile()` throws, or the file there has a different size | "…The file is no longer where it was.", Details = the platform's words or the sizes. **Changed in T093**: the raw detail was inline after a dash | *Find the file…* | `source-vanishes-mid-session.spec.ts`, `import-smoke.spec.ts`, `failures-are-legible.spec.ts` (Offline at export), `source-status.test.ts` |
| The file is there but unreadable | The engine refuses the re-attach | "…The file is there, but it could not be read as this Source.", Details = the engine's reason. **Changed in T093**: was "The file could not be read — *reason*." | *Find the file…* | `source-status.test.ts` |
| A status check fails | Storage throws while looking up the handle | A Source with no status yet goes Offline: "…The file is no longer where it was.", Details "Cutroom could not look up where its file is: …". A Source that already had a status keeps it. **Changed in T093**: was `console.error` and "Checking…" for ever | *Find the file…* | `source-status.test.ts` |
| Permission refused | The user answers the prompt with Block | `relink-failure`: "Access was not granted, so the Source stays Offline." | *Allow access* again, *Find the file…* | `import-smoke.spec.ts`, `relink.test.ts` |
| The permission prompt could not be shown | `requestPermission` throws (no user activation) | "The browser did not ask for permission. Click Allow access again.", Details. **Changed in T093**: was the raw exception message | *Allow access* | `relink.test.ts` |
| Access granted, file gone | Granted, then the handle no longer reads | "Access was granted, but the file is no longer where it was. Find it instead.", Details. **Changed in T093**: the platform's words used to replace this sentence | *Find the file…* | `relink.test.ts` |
| Relink to a different file | The picked file's size differs from the Source's fingerprint | "That is not the same file: it is X bytes, and *Source* was Y bytes." Nothing changes | *Find the file…* again | `source-links.spec.ts`, `relink.test.ts` |
| Relink to an unreadable file | `getFile()` on the picked handle throws | "That file could not be used for *Source*. " + `fileProblem`, Details. **Changed in T093** | *Find the file…* again | `relink.test.ts` |
| Relink: matches, but the engine refuses it | `attach-source` answers `source-failed` | "The file matches *Source*, but it could not be read. Its Clips stay as they are.", Details = the engine's reason. **Changed in T093** | *Find the file…* again | `relink.test.ts` |
| Relink: the picker fails | `showOpenFilePicker` throws | "The file picker could not be opened. Click Find the file… again.", Details. **Changed in T093** | *Find the file…* | Wording only; the same path as the import picker in `failures-are-legible.spec.ts` |

## The engine

| Failure | Trigger | What the user sees | Action | Covered by |
| --- | --- | --- | --- | --- |
| Worker `fatal` | The worker reports `fatal`, or dies without a word (`error` event): a lost GPU context, a protocol violation, a crash | `engine-fatal` in the Preview's place: "Cutroom's engine stopped." + "The Preview, playback, importing and exporting all need it, so they are unavailable until the page is reloaded. The Timeline and its Clips are untouched." + `engine-fatal-saved`: "Your Project is saved, so reloading loses nothing." — said only after the saver has been flushed; if the save failed it says so instead. Details = the worker's reason and stack. *Import…*, *Play* and *Export…* are disabled; the status line says "engine stopped". **Changed in T093**: was "The engine stopped and the Preview is no longer live. *reason*", nothing about the Project, no action, and Import still enabled (it then blamed the file) | *Reload* | `failures-are-legible.spec.ts` "a stopped engine…" (real worker, sent a message it does not have), `store/engine-fatal.test.ts` (client over a fake worker → store), `engine-client/index.test.ts`, `engine-worker.spec.ts` |
| The Preview cannot be handed to the engine | `transferControlToOffscreen` throws | Same notice, with that reason in Details | *Reload* | Not reproducible in a supported browser (the double-transfer is handled, T036); same rendering path as the row above |

## Exporting (FR-015–FR-019, FR-024)

| Failure | Trigger | What the user sees | Action | Covered by |
| --- | --- | --- | --- | --- |
| A quality the machine cannot encode | `isConfigSupported` says no for that bitrate and size | Listed, disabled: "— unavailable: this machine cannot encode it at this frame size" | Another quality | `export-settings.test.ts` |
| No sound encoder (FR-024) | No AAC or Opus encoder | `export-no-sound-warning` (amber): "The Timeline has sound, and this machine has no encoder that can write it…"; *Export* stays disabled until chosen | *Export without sound* | `export-settings.test.ts`, `capability-gate.spec.ts` |
| Sources Offline at export | Any Source Offline when the dialog opens | `export-offline-warning`: "*Source* is Offline: its Clips will be exported as the Preview shows them, empty." | Relink first, or export anyway | `failures-are-legible.spec.ts` "an export over an Offline Source…" |
| The encoder probe fails | `probeExportOffer` rejects | `export-probe-failed`: "Cutroom could not ask this machine what it can encode." + "Without that answer no export settings can be offered.", Details. **Changed in T093**: was one line with the raw message, no action | *Try again* | Defensive: each question already reads a rejection as "no" (`export-settings.test.ts`), so this needs a bug to reach |
| Saving over a Source | The destination is a Source's own file (`isSameEntry`) | `export-refused`: "Not exported: *file* is the file the Source *Source* reads from." + "Saving over it would destroy that Source. Nothing was written to it." **Changed in T093**: action button added | *Choose another name…* (opens the save dialog with the same settings) | `export-refuses-a-source.spec.ts`, `export.test.ts` |
| The save dialog fails | `showSaveFilePicker` throws | `export-failed` (`data-stage="choosing"`): "The save dialog could not be opened." + "Nothing was exported. Try again." + "No file was written." **Changed in T093**: was "The export failed: The destination could not be chosen. *raw*" | *Try again* | `failures-are-legible.spec.ts` "a save dialog that fails…", `export.test.ts` |
| The destination cannot be opened | `createWritable()` throws (`NotAllowedError`, …) | `export-failed` (`opening`): "*file* could not be opened for writing." (or "Cutroom was not allowed to write to *file*.") + "Choose another name or another place…" **Changed in T093** | *Choose another name…* | `export.test.ts`, `failure-wording.test.ts` |
| The destination fills up or becomes unwritable mid-export (spec edge case) | A write fails on the main thread (`QuotaExceededError`, `NotAllowedError`) | `export-failed` (`running`): "There was not enough space to save the file." + "Free up some space, or save it somewhere else." + what became of the file ("No file was left at *file*."). Details = the platform's error, then the engine's symptom. No partial file (FR-018). **Changed in T093**: the engine only sees "Cannot close a ERRORED writable stream"; the controller now keeps the platform's error from the destination and words the failure by it | *Choose another name…* | `failures-are-legible.spec.ts` "an export whose destination fills up…", `export.test.ts` |
| The commit fails | The file stream's `close()` rejects after `export-done` | `export-failed` (`committing`): "There was not enough space…" / "The finished file could not be saved to *file*." Never shown as done | *Try again* / *Choose another name…* | `export.test.ts` |
| A Source goes Offline or is relinked mid-export | The engine's `export-failed` "the media of Clip … went offline or was relinked…" | "A Source went Offline or was relinked while the export ran." + "The rest of the file would no longer have matched the Timeline. Once every Source is back, export again." **Changed in T093**: the engine's words (which say "media") are now only in Details | *Try again* | `failure-wording.test.ts`; engine half: T083's checks |
| The encoder or muxer fails | Any other `export-failed` | "Something went wrong while the file was being made." + "Try again. If it keeps happening, the Details say what went wrong." **Changed in T093**: was "The export failed: *raw reason*" | *Try again* | `export.test.ts`, `failure-wording.test.ts` |
| The sound mix fails | `streamExportAudio` rejects; the export is cancelled rather than finished silent (FR-024) | `export-failed` (`mixing`): "The sound could not be mixed." + "The export was stopped rather than finished without the sound it was started with." | *Try again* | `export.test.ts` |
| The engine stops mid-export | `fatal` while exporting | `export-failed`: "The export stopped because Cutroom's engine stopped." + "Reload the page…"; the Preview shows the engine notice | *Reload* | `export.test.ts`, `failure-wording.test.ts` |
| A partial file that cannot be removed | `remove()` fails after an ending short of done | The ending says "*file* is unfinished and could not be removed. It is not a finished export — delete it." | Delete it (stated) | `export.test.ts` |
| Cancelled | The user cancels | `export-cancelled`: "Export cancelled." + what became of the file | — | `export-cancel.spec.ts` |
| No save dialog in this browser | `showSaveFilePicker` missing | "This browser cannot choose where to save a file."; *Export* disabled | — | The capability gate refuses such a browser on arrival (`capability-gate.spec.ts`); defence in depth |

*Try again* after an export failure opens the save dialog straight away with the settings the
failed export used — unless the Timeline has gained or lost sound since, when it goes back to the
settings so FR-024's question is asked again.

## Known gaps and notes

- **Engine wording.** The engine's `export-failed` reason for a Source lost mid-export says "media of
  Clip *id*", against CONTEXT.md; it is now shown only under Details, behind the editor's own
  sentence, and the engine file was not edited (another agent is working there). Worth rewording
  at the source when that work lands.
- **Engine read failures** (`source-failed` reasons) end in a parenthesised platform message, e.g.
  "could not be read — it may be damaged or incomplete (NotReadableError: …)". They are shown as the
  engine writes them, since they already name the file and the problem in words.
- **Playback** has no failure of its own that reaches the user: an `AudioContext` that will not
  resume is retried by the next Play; a decoding problem is a `fatal` (above) or an Offline Source.
