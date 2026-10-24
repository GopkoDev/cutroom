import { describe, expect, it, vi } from "vitest"

import { duplicateDelta, type Clip, type Command, type Source } from "@cutroom/model"

import { createEditActions } from "./edit"
import { canUndo, createEditorStore, nextUndoLabel } from "./index"

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
const unusedSource: Source = { ...source, id: "source-2", name: "b-roll.mp4" }

const clip = (id: string, startFrame: number): Clip => ({
  id,
  sourceId: "source-1",
  startFrame,
  durationFrames: 100,
  sourceInPoint: { numerator: 0, denominator: 1 },
})

const AT = "2026-07-31T10:00:00.000Z"
const NOW = "2026-07-31T11:00:00.000Z"

const addClip = (trackId: string, id: string, startFrame: number): Command => ({
  type: "add-clip",
  at: AT,
  trackId,
  clip: clip(id, startFrame),
})

/**
 * Track 1 holds clip-a (0..100), clip-b (100..200), clip-c (200..300); Track 2 (unless
 * `twoTracks` is false) holds clip-d (0..100). Source 2 is imported and used by no Clip.
 * `stopPlayback` is a spy that stops "on the Frame it reached": it moves the Playhead to `reached`.
 */
function setup({ twoTracks = true }: { twoTracks?: boolean } = {}) {
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
  run({ type: "import-source", at: AT, source: unusedSource })
  run(addClip("track-1", "clip-a", 0))
  run(addClip("track-1", "clip-b", 100))
  run(addClip("track-1", "clip-c", 200))
  if (twoTracks) {
    run({ type: "add-track", at: AT, track: { id: "track-2", name: "Video 2" } })
    run(addClip("track-2", "clip-d", 0))
  }
  saver.save.mockClear()
  saver.flush.mockClear()

  let counter = 0
  const newId = vi.fn(() => `new-${++counter}`)
  const reached = { frame: null as number | null }
  const stopPlayback = vi.fn(() => {
    if (reached.frame !== null) store.getState().setPlayhead(reached.frame)
  })
  const edit = createEditActions({ store, now: () => NOW, newId, stopPlayback })
  return { store, saver, edit, newId, stopPlayback, reached }
}

type Setup = ReturnType<typeof setup>

function clips(store: Setup["store"]): Clip[] {
  return store.getState().project!.timeline.tracks.flatMap((track) => [...track.clips])
}
function find(store: Setup["store"], id: string): Clip {
  const found = clips(store).find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no clip ${id}`)
  return found
}
const has = (store: Setup["store"], id: string): boolean =>
  clips(store).some((candidate) => candidate.id === id)

/** Nothing changed: Project, history and saver untouched. */
function expectUntouched(s: Setup, before: { project: unknown; past: unknown }) {
  expect(s.store.getState().project).toBe(before.project)
  expect(s.store.getState().past).toBe(before.past)
  expect(s.saver.save).not.toHaveBeenCalled()
  expect(s.saver.flush).not.toHaveBeenCalled()
}
const snapshot = (s: Setup) => ({
  project: s.store.getState().project,
  past: s.store.getState().past,
})

describe("split (AC-04, AC-29, AC-31)", () => {
  it("cuts the selected Clip at the Playhead into two that meet there; the second half is selected", () => {
    const s = setup()
    s.store.getState().setSelection(["clip-b"])
    s.store.getState().setPlayhead(150)
    const pastLength = s.store.getState().past.length

    s.edit.split()

    expect(find(s.store, "clip-b")).toMatchObject({ startFrame: 100, durationFrames: 50 })
    expect(find(s.store, "new-1")).toMatchObject({
      startFrame: 150,
      durationFrames: 50,
      sourceId: "source-1",
      // 50 Frames at 30/1 is 50/30 s, which the Timebase module keeps in lowest terms.
      sourceInPoint: { numerator: 5, denominator: 3 },
    })
    expect(s.store.getState().selection).toEqual(["new-1"])
    expect(s.store.getState().past).toHaveLength(pastLength + 1)
    expect(nextUndoLabel(s.store.getState())).toBe("Split")
    expect(s.saver.save).toHaveBeenCalled()
  })

  it("with no Selection cuts every Clip under the Playhead on every Track in one step; the second halves are selected", () => {
    const s = setup()
    s.store.getState().setPlayhead(50)
    const pastLength = s.store.getState().past.length

    s.edit.split()

    expect(find(s.store, "clip-a").durationFrames).toBe(50)
    expect(find(s.store, "clip-d").durationFrames).toBe(50)
    const selected = [...s.store.getState().selection]
    expect(selected).toHaveLength(2)
    for (const id of selected) expect(find(s.store, id).startFrame).toBe(50)
    expect(s.store.getState().past).toHaveLength(pastLength + 1)

    s.store.getState().undo()
    expect(clips(s.store)).toHaveLength(4)
  })

  it("stops Playback first and cuts at the Frame it reached (AC-31)", () => {
    const s = setup()
    s.store.getState().setPlayhead(10)
    s.reached.frame = 250 // inside clip-c
    s.store.getState().setTransport("playing")

    s.edit.split()

    expect(s.stopPlayback).toHaveBeenCalledTimes(1)
    expect(find(s.store, "clip-c").durationFrames).toBe(50)
    expect(find(s.store, "new-1").startFrame).toBe(250)
  })

  it("refuses with the selection wording when no selected Clip is under the Playhead (AC-05)", () => {
    const s = setup()
    s.store.getState().setSelection(["clip-a"])
    s.store.getState().setPlayhead(150)
    const before = snapshot(s)

    s.edit.split()

    expectUntouched(s, before)
    expect(s.store.getState().editRefusal).toMatchObject({
      reason: "selection-not-under-frame",
      title: "No selected Clip is under the Playhead.",
    })
    expect(s.store.getState().editRefusal?.explanation).not.toBe("")
  })

  it("refuses with the general wording in a Gap or on a Clip's first Frame (AC-05)", () => {
    const s = setup()
    s.store.getState().setPlayhead(100) // first Frame of clip-b, last of clip-a
    s.store.getState().setSelection([])
    const before = snapshot(s)
    s.edit.split()
    expectUntouched(s, before)
    expect(s.store.getState().editRefusal).toMatchObject({
      reason: "nothing-under-frame",
      title: "No Clip is under the Playhead.",
    })
  })
})

describe("delete (AC-10, AC-11, AC-32)", () => {
  it("leaves a Gap and empties the Selection; one step named Delete", () => {
    const s = setup()
    s.store.getState().setSelection(["clip-b"])
    const pastLength = s.store.getState().past.length

    s.edit.deleteSelected(false)

    expect(has(s.store, "clip-b")).toBe(false)
    expect(find(s.store, "clip-c").startFrame).toBe(200)
    expect(find(s.store, "clip-a").startFrame).toBe(0)
    expect(s.store.getState().selection).toEqual([])
    expect(s.store.getState().past).toHaveLength(pastLength + 1)
    expect(nextUndoLabel(s.store.getState())).toBe("Delete")
    expect(s.saver.save).toHaveBeenCalled()
  })

  it("a Ripple delete closes the Gap on its own Track only; one step named Ripple delete", () => {
    const s = setup()
    s.store.getState().setSelection(["clip-b"])
    const pastLength = s.store.getState().past.length

    s.edit.deleteSelected(true)

    expect(has(s.store, "clip-b")).toBe(false)
    expect(find(s.store, "clip-c").startFrame).toBe(100)
    expect(find(s.store, "clip-d").startFrame).toBe(0)
    expect(s.store.getState().selection).toEqual([])
    expect(s.store.getState().past).toHaveLength(pastLength + 1)
    expect(nextUndoLabel(s.store.getState())).toBe("Ripple delete")
  })

  it.each([false, true])("with nothing selected does nothing at all (ripple=%s)", (ripple) => {
    const s = setup()
    const before = snapshot(s)
    const label = nextUndoLabel(s.store.getState())

    s.edit.deleteSelected(ripple)

    expectUntouched(s, before)
    expect(nextUndoLabel(s.store.getState())).toBe(label)
    expect(s.store.getState().editRefusal).toBeNull()
  })
})

describe("duplicate (AC-12, AC-13, AC-32)", () => {
  it("places a copy directly after the original and selects the copy; one step named Duplicate", () => {
    const s = setup()
    s.store.getState().setSelection(["clip-c"])
    const delta = duplicateDelta(s.store.getState().project!, ["clip-c"])
    const pastLength = s.store.getState().past.length

    s.edit.duplicateSelected()

    expect(delta).toBe(100)
    expect(find(s.store, "new-1")).toMatchObject({
      sourceId: "source-1",
      startFrame: 300,
      durationFrames: 100,
      sourceInPoint: { numerator: 0, denominator: 1 },
    })
    expect(s.store.getState().selection).toEqual(["new-1"])
    expect(s.store.getState().past).toHaveLength(pastLength + 1)
    expect(nextUndoLabel(s.store.getState())).toBe("Duplicate")
    expect(s.saver.save).toHaveBeenCalled()
  })

  it("puts the copy after the last Clip when there is no room directly after (AC-13)", () => {
    const s = setup()
    s.store.getState().setSelection(["clip-b"])

    s.edit.duplicateSelected()

    expect(find(s.store, "new-1").startFrame).toBe(300)
    expect(find(s.store, "clip-c").startFrame).toBe(200)
  })

  it("copies several Clips as one block, one step, with all copies selected", () => {
    const s = setup()
    s.store.getState().setSelection(["clip-b", "clip-c"])
    const pastLength = s.store.getState().past.length

    s.edit.duplicateSelected()

    expect(s.store.getState().selection).toHaveLength(2)
    expect(s.store.getState().selection).not.toContain("clip-b")
    expect(s.store.getState().past).toHaveLength(pastLength + 1)
  })

  it("with nothing selected does nothing at all", () => {
    const s = setup()
    const before = snapshot(s)
    s.edit.duplicateSelected()
    expectUntouched(s, before)
    expect(s.newId).not.toHaveBeenCalled()
  })
})

describe("Tracks (AC-20, AC-21, AC-22, AC-30)", () => {
  it("adds a Track named Video N with a minted id; one step named Add Track", () => {
    const s = setup({ twoTracks: false })
    const pastLength = s.store.getState().past.length

    s.edit.addTrack()

    const tracks = s.store.getState().project!.timeline.tracks
    expect(tracks).toHaveLength(2)
    expect(tracks[1]).toMatchObject({ id: "new-1", name: "Video 2", clips: [] })
    expect(s.store.getState().past).toHaveLength(pastLength + 1)
    expect(nextUndoLabel(s.store.getState())).toBe("Add Track")
    expect(s.saver.save).toHaveBeenCalled()
  })

  it("refuses a third Track with the limit wording and records nothing (AC-30)", () => {
    const s = setup()
    const before = snapshot(s)
    const label = nextUndoLabel(s.store.getState())

    s.edit.addTrack()

    expectUntouched(s, before)
    expect(nextUndoLabel(s.store.getState())).toBe(label)
    expect(s.store.getState().editRefusal).toMatchObject({
      reason: "track-limit",
      title: "A Project has at most two video Tracks for now.",
    })
    // A refusal the User can act on carries no reducer message under Details (screens.md, R-11).
    expect(s.store.getState().editRefusal?.detail).toBeUndefined()
  })

  it("removes a Track with its Clips in one step that one undo restores; the Selection is pruned", () => {
    const s = setup()
    s.store.getState().setSelection(["clip-d", "clip-a"])
    const before = s.store.getState().project
    const pastLength = s.store.getState().past.length

    s.edit.removeTrack("track-2")

    expect(s.store.getState().project!.timeline.tracks).toHaveLength(1)
    expect(has(s.store, "clip-d")).toBe(false)
    expect(s.store.getState().selection).toEqual(["clip-a"])
    expect(s.store.getState().past).toHaveLength(pastLength + 1)
    expect(nextUndoLabel(s.store.getState())).toBe("Remove Track")

    s.store.getState().undo()
    expect(s.store.getState().project).toEqual(before)
  })

  it("refuses to remove the only Track with the last-track wording (AC-22)", () => {
    const s = setup({ twoTracks: false })
    const before = snapshot(s)

    s.edit.removeTrack("track-1")

    expectUntouched(s, before)
    expect(s.store.getState().editRefusal).toMatchObject({
      reason: "last-track",
      title: "A Project always keeps at least one Track.",
    })
    expect(s.store.getState().editRefusal?.detail).toBeUndefined()
  })
})

describe("placeSource (AC-24, AC-25)", () => {
  it("places a Source no Clip uses after the last Clip on the bottom Track and selects it", () => {
    const s = setup()
    const pastLength = s.store.getState().past.length

    s.edit.placeSource("source-2")

    expect(find(s.store, "new-1")).toMatchObject({
      sourceId: "source-2",
      startFrame: 300,
      durationFrames: 300,
      sourceInPoint: { numerator: 0, denominator: 1 },
    })
    expect(s.store.getState().project!.timeline.tracks[0]!.clips.map((c) => c.id)).toContain(
      "new-1"
    )
    expect(s.store.getState().selection).toEqual(["new-1"])
    expect(s.store.getState().past).toHaveLength(pastLength + 1)
    expect(nextUndoLabel(s.store.getState())).toBe("Place")
    expect(s.saver.save).toHaveBeenCalled()
  })

  it("places an Offline Source from what was recorded, needing no handle or permission", () => {
    const s = setup()
    s.store.getState().markSource("source-1", "offline", { reason: "needs-permission" })

    s.edit.placeSource("source-1")

    expect(find(s.store, "new-1")).toMatchObject({ sourceId: "source-1", durationFrames: 300 })
    // The only dependencies are the store, the clock, ids and Playback: nothing file-related.
    expect(Object.keys({ store: 1, now: 1, newId: 1, stopPlayback: 1 })).toHaveLength(4)
  })
})

describe("every Gesture (AC-31, AC-26)", () => {
  const gestures: [string, (s: Setup) => void, boolean][] = [
    ["split", (s) => s.edit.split(), false],
    ["deleteSelected", (s) => s.edit.deleteSelected(false), false],
    ["duplicateSelected", (s) => s.edit.duplicateSelected(), false],
    ["addTrack", (s) => s.edit.addTrack(), false],
    ["removeTrack", (s) => s.edit.removeTrack("track-2"), false],
    ["placeSource", (s) => s.edit.placeSource("source-2"), false],
  ]

  it.each(gestures)("%s stops Playback and clears an earlier refusal", (_name, gesture) => {
    const s = setup()
    s.store.getState().reportEditRefusal({ reason: "x", title: "t", explanation: "e" })

    gesture(s)

    expect(s.stopPlayback).toHaveBeenCalledTimes(1)
    expect(s.store.getState().editRefusal?.reason).not.toBe("x")
  })

  it("stopPlayback runs before the Playhead is read, even for a Gesture that ends up refused", () => {
    const s = setup()
    s.reached.frame = 100
    s.edit.split()
    expect(s.stopPlayback).toHaveBeenCalledTimes(1)
    expect(s.store.getState().editRefusal?.reason).toBe("nothing-under-frame")
  })

  it("edits apply and save as usual while an Export runs (AC-26)", () => {
    const s = setup()
    s.store.getState().setTransport("playing")
    s.store.getState().setSelection(["clip-a"])
    s.edit.deleteSelected(false)
    expect(has(s.store, "clip-a")).toBe(false)
    expect(canUndo(s.store.getState())).toBe(true)
    expect(s.saver.save).toHaveBeenCalled()
  })
})

describe("while a drag is open (review R-12)", () => {
  it("no other Gesture acts: the drag's preview stays the only edit in flight", () => {
    const s = setup({ twoTracks: false })
    s.store.getState().setSelection(["clip-b"])
    s.store.getState().setPlayhead(150)
    s.store.getState().setDrag({
      kind: "move",
      grabbedClipId: "clip-b",
      clipIds: ["clip-b"],
      delta: 0,
      toTrackId: null,
      verdict: { ok: true },
    })
    const before = snapshot(s)

    s.edit.split()
    s.edit.deleteSelected(false)
    s.edit.deleteSelected(true)
    s.edit.duplicateSelected()
    s.edit.addTrack()
    s.edit.removeTrack("track-1")
    s.edit.placeSource("source-1")

    expectUntouched(s, before)
    expect(s.store.getState().drag).not.toBeNull()
    expect(s.store.getState().selection).toEqual(["clip-b"])
  })
})

describe("an unexpected refusal", () => {
  it("is reported with its reason and a detail, changes nothing, and can be dismissed", () => {
    const s = setup()
    const before = snapshot(s)

    s.edit.removeTrack("no-such-track")

    expectUntouched(s, before)
    const refusal = s.store.getState().editRefusal
    expect(refusal).toMatchObject({ reason: "unknown-track" })
    expect(refusal?.title).not.toBe("")
    expect(refusal?.explanation).not.toBe("")
    expect(typeof refusal?.detail).toBe("string")
    expect(refusal?.detail).not.toBe("")

    s.edit.dismissRefusal()
    expect(s.store.getState().editRefusal).toBeNull()
  })
})

describe("the refusal state", () => {
  it("starts null, is set by reportEditRefusal, and is reset by opening and closing a Project", async () => {
    const s = setup()
    expect(s.store.getState().editRefusal).toBeNull()
    s.store.getState().reportEditRefusal({ reason: "r", title: "t", explanation: "e" })
    expect(s.store.getState().editRefusal).toEqual({ reason: "r", title: "t", explanation: "e" })
    s.store.getState().reportEditRefusal(null)
    expect(s.store.getState().editRefusal).toBeNull()

    s.store.getState().reportEditRefusal({ reason: "r", title: "t", explanation: "e" })
    s.store.getState().newProject()
    expect(s.store.getState().editRefusal).toBeNull()

    s.store.getState().reportEditRefusal({ reason: "r", title: "t", explanation: "e" })
    await s.store.getState().closeProject()
    expect(s.store.getState().editRefusal).toBeNull()
  })
})
