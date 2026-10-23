import { describe, expect, it } from "vitest"

import {
  applyCommand,
  CommandError,
  importCommands,
  MAX_VIDEO_TRACKS,
  type Command,
  type ImportRequest,
  type Project,
  type RefusalReason,
  type Source,
} from "../src/index"

// Every refusal carries a machine-readable `reason` (contracts/public-api.md §Refusals); the
// message stays for people and keeps its "applyCommand: <type>: ..." shape.

const AT = "2026-07-31T10:00:00.000Z"

const aSource = (overrides: Partial<Source> = {}): Source => ({
  id: "source-1",
  name: "a.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 100, lastModified: 1_754_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
  ...overrides,
})

const create: Command = {
  type: "create-project",
  at: AT,
  projectId: "p1",
  name: "P",
  timebase: { numerator: 30, denominator: 1 },
  frameSize: { width: 1920, height: 1080 },
  track: { id: "track-1", name: "Video 1" },
}
const importIt: Command = { type: "import-source", at: AT, source: aSource() }
const clipCmd = (over: Record<string, unknown> = {}, trackId = "track-1"): Command =>
  ({
    type: "add-clip",
    at: AT,
    trackId,
    clip: {
      id: "clip-1",
      sourceId: "source-1",
      startFrame: 0,
      durationFrames: 30,
      sourceInPoint: { numerator: 0, denominator: 1 },
      ...over,
    },
  }) as Command

const project = (): Project => {
  let p = applyCommand(null, create).project
  p = applyCommand(p, importIt).project
  p = applyCommand(p, clipCmd()).project
  return p
}

const refusal = (fn: () => unknown): CommandError => {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(CommandError)
    return error as CommandError
  }
  throw new Error("expected a refusal, but nothing was thrown")
}

const expectReason = (fn: () => unknown, reason: RefusalReason, type?: string) => {
  const error = refusal(fn)
  expect(error.reason).toBe(reason)
  expect(error.name).toBe("CommandError")
  if (type !== undefined) expect(error.message.startsWith(`applyCommand: ${type}: `)).toBe(true)
}

describe("exports", () => {
  it("MAX_VIDEO_TRACKS is 2", () => {
    expect(MAX_VIDEO_TRACKS).toBe(2)
  })
})

describe("applyCommand refusal reasons", () => {
  it("no-project: any command but create-project on null", () => {
    expectReason(() => applyCommand(null, importIt), "no-project", "import-source")
    expectReason(() => applyCommand(null, clipCmd()), "no-project", "add-clip")
    expectReason(
      () =>
        applyCommand(null, {
          type: "relink-source",
          at: AT,
          sourceId: "source-1",
          name: "a.mp4",
          fingerprint: { size: 1, lastModified: 1 },
        }),
      "no-project",
      "relink-source"
    )
  })

  it("invalid: create-project on an open Project", () => {
    expectReason(() => applyCommand(project(), create), "invalid", "create-project")
  })

  it("invalid: bad timestamp, empty id, non-whole Frame, malformed ratio", () => {
    expectReason(() => applyCommand(null, { ...create, at: "yesterday" }), "invalid")
    expectReason(() => applyCommand(null, { ...create, projectId: "" }), "invalid")
    expectReason(
      () => applyCommand(null, { ...create, timebase: { numerator: 0, denominator: 1 } }),
      "invalid"
    )
    expectReason(
      () => applyCommand(null, { ...create, frameSize: { width: 1.5, height: 1080 } }),
      "invalid"
    )
    const p = project()
    expectReason(
      () => applyCommand(p, { ...importIt, source: aSource({ id: "" }) } as Command),
      "invalid",
      "import-source"
    )
    expectReason(
      () => applyCommand(p, clipCmd({ id: "c2", startFrame: 40.5 })),
      "invalid",
      "add-clip"
    )
    expectReason(
      () => applyCommand(p, clipCmd({ id: "c2", startFrame: 40, durationFrames: 0 })),
      "invalid",
      "add-clip"
    )
    expectReason(
      () =>
        applyCommand(
          p,
          clipCmd({ id: "c2", startFrame: 40, sourceInPoint: { numerator: 1, denominator: 0 } })
        ),
      "invalid",
      "add-clip"
    )
    expectReason(
      () =>
        applyCommand(p, {
          type: "relink-source",
          at: "nope",
          sourceId: "source-1",
          name: "a.mp4",
          fingerprint: { size: 1, lastModified: 1 },
        }),
      "invalid",
      "relink-source"
    )
  })

  it("unknown-source", () => {
    const p = project()
    expectReason(
      () => applyCommand(p, clipCmd({ id: "c2", sourceId: "nope", startFrame: 40 })),
      "unknown-source",
      "add-clip"
    )
    expectReason(
      () =>
        applyCommand(p, {
          type: "relink-source",
          at: AT,
          sourceId: "nope",
          name: "a.mp4",
          fingerprint: { size: 1, lastModified: 1 },
        }),
      "unknown-source",
      "relink-source"
    )
  })

  it("unknown-track", () => {
    expectReason(
      () => applyCommand(project(), clipCmd({ id: "c2", startFrame: 40 }, "nope")),
      "unknown-track",
      "add-clip"
    )
  })

  it("duplicate-id: source id reused, clip id reused", () => {
    const p = project()
    expectReason(() => applyCommand(p, importIt), "duplicate-id", "import-source")
    expectReason(() => applyCommand(p, clipCmd({ startFrame: 40 })), "duplicate-id", "add-clip")
  })

  it("overlap: add-clip overlapping a neighbour on either side", () => {
    const p = project()
    expectReason(
      () => applyCommand(p, clipCmd({ id: "c2", startFrame: 10 })),
      "overlap",
      "add-clip"
    )
    const q = applyCommand(p, clipCmd({ id: "c3", startFrame: 100 })).project
    expectReason(
      () => applyCommand(q, clipCmd({ id: "c4", startFrame: 80, durationFrames: 30 })),
      "overlap",
      "add-clip"
    )
  })

  it("first rule wins: no-project before invalid", () => {
    expectReason(() => applyCommand(null, { ...importIt, at: "bad" } as Command), "no-project")
  })
})

describe("importCommands refusal reasons", () => {
  const request = (source: Source): ImportRequest => ({
    at: AT,
    source,
    clipId: "clip-1",
    projectId: "p1",
    trackId: "track-1",
  })

  it("too-short: a Source shorter than one Frame", () => {
    const error = refusal(() =>
      importCommands(null, request(aSource({ duration: { numerator: 0, denominator: 1 } })))
    )
    expect(error.reason).toBe("too-short")
    expect(error.message.startsWith("importCommands: ")).toBe(true)
  })

  it("invalid: an unusable duration", () => {
    const error = refusal(() =>
      importCommands(null, request(aSource({ duration: { numerator: 1, denominator: 0 } })))
    )
    expect(error.reason).toBe("invalid")
    expect(error.message.startsWith("importCommands: ")).toBe(true)
  })

  it("unknown-track: a Project with no video Track", () => {
    const p = project()
    const bare: Project = { ...p, timeline: { tracks: [], durationFrames: 0 } }
    const error = refusal(() => importCommands(bare, request(aSource({ id: "source-2" }))))
    expect(error.reason).toBe("unknown-track")
    expect(error.message.startsWith("importCommands: ")).toBe(true)
  })
})
