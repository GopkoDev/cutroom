// Which of the browser APIs Cutroom cannot work without are absent (FR-023). Kept apart from the
// component so the check can be called, and tested, without rendering anything.

export interface MissingCapability {
  readonly name: string
  readonly why: string
}

const REQUIRED: readonly { name: string; why: string; present(scope: object): boolean }[] = [
  {
    name: "showOpenFilePicker",
    why: "needed to open your video files in place, without copying them",
    present: (scope) => "showOpenFilePicker" in scope,
  },
  {
    name: "OffscreenCanvas",
    why: "needed to draw the preview off the main thread",
    present: (scope) => "OffscreenCanvas" in scope,
  },
  {
    name: "WebCodecs",
    why: "needed to decode and encode video",
    present: (scope) => "VideoDecoder" in scope && "VideoEncoder" in scope,
  },
]

/** What is absent from `scope`, in a fixed order. Empty means the browser can run Cutroom. */
export function missingCapabilities(scope: object = globalThis): MissingCapability[] {
  return REQUIRED.filter((need) => !need.present(scope)).map(({ name, why }) => ({ name, why }))
}
