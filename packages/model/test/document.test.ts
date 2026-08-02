import { describe, expect, it } from "vitest"

import { migrateProject } from "../src/document/migrate"
import { parseProject } from "../src/document/parse"
import { CURRENT_SCHEMA_VERSION } from "../src/document/types"

// What these tests are for.
//
// `parseProject` is the last thing between a corrupted document and a user's lost work, so the
// rejections are tested one rule at a time and each assertion checks the *message* as well as the
// throw: an error that does not name the field it rejected is not much better than a crash. The
// documents below are built from plain literals rather than from typed fixtures, because the input
// is untrusted by definition — a fixture that only TypeScript could have produced would not
// exercise the parser at all.
//
// The two properties that are easy to lose later, and so are pinned hardest:
//
//   - the returned Project is plain data, proved by a `structuredClone` round-trip and by parsing
//     the same input twice and getting two structures that share no object with each other;
//   - the migration ladder actually runs, proved by a hand-written version-0 document that
//     `parseProject` refuses and `migrateProject` opens.

// ---------------------------------------------------------------------------- fixtures

const aSource = (overrides: Record<string, unknown> = {}) => ({
  id: "source-1",
  name: "sync-1080p30.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 12_345_678, lastModified: 1_754_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: { width: 1920, height: 1080 },
  hasAudio: true,
  codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
  ...overrides,
})

const aClip = (overrides: Record<string, unknown> = {}) => ({
  id: "clip-1",
  sourceId: "source-1",
  startFrame: 0,
  durationFrames: 300,
  sourceInPoint: { numerator: 0, denominator: 1 },
  ...overrides,
})

const aTrack = (overrides: Record<string, unknown> = {}) => ({
  id: "track-1",
  kind: "video",
  name: "Video 1",
  clips: [aClip()],
  ...overrides,
})

const aTimeline = (overrides: Record<string, unknown> = {}) => ({
  tracks: [aTrack()],
  durationFrames: 300,
  ...overrides,
})

const aProject = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: "project-1",
  name: "First cut",
  createdAt: "2026-07-31T09:00:00.000Z",
  modifiedAt: "2026-07-31T09:30:00.000Z",
  timebase: { numerator: 30000, denominator: 1001 },
  frameSize: { width: 1920, height: 1080 },
  sources: [aSource()],
  timeline: aTimeline(),
  ...overrides,
})

/** A Project whose Timeline holds exactly the Clips given, with the derived duration to match. */
const withClips = (clips: readonly Record<string, unknown>[], durationFrames: number) =>
  aProject({ timeline: aTimeline({ tracks: [aTrack({ clips })], durationFrames }) })

/** A Project whose single Clip differs from the fixture in one field. */
const withClip = (overrides: Record<string, unknown>) => {
  const clip = aClip(overrides)
  const startFrame = typeof clip.startFrame === "number" ? clip.startFrame : 0
  const durationFrames = typeof clip.durationFrames === "number" ? clip.durationFrames : 0
  return withClips([clip], startFrame + durationFrames)
}

// ---------------------------------------------------------------------- the valid document

describe("a valid Project", () => {
  it("is returned field for field", () => {
    expect(parseProject(aProject())).toEqual({
      schemaVersion: 1,
      id: "project-1",
      name: "First cut",
      createdAt: "2026-07-31T09:00:00.000Z",
      modifiedAt: "2026-07-31T09:30:00.000Z",
      timebase: { numerator: 30000, denominator: 1001 },
      frameSize: { width: 1920, height: 1080 },
      sources: [
        {
          id: "source-1",
          name: "sync-1080p30.mp4",
          address: { kind: "local-file" },
          fingerprint: { size: 12_345_678, lastModified: 1_754_000_000_000 },
          duration: { numerator: 10, denominator: 1 },
          timebase: { numerator: 30, denominator: 1 },
          dimensions: { width: 1920, height: 1080 },
          hasAudio: true,
          codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
        },
      ],
      timeline: {
        tracks: [
          {
            id: "track-1",
            kind: "video",
            name: "Video 1",
            clips: [
              {
                id: "clip-1",
                sourceId: "source-1",
                startFrame: 0,
                durationFrames: 300,
                sourceInPoint: { numerator: 0, denominator: 1 },
              },
            ],
          },
        ],
        durationFrames: 300,
      },
    })
  })

  // ADR 0004 and ADR 0007: the document is posted, stored and one day sent to a server. If it can
  // survive a structured clone unchanged it holds no class instance, no Map, no Date and no file
  // handle, which is the property those ADRs actually depend on.
  it("comes back deep-equal from structuredClone", () => {
    const parsed = parseProject(aProject())
    const cloned = structuredClone(parsed)

    expect(cloned).toEqual(parsed)
    expect(cloned).not.toBe(parsed)
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed)
  })

  it("is rebuilt, so it shares no object with the value it was parsed from", () => {
    const input = aProject()
    const once = parseProject(input)
    const twice = parseProject(input)

    expect(twice).toEqual(once)
    expect(twice).not.toBe(once)
    expect(twice.timeline).not.toBe(once.timeline)
    expect(twice.timeline.tracks[0]).not.toBe(once.timeline.tracks[0])
    expect(twice.sources[0]).not.toBe(once.sources[0])
  })

  it("is unaffected by later changes to the value it was parsed from", () => {
    const input: Record<string, unknown> = aProject()
    const parsed = parseProject(input)

    input.name = "changed afterwards"

    expect(parsed.name).toBe("First cut")
  })

  it("accepts Clips that butt-join exactly", () => {
    const parsed = parseProject(
      withClips(
        [
          aClip({ id: "clip-1", startFrame: 0, durationFrames: 120 }),
          aClip({ id: "clip-2", startFrame: 120, durationFrames: 90 }),
        ],
        210
      )
    )

    expect(parsed.timeline.durationFrames).toBe(210)
  })

  it("accepts a Source with no audio and no codecs recorded", () => {
    const parsed = parseProject(aProject({ sources: [aSource({ hasAudio: false, codecs: {} })] }))

    expect(parsed.sources[0]?.hasAudio).toBe(false)
    expect(parsed.sources[0]?.codecs).toEqual({})
  })

  it("accepts an empty Timeline and an empty Track", () => {
    expect(
      parseProject(aProject({ timeline: { tracks: [], durationFrames: 0 } })).timeline
    ).toEqual({ tracks: [], durationFrames: 0 })
    expect(parseProject(withClips([], 0)).timeline.tracks[0]?.clips).toEqual([])
  })
})

// -------------------------------------------------------------------------- Frames are integers

describe("Frames are integers", () => {
  const rejections: [string, unknown, RegExp][] = [
    ["a fractional startFrame", withClip({ startFrame: 10.5 }), /clips\[0\]\.startFrame.*10\.5/],
    ["a negative startFrame", withClip({ startFrame: -1 }), /clips\[0\]\.startFrame.*-1/],
    [
      "a fractional durationFrames",
      withClip({ durationFrames: 1.5 }),
      /clips\[0\]\.durationFrames.*1\.5/,
    ],
    [
      "a startFrame expressed as a string",
      withClip({ startFrame: "10" }),
      /clips\[0\]\.startFrame.*"10"/,
    ],
    ["a NaN startFrame", withClip({ startFrame: Number.NaN }), /clips\[0\]\.startFrame.*NaN/],
    [
      "an infinite startFrame",
      withClip({ startFrame: Number.POSITIVE_INFINITY }),
      /clips\[0\]\.startFrame.*Infinity/,
    ],
    [
      "a startFrame past the exact integers",
      withClip({ startFrame: 2 ** 53 }),
      /clips\[0\]\.startFrame/,
    ],
    [
      "a fractional Timeline duration",
      aProject({ timeline: aTimeline({ durationFrames: 300.5 }) }),
      /timeline\.durationFrames.*300\.5/,
    ],
  ]

  it.each(rejections)("rejects %s", (_description, document, message) => {
    expect(() => parseProject(document)).toThrow(message)
  })

  it("says what a Frame has to be, not merely that it was wrong", () => {
    expect(() => parseProject(withClip({ startFrame: 10.5 }))).toThrow(
      "parseProject: timeline.tracks[0].clips[0].startFrame must be a whole number of Frames, zero or greater, got 10.5"
    )
  })
})

// ------------------------------------------------------------------------------ durations

describe("durations", () => {
  it("rejects a Clip of zero Frames", () => {
    expect(() => parseProject(withClip({ durationFrames: 0 }))).toThrow(
      /clips\[0\]\.durationFrames must be a whole number of Frames, one or greater, got 0/
    )
  })

  it("rejects a Clip of negative length", () => {
    expect(() => parseProject(withClip({ durationFrames: -300 }))).toThrow(
      /clips\[0\]\.durationFrames.*-300/
    )
  })

  it("rejects a Timeline duration that disagrees with its Clips", () => {
    expect(() => parseProject(withClips([aClip({ durationFrames: 300 })], 299))).toThrow(
      /timeline\.durationFrames is 299, but the last Clip ends at Frame 300/
    )
  })

  it("rejects a Source duration whose denominator is zero", () => {
    expect(() =>
      parseProject(
        aProject({ sources: [aSource({ duration: { numerator: 10, denominator: 0 } })] })
      )
    ).toThrow(/sources\[0\]\.duration\.denominator must be a positive whole number, got 0/)
  })

  it("accepts a Source of zero length, which is odd but not corrupt", () => {
    const parsed = parseProject(
      aProject({ sources: [aSource({ duration: { numerator: 0, denominator: 1 } })] })
    )

    expect(parsed.sources[0]?.duration).toEqual({ numerator: 0, denominator: 1 })
  })
})

// ------------------------------------------------------------------------------ Clip layout

describe("Clips on a Track", () => {
  it("rejects two Clips that overlap by one Frame", () => {
    expect(() =>
      parseProject(
        withClips(
          [
            aClip({ id: "clip-1", startFrame: 0, durationFrames: 120 }),
            aClip({ id: "clip-2", startFrame: 119, durationFrames: 90 }),
          ],
          209
        )
      )
    ).toThrow(
      /clips\[1\] starts at Frame 119, but the Clip before it runs to Frame 120 — Clips on a Track are ordered by startFrame and must not overlap/
    )
  })

  it("rejects Clips that are not ordered by startFrame", () => {
    expect(() =>
      parseProject(
        withClips(
          [
            aClip({ id: "clip-1", startFrame: 200, durationFrames: 100 }),
            aClip({ id: "clip-2", startFrame: 0, durationFrames: 100 }),
          ],
          300
        )
      )
    ).toThrow(/clips\[1\].*ordered by startFrame/)
  })

  it("rejects a Clip pointing at a Source the Project does not have", () => {
    expect(() => parseProject(withClip({ sourceId: "source-9" }))).toThrow(
      /clips\[0\]\.sourceId is "source-9", which no Source in this Project carries/
    )
  })

  it("rejects a repeated Clip id", () => {
    expect(() =>
      parseProject(
        withClips(
          [
            aClip({ id: "clip-1", startFrame: 0, durationFrames: 100 }),
            aClip({ id: "clip-1", startFrame: 100, durationFrames: 100 }),
          ],
          200
        )
      )
    ).toThrow(/clips\[1\]\.id repeats the id "clip-1"/)
  })

  it("rejects a repeated Source id", () => {
    expect(() => parseProject(aProject({ sources: [aSource(), aSource()] }))).toThrow(
      /sources\[1\]\.id repeats the id "source-1"/
    )
  })

  it("rejects a Track kind this schema version does not have", () => {
    expect(() =>
      parseProject(aProject({ timeline: aTimeline({ tracks: [aTrack({ kind: "audio" })] }) }))
    ).toThrow(/tracks\[0\]\.kind must be "video"/)
  })
})

// ------------------------------------------------------------------------------- the Timebase

describe("the Timebase", () => {
  const rejections: [string, unknown, RegExp][] = [
    [
      "a denominator of zero",
      aProject({ timebase: { numerator: 30000, denominator: 0 } }),
      /timebase\.denominator must be a positive whole number, got 0/,
    ],
    [
      "a numerator of zero",
      aProject({ timebase: { numerator: 0, denominator: 1 } }),
      /timebase\.numerator must be a positive whole number, got 0/,
    ],
    [
      "a rate flattened to a float",
      aProject({ timebase: { numerator: 29.97, denominator: 1 } }),
      /timebase\.numerator must be a positive whole number, got 29\.97/,
    ],
    [
      "a Timebase given as a number",
      aProject({ timebase: 30 }),
      /timebase must be an object, got 30/,
    ],
    [
      "a missing Timebase",
      aProject({ timebase: undefined }),
      /timebase must be an object, got nothing/,
    ],
    [
      "a Source Timebase that is not a ratio",
      aProject({ sources: [aSource({ timebase: { numerator: 30, denominator: -1 } })] }),
      /sources\[0\]\.timebase\.denominator/,
    ],
  ]

  it.each(rejections)("rejects %s", (_description, document, message) => {
    expect(() => parseProject(document)).toThrow(message)
  })
})

// --------------------------------------------------------- things a saved document cannot contain

describe("the document is plain data", () => {
  class LocalHandle {
    readonly name = "sync-1080p30.mp4"
  }

  const rejections: [string, unknown, RegExp][] = [
    [
      "a Date where a timestamp string belongs",
      aProject({ createdAt: new Date("2026-07-31T09:00:00.000Z") }),
      /createdAt must be a string, got a Date/,
    ],
    ["a Map of Sources", aProject({ sources: new Map() }), /sources must be an array, got a Map/],
    [
      "a Set of Sources",
      aProject({ sources: new Set([aSource()]) }),
      /sources must be an array, got a Set/,
    ],
    [
      "a file handle standing in for an address",
      aProject({ sources: [aSource({ address: new LocalHandle() })] }),
      /sources\[0\]\.address must be a plain object, got a LocalHandle/,
    ],
    [
      "a function where a name belongs",
      aProject({ name: () => "First cut" }),
      /name must be a string, got a function/,
    ],
    [
      "a RegExp where an id belongs",
      aProject({ id: /project-1/ }),
      /id must be a string, got a RegExp/,
    ],
    [
      "a timestamp that is not ISO 8601",
      aProject({ modifiedAt: "31 July 2026" }),
      /modifiedAt must be an ISO 8601 date and time, got "31 July 2026"/,
    ],
    [
      "a date that does not exist",
      aProject({ modifiedAt: "2026-02-30T00:00:00.000Z" }),
      /modifiedAt must be an ISO 8601 date and time/,
    ],
    [
      "a frame size of zero",
      aProject({ frameSize: { width: 0, height: 1080 } }),
      /frameSize\.width must be a positive whole number of pixels, got 0/,
    ],
    [
      "hasAudio given as a string",
      aProject({ sources: [aSource({ hasAudio: "yes" })] }),
      /sources\[0\]\.hasAudio must be true or false, got "yes"/,
    ],
    [
      "a codec name that is explicitly undefined",
      aProject({ sources: [aSource({ codecs: { video: undefined } })] }),
      /sources\[0\]\.codecs\.video must be a string, got nothing/,
    ],
  ]

  it.each(rejections)("rejects %s", (_description, document, message) => {
    expect(() => parseProject(document)).toThrow(message)
  })

  it("rejects an unknown field rather than dropping it", () => {
    expect(() => parseProject(aProject({ author: "someone" }))).toThrow(
      /project has an unknown field "author" — known fields are/
    )
  })

  it("rejects a Project that is not an object at all", () => {
    expect(() => parseProject(null)).toThrow(/project must be an object, got null/)
    expect(() => parseProject([aProject()])).toThrow(/project must be an object, got an array/)
    expect(() => parseProject("{}")).toThrow(/project must be an object, got "\{\}"/)
  })
})

// -------------------------------------------------------------------------- versions and migration

/**
 * Hand-written, on purpose: version 0 is the shape from before `schemaVersion` existed, so it is
 * spelled out here in full rather than derived from the current fixture. If a later schema change
 * makes this document unmigratable, that is a real failure and it should be this test that says so.
 */
const versionZeroProject = () => ({
  id: "project-0",
  name: "Before schemaVersion existed",
  createdAt: "2026-06-01T08:00:00.000Z",
  modifiedAt: "2026-06-01T08:45:00.000Z",
  timebase: { numerator: 30, denominator: 1 },
  frameSize: { width: 1280, height: 720 },
  sources: [
    {
      id: "source-a",
      name: "silent-720p24.mp4",
      address: { kind: "local-file" },
      fingerprint: { size: 4_096, lastModified: 1_748_000_000_000 },
      duration: { numerator: 5, denominator: 1 },
      timebase: { numerator: 24, denominator: 1 },
      dimensions: { width: 1280, height: 720 },
      hasAudio: false,
      codecs: { video: "avc1.42E01E" },
    },
  ],
  timeline: {
    tracks: [
      {
        id: "track-a",
        kind: "video",
        name: "Video 1",
        clips: [
          {
            id: "clip-a",
            sourceId: "source-a",
            startFrame: 0,
            durationFrames: 150,
            sourceInPoint: { numerator: 0, denominator: 1 },
          },
        ],
      },
    ],
    durationFrames: 150,
  },
})

describe("schema versions", () => {
  it("refuses a document from a newer version rather than downgrading it", () => {
    expect(() => migrateProject(aProject({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }))).toThrow(
      /schema version 2, and this build of Cutroom understands version 1/
    )
    expect(() => migrateProject(aProject({ schemaVersion: 99 }))).toThrow(/There is no downgrade/)
  })

  it("refuses a newer document at the parser too, so the check cannot be walked around", () => {
    expect(() => parseProject(aProject({ schemaVersion: 2 }))).toThrow(
      /schemaVersion is 2.*will not be opened rather than opened wrongly/s
    )
  })

  it("tells a caller who parses an older document to migrate it instead", () => {
    expect(() => parseProject(aProject({ schemaVersion: 0 }))).toThrow(
      /schemaVersion is 0.*open an older Project with migrateProject/s
    )
  })

  it("rejects a schemaVersion that is not a whole number", () => {
    expect(() => migrateProject(aProject({ schemaVersion: "1" }))).toThrow(
      /schemaVersion must be a whole number, zero or greater, got "1"/
    )
    expect(() => migrateProject(aProject({ schemaVersion: 1.5 }))).toThrow(/schemaVersion/)
  })
})

describe("the migration chain", () => {
  it("refuses the version-0 document at the parser, and says what opens it", () => {
    expect(() => parseProject(versionZeroProject())).toThrow(
      "parseProject: schemaVersion is missing — a Project without one predates versioning, and migrateProject is what opens it"
    )
  })

  it("opens the version-0 document and brings it to the current version", () => {
    const migrated = migrateProject(versionZeroProject())

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated).toEqual({ ...versionZeroProject(), schemaVersion: CURRENT_SCHEMA_VERSION })
  })

  it("produces a document that is valid and still plain data", () => {
    const migrated = migrateProject(versionZeroProject())

    expect(parseProject(migrated)).toEqual(migrated)
    expect(structuredClone(migrated)).toEqual(migrated)
  })

  it("leaves the document it was given untouched", () => {
    const stored = versionZeroProject()

    migrateProject(stored)

    expect(stored).toEqual(versionZeroProject())
    expect("schemaVersion" in stored).toBe(false)
  })

  it("passes a current document straight through", () => {
    expect(migrateProject(aProject())).toEqual(parseProject(aProject()))
  })

  it("rejects something that is not a document at all", () => {
    expect(() => migrateProject(null)).toThrow(/a Project must be an object, got null/)
    expect(() => migrateProject([])).toThrow(/a Project must be an object, got an array/)
  })

  it("still validates what a migration produced", () => {
    expect(() =>
      migrateProject({ ...versionZeroProject(), timeline: { tracks: [], durationFrames: 7 } })
    ).toThrow(/timeline\.durationFrames is 7, but the last Clip ends at Frame 0/)
  })
})
