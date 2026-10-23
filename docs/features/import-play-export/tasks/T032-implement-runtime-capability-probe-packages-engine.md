---
id: T032
title: "Implement the runtime capability probe in `packages/engine/src/capabilities.ts` using `canEncode` /…"
layer: "app"
deps: ["T029"]
blocks: ["T073", "T074"]
acs: []
files_hint: ["packages/engine/src/capabilities.ts"]
owner: "Dmytro Hopko"
estimate: "n/a"         # retroactive: the Spec Kit breakdown carried no estimates
context_budget: "S"
status: "done"
step: ""
---

# T032 — Implement the runtime capability probe in `packages/engine/src/capabilities.ts` using `canEncode` /…

## Place in the sequence

- **Blocked by:** T029 · **Blocks:** T073, T074 · **Wave:** Spec Kit Phase 2 — Foundational (Blocking Prerequisites) (phase order 1 → 2 → 3 → 4 → 5 → 6).
- **Lane:** own lane.

## Why (user story)

No single user story. This is Phase 2 (Foundational (Blocking Prerequisites)) infrastructure that every story stands on; the phase's purpose is quoted in [_epic.md](./_epic.md#spec-kit-breakdown-notes-verbatim).

## Inlined context

> **Implementation record** (the Spec Kit task line, with its done note):
>
> [x] T032 Implement the runtime capability probe in `packages/engine/src/capabilities.ts` using `canEncode` / `canEncodeVideo` / `canEncodeAudio`, returned in the `ready` message (research R5, Principle I) — **done**, and **nothing about codecs is written down anywhere in this repository**: the lists probed are Mediabunny's own `VIDEO_CODECS` and `AUDIO_CODECS`, so the day it learns a new one it is probed here without this file changing — and, more to the point, a codec cannot be missing from the export dialog because someone forgot to add it to a list of ours (Principle I). The module **does not choose**: no preference order, no "best", no fallback. It reports every codec and what the browser said, and leaves choosing to the dialog, where the user is (R5); a probe that quietly picked a winner would make "AAC is unavailable" indistinguishable from "we preferred Opus". A probe that *throws* is read as `false` and does not take `init` down with it — `VideoEncoder.isConfigSupported` rejects configurations it considers malformed rather than answering `false`, and which those are differs between browsers; the question asked is "can this machine encode it", and an implementation refusing the question has answered it, whereas letting one codec's refusal fail `init` would turn an unsupported codec into an engine that never starts. All twenty-seven probes run concurrently, since each is an independent round trip and serialising them would put them on the path between the worker starting and the editor being usable. `renderer` is passed in rather than discovered here — this module has no business standing up a GPU context to find out. **What the target platform actually said** (Google Chrome, macOS 15.5, measured not assumed): video — `avc`, `hevc`, `vp9`, `av1` and `vp8` all encodable and all encodable at the probed frame size; `prores` refused. Audio — `aac` and `opus` encodable, every PCM flavour encodable (Mediabunny encodes those itself), and `mp3`, `vorbis`, `flac`, `ac3`, `eac3` all refused. So H.264 + AAC, which quickstart and ADR 0006 assume, is confirmed rather than hoped for, and the export dialog has four more video codecs to offer than the plan expected
>
> — `specs/001-import-play-export/tasks.md @ a49c7f8, T032, verbatim` · full text: `git show a49c7f8:specs/001-import-play-export/tasks.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[events.md](../contracts/events.md) · [public-api.md](../contracts/public-api.md) · [docs/adr/](../../../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Main thread ↔ engine worker messages, as specified in the worker protocol.

— `contracts/events.md, message reference, abridged` · full text: [events.md](../contracts/events.md)

## Acceptance criteria

None — infrastructure, measurement or documentation task; no spec §5 criterion is satisfied by it alone (the Spec Kit breakdown tied it to no FR or acceptance scenario).

## Checklist

- [x] Implement the runtime capability probe in `packages/engine/src/capabilities.ts` using `canEncode` / `canEncodeVideo` / `canEncodeAudio`, returned in the `ready` message (research R5, Principle I)

## Edge cases

| Case | Behaviour |
|---|---|
| No negative branch in this task's acceptance criteria | — (the cases it handled are in the implementation record above) |

## Definition of Done

- [x] Done as recorded in the Spec Kit note (Phase 2, commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29).
- [x] Delivered in Spec Kit Phase 2 (Foundational (Blocking Prerequisites)), commits 748e8a6, 0cf95a9, bd0cf89, 044f944, ee962d5, c9f21d2, f1a8687, 6103c29
