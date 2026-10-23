---
id: T012
title: "Configure Playwright in `apps/editor/e2e/` to run against Chromium only, with permissions for the File System…"
layer: "tests"
deps: []
blocks: []
acs: []
files_hint: ["apps/editor/playwright.config.ts", "apps/editor/e2e/harness.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T012 — Configure Playwright in `apps/editor/e2e/` to run against Chromium only, with permissions for the File System…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 1 — Setup (Shared Infrastructure) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 1 (Setup (Shared Infrastructure)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T012 [P] Configure Playwright in `apps/editor/e2e/` to run against Chromium only, with permissions for the File System Access API pre-granted where possible — **done**, with a finding: nothing can be pre-granted. `grantPermissions` accepts only storage-access and the two clipboard names, CDP `Browser.setPermission` rejects every File System Access spelling as an invalid permission descriptor, and `showOpenFilePicker` opens a native dialog Playwright cannot drive — no `filechooser` event fires and the promise never settles, headed or headless. So T053–T058 will have to substitute `showOpenFilePicker` through `addInitScript`; that is recorded in `playwright.config.ts` so it is discovered once. The single project is `channel: "chrome"` rather than the bundled Chromium, because quickstart.md measures SC-004 and SC-005 against Chrome 150 specifically. `e2e/harness.spec.ts` is the smoke test: the dev server answers, and the browser it launches really has the file picker, an OffscreenCanvas, WebCodecs and H.264 decoding
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T012, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

None — infrastructure, measurement or documentation task; no spec §5 criterion is satisfied by it alone (the Spec Kit breakdown tied it to no FR or acceptance scenario).

## Checklist

- [x] Configure Playwright in `apps/editor/e2e/` to run against Chromium only, with permissions for the File System Access API pre-granted where possible

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 1, commits 35a3596, f554804, 78604a6, d8af2fe, 565b695).
- [x] Delivered in Spec Kit Phase 1 (Setup (Shared Infrastructure)), commits 35a3596, f554804, 78604a6, d8af2fe, 565b695
