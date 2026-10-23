// An exported file, opened again in the page and read Frame by Frame (T085, T088).
//
// Not a `*.spec.ts`, so Playwright does not collect it.
//
// ## How Mediabunny reaches the page
//
// Mediabunny is a dependency of `packages/engine`, not of the editor, and the specs must not add
// one. So the page imports the very copy the engine depends on: `packages/engine/node_modules/
// mediabunny` is followed to where pnpm keeps it, and its single-file ESM bundle (`dist/bundles/
// mediabunny.mjs`, no imports of its own) is loaded over the Vite dev server's `/@fs/` path — the
// same route `engine-worker.spec.ts` uses for the worker. No version is written here, so the specs
// follow the engine's dependency wherever it moves. It is a second module instance beside the one
// in the engine's worker, which is what a reader of the file should be: it shares nothing with
// the code that wrote it.
//
// ## What it reads
//
// The export is read from OPFS, where the save-picker stand-in put it (`file-picker.ts`), and kept
// open in the page between calls. `openExport` reports the track as the file states it — size,
// codec, duration, and every video packet's timestamp, which is the Frame count and the Frame
// grid in one. `exportedFrame` decodes one output Frame, reads its burned-in counter with the same
// sampler as the Preview reader (`burned-in-counter.ts`), and — when asked — compares its pixels
// with the Preview canvas as it stands, in the same page task, so neither picture has to cross to
// Node.

import { realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { Page } from "@playwright/test"
import type { Timebase } from "@cutroom/model"

import {
  counterRegion,
  decodeCounter,
  sampleCounterCells,
  type CounterReading,
} from "./burned-in-counter"

const engineMediabunny = realpathSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/engine/node_modules/mediabunny"
  )
)

/** `/@fs/` + the absolute path, each segment escaped (the repository's path has a space in it). */
const toFs = (file: string) =>
  `/@fs${file
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment).replaceAll("%40", "@"))
    .join("/")}`

export const MEDIABUNNY_URL = toFs(path.join(engineMediabunny, "dist/bundles/mediabunny.mjs"))

const KEY = "__cutroomExportedFile"

export interface ExportedTrack {
  readonly width: number
  readonly height: number
  readonly codec: string | null
  /** The video track's duration as Mediabunny computes it from the packets, in seconds. */
  readonly videoSeconds: number
  /** Every video packet's presentation timestamp, in seconds, sorted. */
  readonly timestamps: readonly number[]
  readonly hasAudio: boolean
}

/** Opens `fileName` from OPFS with Mediabunny and keeps it open for `exportedFrame`. */
export async function openExport(page: Page, fileName: string): Promise<ExportedTrack> {
  return page.evaluate(
    async ({ url, name, key }) => {
      // Typed by hand: the editor does not depend on Mediabunny, so its declarations are not
      // reachable from here. Only what is used.
      interface Packet {
        readonly timestamp: number
      }
      interface VideoTrack {
        readonly displayWidth: number
        readonly displayHeight: number
        readonly codec: string | null
        computeDuration(): Promise<number>
      }
      interface Mediabunny {
        Input: new (init: { source: unknown; formats: unknown }) => {
          getPrimaryVideoTrack(): Promise<VideoTrack | null>
          getAudioTracks(): Promise<unknown[]>
        }
        BlobSource: new (blob: Blob) => unknown
        ALL_FORMATS: unknown
        EncodedPacketSink: new (track: VideoTrack) => {
          packets(): AsyncGenerator<Packet>
        }
        VideoSampleSink: new (track: VideoTrack) => unknown
      }
      const mb = (await import(/* @vite-ignore */ url)) as Mediabunny
      const directory = await navigator.storage.getDirectory()
      const file = await (await directory.getFileHandle(name)).getFile()
      const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
      const track = await input.getPrimaryVideoTrack()
      if (track === null) throw new Error(`${name} has no video track`)
      const timestamps: number[] = []
      for await (const packet of new mb.EncodedPacketSink(track).packets()) {
        timestamps.push(packet.timestamp)
      }
      timestamps.sort((a, b) => a - b)
      ;(window as unknown as Record<string, unknown>)[key] = {
        sink: new mb.VideoSampleSink(track),
      }
      return {
        width: track.displayWidth,
        height: track.displayHeight,
        codec: track.codec,
        videoSeconds: await track.computeDuration(),
        timestamps,
        hasAudio: (await input.getAudioTracks()).length > 0,
      }
    },
    { url: MEDIABUNNY_URL, name: fileName, key: KEY }
  )
}

/** How alike an exported Frame and the Preview's picture of it are. */
export interface Likeness {
  /** Mean absolute difference over every R, G and B value of the whole picture, 0–255. */
  readonly meanAbs: number
  /** Peak signal-to-noise ratio over the whole picture, dB; `Infinity` when identical. */
  readonly psnr: number
  /** Mean absolute difference inside the counter's rectangle, where the picture has detail. */
  readonly counterMeanAbs: number
  /** The share of the counter rectangle's pixels whose luma differs by more than 64. */
  readonly counterFlipped: number
}

export interface ExportedFrame {
  /** The decoded sample's own timestamp, seconds. */
  readonly timestamp: number
  readonly counter: CounterReading
  /** Only when compared: the Preview's counter, read off the same pixels the likeness used. */
  readonly previewCounter?: CounterReading
  readonly likeness?: Likeness
}

/**
 * Decodes output Frame `frame` of the export `openExport` opened — the sample shown half a Frame
 * after Frame `frame` starts on `timebase`'s grid, so a timestamp a hair early or late cannot pick
 * a neighbour — and reads its counter. With `comparePreview`, also compares it with the Preview
 * canvas as it is now; park the Playhead on the matching Timeline Frame first.
 */
export async function exportedFrame(
  page: Page,
  frame: number,
  timebase: Timebase,
  options: { comparePreview?: boolean } = {}
): Promise<ExportedFrame> {
  const result = await page.evaluate(
    async ({ key, at, sampler, compare, regionOf }) => {
      interface Sample {
        readonly timestamp: number
        readonly displayWidth: number
        readonly displayHeight: number
        draw(context: OffscreenCanvasRenderingContext2D, x: number, y: number): void
        close(): void
      }
      const held = (window as unknown as Record<string, { sink: unknown } | undefined>)[key]
      if (held === undefined) throw new Error("openExport first")
      const sink = held.sink as { getSample(t: number): Promise<Sample | null> }
      const sample = await sink.getSample(at)
      if (sample === null) throw new Error(`no exported Frame at ${at} s`)

      const width = sample.displayWidth
      const height = sample.displayHeight
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (context === null) throw new Error("no 2d context")
      sample.draw(context, 0, 0)
      const timestamp = sample.timestamp
      sample.close()
      const exported = context.getImageData(0, 0, width, height).data

      const sample6 = new Function(`return (${sampler})`)() as (
        data: Uint8ClampedArray,
        width: number,
        height: number
      ) => number[][]
      const cells = sample6(exported, width, height)
      if (!compare) return { timestamp, width, height, cells }

      const element = document.querySelector<HTMLCanvasElement>("[data-testid=preview-canvas]")
      if (element === null) throw new Error("the Preview canvas is not on the page")
      await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
      const bitmap = await createImageBitmap(element)
      if (bitmap.width !== width || bitmap.height !== height) {
        throw new Error(
          `the export is ${width}×${height} and the Preview ${bitmap.width}×${bitmap.height}`
        )
      }
      // A canvas of its own, as `readCounter` uses: drawn into the `willReadFrequently` canvas above,
      // the Preview's bitmap came out all black in Chrome 150.
      const previewContext = new OffscreenCanvas(width, height).getContext("2d")
      if (previewContext === null) throw new Error("no 2d context")
      previewContext.drawImage(bitmap, 0, 0)
      bitmap.close()
      const preview = previewContext.getImageData(0, 0, width, height).data

      let absSum = 0
      let squareSum = 0
      for (let p = 0; p < exported.length; p += 4) {
        for (let c = 0; c < 3; c++) {
          const d = exported[p + c]! - preview[p + c]!
          absSum += Math.abs(d)
          squareSum += d * d
        }
      }
      const values = (exported.length / 4) * 3
      const mse = squareSum / values

      const r = (
        new Function(`return (${regionOf})`)() as (h: number) => {
          x: number
          y: number
          width: number
          height: number
        }
      )(height)
      let regionAbs = 0
      let flipped = 0
      for (let y = r.y; y < r.y + r.height; y++) {
        for (let x = r.x; x < r.x + r.width; x++) {
          const p = (y * width + x) * 4
          const luma = (d: Uint8ClampedArray) =>
            0.2126 * d[p]! + 0.7152 * d[p + 1]! + 0.0722 * d[p + 2]!
          for (let c = 0; c < 3; c++) regionAbs += Math.abs(exported[p + c]! - preview[p + c]!)
          if (Math.abs(luma(exported) - luma(preview)) > 64) flipped += 1
        }
      }
      const regionPixels = r.width * r.height
      return {
        timestamp,
        width,
        height,
        cells,
        previewCells: sample6(preview, width, height),
        likeness: {
          meanAbs: absSum / values,
          psnr: mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse),
          counterMeanAbs: regionAbs / (regionPixels * 3),
          counterFlipped: flipped / regionPixels,
        },
      }
    },
    {
      key: KEY,
      at: ((frame + 0.5) * timebase.denominator) / timebase.numerator,
      sampler: sampleCounterCells.toString(),
      compare: options.comparePreview === true,
      regionOf: counterRegion.toString(),
    }
  )

  return {
    timestamp: result.timestamp,
    counter: decodeCounter(result.cells, result.width, result.height),
    ...("likeness" in result && result.likeness !== undefined
      ? {
          previewCounter: decodeCounter(result.previewCells, result.width, result.height),
          likeness: result.likeness,
        }
      : {}),
  }
}

/** Output Frame `frame`'s start on `timebase`'s grid, in seconds, as the file should state it. */
export const frameStart = (timebase: Timebase, frame: number) =>
  (frame * timebase.denominator) / timebase.numerator
