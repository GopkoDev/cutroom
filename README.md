# Cutroom

A multi-track video editor that runs entirely in the browser. Media never leaves the machine it
is edited on: decoding, compositing and encoding all happen locally, on the GPU where possible.

Chrome and Edge only, deliberately — see [ADR 0006](./docs/adr/0006-chromium-first-cross-browser-comes-from-the-cloud.md).

## Layout

```
packages/model     Project document, Timebase arithmetic, reducer, Scene projection.
                   No browser APIs, no framework — the backend will reuse this.
packages/engine    The worker: Mediabunny decode, PixiJS compositing, Mediabunny mux.
                   No React.
apps/editor        The interface. Owns state, sound and the clock.
docs/adr           Why things are the way they are.
specs/             Feature specifications, plans and task lists (Spec Kit).
CONTEXT.md         The domain language. Identifiers in code follow it.
```

The split is by dependency direction, not by feature: `model` knows nothing about the browser,
`engine` knows nothing about React, `apps/editor` knows about everything.

## Running

```bash
pnpm install
pnpm dev          # the editor
pnpm test         # Vitest — packages/model
pnpm test:e2e     # Playwright against Chromium
pnpm typecheck
```

## Reading order

1. [CONTEXT.md](./CONTEXT.md) — the vocabulary. Everything else assumes it.
2. [The constitution](./.specify/memory/constitution.md) — six principles the code must hold to.
3. [docs/adr](./docs/adr) — ten decisions, each with what it cost.
4. [specs/001-import-play-export](./specs/001-import-play-export) — the current slice: import a
   file, play it with sound in sync, export an MP4 that matches what you saw.

## Non-obvious constraints

- **Timeline positions are integer Frames**, never seconds. Conversion happens in exactly one
  module ([ADR 0002](./docs/adr/0002-timeline-time-is-integer-frames.md)).
- **Sound is the clock.** Picture follows it and drops Frames rather than making audio wait
  ([ADR 0008](./docs/adr/0008-audio-stays-on-the-main-thread.md)).
- **Source files are referenced, never copied** into browser storage
  ([ADR 0005](./docs/adr/0005-sources-are-referenced-never-copied.md)).
- **`lovable_test_ui/` is not part of this repository.** It is a visual reference living outside
  it; nothing here imports from it ([ADR 0010](./docs/adr/0010-the-lovable-prototype-is-a-reference-not-a-codebase.md)).
