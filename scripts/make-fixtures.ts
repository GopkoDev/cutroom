#!/usr/bin/env node
// Generates the eight test fixtures quickstart.md names, into packages/engine/test/fixtures/.
// The output is gitignored: this script is the fixture, not the files it writes.
//
// Why the ffmpeg CLI and not mediabunny, the muxing library this project is otherwise built on:
// mediabunny encodes through WebCodecs, and Node has no WebCodecs — `'VideoEncoder' in globalThis`
// is false on Node 22. There is no encoder for it to drive here. The alternatives were to run this
// inside a headless browser (a Playwright dependency for a step that has to finish *before*
// Playwright can run at all — T013 blocks every e2e task) or to shell out to ffmpeg. ffmpeg wins:
// no ordering knot, and fixtures produced by a different implementation than the one under test
// are better evidence than fixtures produced by the code they are meant to check.
//
// Why the frame counter is drawn from a sprite instead of ffmpeg's `drawtext`: `drawtext` needs
// libfreetype, and the Homebrew `ffmpeg` formula (8.1.2) is built without it — `ffmpeg -filters`
// lists no drawtext. Rather than require the much larger `ffmpeg-full`, the digits are drawn here
// from a 5x7 bitmap font into a grayscale sprite of the ten glyphs stacked vertically, and each
// digit position crops the row it needs using ffmpeg's `n` (frame number) variable. The counter is
// therefore exact by construction: frame 45 reads 000045, with no rounding anywhere.
//
// Usage:
//   pnpm fixtures                      generate whatever is missing
//   pnpm fixtures --force              regenerate everything
//   pnpm fixtures sync-1080p30.mp4     generate just these, missing or not

import { spawn } from "node:child_process"
import {
  mkdirSync,
  existsSync,
  statSync,
  truncateSync,
  copyFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const outDir = join(root, "packages/engine/test/fixtures")
const scratch = join(tmpdir(), "cutroom-fixtures")

// ---------------------------------------------------------------- the frame counter

// A 5x7 bitmap font. Only the digits exist because only digits are ever drawn.
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

const DIGITS = 6 // 999999 frames — over nine hours at 30 fps, so the counter never wraps

type Sprite = { path: string; cellWidth: number; cellHeight: number; margin: number }

/**
 * Writes the ten digits as one grayscale PGM, stacked vertically in equal cells, so that cropping
 * at `cellHeight * d` yields the glyph for `d`. PGM because ffmpeg reads it natively and it is
 * three lines of header plus raw bytes — no image library, no extra dependency.
 */
function writeSprite(frameHeight: number): Sprite {
  // Even, so that half of it is still a whole pixel. An odd scale used to give a fractional pad,
  // every glyph row landed half a pixel out, and the 720p counter came out visibly mangled while
  // 1080p — where the scale happened to be even — looked perfect.
  const scale = Math.max(6, Math.round((frameHeight / 1080) * 16 * 0.5) * 2)
  const pad = scale / 2
  const cellWidth = 5 * scale + pad * 2
  const cellHeight = 7 * scale + pad * 2
  const pixels = new Uint8Array(cellWidth * cellHeight * 10)

  for (let digit = 0; digit <= 9; digit++) {
    const rows = GLYPHS[digit]!
    for (let gy = 0; gy < 7; gy++) {
      const row = rows[gy]!
      for (let gx = 0; gx < 5; gx++) {
        if (row[gx] !== "1") continue
        for (let sy = 0; sy < scale; sy++) {
          const y = digit * cellHeight + pad + gy * scale + sy
          const x = pad + gx * scale
          pixels.fill(255, y * cellWidth + x, y * cellWidth + x + scale)
        }
      }
    }
  }

  const path = join(scratch, `digits-${cellWidth}x${cellHeight}.pgm`)
  const header = Buffer.from(`P5\n${cellWidth} ${cellHeight * 10}\n255\n`, "ascii")
  writeFileSync(path, Buffer.concat([header, Buffer.from(pixels)]))
  return { path, cellWidth, cellHeight, margin: Math.round(frameHeight / 27) }
}

/**
 * The filtergraph that burns the counter in. Input 0 is the picture, input 1 the sprite; each
 * digit position crops its glyph out of the sprite using the frame number and is composited at a
 * fixed offset. `[counter]` is the labelled result.
 */
function counterFilter({ cellWidth, cellHeight, margin }: Sprite): string {
  const steps: string[] = []
  steps.push(`[1:v]split=${DIGITS}${Array.from({ length: DIGITS }, (_, i) => `[s${i}]`).join("")}`)

  for (let i = 0; i < DIGITS; i++) {
    const place = 10 ** (DIGITS - 1 - i)
    steps.push(
      `[s${i}]crop=${cellWidth}:${cellHeight}:0:'${cellHeight}*mod(trunc(n/${place}),10)'[d${i}]`
    )
  }

  for (let i = 0; i < DIGITS; i++) {
    const over = i === 0 ? "[0:v]" : `[o${i - 1}]`
    steps.push(`${over}[d${i}]overlay=${margin + i * cellWidth}:${margin}[o${i}]`)
  }

  steps.push(`[o${DIGITS - 1}]format=yuv420p[counter]`)
  return steps.join(";")
}

// A 1 kHz tone gated to the first 20 ms of every second: audible as a click, and its onset is
// exactly on the whole second, which is what the A/V alignment assertions read.
const CLICK_TRACK = "aevalsrc='0.6*sin(2*PI*1000*t)*lt(mod(t,1),0.02)':s=48000"

// ---------------------------------------------------------------------- running ffmpeg

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "inherit"] })
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}\n  ${args.join(" ")}`))
    )
  })
}

function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    child.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()))
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}`))
    )
  })
}

type MovingFixture = {
  name: string
  width: number
  height: number
  timebase: string // exact ratio, as ffmpeg takes it — never a decimal
  seconds: number
  audio: boolean
  crf: number
  preset: string
}

async function encodeMoving(f: MovingFixture, target: string): Promise<void> {
  const sprite = writeSprite(f.height)
  const gop = Math.round(ratioToNumber(f.timebase) * 2) // a keyframe every two seconds, as ordinary footage has

  const args = [
    "-y",
    "-hide_banner",
    "-v",
    "error",
    "-stats",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${f.width}x${f.height}:r=${f.timebase}`,
    "-loop",
    "1",
    "-framerate",
    f.timebase,
    "-i",
    sprite.path,
  ]

  if (f.audio) args.push("-f", "lavfi", "-i", CLICK_TRACK)

  args.push(
    "-filter_complex",
    counterFilter(sprite),
    "-map",
    "[counter]",
    ...(f.audio ? ["-map", "2:a"] : []),
    "-t",
    String(f.seconds),
    "-c:v",
    "libx264",
    "-preset",
    f.preset,
    "-crf",
    String(f.crf),
    "-g",
    String(gop),
    "-pix_fmt",
    "yuv420p",
    ...(f.audio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : []),
    // moov at the front, so reading a Source's metadata is a short read at the start of the file
    // rather than a seek to the end of seventy minutes of it.
    "-movflags",
    "+faststart",
    target
  )

  await run("ffmpeg", args)
}

/** Evaluates an exact ratio like "30000/1001" — used only for the keyframe interval. */
function ratioToNumber(ratio: string): number {
  const [numerator, denominator = "1"] = ratio.split("/")
  return Number(numerator) / Number(denominator)
}

// -------------------------------------------------------------------- the eight fixtures

const MOVING: MovingFixture[] = [
  {
    name: "sync-1080p30.mp4",
    width: 1920,
    height: 1080,
    timebase: "30",
    seconds: 30,
    audio: true,
    crf: 20,
    preset: "veryfast",
  },
  {
    name: "sync-1080p2997.mp4",
    width: 1920,
    height: 1080,
    timebase: "30000/1001",
    seconds: 30,
    audio: true,
    crf: 20,
    preset: "veryfast",
  },
  {
    name: "sync-1080p30-10min.mp4",
    width: 1920,
    height: 1080,
    timebase: "30",
    seconds: 600,
    audio: true,
    crf: 22,
    preset: "veryfast",
  },
  {
    name: "silent-720p24.mp4",
    width: 1280,
    height: 720,
    timebase: "24",
    seconds: 10,
    audio: false,
    crf: 20,
    preset: "veryfast",
  },
  {
    // Exists only to prove that importing an hour of footage does not read an hour of footage, so
    // its picture is worth nothing to anybody: the cheapest preset and a high CRF are the point.
    name: "long-1080p30-70min.mp4",
    width: 1920,
    height: 1080,
    timebase: "30",
    seconds: 70 * 60,
    audio: true,
    crf: 32,
    preset: "ultrafast",
  },
]

const builders: Record<string, (target: string) => Promise<void>> = {}

for (const fixture of MOVING) {
  builders[fixture.name] = (target) => encodeMoving(fixture, target)
}

builders["audio-only.m4a"] = (target) =>
  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-v",
    "error",
    "-stats",
    "-f",
    "lavfi",
    "-i",
    CLICK_TRACK,
    "-t",
    "10",
    "-vn",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    target,
  ])

builders["still.png"] = async (target) => {
  const sprite = writeSprite(1080)
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=1920x1080:r=30",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    sprite.path,
    "-filter_complex",
    counterFilter(sprite),
    "-map",
    "[counter]",
    "-frames:v",
    "1",
    target,
  ])
}

builders["broken.mp4"] = async (target) => {
  // Truncation only makes a file unreadable if what is missing is the part that describes it. The
  // other fixtures are written with `+faststart`, so cutting them short would leave a perfectly
  // readable header over a short body — a file that imports fine and fails later, which is not
  // what "refused" means. So: remux without faststart, putting the moov atom at the end, then
  // throw the end away. The result has no index at all and fails when its metadata is read, which
  // is the refusal T040 and the quickstart walk-through are looking for.
  const whole = join(scratch, "broken-source.mp4")
  const source = join(outDir, "sync-1080p30.mp4")
  if (!existsSync(source))
    throw new Error("broken.mp4 is cut from sync-1080p30.mp4, which is missing")

  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-v",
    "error",
    "-i",
    source,
    "-c",
    "copy",
    "-f",
    "mp4",
    whole,
  ])
  copyFileSync(whole, target)
  truncateSync(target, Math.floor(statSync(whole).size * 0.3))
  rmSync(whole, { force: true })
}

// `broken.mp4` is cut from `sync-1080p30.mp4`, so it is built last whatever order was asked for.
const ORDER = [...MOVING.map((f) => f.name), "audio-only.m4a", "still.png", "broken.mp4"]

// ----------------------------------------------------------------------------- reporting

async function describe(name: string): Promise<string> {
  const path = join(outDir, name)
  const megabytes = (statSync(path).size / 1e6).toFixed(1)

  try {
    const probe = await capture("ffprobe", [
      "-v",
      "error",
      "-of",
      "json",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate",
      path,
    ])
    const { streams = [], format = {} } = JSON.parse(probe) as {
      streams?: {
        codec_type: string
        codec_name: string
        width?: number
        height?: number
        r_frame_rate?: string
      }[]
      format?: { duration?: string }
    }
    const video = streams.find((s) => s.codec_type === "video")
    const audio = streams.find((s) => s.codec_type === "audio")
    const duration = format.duration ? `${Number(format.duration).toFixed(2)}s` : "—"
    const picture = video
      ? `${video.width}x${video.height} ${video.r_frame_rate} ${video.codec_name}`
      : "no video"
    return `${name.padEnd(26)} ${megabytes.padStart(7)} MB  ${duration.padStart(9)}  ${picture}, ${audio ? audio.codec_name : "no audio"}`
  } catch {
    return `${name.padEnd(26)} ${megabytes.padStart(7)} MB   unreadable by ffprobe — which is what this one is for`
  }
}

// --------------------------------------------------------------------------------- main

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const force = argv.includes("--force")
  const asked = argv.filter((a) => !a.startsWith("--"))
  const unknown = asked.filter((a) => !ORDER.includes(a))
  if (unknown.length)
    throw new Error(`no such fixture: ${unknown.join(", ")}\nknown: ${ORDER.join(", ")}`)

  mkdirSync(outDir, { recursive: true })
  mkdirSync(scratch, { recursive: true })

  const wanted = asked.length ? ORDER.filter((n) => asked.includes(n)) : ORDER

  for (const name of wanted) {
    const target = join(outDir, name)
    if (existsSync(target) && !force && !asked.includes(name)) {
      console.log(`· ${name} — already there`)
      continue
    }
    const started = Date.now()
    process.stdout.write(`→ ${name}\n`)
    await builders[name]!(target)
    console.log(`✓ ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }

  rmSync(scratch, { recursive: true, force: true })

  console.log(`\nfixtures in ${outDir}`)
  for (const name of ORDER) {
    if (existsSync(join(outDir, name))) console.log(`  ${await describe(name)}`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
