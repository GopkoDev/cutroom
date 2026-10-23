---
id: T085
title: "Write `apps/editor/e2e/export-fidelity.spec.ts`"
layer: "tests"
deps: ["T013"]
blocks: []
acs: ["AC-21"]
files_hint: ["apps/editor/e2e/export-fidelity.spec.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T085 — Write `apps/editor/e2e/export-fidelity.spec.ts`

## Place in the sequence

- **Blocked by:** T013 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Write `apps/editor/e2e/export-fidelity.spec.ts`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T085 [P] [US3] Write `apps/editor/e2e/export-fidelity.spec.ts`: export, reopen the output with Mediabunny, and compare sampled Frames against Preview renders of the same Frames (SC-007) — **done**: the Project is `sync-1080p30` followed by `sync-1080p2997` in a 30 fps Project, 1800 Frames, exported at Standard (8 Mbps) through the UI and reopened with Mediabunny in the page (its self-contained bundle loaded over Vite's `/@fs/` path, so no re-export and no version written in the specs). The file is 1920×1080 `avc`, 1800 packets, every timestamp on the k/30 grid to within 1e-6. Twelve Frames are sampled — 0, 1, 450, 898, 899, 900, 901, 902, 1110, 1350, 1798, 1799: both ends, both sides of the join, the doubled Source Frame 0 at 900/901, and 1110 → Source Frame 209. **Which Frame**: the export's counter equals the Preview's counter and the model's mapping, floor(30000k/30030). **What it looks like**: compared with the Preview canvas pixel by pixel — whole-picture mean |Δ| ≤ 0.1, PSNR ≥ 45 dB, mean |Δ| inside the counter ≤ 2, ≤ 0.5 % of counter pixels with luma flipped by more than 64. Measured worst (Frame 0, a keyframe) mean 0.010 at 65 dB; the rest 83–99 dB. The limits sit about 10× above the worst measured and at least 5× below a one-digit miss (the neighbouring Frame measured mean 0.50, 27 dB, 5.6 % flipped), so a colour-range error or a scaled picture fails. The counter reader was split into `sampleCounterCells`, `decodeCounter` and `counterRegion` so one reader serves the Preview and decoded Frames. About 14 s
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T085, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-21 — happy

> **Given** a Project with one Clip
> **When** the user exports and chooses where the file goes
> **Then** a single MP4 file is written to the chosen location, containing every Frame of the Timeline and its sound, matching what the Preview showed
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Write `apps/editor/e2e/export-fidelity.spec.ts`: export, reopen the output with Mediabunny, and compare sampled Frames against Preview renders of the same Frames (SC-007)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded: `export-fidelity.spec.ts` is in the suite and passing at the phase checkpoint.
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
