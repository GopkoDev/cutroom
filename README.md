# Cutroom

A multi-track video editor that runs entirely in the browser. Media never leaves the machine it
is edited on: decoding, compositing and encoding all happen locally, on the GPU where possible.

What works today is the first slice, end to end: import a video file from your own disk, scrub it
Frame-accurately, play it back with sound in sync, and export the Timeline as an MP4 (H.264 + AAC)
that matches what the Preview showed. Projects save themselves into the browser and reopen from
the Project list; a Source whose file moved or lost permission shows as Offline and can be
relinked.

## Chrome and Edge only

Deliberately. The one capability the product cannot do without — a file handle that survives a
reload, so a Project can reopen your files where they already live — exists only in Chromium.
Everything else it depends on (WebCodecs, OffscreenCanvas in a worker, Web Audio) is available
elsewhere, so cross-browser support arrives with cloud Sources rather than with local fallbacks.
Other browsers are told so plainly on arrival
([ADR 0006](./docs/adr/0006-chromium-first-cross-browser-comes-from-the-cloud.md)).

## Layout

```
packages/model     Project document, Timebase arithmetic, reducer, Scene projection.
                   No browser APIs, no framework — the backend will reuse this.
packages/engine    The worker: Mediabunny decode, PixiJS compositing, Mediabunny mux.
                   No React.
apps/editor        The interface. Owns state, sound and the clock.
docs/adr           Why things are the way they are.
docs/features/     One folder per feature: spec, architecture, contracts, tasks, test plan (SDD).
docs/              Also the architecture map, the roadmap, the constitution and what was deferred.
CONTEXT.md         The domain language. Identifiers in code follow it.
```

The split is by dependency direction, not by feature: `model` knows nothing about the browser,
`engine` knows nothing about React, `apps/editor` knows about everything.

## Running

Node 22 or later and pnpm 10.

```bash
pnpm install
pnpm fixtures     # generate the test fixtures into packages/engine/test/fixtures/ (needs ffmpeg on PATH)
pnpm dev          # the editor, on http://localhost:5173
```

`pnpm fixtures` only builds what is missing; `--force` rebuilds everything. The fixtures carry a
burned-in Frame counter and a click on every whole second, which is what the tests read back.

## Testing

```bash
pnpm test           # Vitest: packages/model and apps/editor
pnpm test:e2e       # Playwright, in Google Chrome
pnpm test:e2e:slow  # the two ten-minute measurements
pnpm typecheck
pnpm lint           # docs check, ESLint, Prettier (the docs check still expects the retired Spec Kit layout — see docs/architecture-map.md §Constraints)
```

- **`pnpm test`** runs the unit tests of `packages/model` (Timebase arithmetic, the document,
  the reducer, the Scene) and of `apps/editor` (store, engine client, audio graph and clock,
  export mix and settings).
- **`pnpm test:e2e`** drives the real editor in Google Chrome (`channel: "chrome"`, so Chrome must
  be installed), with the file pickers replaced by stand-ins over the fixtures. It reuses a dev
  server already running on 5173; `CUTROOM_E2E_PORT=<port> pnpm test:e2e` starts a fresh one
  instead, which is worth doing while files are changing, since a watched server hot-reloads into
  the page under test. `export-duration.spec.ts` checks exported files with host `ffmpeg` and
  `ffprobe`, so it needs them on PATH too.
- **`pnpm test:e2e:slow`** runs the two specs tagged `@slow`, left out of the default run: A/V
  drift over ten minutes of playback (SC-002) and sustained full-rate playback over the same ten
  minutes (SC-004). About twenty minutes in all, always on a fresh server of its own (port 5191),
  because timing numbers taken on a hot-reloading page are not numbers.

The e2e specs are measurements against one machine, so they run one at a time. What still needs
a person — opening exports in QuickTime and VLC, the CPU-throttled playback check — is listed in
[quickstart.md](./docs/features/import-play-export/_evidence/quickstart.md).

## Reading order

1. [CONTEXT.md](./CONTEXT.md) — the vocabulary. Everything else assumes it.
2. [The constitution](./docs/constitution.md) — six principles the code must hold to.
3. [docs/architecture-map.md](./docs/architecture-map.md) — the code as it stands: modules,
   conventions, datastores, where a new piece of work goes.
4. [docs/adr](./docs/adr) — the decisions, each with what it cost.
5. [docs/features/import-play-export](./docs/features/import-play-export/spec.md) — the current
   slice: import a file, play it with sound in sync, export an MP4 that matches what you saw. Its
   `sad.md` holds the architecture and what was settled while building it, and `_evidence/` the
   measurements.
6. [docs/roadmap.md](./docs/roadmap.md) and [docs/future.md](./docs/future.md) — what comes next,
   what was deliberately left out, and what each omission will cost when it comes back.

## How work is planned

Features go through the [SDD](https://github.com/genkovich/sdd) Claude Code plugin (`sdd@sdd`,
enabled in `.claude/settings.json`). Each stage writes one document under
`docs/features/<slug>/` that the next stage reads:

```text
/sdd:specify <slug> → /sdd:clarify → /sdd:design → /sdd:sequences → /sdd:data-model → /sdd:api
→ /sdd:tasks → /sdd:plan-tests → /sdd:implement → /sdd:review → /sdd:ship
```

`/sdd:survey` refreshes the architecture map, `/sdd:roadmap` the roadmap, and `/sdd:glossary`
adds a term to `CONTEXT.md`. Per-developer settings live in `.claude/sdd.local.md` (gitignored;
`/sdd:config` to tune).

## Non-obvious constraints

- **Timeline positions are integer Frames**, never seconds. Conversion happens in exactly one
  module ([ADR 0002](./docs/adr/0002-timeline-time-is-integer-frames.md)).
- **Sound is the clock.** Picture follows it and drops Frames rather than making audio wait
  ([ADR 0008](./docs/adr/0008-audio-stays-on-the-main-thread.md)).
- **Source files are referenced, never copied** into browser storage
  ([ADR 0005](./docs/adr/0005-sources-are-referenced-never-copied.md)).
- **`lovable_test_ui/` is not part of this repository.** It is a visual reference living outside
  it; nothing here imports from it ([ADR 0010](./docs/adr/0010-the-lovable-prototype-is-a-reference-not-a-codebase.md)).
