// The frame counter burned into every moving fixture, read back off the Preview canvas.
//
// Not a `*.spec.ts`, so Playwright does not collect it. Shared by the specs that need to know
// *which* Source Frame the engine drew (T053 scrubbing, T066–T068 playback).

import type { Page } from "@playwright/test"

// ---------------------------------------------------------------- reading the counter back
//
// The counter's geometry and font are those `scripts/make-fixtures.ts` draws (T013), copied rather
// than imported: that file is a script with top-level work, not a module. Six digits, each a 5×7
// grid of `scale`-pixel squares, white on black, at (margin, margin).

const GLYPHS: Record<number, string[]> = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
}

const DIGITS = 6

export interface CounterReading {
  /** The digits as read, `?` where a cell matched no glyph. */
  readonly text: string
  /** The weakest lit/unlit decision, 0–127: how far the closest sample sat from the threshold. */
  readonly margin: number
  readonly width: number
  readonly height: number
}

/**
 * Reads the counter out of the Preview canvas. Each of the 35 squares of each digit is sampled as
 * the mean luma of its central half (so H.264 ringing at the glyph edges never decides anything)
 * and called lit above mid-grey. A digit is the glyph whose bitmap matches exactly — no nearest
 * match, so a smeared or misplaced picture reads as `?`, not as a plausible wrong number.
 */
export async function readCounter(page: Page): Promise<CounterReading> {
  const { samples, width, height } = await page.evaluate(
    async ({ digits }) => {
      const element = document.querySelector<HTMLCanvasElement>("[data-testid=preview-canvas]")
      if (element === null) throw new Error("the Preview canvas is not on the page")
      // The worker's frames reach the element when the compositor next runs.
      await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))

      const bitmap = await createImageBitmap(element)
      const probe = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = probe.getContext("2d")
      if (context === null) throw new Error("no 2d context to read the Frame back through")
      context.drawImage(bitmap, 0, 0)

      // `writeSprite`'s geometry in make-fixtures.ts, for a picture this tall.
      const h = bitmap.height
      const scale = Math.max(6, Math.round((h / 1080) * 16 * 0.5) * 2)
      const pad = scale / 2
      const cellWidth = 5 * scale + pad * 2
      const margin = Math.round(h / 27)
      const inset = Math.floor(scale / 4)
      const side = scale - inset * 2

      const lumas: number[][] = []
      for (let i = 0; i < digits; i++) {
        const cell: number[] = []
        for (let gy = 0; gy < 7; gy++) {
          for (let gx = 0; gx < 5; gx++) {
            const x = margin + i * cellWidth + pad + gx * scale + inset
            const y = margin + pad + gy * scale + inset
            const { data } = context.getImageData(x, y, side, side)
            let sum = 0
            for (let p = 0; p < data.length; p += 4) {
              sum += 0.2126 * data[p]! + 0.7152 * data[p + 1]! + 0.0722 * data[p + 2]!
            }
            cell.push(sum / (side * side))
          }
        }
        lumas.push(cell)
      }
      return { samples: lumas, width: bitmap.width, height: bitmap.height }
    },
    { digits: DIGITS }
  )

  let weakest = Number.POSITIVE_INFINITY
  let text = ""
  for (const cell of samples) {
    const bits = cell.map((luma) => {
      weakest = Math.min(weakest, Math.abs(luma - 127.5))
      return luma > 127.5 ? "1" : "0"
    })
    const pattern = bits.join("")
    const digit = Object.entries(GLYPHS).find(([, rows]) => rows.join("") === pattern)
    text += digit === undefined ? "?" : digit[0]
  }
  return { text, margin: Math.round(weakest), width, height }
}

export const counterText = (frame: number) => String(frame).padStart(DIGITS, "0")
