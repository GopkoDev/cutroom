#!/usr/bin/env node
// Checks the invariants that kept resurfacing in review, so they fail here instead.
// Each rule below exists because it was broken at least once. Run: pnpm check:docs
//
// The docs follow the SDD layout: one folder per feature under docs/features/<slug>/
// (spec.md, sad.md, test-plan.md, tasks.json + tasks/), project-wide ADRs in docs/adr/,
// and the glossary in CONTEXT.md.

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (p) => readFileSync(join(root, p), "utf8")
const exists = (p) => existsSync(join(root, p))
const failures = []
const warnings = []
const fail = (rule, detail) => failures.push({ rule, detail })
const warn = (rule, detail) => warnings.push({ rule, detail })

const uniq = (s, re) => [...new Set(s.match(re) ?? [])].sort()
const mdFiles = (dir) =>
  exists(dir)
    ? readdirSync(join(root, dir))
        .filter((f) => f.endsWith(".md"))
        .sort()
    : []

// ------------------------------------------------------------------- features
// _scaffold is survey's greenfield plan, not a feature; underscore folders are records.

const features = readdirSync(join(root, "docs/features"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .sort()
if (features.length === 0) fail("no-features", "docs/features/ holds no feature folder")

let taskCount = 0
let acCount = 0

for (const slug of features) {
  const dir = `docs/features/${slug}`
  const at = (f) => `${dir}/${f}`

  // ------------------------------------------------- 0. the SDD stage files
  // A stage that hard-refuses on a missing artifact should not find one missing here.

  for (const f of ["spec.md", ".size", ".route"]) {
    if (!exists(at(f))) fail("missing-artifact", `${slug}: ${f} is missing`)
  }
  if (!exists(at("spec.md"))) continue
  const spec = read(at("spec.md"))

  if (exists(at(".size")) && !/^(XS|S|M|L|XL)$/.test(read(at(".size")).trim()))
    fail("size", `${slug}: .size must be one of XS/S/M/L/XL`)
  if (exists(at(".route")) && !/^(quick|standard|full)$/.test(read(at(".route")).trim()))
    fail("route", `${slug}: .route must be one of quick/standard/full`)

  // --------------------------------------------------- 1. task id integrity
  // Broken twice by adding T012a / T035a rather than renumbering.

  const tasks = exists(at("tasks.json")) ? JSON.parse(read(at("tasks.json"))).tasks : []
  const ids = tasks.map((t) => t.id)
  taskCount += ids.length
  ids.forEach((id, i) => {
    const expected = `T${String(i + 1).padStart(3, "0")}`
    if (id !== expected)
      fail("task-ids", `${slug}: position ${i + 1} is ${id}, expected ${expected}`)
  })
  const known = new Set(ids)
  for (const t of tasks) {
    if (t.file && !exists(t.file))
      fail("task-file", `${slug}: ${t.id} points at ${t.file}, which does not exist`)
    for (const dep of t.deps ?? [])
      if (!known.has(dep))
        fail("task-deps", `${slug}: ${t.id} depends on ${dep}, which no task carries`)
  }
  const taskFiles = mdFiles(at("tasks")).filter((f) => /^T\d{3}/.test(f))
  if (tasks.length && taskFiles.length !== tasks.length)
    fail(
      "task-files",
      `${slug}: tasks.json has ${tasks.length} tasks but tasks/ has ${taskFiles.length} task files`
    )

  // --------------------------------------------------- 2. no dangling ids
  // Renumbering rewrites references; a missed one points at nothing.
  // _review/ and _evidence/ are excluded on purpose, except the quickstart: they record what
  // past reviews and runs found, including IDs that renumbering has since retired.

  const living = [
    "spec.md",
    "sad.md",
    "test-plan.md",
    "data-model.md",
    "tasks/_epic.md",
    "_evidence/quickstart.md",
  ]
  for (const f of living) {
    if (!exists(at(f)) || !tasks.length) continue
    for (const ref of uniq(read(at(f)), /\bT\d{3}[a-z]?\b/g)) {
      if (!known.has(ref))
        fail("dangling-task-ref", `${slug}: ${f} cites ${ref}, which no task carries`)
    }
  }

  // ------------------------------------------------ 3. acceptance coverage
  // Every AC needs a task and a test, or it is a wish rather than a plan.

  const acs = uniq(spec, /^### AC-\d+/gm).map((h) => h.slice(4))
  acCount += acs.length
  const claimed = new Set(tasks.flatMap((t) => t.acs ?? []))
  const testPlan = exists(at("test-plan.md")) ? read(at("test-plan.md")) : spec
  for (const ac of acs) {
    if (tasks.length && !claimed.has(ac)) fail("uncovered-ac", `${slug}: ${ac} has no task`)
    if (!new RegExp(`\\b${ac}\\b`).test(testPlan))
      fail("untested-ac", `${slug}: ${ac} has no row in the test plan`)
  }
  for (const ref of uniq(testPlan, /\bAC-\d+\b/g)) {
    if (!acs.includes(ref))
      fail("dangling-ac-ref", `${slug}: test-plan.md cites ${ref}, which spec.md does not define`)
  }

  // Spec Kit success criteria survive in §6; each still needs the task that measured it.
  const taskText = taskFiles.map((f) => read(at(`tasks/${f}`))).join("\n")
  for (const sc of uniq(spec, /\bSC-\d{3}\b/g)) {
    if (tasks.length && !taskText.includes(sc)) fail("uncovered-sc", `${slug}: ${sc} has no task`)
  }

  // ------------------------------------------------------ 4. banned identifiers
  // Derived from CONTEXT.md's NOT lists, but only the exact spellings that were
  // actually written and had to be corrected. A broader rule catches `sample.draw()`
  // and `docs/adr/...` and teaches everyone to ignore the output.

  const banned = [
    ["SceneLayer", "SceneClip — Layer is the commonest wrong name for a Track"],
    ["SceneItem", "SceneClip — Item is under Clip's NOT list; these are Clips"],
    ["Project.canvas", "Project.frameSize — Canvas is the wrong name for the Preview"],
    ["`canvas`", "frameSize, unless it means the literal OffscreenCanvas object"],
    ["frameRate:", "timebase — CONTEXT.md avoids 'frame rate' for the Timebase"],
    ["MediaItem", "Source"],
    ["mediaLibrary", "sources"],
    ["media list", "Source list"],
  ]
  const prose = living.filter((f) => exists(at(f)))
  for (const f of prose) {
    const text = read(at(f))
    for (const [term, instead] of banned) {
      // Ignore lines that exist to say the term is wrong.
      const offending = text
        .split("\n")
        .filter(
          (l) =>
            l.includes(term) &&
            !/_Avoid_|\bNOT\b|[Nn]ot |never |avoid|instead of|rather than/.test(l)
        )
      if (offending.length)
        fail("banned-identifier", `${slug}: ${f} writes "${term}" — use ${instead}`)
    }
  }

  // ------------------------------------------------------------ 5. no placeholders
  // TODO(sdd-migration) marks a question the migration could not answer from the sources.
  // It is a known open item, so it warns; any other placeholder fails.

  for (const f of prose) {
    const text = read(at(f))
    const open = (text.match(/TODO\(sdd-migration\)/g) ?? []).length
    if (open) warn("open-migration-todo", `${slug}: ${f} has ${open} TODO(sdd-migration)`)
    const hit = text
      .replace(/TODO\(sdd-migration\)/g, "")
      .match(/\b(TODO|TKTK|to be filled|\?\?\?)\b/i)
    if (hit) fail("placeholder", `${slug}: ${f} still contains "${hit[0]}"`)
  }

  // ---------------------------------------------------------- 6. feature adr/
  // SDD's tasks gate reads the feature's adr/; each entry must resolve (symlinks into
  // docs/adr/ included) and keep the shared numbering.

  for (const f of mdFiles(at("adr"))) {
    if (!/^\d{4}-/.test(f))
      fail("adr-name", `${slug}: adr/${f} does not start with a 4-digit number`)
    if (!exists(at(`adr/${f}`))) fail("adr-link", `${slug}: adr/${f} does not resolve`)
  }
}

// --------------------------------------------------- 7. paths that must exist
// Documents drifted from reality when the repository was restructured: a tree
// listing a folder that moved reads as authoritative and is simply wrong.

for (const dir of ["packages/model", "packages/engine", "apps/editor", "docs/adr", "scripts"]) {
  if (!exists(dir))
    fail("missing-path", `${dir} is described in architecture-map.md but does not exist`)
}
for (const doc of ["CONTEXT.md", "docs/architecture-map.md"]) {
  if (!exists(doc)) fail("missing-path", `${doc} is read by every SDD stage but does not exist`)
}
if (exists("lovable_test_ui")) {
  fail(
    "prototype-inside-repo",
    "the Lovable prototype must stay outside this repository (ADR 0010)"
  )
}

// ----------------------------------------------------------------- 8. adr numbering

const adrs = mdFiles("docs/adr")
adrs.forEach((f, i) => {
  const expected = String(i + 1).padStart(4, "0")
  if (!f.startsWith(expected)) fail("adr-numbering", `${f} breaks the sequence at ${expected}`)
})

// ---------------------------------------------------------------------- report

for (const { rule, detail } of warnings) console.warn(`warning ${rule}: ${detail}`)
if (failures.length === 0) {
  console.log(
    `docs ok — ${features.length} feature${features.length === 1 ? "" : "s"}, ${taskCount} tasks, ` +
      `${acCount} ACs, ${adrs.length} ADRs, every AC covered`
  )
  process.exit(0)
}
for (const { rule, detail } of failures) console.error(`${rule}: ${detail}`)
console.error(`\n${failures.length} problem${failures.length === 1 ? "" : "s"}`)
process.exit(1)
