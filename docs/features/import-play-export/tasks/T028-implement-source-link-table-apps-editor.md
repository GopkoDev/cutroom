---
id: T028
title: "Implement the Source link table in `apps/editor/src/storage/source-links.ts`"
layer: "infra"
deps: []
blocks: []
acs: ["AC-08", "AC-33", "AC-35"]
files_hint: ["apps/editor/src/storage/source-links.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "M"
status: "done"
step: ""
---

# T028 — Implement the Source link table in `apps/editor/src/storage/source-links.ts`

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to pick a video file from my own machine and immediately see it — as a Source in the Source list, as a Clip covering the whole file on the Timeline, and as a picture in the Preview at the Playhead
> **So that** I can inspect my own footage Frame by Frame, moving the Playhead along the Timeline to see the corresponding Frame
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** user
> **I want** my Project kept between sessions without being asked to save, listed so I can reopen it, and its Sources reattached — or shown as Offline with a way to Relink them
> **So that** closing the tab, reloading or moving a file never costs me the Timeline I built
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the Source link table in `apps/editor/src/storage/source-links.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T028 Implement the Source link table in `apps/editor/src/storage/source-links.ts`: put/get a `FileSystemFileHandle` by sourceId, query permission, request permission behind a user gesture, and verify a relinked file against the stored fingerprint (ADR 0005, FR-021) — **done**. No status is stored beside a handle: the three runtime states are derived on demand, because a stored answer is wrong the instant the user revokes access or moves the file. `querySourceAccess` and `requestSourceAccess` are separate functions rather than one with a flag, and `inspectSourceLink` — the call a Project's load path makes for every Source at once — is built only out of the first, so reopening a Project shows no prompt and does no file I/O at all; an e2e test counts the two calls apart and pins `requested` at zero. Both take the handle rather than a Source id, so the click handler that asks for permission can call it as its first act: an `await` before `requestPermission` is an opportunity for the browser to decide the gesture has expired. A granted permission is not a promise that the file is still there, so `readSourceFile` turns a throwing `getFile` into `offline / unreachable` — that is what stops a Preview showing pictures from a file that no longer exists (quickstart, Persistence step 7), and the row stays in the table so a Relink has somewhere to put its answer. **A Relink verifies `size` and corrects the name and `lastModified`**, which is the only rule under which both of data-model.md's sentences are true at once: it asks that a Relink check the picked file against `Source.fingerprint`, *and* that a Relink may legitimately correct that fingerprint and the name. A renamed file keeps its size and timestamp; a copied one keeps its size and usually gets a new timestamp; demanding both fields match would refuse every copied file — the commonest reason a Source goes Offline — and leave the "may correct its fingerprint" allowance describing something that could never happen, while demanding neither would let a Relink silently bind Clips to different footage. Quickstart's step 5 settles the name half: the file is *renamed* on disk and must still relink, so the name cannot be part of the check, and `Source.fingerprint` does not carry one. The handle is written only on success, so a mistaken pick cannot cost the user the good link they already had, and nothing here touches the `projects` store — asserted by a test that counts it still empty after a full link-and-Relink. Chromium's `queryPermission` / `requestPermission` are declared as optional members of a `SourceFileHandle` interface, since TypeScript's DOM library has neither; a browser without them is told so by name rather than being assumed to mean "granted" (ADR 0006). Tested in `apps/editor/e2e/project-store.spec.ts` and `e2e/source-links.spec.ts` — 14 specs in real Chromium, since Vitest's node environment has no IndexedDB and no structured clone of a file handle. The handles under test come from OPFS, which is only how a test obtains a real handle without a file picker Playwright cannot drive (the app copies nothing into browser storage, ADR 0005). What that leaves genuinely untestable, stated rather than faked: the `prompt` and `denied` permission states, which need a real picker grant to lapse from, and the Project list screen itself, which is T037
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T028, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

Touches the persisted shapes: the Project Document and/or the IndexedDB stores (`projects`, `source-links`). No SQL, no staged migrations (this repository has none).

— `data-model.md §Entities, §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-08 — domain invariant

> **Given** a user importing a video file
> **When** the import completes
> **Then** the Source is addressed where it already lives and its contents are never copied into the product's own storage
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-33 — authorization

> **Given** a reopened Project whose Sources the browser no longer has permission to read
> **When** the Project opens
> **Then** each such Source shows as Offline and says the browser needs the user's permission again; it reattaches only after the user grants access by their own action, with no prompt on load
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)

### AC-35 — domain invariant

> **Given** an Offline Source being relinked
> **When** the user picks a file that is not the same file (a different size from the one recorded)
> **Then** the Relink is refused, and the Source's existing link and its Clips are left as they were
>
> — `spec.md §5, AC-35, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the Source link table in `apps/editor/src/storage/source-links.ts`: put/get a `FileSystemFileHandle` by sourceId, query permission, request permission behind a user gesture, and verify a relinked file against the stored fingerprint (ADR 0005, FR-021)

## Edge cases

| Case | Behaviour |
|---|---|
| the import completes | the Source is addressed where it already lives and its contents are never copied into the product's own storage |
| the Project opens | each such Source shows as Offline and says the browser needs the user's permission again; it reattaches only after the user grants access by their own action, with no prompt on load |
| the user picks a file that is not the same file (a different size from the one recorded) | the Relink is refused, and the Source's existing link and its Clips are left as they were |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
