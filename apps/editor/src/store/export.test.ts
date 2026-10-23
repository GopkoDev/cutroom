import { describe, expect, it, vi } from "vitest"

import type { EngineEvent } from "@cutroom/engine/protocol"
import { importCommands, projectScene, type Source } from "@cutroom/model"

import type { ExportOutcome, ExportRequest } from "@/engine-client"
import { createEditorStore } from "@/store"
import type { StreamExportAudioOptions } from "@/audio/offline-mix"
import type { ExportSettings } from "@/ui/export-settings"

import {
  createExportController,
  freezeForExport,
  suggestedFileName,
  type ExportEngine,
} from "./export"

// The controller's promises are about order (the picker before anything else), about what crosses
// to the engine (the Timeline as it stood at the click), about one export at a time, and about
// never leaving a partial file looking finished. The editor store is the real one; the engine, the
// picker, the destination and the mix are stand-ins stepped by hand.

const SOURCE: Source = {
  id: "source-1",
  name: "sync-1080p30.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 4096, lastModified: 1_750_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028" },
}

const WITH_SOUND: ExportSettings = {
  video: { codec: "avc", bitrate: 8_000_000 },
  audio: { codec: "aac", bitrate: 192_000, sampleRate: 48_000, channels: 2 },
}
const SILENT: ExportSettings = { video: WITH_SOUND.video, audio: null }

function editorWithProject() {
  const store = createEditorStore({
    saver: { save: vi.fn(), flush: vi.fn(async () => undefined) },
    loadProject: vi.fn(async () => undefined),
  })
  store.getState().newProject()
  store.getState().transact("Import", () => {
    for (const command of importCommands(null, {
      at: "2026-10-23T10:00:00.000Z",
      source: SOURCE,
      clipId: "clip-1",
      projectId: "project-1",
      trackId: "track-1",
    })) {
      store.getState().run(command)
    }
  })
  return store
}

/** Lets every pending promise callback run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function fakeEngine() {
  const listeners = new Map<string, Set<(event: EngineEvent) => void>>()
  let finish: { settle: (o: ExportOutcome) => void; refuse: (e: Error) => void } | null = null
  const transferred: WritableStream[] = []
  const engine = {
    startExport: vi.fn((_request: ExportRequest, writable: WritableStream) => {
      transferred.push(writable)
      return new Promise<ExportOutcome>((settleIt, refuse) => {
        finish = { settle: settleIt, refuse }
      })
    }),
    cancelExport: vi.fn(),
    sendExportAudioChunk: vi.fn(),
    requestExportAudio: vi.fn(),
    on: ((type: string, listener: (event: EngineEvent) => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
      return () => set.delete(listener)
    }) as ExportEngine["on"],
  }
  return {
    engine,
    /** The streams the "worker" was handed, as it would write to them. */
    transferred,
    emit(event: EngineEvent) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event)
    },
    finish(outcome: ExportOutcome) {
      finish?.settle(outcome)
    },
    /** As the worker finishes: close the stream (which commits the file), then say `done`. */
    async finishDone(bytes: number) {
      await transferred.at(-1)?.getWriter().close()
      finish?.settle({ status: "done", bytes })
    },
    fail(reason: string) {
      finish?.refuse(new Error(reason))
    },
  }
}

/** A destination file: its contents change when the "worker" writes to it. */
function fakeDestination(name = "Interview.mp4", existing?: { size: number }) {
  let file: { size: number; lastModified: number } | null = existing
    ? { size: existing.size, lastModified: 1 }
    : { size: 0, lastModified: 1 } // the save picker creates an empty file for a new name
  const writable = {
    write: vi.fn<(chunk: unknown) => Promise<void>>(async () => undefined),
    close: vi.fn(async () => undefined),
    abort: vi.fn<(reason?: unknown) => Promise<void>>(async () => undefined),
  }
  const handle = {
    name,
    getFile: vi.fn(async () => {
      if (file === null) throw new DOMException("gone", "NotFoundError")
      return file
    }),
    createWritable: vi.fn(async () => writable),
    remove: vi.fn(async () => {
      file = null
    }),
  }
  return {
    handle: handle as unknown as FileSystemFileHandle,
    raw: handle,
    writable,
    written(size: number) {
      file = { size, lastModified: 2 }
    },
    exists: () => file !== null,
  }
}

function setup(
  options: {
    destination?: ReturnType<typeof fakeDestination>
    sourceAt?: (destination: FileSystemFileHandle) => Promise<string | undefined>
  } = {}
) {
  const editor = editorWithProject()
  const engine = fakeEngine()
  const destination = options.destination ?? fakeDestination()
  const order: string[] = []
  const pickDestination = vi.fn(async (name: string): Promise<FileSystemFileHandle | null> => {
    order.push(`pick ${name}`)
    return destination.handle
  })
  const mixes: StreamExportAudioOptions[] = []
  const streamAudio = vi.fn(async (request: StreamExportAudioOptions) => {
    mixes.push(request)
  })
  let clock = 1000
  const controller = createExportController({
    engine: engine.engine,
    pickDestination,
    streamAudio,
    ...(options.sourceAt === undefined ? {} : { sourceAt: options.sourceAt }),
    now: () => clock,
  })
  return {
    editor,
    engine,
    destination,
    controller,
    pickDestination,
    streamAudio,
    mixes,
    order,
    status: () => controller.store.getState().status,
    tick(ms: number) {
      clock += ms
    },
  }
}

describe("starting", () => {
  it("opens the save picker before anything else, in the same task as the click", () => {
    const t = setup()
    const project = t.editor.getState().project!
    void t.controller.start(project, WITH_SOUND)
    // Synchronously: nothing awaited before the picker.
    expect(t.pickDestination).toHaveBeenCalledTimes(1)
    expect(t.pickDestination).toHaveBeenCalledWith("sync-1080p30.mp4")
    expect(t.status().phase).toBe("choosing-destination")
  })

  it("posts the Scene as it stood at the click, untouched by edits made afterwards (FR-019)", async () => {
    const t = setup()
    const project = t.editor.getState().project!
    const atClick = JSON.parse(JSON.stringify(projectScene(project)))

    void t.controller.start(project, WITH_SOUND)
    // An edit while the export runs: a second Clip lengthens the Timeline.
    t.editor.getState().transact("Import", () => {
      for (const command of importCommands(t.editor.getState().project, {
        at: "2026-10-23T10:01:00.000Z",
        source: { ...SOURCE, id: "source-2" },
        clipId: "clip-2",
        projectId: "unused",
        trackId: "unused",
      })) {
        t.editor.getState().run(command)
      }
    })
    await settle()

    const [request] = t.engine.engine.startExport.mock.calls[0]
    expect(request.scene).toEqual(atClick)
    expect(request.scene.clips).toHaveLength(1)
    expect(request.range).toEqual({ fromFrame: 0, toFrame: 300 })
    expect(t.editor.getState().project!.timeline.durationFrames).toBe(600)
    expect(Object.isFrozen(request.scene)).toBe(true)
    expect(request.video).toEqual({ codec: "avc", bitrate: 8_000_000 })
    expect(request.audio).toEqual(WITH_SOUND.audio)
    // The worker is handed a stream that writes through to the destination's.
    const relay = t.engine.engine.startExport.mock.calls[0][1]
    const chunk = { type: "write", data: new Uint8Array([1, 2]), position: 0 }
    await relay.getWriter().write(chunk)
    expect(t.destination.writable.write).toHaveBeenCalledWith(chunk)
  })

  it("streams the mix of the same frozen Timeline when there is sound, and none without", async () => {
    const t = setup()
    const project = t.editor.getState().project!
    void t.controller.start(project, WITH_SOUND)
    await settle()
    expect(t.mixes).toHaveLength(1)
    const [mix] = t.mixes
    expect(mix.scene).toBe(t.engine.engine.startExport.mock.calls[0][0].scene)
    expect(mix.range).toEqual({ fromFrame: 0, toFrame: 300 })
    expect(mix.sampleRate).toBe(48_000)

    // `send` reaches the engine, and `acks` hears `export-audio-ack`.
    const heard: number[] = []
    mix.acks((startSample) => heard.push(startSample))
    t.engine.emit({ type: "export-audio-ack", startSample: 4800 })
    expect(heard).toEqual([4800])
    const left = new Float32Array(4)
    mix.send([left, left], 0, false)
    expect(t.engine.engine.sendExportAudioChunk).toHaveBeenCalledWith([left, left], 0, false)

    // `pcm` asks the worker, and is answered by the `export-audio-pcm` naming the same Frame.
    const pulled = mix.pcm.pull(90, new AbortController().signal)
    expect(t.engine.engine.requestExportAudio).toHaveBeenCalledWith(90)
    t.engine.emit({ type: "export-audio-pcm", toFrame: 90, chunks: [] })
    expect(await pulled).toEqual([])

    const silent = setup()
    void silent.controller.start(silent.editor.getState().project!, SILENT)
    await settle()
    expect(silent.streamAudio).not.toHaveBeenCalled()
    expect(silent.engine.engine.startExport.mock.calls[0][0].audio).toBeNull()
  })

  it("does nothing when the picker is closed", async () => {
    const t = setup()
    t.pickDestination.mockResolvedValueOnce(null)
    await t.controller.start(t.editor.getState().project!, WITH_SOUND)
    expect(t.status()).toEqual({ phase: "idle" })
    expect(t.engine.engine.startExport).not.toHaveBeenCalled()
  })

  it("runs one export at a time: a second start does not even open the picker", async () => {
    const t = setup()
    const project = t.editor.getState().project!
    void t.controller.start(project, WITH_SOUND)
    void t.controller.start(project, WITH_SOUND) // while choosing
    await settle()
    expect(t.status().phase).toBe("running")
    void t.controller.start(project, WITH_SOUND) // while running
    expect(t.pickDestination).toHaveBeenCalledTimes(1)
    expect(t.engine.engine.startExport).toHaveBeenCalledTimes(1)

    await t.engine.finishDone(10)
    await settle()
    void t.controller.start(project, WITH_SOUND) // after it ended
    expect(t.pickDestination).toHaveBeenCalledTimes(2)
  })
})

describe("a destination that is a Source's own file", () => {
  it("is refused before the file is read, opened or written, and left exactly as it was", async () => {
    const destination = fakeDestination("sync-1080p30.mp4", { size: 4096 })
    const sourceAt = vi.fn(async (handle: FileSystemFileHandle) =>
      handle === destination.handle ? SOURCE.id : undefined
    )
    const t = setup({ destination, sourceAt })

    await t.controller.start(t.editor.getState().project!, WITH_SOUND)

    expect(sourceAt).toHaveBeenCalledWith(destination.handle)
    expect(t.status()).toEqual({
      phase: "refused",
      fileName: "sync-1080p30.mp4",
      sourceName: "sync-1080p30.mp4",
    })
    expect(destination.raw.getFile).not.toHaveBeenCalled()
    expect(destination.raw.createWritable).not.toHaveBeenCalled()
    expect(destination.raw.remove).not.toHaveBeenCalled()
    expect(t.engine.engine.startExport).not.toHaveBeenCalled()
    expect(t.streamAudio).not.toHaveBeenCalled()

    // Not busy: dismissed, the next export can start.
    t.controller.dismiss()
    expect(t.status()).toEqual({ phase: "idle" })
  })

  it("lets any other destination through", async () => {
    const t = setup({ sourceAt: vi.fn(async () => undefined) })
    void t.controller.start(t.editor.getState().project!, WITH_SOUND)
    await settle()
    expect(t.status().phase).toBe("running")
    expect(t.engine.engine.startExport).toHaveBeenCalledTimes(1)
  })
})

describe("progress", () => {
  it("follows export-progress, with the start time for elapsed and remaining", async () => {
    const t = setup()
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    expect(t.status()).toMatchObject({
      phase: "running",
      framesDone: 0,
      framesTotal: 300,
      startedAt: 1000,
    })

    t.engine.emit({ type: "export-progress", framesDone: 150, framesTotal: 300 })
    expect(t.status()).toMatchObject({ phase: "running", framesDone: 150 })

    t.tick(4000)
    t.destination.written(5000)
    await t.engine.finishDone(5000)
    await settle()
    expect(t.status()).toEqual({
      phase: "done",
      fileName: "Interview.mp4",
      bytes: 5000,
      elapsedMs: 4000,
      withSound: false,
    })
    expect(t.destination.exists()).toBe(true)
  })
})

describe("endings short of done", () => {
  it("cancel asks the engine, stops the mix, and removes what was written", async () => {
    const t = setup()
    void t.controller.start(t.editor.getState().project!, WITH_SOUND)
    await settle()
    t.destination.written(1234)

    t.controller.cancel()
    expect(t.status().phase).toBe("cancelling")
    expect(t.engine.engine.cancelExport).toHaveBeenCalledTimes(1)
    expect(t.mixes[0].signal.aborted).toBe(true)

    t.engine.finish({ status: "cancelled" })
    await settle()
    expect(t.status()).toEqual({
      phase: "cancelled",
      fileName: "Interview.mp4",
      leftover: "removed",
    })
    expect(t.destination.exists()).toBe(false)
  })

  it("a failure is reported plainly and the partial file removed (T083)", async () => {
    const t = setup()
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    t.destination.written(999)
    t.engine.fail("the destination is no longer writable")
    await settle()
    expect(t.status()).toEqual({
      phase: "failed",
      fileName: "Interview.mp4",
      stage: "running",
      reason: "the destination is no longer writable",
      leftover: "removed",
    })
    expect(t.destination.exists()).toBe(false)
  })

  it("leaves a replaced file alone when the export never wrote to it", async () => {
    const destination = fakeDestination("Old cut.mp4", { size: 50_000 })
    const t = setup({ destination })
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    t.controller.cancel()
    t.engine.finish({ status: "cancelled" })
    await settle()
    expect(t.status()).toMatchObject({ phase: "cancelled", leftover: "untouched" })
    expect(destination.raw.remove).not.toHaveBeenCalled()
  })

  it("says a file is unfinished when it cannot be removed", async () => {
    const destination = fakeDestination()
    destination.raw.remove.mockRejectedValueOnce(
      new DOMException("no", "NoModificationAllowedError")
    )
    const t = setup({ destination })
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    destination.written(10)
    t.engine.fail("encoder error")
    await settle()
    expect(t.status()).toMatchObject({ phase: "failed", leftover: "unfinished" })
  })

  it("a mix that fails stops the export rather than finishing it silent (FR-024)", async () => {
    const t = setup()
    t.streamAudio.mockRejectedValueOnce(new Error("decode error"))
    void t.controller.start(t.editor.getState().project!, WITH_SOUND)
    await settle()
    expect(t.engine.engine.cancelExport).toHaveBeenCalledTimes(1)
    t.engine.finish({ status: "cancelled" })
    await settle()
    expect(t.status()).toMatchObject({
      phase: "failed",
      stage: "mixing",
      reason: "decode error",
    })
  })

  it("a stream the engine never took is aborted, not left open", async () => {
    const t = setup()
    t.engine.engine.startExport.mockImplementationOnce(() =>
      Promise.reject(new Error("The Cutroom engine stopped: boom"))
    )
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    expect(t.destination.writable.abort).toHaveBeenCalled()
    expect(t.status()).toMatchObject({
      phase: "failed",
      reason: "The Cutroom engine stopped: boom",
    })
  })

  it("dismiss returns to idle only once the export has ended", async () => {
    const t = setup()
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    t.controller.dismiss()
    expect(t.status().phase).toBe("running")
    await t.engine.finishDone(1)
    await settle()
    t.controller.dismiss()
    expect(t.status()).toEqual({ phase: "idle" })
  })
})

describe("the stream the worker writes to (forwardingWritable)", () => {
  it("commits the file on close, and is done only once that close has finished", async () => {
    const t = setup()
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    t.engine.finish({ status: "done", bytes: 7 }) // `export-done` overtaking the close
    await settle()
    expect(t.status().phase).toBe("running")
    await t.engine.transferred[0].getWriter().close()
    await settle()
    expect(t.destination.writable.close).toHaveBeenCalledTimes(1)
    expect(t.status()).toMatchObject({ phase: "done", bytes: 7 })
  })

  it("a close that fails to commit is a failure, not a finished file", async () => {
    const t = setup()
    t.destination.writable.close.mockRejectedValueOnce(
      new DOMException("disk full", "QuotaExceededError")
    )
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    await t.engine.transferred[0]
      .getWriter()
      .close()
      .catch(() => {})
    t.engine.finish({ status: "done", bytes: 7 })
    await settle()
    expect(t.status()).toMatchObject({
      phase: "failed",
      stage: "committing",
      reason: "QuotaExceededError: disk full",
    })
  })

  it("passes an abort on to the file, discarding it", async () => {
    const t = setup()
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    await t.engine.transferred[0].getWriter().abort(new Error("export did not finish"))
    expect(t.destination.writable.abort).toHaveBeenCalled()
    expect(t.destination.writable.close).not.toHaveBeenCalled()
  })
})

describe("where a failure happened, for the words the dialog gives it (T093)", () => {
  it("a save dialog that could not open is `choosing`, and nothing was written", async () => {
    const t = setup()
    t.pickDestination.mockRejectedValueOnce(
      new DOMException("Must be handling a user gesture", "SecurityError")
    )
    await t.controller.start(t.editor.getState().project!, SILENT)
    expect(t.status()).toEqual({
      phase: "failed",
      fileName: null,
      stage: "choosing",
      reason: "SecurityError: Must be handling a user gesture",
      leftover: null,
    })
    expect(t.engine.engine.startExport).not.toHaveBeenCalled()
  })

  it("a destination that cannot be opened for writing is `opening`", async () => {
    const t = setup()
    t.destination.raw.createWritable.mockRejectedValueOnce(
      new DOMException("not allowed", "NotAllowedError")
    )
    await t.controller.start(t.editor.getState().project!, SILENT)
    expect(t.status()).toMatchObject({
      phase: "failed",
      fileName: "Interview.mp4",
      stage: "opening",
      reason: "NotAllowedError: not allowed",
    })
    expect(t.engine.engine.startExport).not.toHaveBeenCalled()
  })

  it("a write the destination refused is named as the cause, not the engine's symptom of it", async () => {
    const t = setup()
    t.destination.writable.write.mockRejectedValueOnce(
      new DOMException("There is not enough space on the disk.", "QuotaExceededError")
    )
    void t.controller.start(t.editor.getState().project!, SILENT)
    await settle()
    await t.engine.transferred[0]
      .getWriter()
      .write({ type: "write", data: new Uint8Array(4), position: 0 })
      .catch(() => {})
    t.engine.fail("Cannot close a ERRORED writable stream")
    await settle()
    expect(t.status()).toMatchObject({
      phase: "failed",
      stage: "running",
      reason:
        "QuotaExceededError: There is not enough space on the disk.\n(Cannot close a ERRORED writable stream)",
    })
  })

  it("an engine that stopped mid-export is `running`, with its words kept", async () => {
    const t = setup()
    t.engine.engine.startExport.mockImplementationOnce(() => {
      const error = new Error("The Cutroom engine stopped: boom")
      error.name = "EngineFatalError"
      return Promise.reject(error)
    })
    await t.controller.start(t.editor.getState().project!, SILENT)
    expect(t.status()).toMatchObject({
      phase: "failed",
      stage: "running",
      reason: "EngineFatalError: The Cutroom engine stopped: boom",
    })
  })
})

describe("helpers", () => {
  it("freezes the whole Timeline from Frame 0", () => {
    const project = editorWithProject().getState().project!
    const frozen = freezeForExport(project)
    expect(frozen.scene).toBe(projectScene(project))
    expect(frozen.range).toEqual({ fromFrame: 0, toFrame: project.timeline.durationFrames })
  })

  it("suggests the Project's name as an MP4, without path separators", () => {
    const project = editorWithProject().getState().project!
    expect(suggestedFileName({ ...project, name: "Cut 1/2: final" })).toBe("Cut 1-2- final.mp4")
    expect(suggestedFileName({ ...project, name: "  " })).toBe("Cutroom export.mp4")
  })
})
