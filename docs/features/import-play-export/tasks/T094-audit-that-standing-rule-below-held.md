---
id: T094
title: "Audit that the standing rule below held"
layer: "docs"
deps: []
blocks: []
acs: []
files_hint: ["docs/adr/", "CONTEXT.md", "docs/features/import-play-export/_review/audit-t094.md"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T094 — Audit that the standing rule below held

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** Spec Kit Phase 6 — Polish & Cross-Cutting Concerns (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** parallel-safe ([P] in the Spec Kit breakdown).

## Why (user story)

No single user story. This is Phase 6 (Polish & Cross-Cutting Concerns) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T094 [P] Audit that the standing rule below held: every decision meeting the ADR bar has an entry in `docs/adr/` that predates the code depending on it, and every domain term the code introduced was already added to `CONTEXT.md` when it was introduced. Anything missing found here is a lapse to record, not a document to write for the first time — the constitution requires both *before* the code lands, so writing them now would be closing the gate after the fact **Lapse recorded so far**: ADR 0011 (saves follow the gesture, writes commit explicitly) was written after the Phase 3 code that depends on it, when a lost-Project bug forced the decision; ADRs 0012 (playback sound is placed on the Timeline by the worker) and 0013 (the worker counts skipped Frames) were written after the Phase 4 code that settled them, as was 0012's amendment on the start rule (T070), and ADR 0014 (exported AAC carries an edit list) after the Phase 5 code that needed it. **Audit done** (`audit-t094.md`): three further decisions at the ADR bar had no ADR — the Export's own renderer and decoders, the commit-once rule for the destination, and the measured Source Timebase — now recorded after the fact as ADRs 0015 and 0016 (0003 annotated). Terms: eleven domain terms in use had no `CONTEXT.md` entry (Linked Source, In-point, Timecode, Scrub, Playback, Transport, Skipped Frame, Dropped Frame, Gesture, Project list, Export quality) — added after the fact; nothing had entered `CONTEXT.md` since before Phase 2, which is the largest lapse. Two identifiers used avoided words and were renamed: `importSequence` → `importCommands`, `framesPerSecond` → `timebaseAsNumber`; `anchor` and `segment` kept (decisions.md). Open, not a lapse: the time space of `sourceInPoint` needs an ADR before trimming
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T094, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

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

- [x] Audit that the standing rule below held: every decision meeting the ADR bar has an entry in `docs/adr/` that predates the code depending on it, and every domain term the code introduced was already added to `CONTEXT.md` when it was introduced. Anything missing found here is a lapse to record, not a document to write for the first time — the constitution requires both *before* the code lands, so writing them now would be closing the gate after the fact **Lapse recorded so far**: ADR 0011 (saves follow the gesture, writes commit explicitly) was written after the Phase 3 code that depends on it, when a lost-Project bug forced the decision; ADRs 0012 (playback sound is placed on the Timeline by the worker) and 0013 (the worker counts skipped Frames) were written after the Phase 4 code that settled them, as was 0012's amendment on the start rule (T070), and ADR 0014 (exported AAC carries an edit list) after the Phase 5 code that needed it. **Audit done** (`audit-t094.md`): three further decisions at the ADR bar had no ADR — the Export's own renderer and decoders, the commit-once rule for the destination, and the measured Source Timebase — now recorded after the fact as ADRs 0015 and 0016 (0003 annotated). Terms: eleven domain terms in use had no `CONTEXT.md` entry (Linked Source, In-point, Timecode, Scrub, Playback, Transport, Skipped Frame, Dropped Frame, Gesture, Project list, Export quality) — added after the fact; nothing had entered `CONTEXT.md` since before Phase 2, which is the largest lapse. Two identifiers used avoided words and were renamed: `importSequence` → `importCommands`, `framesPerSecond` → `timebaseAsNumber`; `anchor` and `segment` kept (decisions.md). Open, not a lapse: the time space of `sourceInPoint` needs an ADR before trimming

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 6, commits a49c7f8).
- [x] Delivered in Spec Kit Phase 6 (Polish & Cross-Cutting Concerns), commits a49c7f8
