#!/usr/bin/env node
// Checks the invariants that kept resurfacing in review, so they fail here instead.
// Each rule below exists because it was broken at least once. Run: pnpm check:docs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const failures = [];
const fail = (rule, detail) => failures.push({ rule, detail });

// ---------------------------------------------------------------- feature dir

const featureDir = JSON.parse(read(".specify/feature.json")).feature_directory;
const spec = read(join(featureDir, "spec.md"));
const tasks = read(join(featureDir, "tasks.md"));
const plan = read(join(featureDir, "plan.md"));
const quickstart = read(join(featureDir, "quickstart.md"));

const uniq = (s, re) => [...new Set(s.match(re) ?? [])].sort();
const taskLines = tasks.split("\n").filter((l) => /^- \[[ x]\] T/.test(l));

// ------------------------------------------------------- 1. task id integrity
// Broken twice by adding T012a / T035a rather than renumbering.

const ids = taskLines.map((l) => l.match(/^- \[[ x]\] (T\d{3}[a-z]?)/)[1]);
ids.forEach((id, i) => {
  const expected = `T${String(i + 1).padStart(3, "0")}`;
  if (id !== expected) fail("task-ids", `position ${i + 1} is ${id}, expected ${expected}`);
});

// ------------------------------------------------------- 2. no dangling ids
// Renumbering rewrites references; a missed one points at nothing.

const known = new Set(ids);
// checklists/requirements.md is excluded on purpose: it records what past reviews found,
// including IDs that renumbering has since retired. Rewriting it would falsify the record.
for (const file of ["tasks.md", "quickstart.md", "plan.md"]) {
  const path = join(featureDir, file);
  if (!existsSync(join(root, path))) continue;
  for (const ref of uniq(read(path), /\bT\d{3}[a-z]?\b/g)) {
    if (!known.has(ref)) fail("dangling-task-ref", `${file} cites ${ref}, which no task carries`);
  }
}

// ------------------------------------------------------ 3. requirement coverage
// Every FR and SC needs at least one task, or it is a wish rather than a plan.

for (const req of [...uniq(spec, /\bFR-\d{3}\b/g), ...uniq(spec, /\bSC-\d{3}\b/g)]) {
  if (!taskLines.some((l) => l.includes(req))) fail("uncovered-requirement", `${req} has no task`);
}

// ----------------------------------------------------------- 4. banned identifiers
// Derived from CONTEXT.md's _Avoid_ lists, but only the exact spellings that were
// actually written and had to be corrected. A broader rule catches `sample.draw()`
// and `docs/adr/...` and teaches everyone to ignore the output.

const banned = [
  ["SceneLayer", "SceneClip — Layer is the commonest wrong name for a Track"],
  ["SceneItem", "SceneClip — Item is under Clip's _Avoid_ list; these are Clips"],
  ["Project.canvas", "Project.frameSize — Canvas is the wrong name for the Preview"],
  ["`canvas`", "frameSize, unless it means the literal OffscreenCanvas object"],
  ["frameRate:", "timebase — CONTEXT.md avoids 'frame rate' for the Timebase"],
  ["MediaItem", "Source"],
  ["mediaLibrary", "sources"],
  ["media list", "Source list"],
];

for (const [file, text] of [["spec.md", spec], ["plan.md", plan], ["tasks.md", tasks], ["quickstart.md", quickstart]]) {
  for (const [term, instead] of banned) {
    // Ignore lines that exist to say the term is wrong.
    const offending = text
      .split("\n")
      .filter((l) => l.includes(term) && !/_Avoid_|[Nn]ot |never |avoid|instead of|rather than/.test(l));
    if (offending.length) fail("banned-identifier", `${file} writes "${term}" — use ${instead}`);
  }
}

// --------------------------------------------------- 5. paths that must exist
// Documents drifted from reality when the repository was restructured: a tree
// listing a folder that moved reads as authoritative and is simply wrong.

for (const dir of ["packages/model", "packages/engine", "apps/editor", "docs/adr", "scripts"]) {
  if (!existsSync(join(root, dir))) fail("missing-path", `${dir} is described in plan.md but does not exist`);
}
if (existsSync(join(root, "lovable_test_ui"))) {
  fail("prototype-inside-repo", "the Lovable prototype must stay outside this repository (ADR 0010)");
}

// ------------------------------------------------------------ 6. no placeholders

for (const [file, text] of [["spec.md", spec], ["plan.md", plan], ["tasks.md", tasks], ["quickstart.md", quickstart]]) {
  const hit = text.match(/\b(TODO|TKTK|to be filled|\?\?\?)\b/i);
  if (hit) fail("placeholder", `${file} still contains "${hit[0]}"`);
}

// ----------------------------------------------------------------- 7. adr numbering

const adrs = readdirSync(join(root, "docs/adr")).filter((f) => f.endsWith(".md")).sort();
adrs.forEach((f, i) => {
  const expected = String(i + 1).padStart(4, "0");
  if (!f.startsWith(expected)) fail("adr-numbering", `${f} breaks the sequence at ${expected}`);
});

// ---------------------------------------------------------------------- report

if (failures.length === 0) {
  console.log(`docs ok — ${ids.length} tasks, ${adrs.length} ADRs, every FR and SC covered`);
  process.exit(0);
}
for (const { rule, detail } of failures) console.error(`${rule}: ${detail}`);
console.error(`\n${failures.length} problem${failures.length === 1 ? "" : "s"}`);
process.exit(1);
