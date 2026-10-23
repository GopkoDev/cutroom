---
id: T035
title: "Implement the unsupported-browser gate in `apps/editor/src/ui/CapabilityGate.tsx`"
layer: "ui"
deps: []
blocks: ["T038", "T048"]
acs: ["AC-39"]
files_hint: ["apps/editor/src/ui/CapabilityGate.tsx"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T035 — Implement the unsupported-browser gate in `apps/editor/src/ui/CapabilityGate.tsx`

## Place in the sequence

- **Blocked by:** — · **Blocks:** T038, T048 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

> **As a** user
> **I want** to be told on arrival when my browser cannot run the product
> **So that** I never meet a broken editor halfway through my work
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers: Implement the unsupported-browser gate in `apps/editor/src/ui/CapabilityGate.tsx`.

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T035 Implement the unsupported-browser gate in `apps/editor/src/ui/CapabilityGate.tsx`: detect the absence of `showOpenFilePicker`, `OffscreenCanvas` or WebCodecs on arrival and state it plainly (FR-023) — **done**, and the list is shorter and different from the one this line names, because ADR 0006 is specific about what is genuinely depended on. `FileSystemHandle.prototype.queryPermission` is checked **for itself**: it is the capability the ADR calls structurally absent elsewhere, and a browser can offer `showOpenFilePicker` while having no way to ask whether a *stored* handle may still be read — without which every Project reopens Offline for ever, one session after the one that caused it. `AudioEncoder` is deliberately **not** checked, because FR-024 already has a considered answer for a machine that cannot encode sound and gating arrival on it would refuse a browser the product knows what to do with. `transferControlToOffscreen` is checked as a method rather than inferred from `OffscreenCanvas` existing. Codecs are not checked here and could not be — `canEncode` is asynchronous and per codec, and that answer belongs to the engine's `ready` message where the export dialog can use it (Principle I). Every check is synchronous and runs during render, so an unsupported browser never sees a flash of an editor that was never going to work, and the gate renders its children only when the list is empty. Proved by taking capabilities away from Chrome: each one is an own, configurable property of the global object, measured rather than assumed
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T035, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-39 — error

> **Given** a browser that lacks something the product cannot work without — picking a file, remembering that permission across sessions, compositing off the main thread, or decoding video
> **When** the user arrives
> **Then** the user is told so plainly on arrival, rather than failing later during use. Encoding is deliberately not among the checks, because AC-27 already handles a machine that cannot encode sound
>
> — `spec.md §5, AC-39, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [x] Implement the unsupported-browser gate in `apps/editor/src/ui/CapabilityGate.tsx`: detect the absence of `showOpenFilePicker`, `OffscreenCanvas` or WebCodecs on arrival and state it plainly (FR-023)

## Edge cases

| Case | Behaviour |
|---|---|
| the user arrives | the user is told so plainly on arrival, rather than failing later during use. Encoding is deliberately not among the checks, because AC-27 already handles a machine that cannot encode sound |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
