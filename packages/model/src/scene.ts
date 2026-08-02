// What crosses from the main thread into the engine worker (ADR 0003).
//
// A Scene is the Timeline as the renderer needs to see it: derived from the Project, never edited,
// never stored. The main thread stays the sole owner of the Project and posts one of these whenever
// the picture changes; the worker holds no editing logic and cannot drift out of sync (Principle
// IV, worker-protocol invariant 1).
//
// Three properties this module is built to hold.
//
// **Only what affects the picture.** Every field below has to answer "which pixel would move if
// this changed". Names, timestamps, the schema version, selection, panel sizes and undo history do
// not cross — not to save bytes, but because a field the renderer never reads is a field nothing
// keeps honest, and it will drift from the Project it was copied out of.
//
// **Deterministic and total.** Two Projects that are equal produce Scenes that are equal down to
// the key order, because there is exactly one place — the object literals below — where a Scene is
// written. There is no sorting, no lookup that can miss and no arithmetic here, so there is no
// input of type `Project` for which this function throws or has no answer.
//
// **Memoisable.** An edit that does not change the picture must not produce a different Scene. That
// is what lets the store decide whether to bump the protocol's `revision` and post at all, and it
// is why `applyCommand` goes out of its way to preserve Immer's structural sharing rather than
// re-parsing its own output (see the comment at the top of commands/apply.ts). The guarantee comes
// in two strengths and the difference matters to callers, so it is stated exactly at
// `projectScene`.

import type { Frame, PixelSize, Project, Timeline } from "./document/types"
import type { Rational, Timebase } from "./timebase"

/**
 * One Clip as the renderer sees it.
 *
 * Named `SceneClip` because that is what each one is. Not `SceneLayer` and not `SceneItem`:
 * `CONTEXT.md` lists "Layer" under the words to avoid for a Track and "Item" under the words to
 * avoid for a Clip, and those are the two commonest wrong names in editors, which is exactly why
 * they are listed.
 *
 * Why each field is here:
 *
 *   - `clipId` — identity across Scene revisions. The worker keeps per-Clip render state (a sink, a
 *     texture) and a Scene is a whole snapshot, not a diff, so without a stable id the worker can
 *     only match Clips by position and would rebuild every texture the moment one is inserted
 *     ahead of another. It draws no pixel itself; it is what stops the pixels being redrawn.
 *   - `sourceId` — which media the picture comes from. The worker's decoders are keyed by it
 *     (`attach-source` / `detach-source`), and it is deliberately *not* resolved into the `Source`
 *     here: the worker reads a Source's dimensions, duration and Timebase from the file itself
 *     (`source-attached`), so copying them into the Scene would create a second version of facts
 *     that a Relink to a re-encoded file can change.
 *   - `startFrame` / `durationFrames` — when this Clip is on screen, and, with `startFrame`, which
 *     instant of the Source a given Frame asks for.
 *   - `sourceInPoint` — where inside the Source the Clip begins, in the **Source's** own timescale
 *     as an exact ratio. The engine composes it with the Frame through `frameToSourceTime`
 *     (contracts/model-api.md, R7) rather than doing rate arithmetic of its own. This is Principle
 *     II's one exception and the only seconds allowed across this boundary (worker-protocol
 *     invariant 2).
 *
 * What is deliberately absent:
 *
 *   - **`transform`.** data-model.md lists one in this shape, but nothing in schema version 1 can
 *     produce a value for it: a `Clip` has no transform, and `docs/future.md` names `Clip.transform`
 *     as part of a later slice that also brings blend modes and a schema change. Projecting a
 *     constant identity transform today would put a field in the protocol that no Project can vary
 *     and no renderer can trust — the drift this module's header exists to prevent. It arrives with
 *     the Clip field that feeds it.
 *   - **Whether the Source is reachable.** Linked and Offline are runtime state outside the
 *     document (data-model.md). A Clip whose Source is Offline stays in the Scene and renders as
 *     empty because the worker has no decoder attached for that `sourceId` — which keeps the Scene
 *     a function of the Project alone, so that a permission grant does not count as an edit.
 */
export interface SceneClip {
  readonly clipId: string
  readonly sourceId: string
  readonly startFrame: Frame
  readonly durationFrames: Frame
  readonly sourceInPoint: Rational
}

/**
 * The whole picture, flat: the grid time is measured on, the raster it is composited into, and the
 * Clips drawn onto it.
 *
 * `timebase` and `frameSize` are repeated here even though the worker also receives them in `init`,
 * and that is on purpose: `export-start` carries its own frozen Scene so that later edits cannot
 * affect a running export (FR-019), and a Scene that leans on a message sent once at startup would
 * not be frozen in any useful sense.
 *
 * `clips` is in **back-to-front order** — the order they are drawn, first drawn furthest back. See
 * `projectScene` for how that order is derived.
 */
export interface Scene {
  readonly timebase: Timebase
  readonly frameSize: PixelSize
  readonly clips: readonly SceneClip[]
}

/**
 * What a previous projection produced, and the parts of the Project that were not covered by the
 * key it was filed under. `timeline` is the key; a Project can change `timebase` or `frameSize`
 * while holding on to the same `timeline` object, so those two are compared by value on every hit.
 */
interface Memo {
  readonly timebase: Timebase
  readonly frameSize: PixelSize
  readonly scene: Scene
}

/**
 * Keyed by `Project.timeline`, because that is the object Immer leaves untouched when an edit does
 * not reach the Timeline. Weak, so an entry lives exactly as long as the Timeline it describes and
 * a long editing session cannot accumulate Scenes for Projects nobody holds any more.
 *
 * This is the module's only mutable state, it is not reachable from outside, and the values it
 * hands back are frozen — so the only thing it changes about `projectScene`'s behaviour is which
 * object identity comes back, which is the entire point.
 */
const memo = new WeakMap<Timeline, Memo>()

function sameRatio(a: Timebase, b: Timebase): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator
}

function sameSize(a: PixelSize, b: PixelSize): boolean {
  return a.width === b.width && a.height === b.height
}

/**
 * The Project as the engine needs to see it.
 *
 * **Order.** Back to front: Tracks in the order they appear in `timeline.tracks`, so `tracks[0]` is
 * the backmost and each later Track draws over the ones before it, and within a Track the Clips in
 * document order, which `parseProject` has already established is ascending `startFrame` with no
 * overlaps. Nothing is sorted here — re-sorting would hide a parser bug rather than fix one — so
 * the output order is fully determined by the input's. Only video Tracks contribute: a Track that
 * carries no picture has nothing to say to a renderer, and the test for it is written now so that
 * the day `TrackKind` grows an `"audio"` member, audio Clips do not silently appear in the Scene.
 *
 * **Determinism.** Equal Projects give equal Scenes, down to key order and therefore down to the
 * bytes of `JSON.stringify`, because every Scene in the system is written by the literals below.
 *
 * **Totality.** There is no `Project` this throws on. Clips are not joined against Sources, no time
 * is converted and nothing is rounded, so there is no lookup to miss and no domain to fall outside
 * of. A Project with no Tracks projects to a Scene with no Clips.
 *
 * **What a caller may rely on, in two strengths.**
 *
 *   1. *Always* — deep equality. If two Projects are equal in the parts that draw, the Scenes are
 *      `toStrictEqual` and their JSON is byte-identical, whether or not they share any objects.
 *      This holds for Projects rebuilt from storage, parsed afresh, or structurally cloned.
 *   2. *When structural sharing survives* — reference equality. If the Project still holds the same
 *      `timeline` object and its `timebase` and `frameSize` are unchanged, the very same frozen
 *      `Scene` comes back, so `===` is a sound "nothing to repost" test. Every edit that leaves the
 *      Timeline alone — a rename, a new `modifiedAt`, a Relink recording a Source's new file name —
 *      keeps that reference, because Immer only rebuilds the path it wrote to.
 *
 * A cache miss is therefore always safe: it costs a projection and returns a Scene equal to the one
 * before. What a caller must **not** do is treat `!==` as proof that the picture changed — use it
 * to skip work, never to decide that work is needed. The strength-1 guarantee is the one to test
 * against; strength 2 is an optimisation that structural sharing happens to make free.
 *
 * The returned Scene is frozen and shares no object with the Project. It is plain data throughout —
 * strings, numbers and object literals — so it survives `postMessage` unchanged.
 */
export function projectScene(project: Project): Scene {
  const cached = memo.get(project.timeline)
  if (
    cached !== undefined &&
    sameRatio(cached.timebase, project.timebase) &&
    sameSize(cached.frameSize, project.frameSize)
  ) {
    return cached.scene
  }

  const clips: SceneClip[] = []
  for (const track of project.timeline.tracks) {
    if (track.kind !== "video") continue
    for (const clip of track.clips) {
      clips.push(
        Object.freeze({
          clipId: clip.id,
          sourceId: clip.sourceId,
          startFrame: clip.startFrame,
          durationFrames: clip.durationFrames,
          sourceInPoint: Object.freeze({
            numerator: clip.sourceInPoint.numerator,
            denominator: clip.sourceInPoint.denominator,
          }),
        })
      )
    }
  }

  // Copied field by field rather than passed through, so the Scene is a snapshot rather than a view
  // of the Project — nothing an export holds can be reached by a later edit (FR-019).
  const scene: Scene = Object.freeze({
    timebase: Object.freeze({
      numerator: project.timebase.numerator,
      denominator: project.timebase.denominator,
    }),
    frameSize: Object.freeze({
      width: project.frameSize.width,
      height: project.frameSize.height,
    }),
    clips: Object.freeze(clips),
  })

  memo.set(project.timeline, {
    timebase: scene.timebase,
    frameSize: scene.frameSize,
    scene,
  })
  return scene
}
