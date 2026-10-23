---
id: T095
title: "Write `README.md` at the root"
layer: "docs"
deps: []
blocks: []
acs: []
files_hint: ["README.md"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T095 — Write `README.md` at the root

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 6 — Polish & Cross-Cutting Concerns (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 6 (Polish & Cross-Cutting Concerns) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T095 [P] Write `README.md` at the root: what the product is, the Chromium-only position and why, how to run, and how to run the two test tiers — **done**: rewritten, keeping Layout, Reading order and Non-obvious constraints: what the slice does (import, Frame-accurate scrub, playback with sound in sync, MP4 export, auto-save and Relink), "Chrome and Edge only" and why (ADR 0006), running (Node 22+, `pnpm install`, `pnpm fixtures` with host ffmpeg, `pnpm dev`) and testing — `pnpm test` (model and editor), `pnpm test:e2e` (Chrome channel; reuses a server on 5173, `CUTROOM_E2E_PORT` forces a fresh one; `export-duration.spec.ts` needs host ffmpeg/ffprobe), `pnpm test:e2e:slow` (the two ten-minute measurements, always on a fresh server), `pnpm typecheck`, `pnpm lint`. Every command was run
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T095, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Write `README.md` at the root: what the product is, the Chromium-only position and why, how to run, and how to run the two test tiers

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 6, commits a49c7f8).
- [x] Delivered in Spec Kit Phase 6 (Polish & Cross-Cutting Concerns), commits a49c7f8
