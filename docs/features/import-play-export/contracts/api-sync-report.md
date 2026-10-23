---
status: Approved
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
---

# API sync report — import-play-export

This report was written during the SDD migration. It checks the two contracts against the code at
`53f38c4` (the application code of `a49c7f8`), and was re-run after both were completed:

- [events.md](./events.md), the `worker` surface;
- [public-api.md](./public-api.md), the `library-sdk` surface.

There is no HTTP surface, so there is no `openapi.yaml`. The `web-frontend` surface consumes these
contracts and authors none ([sad.md](../sad.md) §4).

## Section A — field origins

The contracts were written by hand before the code (Spec Kit Phase 1), so "origin" here is the
type declaration the contract is now checked against. Each row is one message or one exported
group, not each field.

| schema_path | origin | confidence |
|---|---|---|
| ToEngine: `init`, `attach-source`, `detach-source`, `scene`, `render-frame`, `transport`, `export-start`, `export-audio-chunk`, `export-audio-request`, `export-cancel` | `packages/engine/src/protocol.ts:107-248`, union at `:252-262` | high |
| EngineEvent: `ready`, `source-attached`, `source-failed`, `frame-rendered`, `frames-dropped`, `audio-pcm`, `export-audio-ack`, `export-audio-pcm`, `export-progress`, `export-done`, `export-cancelled`, `export-failed`, `fatal` | `packages/engine/src/protocol.ts:273-427`, union at `:433-446` | high |
| `ready.capabilities` | `protocol.ts` `EngineCapabilities`, `VideoCodecCapability`, `AudioCodecCapability`. Settled in T029; events.md now carries the full shape | high |
| `fatal.stack` (optional) | `protocol.ts` `FatalEvent`. Added in T029; events.md now lists it | high |
| `Scene`, `SceneClip`, `Timebase`, `Rational`, `Frame`, `PixelSize` in messages | imported from `@cutroom/model`, declared once (T029) | high |
| Timebase functions | `packages/model/src/timebase.ts`, re-exported by `packages/model/src/index.ts:1` | high |
| `parseProject`, `migrateProject`, `CURRENT_SCHEMA_VERSION` | `packages/model/src/document/parse.ts`, `migrate.ts`, `types.ts:30` | high |
| `applyCommand`, `Command` | `packages/model/src/commands/apply.ts`, `index.ts` | high |
| `projectScene`, `Scene`, `SceneClip` | `packages/model/src/scene.ts` | high |

## Section B — drift findings

Each point below is the SDD 4-point checklist, adapted to a message protocol and a library.

- [x] **Message set ↔ code.** Every message in events.md exists in `protocol.ts` with the same
  `type`, in both directions, and the code has no message the contract lacks.
- [x] **Library exports ↔ contract.** Every name `packages/model/src/index.ts` exports is in
  public-api.md under the code's own type names (`Timebase`, `Rational`, `SourceFingerprint`,
  `Codecs`, …). The ones the Spec Kit contract lacked were added: `timebaseAsNumber` (renamed from
  `framesPerSecond` after the T094 audit), `anchorAtTimelineSample`, `PlaybackAnchor`, `Timecode`,
  the four command types, `CommandResult`, `CommandError`, `importCommands`, `ImportRequest`,
  `FIRST_TRACK_NAME` and the re-exported Immer `Patch`. `isTimestamp` is exported by
  `document/parse.ts` but not by `index.ts`, so it is internal and not listed.
- [x] **Payload details ↔ code.** Every field of every `ToEngine` and `EngineEvent` interface in
  `protocol.ts` is named in events.md. `ready.capabilities` and `fatal.stack`, the two that were
  richer in code, now carry the settled shapes.
- [x] **Contract ↔ sequences.** Every flow in [sad.md](../sad.md) §6 uses only messages in
  events.md, and every request/response pair the contract names (`attach-source`, `export-start`)
  has its reply and failure branch drawn there.
- [x] **Back-feed (spec coverage).** Every spec §5 AC that crosses the worker boundary has its
  message: import (AC-01…AC-12) through `attach-source`/`source-*`; scrub and playback
  (AC-04…AC-20) through `scene`/`render-frame`/`transport`/`frame-rendered`/`audio-pcm`; export
  (AC-21…AC-31) through `export-*`. AC-32…AC-39 are main-thread only (storage, permissions, the
  arrival gate) and need no message. No sequence gap was found.

No finding is open. The two documentation gaps found at migration were closed by completing the
contracts from the code; no behaviour changed.
