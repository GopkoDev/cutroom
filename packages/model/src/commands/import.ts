// What importing a Source does to a Project, as a sequence of commands (FR-005, spec assumption).
//
// Importing is one gesture for the user and up to three commands for the reducer: bring a Project
// into being if there is none, record the Source, and place one Clip covering the whole of it. This
// module decides *which* commands and *with what values*; it applies none of them. The caller runs
// the list in order inside one transaction, so the whole import is one undo step, and a refusal
// anywhere in it aborts the transaction and leaves the Project as it was (FR-003, T034).
//
// Three properties this module is built to hold.
//
// **It is a function, like the reducer it feeds.** Every id and the timestamp arrive in the
// request; nothing here reads a clock or mints an id. `apps/editor` supplies the ids and calls it,
// and nothing else about an import is the editor's to decide.
//
// **The first Source sets up the Project, and nothing after it does.** The Project adopts that
// Source's Timebase and its dimensions as its own Timebase and frame size, so the user is not asked
// to configure anything before seeing a picture. That is the *only* moment this can happen: no
// command in this slice changes a Project's Timebase, and doing so once Clips exist is a migration
// of every Frame value, not an edit (data-model.md, ADR 0002). A later Source with a different
// Source Timebase keeps it, and the Project keeps its own — showing it correctly is
// `frameToSourceTime`'s business, not something solved here by renumbering.
//
// **The Clip's length is the one conversion, and it is the Timebase module's.** A Source's duration
// is seconds in its own timescale (Principle II's exception); the Clip's `durationFrames` is Frames
// in the Project's Timebase. `framesForDuration` crosses between them, rounding up so the last Frame
// that starts inside the media is kept, and no rate arithmetic happens in this file.

import { CommandError } from "./apply"
import type { Command } from "./index"
import type { Clip, Project, Source, Track } from "../document/types"
import { framesForDuration, type Timebase } from "../timebase"

/** Given to the Project an import creates, until the user names it something else. */
export const FIRST_TRACK_NAME = "Video 1"

/** What the editor knows when the user picks a file: the Source as read, and fresh ids. */
export interface ImportRequest {
  /** Stamped on every command in the sequence, so a created Project's two timestamps agree. */
  readonly at: string
  /** The Source as the engine read it (`source-attached`), already carrying its new id. */
  readonly source: Source
  /** The id of the Clip that will cover the Source. */
  readonly clipId: string
  /**
   * Ids for a Project and its first Track. Used only when there is no Project yet, and asked for
   * regardless, so the caller never has to know which kind of import it is making — an unused
   * `crypto.randomUUID()` costs nothing, a caller that guessed wrong costs a refused import.
   */
  readonly projectId: string
  readonly trackId: string
}

/**
 * The commands that import `request.source` into `project`, in the order they must be applied.
 *
 * With no Project open (`null`), that is `create-project` — adopting the Source's Timebase and
 * dimensions, named after the Source — then `import-source`, then `add-clip` placing one Clip
 * covering the whole Source at Frame 0.
 *
 * With a Project open, its Timebase and frame size are already established and stay as they are:
 * the sequence is `import-source`, then `add-clip` placing the Clip where the first video Track
 * ends — Frame 0 on an empty Track, which is FR-005's empty Project, and a butt join after the last
 * Clip otherwise, so that a second Source is on the Timeline and can be seen rather than only
 * listed.
 *
 * Throws {@link CommandError}, before any command exists to apply, when the import could never
 * succeed: a Source too short to cover a single Frame, a duration that is not an exact ratio, or a
 * Project with no video Track to place the Clip on. Everything else — ids already in use, a
 * timestamp that is not ISO 8601 — is the reducer's to refuse, once, where it is already checked.
 */
export function importSequence(project: Project | null, request: ImportRequest): Command[] {
  const { at, source, clipId } = request
  const timebase = project === null ? source.timebase : project.timebase
  const durationFrames = coveringFrames(timebase, source)

  // Key order matches `Clip` and `parseProject`'s output, so the document an import writes is the
  // same bytes as the one it reads back. `sourceInPoint` is zero: this slice has no trimming.
  const clipAt = (startFrame: number): Clip => ({
    id: clipId,
    sourceId: source.id,
    startFrame,
    durationFrames,
    sourceInPoint: { numerator: 0, denominator: 1 },
  })
  const importing: Command = { type: "import-source", at, source }

  if (project === null) {
    return [
      {
        type: "create-project",
        at,
        projectId: request.projectId,
        name: projectNameFor(source),
        timebase: {
          numerator: source.timebase.numerator,
          denominator: source.timebase.denominator,
        },
        frameSize: { width: source.dimensions.width, height: source.dimensions.height },
        track: { id: request.trackId, name: FIRST_TRACK_NAME },
      },
      importing,
      { type: "add-clip", at, trackId: request.trackId, clip: clipAt(0) },
    ]
  }

  const track = project.timeline.tracks.find((candidate) => candidate.kind === "video")
  if (track === undefined) {
    throw new CommandError("importSequence: this Project has no video Track to place the Clip on")
  }
  return [importing, { type: "add-clip", at, trackId: track.id, clip: clipAt(endOf(track)) }]
}

/**
 * How many of the Project's Frames the whole Source covers. Zero is a refusal rather than a Clip,
 * because a Clip lasts at least one Frame (data-model.md) — and refusing here, before the sequence
 * exists, is cleaner than letting `add-clip` refuse after `create-project` has already run.
 */
function coveringFrames(timebase: Timebase, source: Source): number {
  let frames: number
  try {
    frames = framesForDuration(timebase, source.duration)
  } catch (error) {
    // The Timebase module throws `RangeError` for a malformed ratio. Here it means the Source's
    // metadata is unusable, which is a refused import, not a bug in Cutroom.
    if (!(error instanceof RangeError)) throw error
    throw new CommandError(`importSequence: the Source's duration is unusable — ${error.message}`)
  }
  if (frames === 0) {
    throw new CommandError(
      `importSequence: ${JSON.stringify(source.name)} is too short to cover a single Frame`
    )
  }
  return frames
}

/** The Frame after the last Clip on a Track ends; Frame 0 for an empty one. */
function endOf(track: Track): number {
  const last = track.clips[track.clips.length - 1]
  return last === undefined ? 0 : last.startFrame + last.durationFrames
}

/**
 * A new Project is named after the Source that created it, less its extension — "interview.mp4"
 * makes "interview" — because that is the one name the user has already chosen. A name that is
 * nothing but an extension (".mp4") leaves nothing to use, and the Project is "Untitled Project",
 * the same words the Project list shows for a name it cannot use.
 */
function projectNameFor(source: Source): string {
  const stem = source.name.replace(/\.[^.]*$/, "").trim()
  return stem === "" ? "Untitled Project" : stem
}
