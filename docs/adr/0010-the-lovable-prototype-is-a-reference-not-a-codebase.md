# The Lovable prototype is a reference, not a codebase

`lovable_test_ui/` holds a complete, good-looking editor UI that is deliberately not part of the build. We write the interface from scratch and consult the prototype only as a visual reference. It sits outside this repository entirely, alongside it rather than within it.

It is presentational by construction — mock clips, a fake export progress bar, a playhead advanced by `setInterval` — and its 895-line `Timeline.tsx` does all its dragging, trimming and snapping in float seconds, which the Frame-based model (ADR 0002) contradicts outright. Porting it would mean importing exactly the arithmetic we decided against, in the component hardest to untangle later.

## Consequences

- The prototype is kept outside the repository on purpose, so an import from it would have to climb out of the source tree to reach it — visible in review rather than plausible-looking.
- It is therefore not versioned with the code it inspired. If it matters later, it should be captured as screenshots in `docs/`, not vendored back in.
