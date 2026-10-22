// What the unsupported-browser gate checks (FR-023), kept apart from the component so the check can
// be called, and tested, against a scope that is not the real browser.
//
// **What is checked is what is actually depended on, not a wishlist.** ADR 0006 is specific: the
// one capability structurally absent outside Chromium is the *persisted file handle*, and
// everything else — WebCodecs, OffscreenCanvas in a worker, Web Audio, IndexedDB — exists in Safari
// and Firefox too. So the list below is short, and each entry is here because a named requirement
// or module stops working without it. Two of them are worth arguing:
//
//   * `FileSystemHandle.prototype.queryPermission` is the ADR's capability, and it is checked for
//     itself. `showOpenFilePicker` existing does not imply it: a browser can offer a picker and no
//     way to ask whether a *stored* handle may still be read, which is exactly what reopening a
//     Project needs (`storage/source-links.ts`, FR-020, FR-021). Without it every Project reopens
//     Offline for ever, and the failure appears one session after the one that caused it.
//   * `AudioEncoder` is deliberately **not** checked. FR-024 designs for a machine that cannot
//     encode sound: the export dialog says so and requires an explicit choice to continue without
//     it. Gating arrival on it would refuse a browser the product has a considered answer for.
//
// Codecs are not checked here either, and could not be: `canEncode` is asynchronous and per codec,
// and the answer belongs to the engine's `ready` message where the export dialog can use it
// (Principle I, research R5). This answers a different question — whether the platform has the
// *shapes* the product is built out of — and answers it synchronously, so there is no moment in
// which a broken editor is on screen.

/** One thing the product cannot be built without, and what the user loses if it is absent. */
export interface Capability {
  /** What it is called in the platform, as a person would search for it. */
  readonly name: string
  /** What stops working without it, in the product's terms rather than the platform's. */
  readonly needed: string
}

/** The part of the global scope the checks read. `globalThis` in the app; a plain object in tests. */
export type CapabilityScope = Record<string, unknown>

interface Requirement extends Capability {
  /** Whether `scope` has it. Synchronous, so the notice is right on the first render. */
  readonly present: (scope: CapabilityScope) => boolean
}

function prototypeOf(scope: CapabilityScope, name: string): Record<string, unknown> | undefined {
  const constructor = scope[name]
  return typeof constructor === "function"
    ? (constructor.prototype as Record<string, unknown>)
    : undefined
}

const REQUIRED: readonly Requirement[] = [
  {
    name: "showOpenFilePicker",
    present: (scope) => "showOpenFilePicker" in scope,
    needed: "choosing a video file to bring in as a Source",
  },
  {
    name: "showSaveFilePicker",
    present: (scope) => "showSaveFilePicker" in scope,
    needed: "choosing where to write an exported file",
  },
  {
    name: "FileSystemHandle.queryPermission",
    present: (scope) => "queryPermission" in (prototypeOf(scope, "FileSystemHandle") ?? {}),
    needed: "reopening a Project with its Sources still attached, without importing them again",
  },
  {
    name: "OffscreenCanvas",
    // `transferControlToOffscreen` is checked as a method rather than inferred from
    // `OffscreenCanvas` existing: the Preview needs the transfer, not just the type.
    present: (scope) =>
      typeof scope.OffscreenCanvas === "function" &&
      typeof prototypeOf(scope, "HTMLCanvasElement")?.transferControlToOffscreen === "function",
    needed: "compositing the Preview off the main thread, so sound is never interrupted by picture",
  },
  {
    name: "VideoDecoder",
    present: (scope) => "VideoDecoder" in scope,
    needed: "decoding your footage to show it",
  },
  {
    name: "VideoEncoder",
    present: (scope) => "VideoEncoder" in scope,
    needed: "exporting a finished file",
  },
  {
    name: "AudioDecoder",
    present: (scope) => "AudioDecoder" in scope,
    needed: "playing a Clip's sound in step with its picture",
  },
  {
    name: "indexedDB",
    present: (scope) => "indexedDB" in scope,
    needed: "keeping your Projects between sessions",
  },
  {
    name: "Worker",
    present: (scope) => "Worker" in scope,
    needed: "running the media engine at all",
  },
]

/**
 * The capabilities `scope` is missing, in the order they are listed above. Empty means Cutroom can
 * run. A check that throws counts as missing — a platform that raises on being asked whether it has
 * something has answered.
 */
export function missingCapabilities(
  scope: CapabilityScope = globalThis as unknown as CapabilityScope
): Capability[] {
  return REQUIRED.filter((requirement) => {
    try {
      return !requirement.present(scope)
    } catch {
      return true
    }
  }).map(({ name, needed }) => ({ name, needed }))
}

/**
 * A page served over plain HTTP loses the File System Access API and more, without any of them
 * throwing — they are simply not there. Naming it separately turns "this browser is unsupported"
 * into the true and actionable "this page is not on a secure origin".
 */
export function insecureContext(
  scope: CapabilityScope = globalThis as unknown as CapabilityScope
): boolean {
  return scope.isSecureContext === false
}
