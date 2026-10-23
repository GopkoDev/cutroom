---
status: Accepted
owner: "Dmytro Hopko"
reviewers: []
updated_at: "2026-10-23"
feature_size: "L"
ticket: ""
---

# 0009 — Effects are registry entries; any numeric parameter can be animated

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** TODO(sdd-migration): not recorded in the original ADR; first committed by Dmytro Hopko in `35a3596`

## Context

The editor will carry many Effects: the prototype UI already lists fifteen colour effects, eighteen blend modes and twenty-two easings, so thirty is the starting point, not a distant worry. Not used by the import-play-export slice (no Effects in it).

## Decision drivers

- No branch per Effect in the renderer, the Inspector and every migration once there are thirty.

## Considered options

1. **A registry entry per Effect** describing its parameters — name, kind, range, default — alongside the shader or node that applies them.
2. **A TypeScript type and an Inspector panel per Effect** — faster for the first handful and becomes a branch per Effect in the renderer, the Inspector and every migration once there are thirty.

## Decision outcome

**Chosen:** Option 1, the registry.

An Effect is not a hand-written type per effect. It is an entry in a registry describing its parameters — name, kind, range, default — alongside the shader or node that applies them. A Clip stores only which Effects it carries and what their parameter values are. The Inspector builds its controls from the parameter schema rather than from bespoke components, and any numeric parameter can be replaced by a curve of Keyframes without the Effect knowing.

## Consequences

**Positive**
- Keyframe interpolation lives in one place, so easing behaves identically across every Effect, transform and volume curve.

**Negative**
- The parameter description language is a real interface we have to design up front, and it constrains what an Effect can express. Effects that don't fit it (a mask with editable geometry, a chroma key with an eyedropper) need a bespoke Inspector escape hatch.

**Neutral**
- None recorded in the original ADR.

## Links

- Spec: [spec.md](../features/import-play-export/spec.md)
- SAD: [sad.md](../features/import-play-export/sad.md) §8
- Related ADR: none; see [docs/future.md](../future.md) "Effects and colour grading"
- Format: converted to SDD's MADR shape during the SDD migration; the original prose is kept in Decision outcome and Consequences. Original text: `git show 35a3596:docs/adr/0009-effects-are-registry-entries-any-parameter-animates.md`
