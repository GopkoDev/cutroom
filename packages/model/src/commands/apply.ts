// The one way a Project ever changes.
//
// `applyCommand` takes the Project as it is and a command describing what should happen, and
// answers with the Project as it becomes plus the two patch sets Immer produced on the way:
// `patches` to get there and `inversePatches` to get back. The store stacks the inverse patches
// and undo is replaying them — never a hand-written reverse operation, so a new command cannot
// ship without being undoable (ADR 0004, Principle IV).
//
// Three properties this file is built to hold.
//
// **It is a function.** No clock, no randomness, no I/O, no id generation. Every id and the
// timestamp arrive in the command. Run the same command on the same Project twice and the two
// results are indistinguishable — document, patches and inverse patches alike.
//
// **It refuses before it writes.** Every precondition is checked against the Project that came in,
// and only then does the `produceWithPatches` call happen. So a refused command leaves the caller's
// Project untouched by construction rather than by rollback, and the reducer never computes a
// document it then has to throw away.
//
// **It validates by construction, not by re-parsing.** The invariants `parseProject` enforces —
// integer Frames, non-overlapping Clips ordered by `startFrame`, `Timeline.durationFrames` equal to
// the greatest Clip end, ids unique, every `sourceId` resolving — hold after every command because
// each command checks the ones it could break and restores the derived ones it touches. The
// alternative, running the result back through `parseProject`, was rejected for a specific reason:
// `parseProject` rebuilds every object it validates, which would destroy the structural sharing
// Immer just gave us and so defeat the memoisation the Scene projection depends on
// (contracts/public-api.md, "referentially transparent enough to memoise"). The guarantee is not
// dropped, it is moved: test/commands.test.ts puts the output of every command through
// `parseProject`, so a command that forgets a check fails there rather than in a user's storage.

import { enablePatches, produceWithPatches, type Draft, type Patch } from "immer"

import { isTimestamp } from "../document/parse"
import { CURRENT_SCHEMA_VERSION, type Clip, type Project } from "../document/types"
import { checkMove } from "../editing/placement"
import { rippleShifts } from "../editing/ripple"
import { splitRefusal } from "../editing/split"
import { trimRefusal } from "../editing/limits"
import { framesForDuration, frameToSourceTime, sourceTimeBefore, type Rational } from "../timebase"

import type {
  AddClipCommand,
  AddTrackCommand,
  RemoveTrackCommand,
  Command,
  CreateProjectCommand,
  DeleteClipsCommand,
  DuplicateClipsCommand,
  ImportSourceCommand,
  MoveClipsCommand,
  RefusalReason,
  RelinkSourceCommand,
  SplitClipsCommand,
  TrimClipCommand,
} from "./index"
import { MAX_VIDEO_TRACKS } from "./index"

// Immer generates patches only when asked to; this is the ask, and it is idempotent.
enablePatches()

/**
 * What one command did: the Project it produced, and the two directions between it and the one
 * before. `patches` applied to the old Project give the new one; `inversePatches` applied to the
 * new one give the old.
 */
export interface CommandResult {
  readonly project: Project
  readonly patches: readonly Patch[]
  readonly inversePatches: readonly Patch[]
}

/**
 * A command that cannot be carried out on this Project. Distinct from a programming error so the
 * store can tell "the user asked for something impossible" from "we have a bug", and thrown before
 * anything is written, so the Project the caller holds is exactly as it was.
 */
export class CommandError extends Error {
  readonly reason: RefusalReason

  constructor(reason: RefusalReason, message: string) {
    super(message)
    this.reason = reason
    this.name = "CommandError"
  }
}

/** Every refusal reads the same way and names the command that was refused. */
function refuse(type: Command["type"], reason: RefusalReason, problem: string): never {
  throw new CommandError(reason, `applyCommand: ${type}: ${problem}`)
}

/** A whole number at or above `minimum`, or a refusal naming the field (FR-006). */
function expectWhole(type: Command["type"], value: number, minimum: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    refuse(
      type,
      "invalid",
      `${what} must be a whole number, ${minimum} or greater, got ${String(value)}`
    )
  }
}

/**
 * An exact ratio. `minNumerator` is 1 for a Timebase — a rate of zero converts nothing — and 0 for
 * a time in a Source's own timescale, where the very first instant is a legitimate address.
 */
function expectRatio(
  type: Command["type"],
  value: Rational,
  minNumerator: 0 | 1,
  what: string
): void {
  expectWhole(type, value.numerator, minNumerator, `${what} numerator`)
  expectWhole(type, value.denominator, 1, `${what} denominator`)
}

/** The timestamp a command stamps on the document must be one `parseProject` will accept back. */
function expectStamp(command: Command): void {
  if (!isTimestamp(command.at)) {
    refuse(
      command.type,
      "invalid",
      `at must be an ISO 8601 date and time, got ${JSON.stringify(command.at)}`
    )
  }
}

function expectIdentifier(type: Command["type"], value: string, what: string): void {
  if (value === "") refuse(type, "invalid", `${what} must not be empty`)
}

/** Runs one write against the current document and collects the patches Immer generated for it. */
function write(project: Project, recipe: (draft: Draft<Project>) => void): CommandResult {
  const [next, patches, inversePatches] = produceWithPatches(project, recipe)
  return { project: next, patches, inversePatches }
}

/**
 * `Timeline.durationFrames` is derived and stored, so whatever moves a Clip owes it an update. It
 * is recomputed from the Clips rather than nudged, because "equal to the greatest Clip end" is the
 * invariant itself and a command that shortens the Timeline one day gets it right for free.
 */
function retimeTimeline(draft: Draft<Project>): void {
  let end = 0
  for (const track of draft.timeline.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.startFrame + clip.durationFrames)
    }
  }
  draft.timeline.durationFrames = end
}

// ------------------------------------------------------------------------------- the commands

function createProject(prior: Project | null, command: CreateProjectCommand): CommandResult {
  if (prior !== null) {
    refuse(
      command.type,
      "invalid",
      "a Project is already open — create-project starts from nothing, so that undoing it means " +
        "no Project rather than some other Project"
    )
  }
  expectStamp(command)
  expectIdentifier(command.type, command.projectId, "projectId")
  expectIdentifier(command.type, command.track.id, "track.id")
  expectRatio(command.type, command.timebase, 1, "timebase")
  expectWhole(command.type, command.frameSize.width, 1, "frameSize.width")
  expectWhole(command.type, command.frameSize.height, 1, "frameSize.height")

  const created: Project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: command.projectId,
    name: command.name,
    createdAt: command.at,
    modifiedAt: command.at,
    timebase: { numerator: command.timebase.numerator, denominator: command.timebase.denominator },
    frameSize: { width: command.frameSize.width, height: command.frameSize.height },
    sources: [],
    timeline: {
      tracks: [{ id: command.track.id, kind: "video", name: command.track.name, clips: [] }],
      durationFrames: 0,
    },
  }

  // A `null` base cannot be drafted, so Immer takes the recipe's answer as the new state and
  // generates a root replacement: `replace []` to the new Project going forward, `replace []` to
  // `null` coming back. That is exactly the right inverse for "there was no Project", and it is
  // Immer's own patch rather than one written by hand here.
  const [, patches, inversePatches] = produceWithPatches<Project | null, Project | null>(
    null,
    () => created
  )
  return { project: created, patches, inversePatches }
}

function importSource(project: Project, command: ImportSourceCommand): CommandResult {
  const { source } = command
  expectStamp(command)
  expectIdentifier(command.type, source.id, "source.id")
  if (project.sources.some((existing) => existing.id === source.id)) {
    refuse(
      command.type,
      "duplicate-id",
      `a Source with the id ${JSON.stringify(source.id)} is already in this Project — ids are ` +
        "never reused, and re-importing the same file makes a second Source"
    )
  }
  expectRatio(command.type, source.duration, 0, "source.duration")
  expectRatio(command.type, source.timebase, 1, "source.timebase")
  expectWhole(command.type, source.dimensions.width, 1, "source.dimensions.width")
  expectWhole(command.type, source.dimensions.height, 1, "source.dimensions.height")
  expectWhole(command.type, source.fingerprint.size, 0, "source.fingerprint.size")
  expectWhole(command.type, source.fingerprint.lastModified, 0, "source.fingerprint.lastModified")

  return write(project, (draft) => {
    draft.sources.push(source)
    draft.modifiedAt = command.at
  })
}

function addClip(project: Project, command: AddClipCommand): CommandResult {
  const { clip } = command
  expectStamp(command)
  expectIdentifier(command.type, clip.id, "clip.id")
  expectIdentifier(command.type, clip.sourceId, "clip.sourceId")

  // Frames are whole numbers on every reducer write, not only at parse (data-model.md, FR-006).
  expectWhole(command.type, clip.startFrame, 0, "clip.startFrame")
  expectWhole(command.type, clip.durationFrames, 1, "clip.durationFrames")
  expectRatio(command.type, clip.sourceInPoint, 0, "clip.sourceInPoint")
  const clipEnd = clip.startFrame + clip.durationFrames
  if (!Number.isSafeInteger(clipEnd)) {
    refuse(
      command.type,
      "invalid",
      `the Clip would end at Frame ${clipEnd}, beyond the range of whole numbers`
    )
  }

  const source = project.sources.find((candidate) => candidate.id === clip.sourceId)
  if (source === undefined) {
    refuse(
      command.type,
      "unknown-source",
      `no Source in this Project carries the id ${JSON.stringify(clip.sourceId)} — import it first`
    )
  }
  for (const track of project.timeline.tracks) {
    if (track.clips.some((existing) => existing.id === clip.id)) {
      refuse(
        command.type,
        "duplicate-id",
        `a Clip with the id ${JSON.stringify(clip.id)} is already on the Timeline — ids are never reused`
      )
    }
  }

  const trackIndex = project.timeline.tracks.findIndex((track) => track.id === command.trackId)
  const track = project.timeline.tracks[trackIndex]
  if (track === undefined) {
    refuse(
      command.type,
      "unknown-track",
      `no Track in this Project carries the id ${JSON.stringify(command.trackId)}`
    )
  }

  // Clips on a Track are kept ordered by `startFrame`, so the Clip goes where that order puts it
  // rather than on the end — a Clip added before an existing one is an insert into the middle, and
  // the patch that undoes it has to put the array back exactly, not merely restore the fields.
  let insertAt = track.clips.length
  for (const [index, existing] of track.clips.entries()) {
    if (existing.startFrame > clip.startFrame) {
      insertAt = index
      break
    }
  }

  // Only the two neighbours can be in the way: the Clips are already ordered and already
  // non-overlapping, so anything further out is behind one of them. Adjacency is integer equality,
  // so a butt join — one Clip starting on the Frame after another ends — is exact and allowed.
  const before = insertAt > 0 ? track.clips[insertAt - 1] : undefined
  const after = track.clips[insertAt]
  if (before !== undefined && before.startFrame + before.durationFrames > clip.startFrame) {
    refuse(
      command.type,
      "overlap",
      `the Clip would start at Frame ${clip.startFrame}, but ${JSON.stringify(before.id)} on this ` +
        `Track runs to Frame ${before.startFrame + before.durationFrames} — Clips must not overlap`
    )
  }
  if (after !== undefined && clipEnd > after.startFrame) {
    refuse(
      command.type,
      "overlap",
      `the Clip would run to Frame ${clipEnd}, but ${JSON.stringify(after.id)} on this Track ` +
        `starts at Frame ${after.startFrame} — Clips must not overlap`
    )
  }

  // A Clip shows only what its Source holds: no more Frames than remain after the In-point, by
  // the same ceiling the import sized the first Clip with (ADR 0018). parseProject checks the same
  // rule on load, so a Clip placed here is never one a reload would refuse.
  const remaining = sourceTimeBefore(source.duration, clip.sourceInPoint)
  const available = remaining.numerator === 0 ? 0 : framesForDuration(project.timebase, remaining)
  if (clip.durationFrames > available) {
    refuse(
      command.type,
      "source-bounds",
      `the Clip asks for ${clip.durationFrames} Frames, but its Source holds only ${available} ` +
        "after the In-point"
    )
  }

  return write(project, (draft) => {
    const target = draft.timeline.tracks[trackIndex]
    if (target === undefined) return
    target.clips.splice(insertAt, 0, clip as Draft<Clip>)
    retimeTimeline(draft)
    draft.modifiedAt = command.at
  })
}

function relinkSource(project: Project, command: RelinkSourceCommand): CommandResult {
  expectStamp(command)
  expectWhole(command.type, command.fingerprint.size, 0, "fingerprint.size")
  expectWhole(command.type, command.fingerprint.lastModified, 0, "fingerprint.lastModified")

  const index = project.sources.findIndex((source) => source.id === command.sourceId)
  const source = project.sources[index]
  if (source === undefined) {
    refuse(
      command.type,
      "unknown-source",
      `no Source in this Project carries the id ${JSON.stringify(command.sourceId)}`
    )
  }

  // A Relink usually leaves the document alone: the file was renamed or its permission lapsed, and
  // what changes is the link table and the Source's runtime status, neither of which lives here.
  // Saying so with an empty patch set matters — a transaction with no patches is nothing for the
  // store to stack, so undo cannot land on a Relink and cannot toggle a Source between Linked and
  // Offline by replaying one (data-model.md, Principle IV).
  const renamed = source.name !== command.name
  const refingerprinted =
    source.fingerprint.size !== command.fingerprint.size ||
    source.fingerprint.lastModified !== command.fingerprint.lastModified
  if (!renamed && !refingerprinted) return { project, patches: [], inversePatches: [] }

  // Each field is written only if it actually differs. Assigning an equal-but-fresh object literal
  // would look harmless and would not be: Immer compares by identity, so it would emit a patch for
  // a fingerprint that never changed, and the undo stack would carry a step that undoes nothing.
  // The patches a command produces should be the list of what it changed, exactly.
  return write(project, (draft) => {
    const target = draft.sources[index]
    if (target === undefined) return
    if (renamed) target.name = command.name
    if (refingerprinted) {
      target.fingerprint = {
        size: command.fingerprint.size,
        lastModified: command.fingerprint.lastModified,
      }
    }
    draft.modifiedAt = command.at
  })
}

function trimClip(project: Project, command: TrimClipCommand): CommandResult {
  expectStamp(command)
  expectIdentifier(command.type, command.clipId, "clipId")
  if (command.edge !== "head" && command.edge !== "tail") {
    refuse(command.type, "invalid", `edge must be "head" or "tail", got ${String(command.edge)}`)
  }
  // Not `expectWhole(…, 0, …)`: a Frame before the Timeline's start is a whole number the rule
  // refuses with its own reason, not a malformed command.
  if (!Number.isSafeInteger(command.frame)) {
    refuse(command.type, "invalid", `frame must be a whole number, got ${String(command.frame)}`)
  }

  let trackIndex = -1
  let clipIndex = -1
  for (const [t, track] of project.timeline.tracks.entries()) {
    const c = track.clips.findIndex((existing) => existing.id === command.clipId)
    if (c !== -1) {
      trackIndex = t
      clipIndex = c
      break
    }
  }
  const clip = project.timeline.tracks[trackIndex]?.clips[clipIndex]
  if (clip === undefined) {
    refuse(
      command.type,
      "unknown-clip",
      `no Clip on the Timeline carries the id ${JSON.stringify(command.clipId)}`
    )
  }

  // The rule decides, so the command is refused exactly when `trimRange` says no.
  const reason = trimRefusal(project, command.clipId, command.edge, command.frame)
  if (reason !== null) {
    refuse(
      command.type,
      reason,
      `the ${command.edge} cannot go to Frame ${command.frame} — see trimRange for the Frames it can`
    )
  }

  const current = command.edge === "head" ? clip.startFrame : clip.startFrame + clip.durationFrames
  if (command.frame === current) return { project, patches: [], inversePatches: [] }

  return write(project, (draft) => {
    const target = draft.timeline.tracks[trackIndex]?.clips[clipIndex]
    if (target === undefined) return
    if (command.edge === "tail") {
      target.durationFrames = command.frame - clip.startFrame
    } else {
      // The In-point moves only through `frameToSourceTime` (ADR 0018): later by n Frames is
      // exact addition; earlier is exact subtraction of n Frames from the In-point.
      const moved = command.frame - clip.startFrame
      target.sourceInPoint =
        moved > 0
          ? frameToSourceTime(project.timebase, clip.sourceInPoint, moved)
          : sourceTimeBefore(
              clip.sourceInPoint,
              frameToSourceTime(project.timebase, { numerator: 0, denominator: 1 }, -moved)
            )
      target.startFrame = command.frame
      target.durationFrames = clip.startFrame + clip.durationFrames - command.frame
    }
    retimeTimeline(draft)
    draft.modifiedAt = command.at
  })
}

function splitClips(project: Project, command: SplitClipsCommand): CommandResult {
  expectStamp(command)
  if (!Number.isSafeInteger(command.frame)) {
    refuse(command.type, "invalid", `frame must be a whole number, got ${String(command.frame)}`)
  }

  const named = new Set<string>()
  const located: { trackIndex: number; clip: Clip; newClipId: string }[] = []
  for (const cut of command.cuts) {
    expectIdentifier(command.type, cut.clipId, "cuts.clipId")
    expectIdentifier(command.type, cut.newClipId, "cuts.newClipId")
    if (named.has(cut.clipId)) {
      refuse(command.type, "invalid", `${JSON.stringify(cut.clipId)} is named in more than one cut`)
    }
    named.add(cut.clipId)
  }
  for (const cut of command.cuts) {
    let found: { trackIndex: number; clip: Clip } | undefined
    for (const [trackIndex, track] of project.timeline.tracks.entries()) {
      const clip = track.clips.find((existing) => existing.id === cut.clipId)
      if (clip !== undefined) found = { trackIndex, clip }
    }
    if (found === undefined) {
      refuse(
        command.type,
        "unknown-clip",
        `no Clip on the Timeline carries the id ${JSON.stringify(cut.clipId)}`
      )
    }
    located.push({ ...found, newClipId: cut.newClipId })
  }

  // A new id may not be on the Timeline already, nor used for two halves in the one command.
  const taken = new Set<string>()
  for (const track of project.timeline.tracks) for (const clip of track.clips) taken.add(clip.id)
  for (const { newClipId } of located) {
    if (taken.has(newClipId)) {
      refuse(
        command.type,
        "duplicate-id",
        `a Clip with the id ${JSON.stringify(newClipId)} is already on the Timeline, or is named ` +
          "twice in this command — ids are never reused"
      )
    }
    taken.add(newClipId)
  }

  for (const { clip } of located) {
    const reason = splitRefusal(clip, command.frame)
    if (reason !== null) {
      refuse(
        command.type,
        reason,
        `Frame ${command.frame} is not strictly inside ${JSON.stringify(clip.id)} — see splitTargets`
      )
    }
  }

  if (located.length === 0) return { project, patches: [], inversePatches: [] }

  return write(project, (draft) => {
    for (const { trackIndex, clip, newClipId } of located) {
      const track = draft.timeline.tracks[trackIndex]
      if (track === undefined) continue
      const index = track.clips.findIndex((existing) => existing.id === clip.id)
      const first = track.clips[index]
      if (first === undefined) continue
      // The second half's In-point moves only through `frameToSourceTime` (ADR 0018). The halves
      // meet at `frame`, so together they cover exactly the Frames the Clip did.
      const offset = command.frame - clip.startFrame
      first.durationFrames = offset
      // Right after the first half keeps the Track ordered by `startFrame`: the Clip after it
      // starts at or beyond the old end, which is beyond `frame`.
      track.clips.splice(index + 1, 0, {
        id: newClipId,
        sourceId: clip.sourceId,
        startFrame: command.frame,
        durationFrames: clip.durationFrames - offset,
        sourceInPoint: frameToSourceTime(project.timebase, clip.sourceInPoint, offset),
      })
    }
    retimeTimeline(draft)
    draft.modifiedAt = command.at
  })
}

function moveClips(project: Project, command: MoveClipsCommand): CommandResult {
  expectStamp(command)
  if (!Number.isSafeInteger(command.delta)) {
    refuse(command.type, "invalid", `delta must be a whole number, got ${String(command.delta)}`)
  }
  const named = new Set<string>()
  for (const id of command.clipIds) {
    expectIdentifier(command.type, id, "clipIds")
    if (named.has(id)) {
      refuse(command.type, "invalid", `${JSON.stringify(id)} is named more than once`)
    }
    named.add(id)
  }
  if (command.toTrackId !== null) expectIdentifier(command.type, command.toTrackId, "toTrackId")

  // The rule decides, so the command is refused exactly when `checkMove` says no.
  const verdict = checkMove(project, command.clipIds, command.delta, command.toTrackId)
  if (!verdict.ok) {
    refuse(
      command.type,
      verdict.reason,
      `the Clips cannot move by ${command.delta} Frames — see checkMove`
    )
  }

  const toIndex =
    command.toTrackId === null
      ? -1
      : project.timeline.tracks.findIndex((track) => track.id === command.toTrackId)
  // Where each moving Clip comes from and lands, by Track index.
  const moves: { clip: Clip; from: number; to: number }[] = []
  for (const [from, track] of project.timeline.tracks.entries()) {
    for (const clip of track.clips) {
      if (named.has(clip.id)) moves.push({ clip, from, to: toIndex === -1 ? from : toIndex })
    }
  }
  if (moves.length === 0 || (command.delta === 0 && moves.every((m) => m.from === m.to))) {
    return { project, patches: [], inversePatches: [] }
  }

  const touched = new Set(moves.flatMap((m) => [m.from, m.to]))
  return write(project, (draft) => {
    for (const index of touched) {
      const track = draft.timeline.tracks[index]
      if (track === undefined) continue
      const kept = track.clips.filter((clip) => !named.has(clip.id))
      const arriving = moves
        .filter((m) => m.to === index)
        .map((m) => ({ ...m.clip, startFrame: m.clip.startFrame + command.delta }))
      // Each Track stays ordered by `startFrame`; the landing Clips cannot tie with a staying one.
      track.clips = [...kept, ...arriving].sort(
        (a, b) => a.startFrame - b.startFrame
      ) as typeof track.clips
    }
    retimeTimeline(draft)
    draft.modifiedAt = command.at
  })
}

function deleteClips(project: Project, command: DeleteClipsCommand): CommandResult {
  expectStamp(command)
  const named = new Set<string>()
  for (const id of command.clipIds) {
    expectIdentifier(command.type, id, "clipIds")
    if (named.has(id)) {
      refuse(command.type, "invalid", `${JSON.stringify(id)} is named more than once`)
    }
    named.add(id)
  }
  const onTimeline = new Set<string>()
  for (const track of project.timeline.tracks)
    for (const clip of track.clips) onTimeline.add(clip.id)
  for (const id of named) {
    if (!onTimeline.has(id)) {
      refuse(
        command.type,
        "unknown-clip",
        `no Clip on the Timeline carries the id ${JSON.stringify(id)}`
      )
    }
  }
  if (named.size === 0) return { project, patches: [], inversePatches: [] }

  // The rule decides how far each Clip moves, so the reducer and the editor's preview agree.
  const back = new Map<string, number>()
  if (command.ripple) {
    for (const { clipId, delta } of rippleShifts(project, command.clipIds)) back.set(clipId, delta)
  }
  return write(project, (draft) => {
    for (const track of draft.timeline.tracks) {
      // A Track holding none of the named Clips is left alone: assigning it a filtered copy would
      // give it a new identity (re-rendering its row, ADR 0021) and a patch in the undo entry.
      if (!track.clips.some((clip) => named.has(clip.id))) continue
      // Removing keeps the order, and moving every later Clip back by what was removed before it
      // cannot make it overlap its predecessor, so the Track stays ordered and non-overlapping.
      track.clips = track.clips.filter((clip) => !named.has(clip.id))
      for (const clip of track.clips) {
        const delta = back.get(clip.id)
        if (delta !== undefined) clip.startFrame -= delta
      }
    }
    retimeTimeline(draft)
    draft.modifiedAt = command.at
  })
}

function duplicateClips(project: Project, command: DuplicateClipsCommand): CommandResult {
  expectStamp(command)
  if (!Number.isSafeInteger(command.delta)) {
    refuse(command.type, "invalid", `delta must be a whole number, got ${String(command.delta)}`)
  }
  const named = new Set<string>()
  for (const copy of command.copies) {
    expectIdentifier(command.type, copy.clipId, "copies.clipId")
    expectIdentifier(command.type, copy.newClipId, "copies.newClipId")
    if (named.has(copy.clipId)) {
      refuse(command.type, "invalid", `${JSON.stringify(copy.clipId)} is named more than once`)
    }
    named.add(copy.clipId)
  }

  const taken = new Set<string>()
  const located: { trackIndex: number; clip: Clip; newClipId: string }[] = []
  for (const track of project.timeline.tracks) for (const clip of track.clips) taken.add(clip.id)
  for (const copy of command.copies) {
    let found: { trackIndex: number; clip: Clip } | undefined
    for (const [trackIndex, track] of project.timeline.tracks.entries()) {
      const clip = track.clips.find((existing) => existing.id === copy.clipId)
      if (clip !== undefined) found = { trackIndex, clip }
    }
    if (found === undefined) {
      refuse(
        command.type,
        "unknown-clip",
        `no Clip on the Timeline carries the id ${JSON.stringify(copy.clipId)}`
      )
    }
    located.push({ ...found, newClipId: copy.newClipId })
  }
  for (const { newClipId } of located) {
    if (taken.has(newClipId)) {
      refuse(
        command.type,
        "duplicate-id",
        `a Clip with the id ${JSON.stringify(newClipId)} is already on the Timeline, or is named ` +
          "twice in this command — ids are never reused"
      )
    }
    taken.add(newClipId)
  }
  if (located.length === 0) return { project, patches: [], inversePatches: [] }

  // Every copy is checked against the Clips already on its Track. The copies keep their relative
  // positions, so they cannot overlap one another.
  let beforeStart = false
  for (const { trackIndex, clip } of located) {
    const start = clip.startFrame + command.delta
    const end = start + clip.durationFrames
    const track = project.timeline.tracks[trackIndex]
    for (const other of track?.clips ?? []) {
      if (start < other.startFrame + other.durationFrames && other.startFrame < end) {
        refuse(
          command.type,
          "overlap",
          `a copy of ${JSON.stringify(clip.id)} would overlap ${JSON.stringify(other.id)} — see duplicateDelta`
        )
      }
    }
    if (start < 0) beforeStart = true
  }
  if (beforeStart) {
    refuse(command.type, "before-timeline-start", "a copy would begin before Frame 0")
  }

  return write(project, (draft) => {
    for (const { trackIndex, clip, newClipId } of located) {
      const track = draft.timeline.tracks[trackIndex]
      if (track === undefined) continue
      track.clips.push({ ...clip, id: newClipId, startFrame: clip.startFrame + command.delta })
    }
    // Each Track stays ordered by `startFrame`; a copy cannot tie with a Clip already there.
    for (const track of draft.timeline.tracks)
      track.clips.sort((a, b) => a.startFrame - b.startFrame)
    retimeTimeline(draft)
    draft.modifiedAt = command.at
  })
}

function addTrack(project: Project, command: AddTrackCommand): CommandResult {
  expectStamp(command)
  expectIdentifier(command.type, command.track.id, "track.id")
  if (project.timeline.tracks.some((existing) => existing.id === command.track.id)) {
    refuse(
      command.type,
      "duplicate-id",
      `a Track with the id ${JSON.stringify(command.track.id)} is already in this Project — ids are never reused`
    )
  }
  if (project.timeline.tracks.length >= MAX_VIDEO_TRACKS) {
    refuse(command.type, "track-limit", `a Project holds at most ${MAX_VIDEO_TRACKS} video Tracks`)
  }
  return write(project, (draft) => {
    // The end of the list is the top of the stack.
    draft.timeline.tracks.push({
      id: command.track.id,
      kind: "video",
      name: command.track.name,
      clips: [],
    })
    draft.modifiedAt = command.at
  })
}

function removeTrack(project: Project, command: RemoveTrackCommand): CommandResult {
  expectStamp(command)
  const index = project.timeline.tracks.findIndex((track) => track.id === command.trackId)
  if (index === -1) {
    refuse(
      command.type,
      "unknown-track",
      `no Track in this Project carries the id ${JSON.stringify(command.trackId)}`
    )
  }
  if (project.timeline.tracks.length <= 1) {
    refuse(command.type, "last-track", "a Project always keeps at least one Track")
  }
  return write(project, (draft) => {
    draft.timeline.tracks.splice(index, 1)
    retimeTimeline(draft)
    draft.modifiedAt = command.at
  })
}

// ------------------------------------------------------------------------------- the reducer

/** The Project a command needs to already exist, or a refusal saying it does not. */
function requireProject(prior: Project | null, command: Command): Project {
  if (prior === null) {
    refuse(command.type, "no-project", "there is no Project open — create-project comes first")
  }
  return prior
}

/**
 * Applies one command to a Project and reports what changed.
 *
 * `project` is `null` for `create-project` and only for it: a Project has to come from somewhere,
 * and starting from nothing is what lets that command have an inverse like every other one.
 *
 * Pure. Same Project and same command, same result — including the patches. Ids and the timestamp
 * come from the command, never from a clock or a generator in here (contracts/public-api.md).
 *
 * Throws {@link CommandError} without touching `project` if the command would break an invariant:
 * a Clip overlapping another on its Track, a Frame that is not a whole number, an id already in
 * use, a Track or Source that is not there.
 */
export function applyCommand(project: Project | null, command: Command): CommandResult {
  switch (command.type) {
    case "create-project":
      return createProject(project, command)
    case "import-source":
      return importSource(requireProject(project, command), command)
    case "add-clip":
      return addClip(requireProject(project, command), command)
    case "relink-source":
      return relinkSource(requireProject(project, command), command)
    case "trim-clip":
      return trimClip(requireProject(project, command), command)
    case "split-clips":
      return splitClips(requireProject(project, command), command)
    case "move-clips":
      return moveClips(requireProject(project, command), command)
    case "delete-clips":
      return deleteClips(requireProject(project, command), command)
    case "duplicate-clips":
      return duplicateClips(requireProject(project, command), command)
    case "add-track":
      return addTrack(requireProject(project, command), command)
    case "remove-track":
      return removeTrack(requireProject(project, command), command)
    default:
      // Unreachable for a caller TypeScript checked, reachable for one that cast its way in.
      return refuse(
        (command as Command).type,
        "invalid",
        "is not a command this build knows — the Command union in commands/index.ts is the list"
      )
  }
}
