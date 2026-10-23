---
id: T013
title: "Write `scripts/make-fixtures.ts` producing the fixtures listed in quickstart.md (`sync-1080p30.mp4`,…"
layer: "tests"
deps: []
blocks: ["T053", "T054", "T055", "T056", "T057", "T058", "T069", "T070", "T071", "T072", "T085", "T086", "T087", "T088", "T089"]
acs: []
files_hint: ["scripts/make-fixtures.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T013 — Write `scripts/make-fixtures.ts` producing the fixtures listed in quickstart.md (`sync-1080p30.mp4`,…

## Place in the sequence

- **Blocked by:** — · **Blocks:** T053, T054, T055, T056, T057, T058, T069, T070, T071, T072, T085, T086, T087, T088, T089 · **Wave:** Spec Kit Phase 1 — Setup (Shared Infrastructure) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 1 (Setup (Shared Infrastructure)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T013 Write `scripts/make-fixtures.ts` producing the fixtures listed in quickstart.md (`sync-1080p30.mp4`, `sync-1080p2997.mp4`, `sync-1080p30-10min.mp4`, `silent-720p24.mp4`, `long-1080p30-70min.mp4`, `audio-only.m4a`, `still.png`, `broken.mp4`) into `packages/engine/test/fixtures/`, each moving fixture carrying a visible frame counter and a click on every whole second. The output is gitignored, not committed: the script is deterministic, so the fixtures are regenerated rather than carried in history. Two of them exist to make a claim testable that otherwise is not — `sync-1080p30-10min.mp4` is the only way SC-002's ten minutes can be played as the single Clip this slice allows, and `long-1080p30-70min.mp4` is the over-an-hour Source the import edge case names. `audio-only.m4a` and `still.png` must both be refused (T040, T054). Run this before any Playwright work: it blocks every e2e task in Phases 3–5 — **done**. It shells out to the ffmpeg CLI rather than using Mediabunny: Mediabunny encodes through WebCodecs and Node has none, so the only way to keep the muxing library would have been to generate fixtures inside a browser — a Playwright dependency for the task that blocks Playwright. The counter is drawn from a bitmap sprite cropped per Frame by ffmpeg's frame-number variable, because this ffmpeg build has no `drawtext` (no libfreetype). All eight build from empty in about four and a half minutes and occupy 36 MB, of which the seventy-minute file is 32
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T013, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Write `scripts/make-fixtures.ts` producing the fixtures listed in quickstart.md (`sync-1080p30.mp4`, `sync-1080p2997.mp4`, `sync-1080p30-10min.mp4`, `silent-720p24.mp4`, `long-1080p30-70min.mp4`, `audio-only.m4a`, `still.png`, `broken.mp4`) into `packages/engine/test/fixtures/`, each moving fixture carrying a visible frame counter and a click on every whole second. The output is gitignored, not committed: the script is deterministic, so the fixtures are regenerated rather than carried in history. Two of them exist to make a claim testable that otherwise is not — `sync-1080p30-10min.mp4` is the only way SC-002's ten minutes can be played as the single Clip this slice allows, and `long-1080p30-70min.mp4` is the over-an-hour Source the import edge case names. `audio-only.m4a` and `still.png` must both be refused (T040, T054). Run this before any Playwright work: it blocks every e2e task in Phases 3–5

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 1, commits 35a3596, f554804, 78604a6, d8af2fe, 565b695).
- [x] Delivered in Spec Kit Phase 1 (Setup (Shared Infrastructure)), commits 35a3596, f554804, 78604a6, d8af2fe, 565b695
