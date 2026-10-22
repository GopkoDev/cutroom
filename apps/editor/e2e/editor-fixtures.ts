// Shared by the specs that drive the running app's own store.
//
// Not a `*.spec.ts`, so Playwright does not collect it. The commands are written as `Command`s from
// `@cutroom/model` rather than as loose literals: they are posted into the real reducer, and a field
// renamed there should stop these compiling rather than fail at run time inside a page.

import type { Clip, Command, Project, Source } from "@cutroom/model"

/**
 * The store, reached the way the app reaches it. The Vite dev server serves this URL transformed
 * and the browser's module registry hands back the instance the app is already using, so a command
 * run from a test lands in the state the screen is rendering.
 */
export const STORE_MODULE = "/src/store/index.ts"

export const PROJECT_STORE_MODULE = "/src/storage/projects.ts"

export const DB_MODULE = "/src/storage/db.ts"

/** Small enough to read every pixel back, and a size nothing else in the app would produce. */
export const FRAME_SIZE = { width: 640, height: 360 }

export const CREATE_PROJECT: Command = {
  type: "create-project",
  projectId: "project-shell",
  name: "Opening titles",
  timebase: { numerator: 30, denominator: 1 },
  frameSize: FRAME_SIZE,
  track: { id: "track-1", name: "Video 1" },
  at: "2026-08-04T10:00:00.000Z",
}

const SOURCE: Source = {
  id: "source-1",
  name: "interview.mp4",
  address: { kind: "local-file" },
  fingerprint: { size: 4096, lastModified: 1_750_000_000_000 },
  duration: { numerator: 10, denominator: 1 },
  timebase: { numerator: 30, denominator: 1 },
  dimensions: FRAME_SIZE,
  hasAudio: true,
  codecs: { video: "avc1.640028", audio: "mp4a.40.2" },
}

const CLIP: Clip = {
  id: "clip-1",
  sourceId: "source-1",
  startFrame: 0,
  durationFrames: 300,
  sourceInPoint: { numerator: 0, denominator: 1 },
}

export const IMPORT_SOURCE: Command = {
  type: "import-source",
  source: SOURCE,
  at: "2026-08-04T10:01:00.000Z",
}

export const ADD_CLIP: Command = {
  type: "add-clip",
  trackId: "track-1",
  clip: CLIP,
  at: "2026-08-04T10:01:00.000Z",
}

/** A whole stored Project, for the specs that seed the library rather than build one by command. */
export function aStoredProject(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: 1,
    id: "project-alpha",
    name: "Opening titles",
    createdAt: "2026-08-01T09:00:00.000Z",
    modifiedAt: "2026-08-01T09:30:00.000Z",
    timebase: { numerator: 30000, denominator: 1001 },
    frameSize: { width: 1920, height: 1080 },
    sources: [SOURCE],
    timeline: {
      tracks: [{ id: "track-1", kind: "video", name: "Video 1", clips: [CLIP] }],
      durationFrames: 300,
    },
    ...overrides,
  }
}
