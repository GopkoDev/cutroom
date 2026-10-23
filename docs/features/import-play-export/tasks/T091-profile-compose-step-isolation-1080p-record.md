---
id: T091
title: "Profile the compose step in isolation at 1080p and record the per-Frame budget, so later Effects work has a…"
layer: "tests"
deps: []
blocks: []
acs: []
files_hint: ["docs/features/import-play-export/_evidence/performance-baseline.md"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T091 — Profile the compose step in isolation at 1080p and record the per-Frame budget, so later Effects work has a…

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 6 — Polish & Cross-Cutting Concerns (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 6 (Polish & Cross-Cutting Concerns) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T091 [P] Profile the compose step in isolation at 1080p and record the per-Frame budget, so later Effects work has a baseline (plan risk table) — **done**: `renderScene` profiled in isolation at 1080p with 1, 2, 4 and 8 stacked full-frame Clips, compose-only and through the full decode-to-GPU pipeline, on the T071 fixture and a 23 Mbps long-GOP file (Apple M4, Chrome 156, WebGL 2; no overlapping runs). CPU time in the compositor is negligible (`renderScene` < 0.7 ms p99 with 8 Clips); the per-Frame cost is GPU work that scales with Clip count, mostly the canvas-to-texture upload (≈1 ms per 1080p layer pre-decoded, 1.5–2 ms in the real pipeline). Full Frame p99: 1 Clip 5–7 ms, 2 ≈ 9.5 ms, 4 ≈ 13 ms, 8 Clips 23–34 ms — so at 30 fps about 20 ms is left with 4 Clips and 0–10 ms with 8, and at 60 fps 4 Clips leave about 4 ms and 8 do not fit. This is the baseline for Effects work; Effects, smaller placements and 4K frame sizes were not measured. Evidence: `performance-baseline.md`
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T091, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Profile the compose step in isolation at 1080p and record the per-Frame budget, so later Effects work has a baseline (plan risk table)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 6, commits a49c7f8).
- [x] Delivered in Spec Kit Phase 6 (Polish & Cross-Cutting Concerns), commits a49c7f8
