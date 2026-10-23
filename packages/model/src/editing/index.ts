// The editing rules: pure functions over a Project that the reducer, the drag preview and the
// agent all call (ADR 0019, contracts/public-api.md §Editing rules).

export { trimRange, trimRefusal, type TrimEdge, type TrimRange } from "./limits"
export { splitRefusal, splitTargets, type SplitTargets } from "./split"
export { checkMove, type Verdict } from "./placement"
