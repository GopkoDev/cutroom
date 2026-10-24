# The flaky `engine-worker.spec.ts` check — diagnosis (T001)

Spec §8 and sad §11 required this check to be diagnosed before `/sdd:implement`, because the
implement gate depends on `pnpm test:e2e` being reliably green. This was done by the agent on the
owner's delegation, 2026-10-23.

## What failed

The step-1 validation run recorded this
([import-play-export/_evidence/validation.md](../../import-play-export/_evidence/validation.md)):
`engine-worker.spec.ts` "a Scene older than the one the worker holds is ignored" failed once in a
full `pnpm test:e2e` run. It read the canvas as **16×9** where it expected 640×360, and it passed
5 of 5 times on its own.

## Reproduction attempts (this machine)

| Run | Result |
|---|---|
| Whole spec alone, `--repeat-each=15` (105 tests) | 105 passed |
| The three pixel-reading tests, `--repeat-each=20`, with all 10 CPU cores saturated by busy loops | 60 passed |

It did not reproduce. The cause was therefore found by reading the code.

## Root cause: a timing assumption in the test harness, not a worker bug

- **The 16×9 size came from the harness, not the worker.** The harness creates its placeholder
  canvas at exactly 16×9 on purpose. That way, a test cannot pass merely because the canvas
  already had the right size. No Scene in the failing test has that size: the Scenes there are
  640×360, 320×180 and 100×50. So a 16×9 read means the read happened **before the worker's
  first committed frame reached the placeholder**. It does not mean the worker accepted a stale
  Scene. A stale Scene would have shown up as 320×180 or 100×50.
- **The read relied on a fixed wait.** `pixels()` waited exactly two `requestAnimationFrame`s and
  then read the placeholder. Frames that a worker's `OffscreenCanvas` commits reach its
  placeholder canvas whenever the compositor and the GPU process deliver them. No fixed number of
  animation frames guarantees that. In a full run, the media specs before this one keep the GPU
  process busy decoding and encoding 1080p, so the delivery can lag. That is consistent with a
  failure that occurs only in the full suite.

## Fix

`pixels(expected)` now waits until the placeholder shows the frame size the test expects the worker
to commit, and has held it for three animation frames, with a 5-second limit. Then it reads
whatever is shown. The assertions are unchanged:

- **A worker that commits the wrong size still fails.** The wait ends after 5 seconds and the
  assertion sees the wrong size.
- **A worker that commits the right size is no longer at the mercy of compositor latency.**

No retry was added, and no assertion was loosened. The change is in
`apps/editor/e2e/engine-worker.spec.ts`, and the three tests that read pixels pass their
expected size.

## Verification after the fix

| Run | Result |
|---|---|
| Full `pnpm test:e2e` after the fix (port 5192, a fresh dev server) | 105 passed (4.9 min) |
| `engine-worker.spec.ts`, `--repeat-each=50` | 350 passed (5.7 min) |

One full run before this one had 16 failures, all from test 72 onwards. That run overlapped
with another task's edits to `packages/model` source, which the dev server serves live, so the
app changed under the running tests. The rerun on the settled tree passed in full. Lesson kept
for this feature's implement run: never run the e2e suite while source files are being edited.

## Quarantine

None. The cause is understood and fixed in the test harness, so the check stays in the
every-run suite.
