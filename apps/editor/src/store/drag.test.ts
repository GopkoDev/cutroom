import { describe, expect, it, vi } from "vitest"

import type { Clip, Command, Source } from "@cutroom/model"

import { createDragController, type MovePreview, type TrimPreview } from "./drag"
import { canRedo, canUndo, createEditorStore, nextUndoLabel } from "./index"

const source: Source = {
  id: "source-1",
  name: "sync-1080p30.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 12_345_678, lastModified: 1_754_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
}

const clip = (id: string, startFrame: number): Clip => ({
  id,
  sourceId: "source-1",
  startFrame,
  durationFrames: 100,
  sourceInPoint: { numerator: 0, denominator: 1 },
})

const AT = "2026-07-31T10:00:00.000Z"
const RELEASED_AT = "2026-07-31T11:00:00.000Z"

const addClip = (trackId: string, id: string, startFrame: number): Command => ({
  type: "add-clip",
  at: AT,
  trackId,
  clip: clip(id, startFrame),
})

/**
 * Track 1 holds clip-a (0..100), clip-b (100..200), clip-c (200..300), each 100 Frames of a
 * 300-Frame Source; Track 2 holds clip-d (0..100). Built through the real commands, so `trimRange`
 * and `checkMove` are the real rules.
 */
function setup() {
  const saver = { save: vi.fn(), flush: vi.fn(async () => undefined) }
  const store = createEditorStore({ saver, loadProject: vi.fn(async () => undefined) })
  const { run } = store.getState()
  store.getState().newProject()
  run({
    type: "create-project",
    at: AT,
    projectId: "project-1",
    name: "Untitled",
    timebase: { numerator: 30, denominator: 1 },
    frameSize: { width: 1920, height: 1080 },
    track: { id: "track-1", name: "Video 1" },
  })
  run({ type: "import-source", at: AT, source })
  run(addClip("track-1", "clip-a", 0))
  run(addClip("track-1", "clip-b", 100))
  run(addClip("track-1", "clip-c", 200))
  run({ type: "add-track", at: AT, track: { id: "track-2", name: "Video 2" } })
  run(addClip("track-2", "clip-d", 0))
  saver.save.mockClear()
  saver.flush.mockClear()

  const stopPlayback = vi.fn()
  const drag = createDragController({ store, now: () => RELEASED_AT, stopPlayback })
  return { store, saver, drag, stopPlayback }
}

function find(store: ReturnType<typeof setup>["store"], id: string): Clip {
  for (const track of store.getState().project!.timeline.tracks) {
    const found = track.clips.find((candidate) => candidate.id === id)
    if (found !== undefined) return found
  }
  throw new Error(`no clip ${id}`)
}

describe("opening a drag", () => {
  it("openTrim stops Playback first and previews the edge where it is now", () => {
    const { store, drag, stopPlayback } = setup()
    const before = store.getState().project

    drag.openTrim("clip-c", "tail")

    expect(stopPlayback).toHaveBeenCalledTimes(1)
    const preview = store.getState().drag as TrimPreview
    expect(preview).toEqual({
      kind: "trim",
      clipId: "clip-c",
      edge: "tail",
      frame: 300,
      atLimit: false,
    })
    expect(store.getState().project).toBe(before)
  })

  it("openMove stops Playback and previews a zero move of the Selection", () => {
    const { store, drag, stopPlayback } = setup()
    store.getState().setSelection(["clip-a", "clip-b"])

    drag.openMove("clip-a")

    expect(stopPlayback).toHaveBeenCalledTimes(1)
    expect(store.getState().drag).toEqual({
      kind: "move",
      grabbedClipId: "clip-a",
      clipIds: ["clip-a", "clip-b"],
      delta: 0,
      toTrackId: null,
      verdict: { ok: true },
    })
  })

  it("openMove on a Clip outside the Selection makes it the only selected Clip (AC-09)", () => {
    const { store, drag } = setup()
    store.getState().setSelection(["clip-b"])

    drag.openMove("clip-a")

    expect(store.getState().selection).toEqual(["clip-a"])
    expect((store.getState().drag as MovePreview).clipIds).toEqual(["clip-a"])
  })

  it("starts with no drag", () => {
    expect(setup().store.getState().drag).toBeNull()
  })
})

describe("the trim preview", () => {
  it("follows the pointer inside the limits", () => {
    const { store, drag } = setup()
    drag.openTrim("clip-c", "tail")
    drag.trimTo(250)
    expect(store.getState().drag).toMatchObject({ kind: "trim", frame: 250, atLimit: false })
  })

  it("clamps the edge into trimRange and says it is at the limit", () => {
    const { store, drag } = setup()
    drag.openTrim("clip-c", "tail")

    drag.trimTo(1000) // the Source ends at Frame 500 for this Clip
    expect(store.getState().drag).toMatchObject({ frame: 500, atLimit: true })

    drag.trimTo(0) // a tail stays one Frame past the head
    expect(store.getState().drag).toMatchObject({ frame: 201, atLimit: true })
  })

  it("clamps a head against the neighbouring Clip", () => {
    const { store, drag } = setup()
    drag.openTrim("clip-b", "head")
    drag.trimTo(20)
    expect(store.getState().drag).toMatchObject({ frame: 100, atLimit: true })
  })
})

describe("the move preview (AC-07)", () => {
  it("is ok on free space and stores the delta", () => {
    const { store, drag } = setup()
    drag.openMove("clip-c")
    drag.moveTo(100, "track-1")
    expect(store.getState().drag).toMatchObject({
      kind: "move",
      delta: 100,
      toTrackId: null,
      verdict: { ok: true },
    })
  })

  it("refuses an overlap with the reason", () => {
    const { store, drag } = setup()
    drag.openMove("clip-a")
    drag.moveTo(50, "track-1")
    expect(store.getState().drag).toMatchObject({
      delta: 50,
      verdict: { ok: false, reason: "overlap" },
    })
  })

  it("refuses a start before the Timeline's first Frame", () => {
    const { store, drag } = setup()
    drag.openMove("clip-a")
    drag.moveTo(-10, "track-1")
    expect(store.getState().drag).toMatchObject({
      verdict: { ok: false, reason: "before-timeline-start" },
    })
  })

  it("names the other Track as the target, and refuses an overlap there", () => {
    const { store, drag } = setup()
    drag.openMove("clip-a")
    drag.moveTo(0, "track-2")
    expect(store.getState().drag).toMatchObject({
      toTrackId: "track-2",
      verdict: { ok: false, reason: "overlap" },
    })
  })

  it("allows the other Track when it is free there", () => {
    const { store, drag } = setup()
    drag.openMove("clip-c")
    drag.moveTo(0, "track-2")
    expect(store.getState().drag).toMatchObject({ toTrackId: "track-2", verdict: { ok: true } })
  })

  it("refuses a Selection on both Tracks given another Track", () => {
    const { store, drag } = setup()
    store.getState().setSelection(["clip-a", "clip-d"])
    drag.openMove("clip-a")
    drag.moveTo(0, "track-2")
    expect(store.getState().drag).toMatchObject({ verdict: { ok: false, reason: "invalid" } })
  })

  it("releasing a refused move puts everything back and records nothing", () => {
    const { store, saver, drag } = setup()
    const project = store.getState().project
    const past = store.getState().past
    drag.openMove("clip-a")
    drag.moveTo(50, "track-1")

    expect(drag.release()).toBe(false)

    expect(store.getState().drag).toBeNull()
    expect(store.getState().project).toBe(project)
    expect(store.getState().past).toBe(past)
    expect(saver.save).not.toHaveBeenCalled()
    expect(saver.flush).not.toHaveBeenCalled()
  })
})

describe("release (AC-17, AC-32)", () => {
  it("a trim is one step named Trim, stamped with now()", () => {
    const { store, drag } = setup()
    const pastLength = store.getState().past.length
    drag.openTrim("clip-c", "tail")
    drag.trimTo(250)

    expect(drag.release()).toBe(true)

    expect(store.getState().drag).toBeNull()
    expect(find(store, "clip-c").durationFrames).toBe(50)
    expect(store.getState().past).toHaveLength(pastLength + 1)
    expect(store.getState().past.at(-1)?.label).toBe("Trim")
    expect(store.getState().project?.modifiedAt).toBe(RELEASED_AT)
  })

  it("a move of one Clip is one step named Move", () => {
    const { store, drag } = setup()
    const pastLength = store.getState().past.length
    drag.openMove("clip-c")
    drag.moveTo(100, "track-1")

    expect(drag.release()).toBe(true)

    expect(find(store, "clip-c").startFrame).toBe(300)
    expect(store.getState().past).toHaveLength(pastLength + 1)
    expect(store.getState().past.at(-1)?.label).toBe("Move")
  })

  it("a move of several Clips is named Move N Clips", () => {
    const { store, drag } = setup()
    store.getState().setSelection(["clip-a", "clip-b"])
    drag.openMove("clip-a")
    drag.moveTo(300, "track-1")

    expect(drag.release()).toBe(true)

    expect(find(store, "clip-a").startFrame).toBe(300)
    expect(find(store, "clip-b").startFrame).toBe(400)
    expect(store.getState().past.at(-1)?.label).toBe("Move 2 Clips")
  })

  it("a move onto the other Track puts the Clip there", () => {
    const { store, drag } = setup()
    drag.openMove("clip-c")
    drag.moveTo(0, "track-2")
    expect(drag.release()).toBe(true)
    const tracks = store.getState().project!.timeline.tracks
    expect(tracks[1]!.clips.map((c) => c.id)).toContain("clip-c")
    expect(tracks[0]!.clips.map((c) => c.id)).not.toContain("clip-c")
  })

  it("a release at the start position records nothing", () => {
    const { store, saver, drag } = setup()
    const project = store.getState().project
    const past = store.getState().past

    drag.openMove("clip-b")
    drag.moveTo(40, "track-1")
    drag.moveTo(0, "track-1")
    expect(drag.release()).toBe(false)

    drag.openTrim("clip-b", "tail")
    drag.trimTo(150)
    drag.trimTo(200)
    expect(drag.release()).toBe(false)

    expect(store.getState().drag).toBeNull()
    expect(store.getState().project).toBe(project)
    expect(store.getState().past).toBe(past)
    expect(saver.save).not.toHaveBeenCalled()
    expect(saver.flush).not.toHaveBeenCalled()
  })

  it("through many positions: nothing saved while open, one step, one end position saved, one undo", () => {
    const { store, saver, drag } = setup()
    const before = store.getState().project!
    const pastLength = store.getState().past.length

    drag.openMove("clip-c")
    for (const delta of [5, 40, 120, -30, 250, 100]) drag.moveTo(delta, "track-1")

    expect(store.getState().project).toBe(before)
    expect(saver.save).not.toHaveBeenCalled()
    expect(saver.flush).not.toHaveBeenCalled()

    expect(drag.release()).toBe(true)

    expect(store.getState().past).toHaveLength(pastLength + 1)
    expect(saver.save).toHaveBeenCalled()
    const ended = store.getState().project
    for (const [saved] of saver.save.mock.calls) expect(saved).toBe(ended)
    expect(saver.flush).toHaveBeenCalled()

    store.getState().undo()
    expect(store.getState().project).toEqual(before)
    expect(find(store, "clip-c").startFrame).toBe(200)
  })
})

describe("the refusal notice and a Project changed under the drag (review R-11, R-12, R-16)", () => {
  const refusal = { reason: "track-limit", title: "t", explanation: "e" }

  it("opening a Trim or a move closes the refusal notice: it lasts until the next Gesture", () => {
    const { store, drag } = setup()
    store.getState().reportEditRefusal(refusal)
    drag.openTrim("clip-c", "tail")
    expect(store.getState().editRefusal).toBeNull()
    drag.cancel()

    store.getState().reportEditRefusal(refusal)
    drag.openMove("clip-a")
    expect(store.getState().editRefusal).toBeNull()
  })

  it("a move whose Clips left the Project mid-drag is refused with a notice, not thrown", () => {
    const { store, drag } = setup()
    drag.openMove("clip-c")
    drag.moveTo(50, "track-1")
    store.getState().run({ type: "delete-clips", at: AT, clipIds: ["clip-c"], ripple: false })
    const project = store.getState().project
    const past = store.getState().past

    let applied: boolean | undefined
    expect(() => (applied = drag.release())).not.toThrow()
    expect(applied).toBe(false)
    expect(store.getState().project).toBe(project)
    expect(store.getState().past).toBe(past)
    expect(store.getState().drag).toBeNull()
    expect(store.getState().editRefusal).toMatchObject({ reason: "unknown-clip" })
  })

  it("a Trim whose edge is no longer allowed mid-drag is refused with a notice, not thrown", () => {
    const { store, drag } = setup()
    drag.openTrim("clip-a", "tail")
    drag.trimTo(60)
    // clip-a is deleted under the open Trim (a key, or an import landing): nothing to trim.
    store.getState().run({ type: "delete-clips", at: AT, clipIds: ["clip-a"], ripple: false })
    const project = store.getState().project

    expect(() => drag.release()).not.toThrow()
    expect(store.getState().project).toBe(project)
    expect(store.getState().editRefusal).toMatchObject({ reason: "unknown-clip" })
  })

  it("a move that now overlaps a Clip placed mid-drag is refused with a notice, not thrown", () => {
    const { store, drag } = setup()
    drag.openMove("clip-d")
    drag.moveTo(300, "track-2") // [300,400) on Track 2 is free when the drag opens
    store.getState().run(addClip("track-2", "clip-e", 320))
    const project = store.getState().project

    expect(() => drag.release()).not.toThrow()
    expect(store.getState().project).toBe(project)
    expect(store.getState().editRefusal).toMatchObject({ reason: "overlap" })
  })

  it("release reports an applied move as applied when the history is full", () => {
    const { drag } = setup()
    for (let i = 0; i < 205; i++) {
      drag.openMove("clip-d")
      drag.moveTo(i % 2 === 0 ? 300 : -300, "track-2")
      expect(drag.release(), `release ${i + 1}`).toBe(true)
    }
  })
})

describe("undo and redo while a drag is open (AC-18)", () => {
  it("are unavailable, name nothing, and change nothing", () => {
    const { store, drag } = setup()
    store.getState().undo() // leaves one step to redo, and many to undo
    expect(canUndo(store.getState())).toBe(true)
    expect(canRedo(store.getState())).toBe(true)
    const project = store.getState().project
    const { past, future } = store.getState()

    drag.openMove("clip-a")

    expect(canUndo(store.getState())).toBe(false)
    expect(canRedo(store.getState())).toBe(false)
    expect(nextUndoLabel(store.getState())).toBeNull()

    expect(() => store.getState().undo()).not.toThrow()
    expect(() => store.getState().redo()).not.toThrow()
    expect(store.getState().project).toBe(project)
    expect(store.getState().past).toBe(past)
    expect(store.getState().future).toBe(future)
  })

  it("come back after release and after cancel", () => {
    const { store, drag } = setup()
    drag.openMove("clip-c")
    drag.moveTo(100, "track-1")
    drag.release()
    expect(canUndo(store.getState())).toBe(true)
    expect(nextUndoLabel(store.getState())).toBe("Move")

    drag.openMove("clip-a")
    drag.cancel()
    expect(canUndo(store.getState())).toBe(true)
  })
})

describe("Escape (AC-19)", () => {
  it("clears the preview and touches nothing", () => {
    const { store, saver, drag } = setup()
    const project = store.getState().project
    const past = store.getState().past
    const future = store.getState().future

    drag.openMove("clip-c")
    drag.moveTo(100, "track-1")
    drag.cancel()

    expect(store.getState().drag).toBeNull()
    expect(store.getState().project).toBe(project)
    expect(store.getState().past).toBe(past)
    expect(store.getState().future).toBe(future)
    expect(saver.save).not.toHaveBeenCalled()
    expect(saver.flush).not.toHaveBeenCalled()
  })

  it("setDrag is runtime only: no history, no save", () => {
    const { store, saver } = setup()
    const past = store.getState().past
    store.getState().setDrag({
      kind: "trim",
      clipId: "clip-a",
      edge: "head",
      frame: 0,
      atLimit: false,
    })
    expect(store.getState().drag).not.toBeNull()
    store.getState().setDrag(null)
    expect(store.getState().drag).toBeNull()
    expect(store.getState().past).toBe(past)
    expect(saver.save).not.toHaveBeenCalled()
  })
})
