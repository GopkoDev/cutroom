---
id: T073
title: "Build the export dialog in `apps/editor/src/ui/ExportDialog.tsx`"
layer: "ui"
deps: ["T032"]
blocks: []
acs: ["AC-22", "AC-23"]
files_hint: ["apps/editor/src/ui/ExportDialog.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T073 — Build the export dialog in `apps/editor/src/ui/ExportDialog.tsx`

## Place in the sequence

- **Blocked by:** T032 · **Blocks:** — · **Wave:** Spec Kit Phase 5 — User Story 3 — Export a finished file (Priority: P3) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to ask for an Export, choose where the file goes, watch its progress and be able to cancel it
> **So that** I receive an MP4 of the whole Timeline whose picture and sound match what I saw and heard while editing
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Build the export dialog in `apps/editor/src/ui/ExportDialog.tsx`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T073 [US3] Build the export dialog in `apps/editor/src/ui/ExportDialog.tsx`. The choices are fixed and small, as the spec's assumptions set them: MP4/H.264 at the Project's frame size and Timebase, in three qualities — High, Standard, Draft, which at 1080p mean 16, 8 and 4 Mbps and scale by pixel count for other sizes — plus one audio setting at 192 kbps stereo. Standard is preselected. Each is offered only if `canEncodeVideo` with those exact parameters says yes at the moment the dialog opens, and a quality the machine cannot produce is stated as unavailable rather than hidden, so the user learns why (FR-017, research R5) — **done**: `ExportDialog.tsx` over the pure `export-settings.ts`. Bitrate is 16/8/4 Mbps × pixels ÷ (1920×1080), rounded to whole bits per second. Each quality is probed **every time the dialog opens**, at its exact bitrate and the Project's real frame size: the `ready` probe cannot answer this, because it runs before any Project exists (the shell's 1920×1080 placeholder, Mediabunny's default bitrate) and encoders refuse particular sizes and bitrates rather than codec names. The probe runs on the main thread through `VideoEncoder`/`AudioEncoder.isConfigSupported`, which fits Principle I — the browser is asked at that moment, nothing is hard-coded, nothing renders on the main thread, and WebCodecs is one implementation in a window and a worker — at the cost of mirroring Mediabunny's encoder config (H.264 High at the lowest level that fits, VBR, `avc` framing, odd sizes refused); if the two ever disagree the user gets `export-failed`, never a broken file, and a `probe-export` engine message would be the better long-term home. Unavailable qualities are listed, disabled, with the reason; Standard is preselected, falling back to Draft then High. Sound is AAC-LC 192 kbps stereo at 48 kHz, with 44.1 kHz and then Opus tried before declaring there is no sound encoder (see decisions.md on the sample rate)
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T073, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-22 — happy

> **Given** the user opens Export on a Project
> **When** the export choices are shown
> **Then** three qualities are offered and no more — High, Standard and Draft, scaled to the Project's frame size (at 1080p 16, 8 and 4 Mbps, scaled by pixel count for other sizes) — with Standard preselected and one sound setting (192 kbps stereo), at the Project's frame size and Timebase
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — domain invariant

> **Given** a machine that cannot produce some combination of format and quality
> **When** the user opens Export
> **Then** only the combinations this machine can actually produce are offered, determined at the moment of asking rather than assumed
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Build the export dialog in `apps/editor/src/ui/ExportDialog.tsx`. The choices are fixed and small, as the spec's assumptions set them: MP4/H.264 at the Project's frame size and Timebase, in three qualities — High, Standard, Draft, which at 1080p mean 16, 8 and 4 Mbps and scale by pixel count for other sizes — plus one audio setting at 192 kbps stereo. Standard is preselected. Each is offered only if `canEncodeVideo` with those exact parameters says yes at the moment the dialog opens, and a quality the machine cannot produce is stated as unavailable rather than hidden, so the user learns why (FR-017, research R5)

## Edge cases

| Case | Behaviour |
|---|---|
| the user opens Export | only the combinations this machine can actually produce are offered, determined at the moment of asking rather than assumed |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 5, commits 34d6197).
- [x] Delivered in Spec Kit Phase 5 (User Story 3 — Export a finished file (Priority: P3)), commits 34d6197
