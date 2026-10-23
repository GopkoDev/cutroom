import { describe, expect, it, vi } from "vitest"

import type { SourceAttachedEvent } from "@cutroom/engine/protocol"
import { importCommands, type Source } from "@cutroom/model"

import type { RelinkOutcome, SourceFileHandle } from "@/storage/source-links"

import { createEditorStore } from "./index"
import { regrantAccess, relinkPickedFile } from "./relink"

const SOURCE: Source = {
  id: "source-1",
  name: "interview.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 2048, lastModified: 1_750_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: false,
  codecs: { video: "avc1.640028" },
}

const handle = { kind: "file", name: "renamed.mp4" } as unknown as SourceFileHandle

function setup() {
  const store = createEditorStore({
    saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
    loadProject: vi.fn(async () => undefined),
  })
  store.getState().newProject()
  store.getState().transact("Import", () => {
    for (const command of importCommands(null, {
      at: "2026-10-22T10:00:00.000Z",
      source: SOURCE,
      clipId: "clip-1",
      projectId: "project-1",
      trackId: "track-1",
    })) {
      store.getState().run(command)
    }
  })
  store.getState().markSource(SOURCE.id, "offline", { reason: "never-linked-here" })
  const tracker = {
    attach: vi.fn(async () => ({ type: "source-attached" }) as SourceAttachedEvent),
    markLinked: vi.fn((sourceId: string) => {
      store.getState().markSource(sourceId, "linked")
    }),
    handleFor: vi.fn((): SourceFileHandle | undefined => handle),
    check: vi.fn(async () => {
      store.getState().markSource(SOURCE.id, "linked")
    }),
  }
  return { store, tracker }
}

describe("relinkPickedFile", () => {
  it("rebinds a renamed file and records its new name as one undoable step", async () => {
    const { store, tracker } = setup()
    const file = new File([new Uint8Array(2048)], "renamed.mp4", {
      lastModified: 1_760_000_000_000,
    })
    const relink = vi.fn(async (): Promise<RelinkOutcome> => ({
      ok: true,
      file,
      name: "renamed.mp4",
      fingerprint: { size: 2048, lastModified: 1_760_000_000_000 },
    }))

    const result = await relinkPickedFile(SOURCE.id, handle, {
      store,
      tracker,
      relink,
      now: () => "2026-10-22T11:00:00.000Z",
    })

    expect(result).toEqual({ ok: true })
    expect(relink).toHaveBeenCalledWith(SOURCE.id, handle, SOURCE.fingerprint)
    expect(tracker.attach).toHaveBeenCalledWith(SOURCE.id, handle, file)
    expect(store.getState().project?.sources[0]?.name).toBe("renamed.mp4")
    expect(store.getState().sourceStatus[SOURCE.id]).toBe("linked")
    // The Timeline is not rebuilt: the same Clip, untouched (FR-022).
    expect(store.getState().project?.timeline.tracks[0]?.clips[0]?.id).toBe("clip-1")

    // Undo takes back the name, never the link.
    store.getState().undo()
    expect(store.getState().project?.sources[0]?.name).toBe("interview.mp4")
    expect(store.getState().sourceStatus[SOURCE.id]).toBe("linked")
  })

  it("refuses a different file, saying how it differs, and changes nothing", async () => {
    const { store, tracker } = setup()
    const before = store.getState().project
    const relink = vi.fn(async (): Promise<RelinkOutcome> => ({
      ok: false,
      reason: "different-file",
      expected: SOURCE.fingerprint,
      found: { size: 9999, lastModified: 0 },
    }))

    const result = await relinkPickedFile(SOURCE.id, handle, {
      store,
      tracker,
      relink,
      now: () => "2026-10-22T11:00:00.000Z",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/not the same file/)
    expect(store.getState().project).toBe(before)
    expect(tracker.attach).not.toHaveBeenCalled()
    expect(store.getState().sourceStatus[SOURCE.id]).toBe("offline")
  })
})

describe("regrantAccess", () => {
  it("requests permission with the handle it already holds, then reads the Source again", async () => {
    const { store, tracker } = setup()
    const requestAccess = vi.fn(async (): Promise<PermissionState> => "granted")

    const result = await regrantAccess(SOURCE.id, { store, tracker, requestAccess })

    expect(requestAccess).toHaveBeenCalledWith(handle)
    expect(tracker.check).toHaveBeenCalledWith(SOURCE.id)
    expect(result).toEqual({ ok: true })
  })

  it("asks before awaiting anything, so the click's gesture is still live", () => {
    const { store, tracker } = setup()
    const requestAccess = vi.fn(async (): Promise<PermissionState> => "granted")
    void regrantAccess(SOURCE.id, { store, tracker, requestAccess })
    expect(requestAccess).toHaveBeenCalledTimes(1)
  })

  it("stays Offline when the user says no", async () => {
    const { store, tracker } = setup()
    const result = await regrantAccess(SOURCE.id, {
      store,
      tracker,
      requestAccess: async () => "denied",
    })
    expect(result.ok).toBe(false)
    expect(tracker.check).not.toHaveBeenCalled()
  })
})

describe("a failed re-grant or Relink is said plainly, with the platform's words kept (T093)", () => {
  it("a permission request the browser refused to show", async () => {
    const { store, tracker } = setup()
    const result = await regrantAccess(SOURCE.id, {
      store,
      tracker,
      requestAccess: async () => {
        throw new DOMException("User activation is required.", "SecurityError")
      },
    })
    expect(result).toEqual({
      ok: false,
      message: "The browser did not ask for permission. Click Allow access again.",
      detail: "SecurityError: User activation is required.",
    })
  })

  it("access granted to a file that is no longer there sends the user to find it", async () => {
    const { store, tracker } = setup()
    tracker.check.mockImplementationOnce(async () => {
      store.getState().markSource(SOURCE.id, "offline", {
        reason: "unreachable",
        detail: "NotFoundError: A requested file or directory could not be found.",
      })
    })
    const result = await regrantAccess(SOURCE.id, {
      store,
      tracker,
      requestAccess: async () => "granted",
    })
    expect(result).toEqual({
      ok: false,
      message: "Access was granted, but the file is no longer where it was. Find it instead.",
      detail: "NotFoundError: A requested file or directory could not be found.",
    })
  })

  it("a picked file that cannot be read names the Source and why", async () => {
    const { store, tracker } = setup()
    const result = await relinkPickedFile(SOURCE.id, handle, {
      store,
      tracker,
      relink: async () => ({
        ok: false,
        reason: "unreadable",
        detail: "NotReadableError: The file could not be read.",
      }),
      now: () => "2026-10-22T11:00:00.000Z",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe(
      "That file could not be used for interview.mp4. It could not be read. It may be open in another program, or on a drive that is no longer connected."
    )
    expect(result.detail).toBe("NotReadableError: The file could not be read.")
  })

  it("a matching file the engine cannot read leaves the Clips as they are", async () => {
    const { store, tracker } = setup()
    const before = store.getState().project
    tracker.attach.mockRejectedValueOnce(new Error('"renamed.mp4" could not be read'))
    const result = await relinkPickedFile(SOURCE.id, handle, {
      store,
      tracker,
      relink: async () => ({
        ok: true,
        file: new File([new Uint8Array(2048)], "renamed.mp4"),
        name: "renamed.mp4",
        fingerprint: { size: 2048, lastModified: 1 },
      }),
      now: () => "2026-10-22T11:00:00.000Z",
    })
    expect(result).toEqual({
      ok: false,
      message:
        "The file matches interview.mp4, but it could not be read. Its Clips stay as they are.",
      detail: '"renamed.mp4" could not be read',
    })
    expect(store.getState().project).toBe(before)
  })
})
