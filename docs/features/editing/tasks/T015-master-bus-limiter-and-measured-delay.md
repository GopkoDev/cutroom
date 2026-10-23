---
id: T015
title: "Mix every Clip through one limiter with its measured delay, in Playback and Export"
layer: "app"
deps: []
blocks: ["T019"]
acs: ["AC-23"]
files_hint: ["apps/editor/src/audio/graph.ts", "apps/editor/src/audio/limiter-delay.ts", "apps/editor/src/audio/offline-mix.ts", "apps/editor/src/audio/fake-audio-context.ts", "apps/editor/src/audio/graph.test.ts", "apps/editor/src/audio/offline-mix.test.ts", "apps/editor/src/audio/limiter-delay.test.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "S"
status: "done"
step: "COMMIT"
---
# T015 — Mix every Clip through one limiter with its measured delay, in Playback and Export

## Place in the sequence

- **Blocked by:** nothing · **Blocks:** T019 — Prove the edited Export matches the Preview at every Edit point, with both sounds mixed · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As a** User
> **I want** the sound of every Clip that is playing, on every Track, to be heard together in Playback and in the exported file
> **So that** a cutaway on the upper Track does not silence the shot under it
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

Two Clips that sound together are both heard at full level without distortion, in sync with their pictures, in Playback and in the file.

## Inlined context

> `createAudioGraph` gains a master bus: every Clip's gain node feeds one limiter, and the limiter feeds the destination. This holds for the live `AudioContext` and for each export segment's `OfflineAudioContext` alike [...]. Below full scale the limiter changes no level [...].
> The settings are threshold 0 dBFS, knee 0, ratio 20, attack about 1 ms and release about 100 ms.
> [...] once per context sample rate, it renders an impulse through the same limiter settings in a short `OfflineAudioContext` and reads where the impulse lands; it then schedules every chunk that many samples earlier, in Playback and in Export alike.
> [...] each segment therefore starts rendering a pre-roll earlier than its first output sample, longer than the limiter's release, and discards the pre-roll.
>
> — `ADR 0022` §Considered options 1 + §Decision outcome, abridged · full text: [ADR 0022](../../../adr/0022-every-clip-is-mixed-through-one-limiter-whose-delay-is-measured.md)

> The limiter has state, and the export mix renders in fresh 10 s segments | Medium | A pre-roll per segment, longer than the limiter's release (ADR 0022). Add a test that exports a loud two-Track stretch across a seam and compares it with one continuous render
>
> — `sad.md` §11, verbatim · full text: [sad.md](../sad.md)

> A single Clip now passes through the limiter. Spec §1's "sounds exactly as it did in step 1" holds at the level and timing the fixtures measure, not bit for bit (ADR 0022) | Low | The level fixture and the A/V sync fixture in §10 QG-3c
>
> — `sad.md` §11, verbatim · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [public-api.md](../contracts/public-api.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. The limiter delay is runtime state keyed by sample rate (`data-model.md` §Runtime only).

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-23 — happy

> **Given** a Clip with sound on the upper Track over a Clip with sound on the lower Track
> **When** the User plays across the stretch where both are present, and exports the Project
> **Then** both sounds are heard together, each at its own full level and in sync with its picture, in Playback and in the exported file, with no distortion where their sum would go past full scale; only the picture of the lower Clip is covered
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add the master bus and the `DynamicsCompressorNode` limiter to `createAudioGraph`; extend the fake context — `audio/graph.ts`, `audio/fake-audio-context.ts`
- [ ] Measure the delay once per sample rate with an impulse in an `OfflineAudioContext`; cache it — `audio/limiter-delay.ts`
- [ ] Schedule every chunk earlier by the measured delay
- [ ] Export: start each segment a pre-roll earlier than its first sample, longer than the release, and drop the pre-roll — `audio/offline-mix.ts`
- [ ] Unit tests: wiring, compensation, seam test (segmented vs continuous loud stretch)

## Edge cases

| Case | Behaviour |
|---|---|
| One Clip below full scale | Same level as step 1 (measured by the level fixture in T020) |
| Delay measured as 0 | No shift; tests still pass |
| First segment (no earlier audio) | Pre-roll renders silence and is dropped |

## Definition of Done

- [ ] Unit tests for the master bus, the measured delay and the seam pass
- [ ] Existing audio tests pass
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm test`, `pnpm lint` (incl. `check:docs`) and `pnpm typecheck` clean
