---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0010 — The Lovable prototype is a reference, not a codebase

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

`lovable_test_ui/` holds a complete, good-looking editor UI that is deliberately not part of the build. It is presentational by construction — mock clips, a fake export progress bar, a playhead advanced by `setInterval` — and its 895-line `Timeline.tsx` does all its dragging, trimming and snapping in float seconds, which the Frame-based model (ADR 0002) contradicts outright.

## Decision drivers

- Porting it would mean importing exactly the arithmetic we decided against (ADR 0002), in the component hardest to untangle later.

## Considered options

1. **Write the interface from scratch** and consult the prototype only as a visual reference, kept outside the repository.
2. **Port the prototype's code** — rejected for the driver above.

## Decision outcome

**Chosen:** Option 1, a visual reference only.

We write the interface from scratch and consult the prototype only as a visual reference. It sits outside this repository entirely, alongside it rather than within it.

## Consequences

**Positive**
- The prototype is kept outside the repository on purpose, so an import from it would have to climb out of the source tree to reach it — visible in review rather than plausible-looking. (Enforced by `eslint-rules/no-import-outside-repo.js`.)

**Negative**
- It is therefore not versioned with the code it inspired. If it matters later, it should be captured as screenshots in `docs/`, not vendored back in.

**Neutral**
- None recorded in the original ADR.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §2
- Related ADR: [0002](./0002-timeline-time-is-integer-frames.md)
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0010-the-lovable-prototype-is-a-reference-not-a-codebase.md`
- Amendment (2026-10-23): the screenshot and a written account of what the prototype does are now committed in [`docs/reference/`](../reference/README.md), as this ADR's negative consequence asked. A local copy of the code may also sit in `docs/reference/kino-prototype/`. It is gitignored and skipped by ESLint, and `cutroom/no-import-outside-repo` forbids importing from it by name, so the decision itself is unchanged: nothing of the prototype is versioned or built on.
