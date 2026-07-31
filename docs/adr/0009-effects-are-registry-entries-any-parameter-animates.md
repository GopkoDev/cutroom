# Effects are registry entries; any numeric parameter can be animated

An Effect is not a hand-written type per effect. It is an entry in a registry describing its parameters — name, kind, range, default — alongside the shader or node that applies them. A Clip stores only which Effects it carries and what their parameter values are. The Inspector builds its controls from the parameter schema rather than from bespoke components, and any numeric parameter can be replaced by a curve of Keyframes without the Effect knowing.

The obvious alternative — a TypeScript type and an Inspector panel per Effect — is faster for the first handful and becomes a branch per Effect in the renderer, the Inspector and every migration once there are thirty. The prototype UI already lists fifteen colour effects, eighteen blend modes and twenty-two easings, so thirty is the starting point, not a distant worry.

## Consequences

- The parameter description language is a real interface we have to design up front, and it constrains what an Effect can express. Effects that don't fit it (a mask with editable geometry, a chroma key with an eyedropper) need a bespoke Inspector escape hatch.
- Keyframe interpolation lives in one place, so easing behaves identically across every Effect, transform and volume curve.
