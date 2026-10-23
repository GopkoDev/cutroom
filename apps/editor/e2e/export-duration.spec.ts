import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"

import { expect, test, type Page } from "@playwright/test"

import { frameToSampleIndex, frameToSeconds, type Timebase } from "@cutroom/model"

import { MEDIABUNNY_URL, openExport } from "./exported-file"
import { installFilePicker, type FilePicker } from "./file-picker"
import { importFixture, newProject } from "./playback"

// SC-006, as far as a test can hold it (T086): an exported file lasts exactly as long as the
// Timeline, and its sound is where the picture says it is — at the start and still at the end.
// This is also the permanent regression test for ADR 0014: Chrome's AAC encoder puts 2112 samples
// of priming before the mix, nothing in WebCodecs says so, and without the edit list the engine
// writes into the `moov` every export played 44 ms late with a tail past the last Frame.
//
// ## Duration: from the container, exactly
//
// Mediabunny's `computeDuration()` is packet-based and ignores where the sound's edit ends, so it
// reads up to one AAC packet long (1024 samples) by design; it is recorded, not asserted. The
// file's own boxes say what a player is told, so they are parsed here in Node and held to the
// Timeline exactly, as integers: `mvhd`, both `tkhd`s, the video's media duration and the sound's
// `elst` segment all equal `frameToSeconds(timebase, durationFrames)` on their own clocks, the
// sound's edit starts a positive priming into its media, and its `roll` group (distance −1, every
// packet) is there — without that group AVFoundation trims its own 2112 on top of the edit and
// plays 44 ms early (ADR 0014), and QuickTime is one of SC-006's three players. ffprobe is asked
// too, as an independent reading of the same boxes.
//
// ## Sync: the clicks, decoded twice
//
// The fixtures click on every whole second of their own time: a 20 ms 1 kHz tone gated on at the
// second (scripts/make-fixtures.ts). The Timeline places Source time on its own sample grid
// (ADR 0012), so the click of Source second s in a Clip starting at Frame f belongs at Timeline
// sample `frameToSampleIndex(f) + s × 48000`. Each click is found by correlating the decoded sound
// with that tone over ±3000 samples (±62 ms — the bug was +2112) and must land within ±2 samples
// of where it belongs, every one of them, the first seconds and the last. The tone's own cycles
// are 48 samples apart, and the 20 ms gate puts the neighbouring cycle's correlation at 95 % of
// the true one, so the lag is unambiguous on sound this clean; the fixtures themselves, decoded
// by ffmpeg, measure 0 at every click.
//
// The fix exists because decoders disagree about edit lists, so two read it:
//
//   * **Chrome**, through Web Audio's `decodeAudioData` — the third named player, and the one
//     that honours the edit's end too, so its sample count is the Timeline's exactly.
//   * **ffmpeg** on the host, the library under VLC's and most other players' AAC: it honours the
//     priming but plays the edit past its end to the last packet, so its count may run up to one
//     packet (1024 samples) over and no further. Host ffmpeg is already a requirement of this
//     repository — `pnpm fixtures` makes every fixture with it.
//
// AVFoundation itself cannot be driven from here; the `roll` group above is what it needs, and
// T084's notes record it decoding these clicks on the sample.

const TIMEBASE: Timebase = { numerator: 30, denominator: 1 }
const SAMPLE_RATE = 48_000
/** How far either side of its place a click is looked for, and how close it must land. */
const SEARCH = 3000
const TOLERANCE = 2
/** One AAC packet: the most ffmpeg's decode may run past the edit's end. */
const AAC_PACKET = 1024

// ------------------------------------------------------------------------- the file's boxes

interface Mp4Box {
  readonly type: string
  readonly body: Buffer
  readonly children: Mp4Box[]
}

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"])

function parseBoxes(bytes: Buffer, from = 0, to = bytes.length): Mp4Box[] {
  const boxes: Mp4Box[] = []
  let at = from
  while (at + 8 <= to) {
    let size = bytes.readUInt32BE(at)
    const type = bytes.toString("latin1", at + 4, at + 8)
    let header = 8
    if (size === 1) {
      size = Number(bytes.readBigUInt64BE(at + 8))
      header = 16
    } else if (size === 0) {
      size = to - at
    }
    if (size < header || at + size > to) throw new Error(`box "${type}" at ${at} overruns`)
    const body = bytes.subarray(at + header, at + size)
    boxes.push({
      type,
      body,
      children: CONTAINERS.has(type) ? parseBoxes(bytes, at + header, at + size) : [],
    })
    at += size
  }
  return boxes
}

function child(box: Mp4Box, type: string): Mp4Box {
  const found = box.children.filter((each) => each.type === type)
  if (found.length !== 1)
    throw new Error(`expected one "${type}" in "${box.type}", ${found.length}`)
  return found[0]!
}

const maybeChild = (box: Mp4Box, type: string) => box.children.find((each) => each.type === type)

/** `mvhd`/`mdhd`: timescale and duration; `tkhd`: duration only (timescale 0). */
function header(box: Mp4Box): { timescale: number; duration: number } {
  const wide = box.body[0] === 1
  const times = wide ? 4 + 8 + 8 : 4 + 4 + 4
  if (box.type === "tkhd") {
    const at = times + 8
    return {
      timescale: 0,
      duration: wide ? Number(box.body.readBigUInt64BE(at)) : box.body.readUInt32BE(at),
    }
  }
  return {
    timescale: box.body.readUInt32BE(times),
    duration: wide ? Number(box.body.readBigUInt64BE(times + 4)) : box.body.readUInt32BE(times + 4),
  }
}

interface Edit {
  readonly segmentDuration: number
  readonly mediaTime: number
  readonly rate: number
}

function edits(trak: Mp4Box): Edit[] | null {
  const edts = maybeChild(trak, "edts")
  if (edts === undefined) return null
  const body = child(edts, "elst").body
  const wide = body[0] === 1
  const out: Edit[] = []
  let at = 8
  for (let entry = 0; entry < body.readUInt32BE(4); entry++) {
    if (wide) {
      out.push({
        segmentDuration: Number(body.readBigUInt64BE(at)),
        mediaTime: Number(body.readBigInt64BE(at + 8)),
        rate: body.readInt16BE(at + 16),
      })
      at += 20
    } else {
      out.push({
        segmentDuration: body.readUInt32BE(at),
        mediaTime: body.readInt32BE(at + 4),
        rate: body.readInt16BE(at + 8),
      })
      at += 12
    }
  }
  return out
}

/** The one `sgpd`/`sbgp` pair of grouping type `roll`: its distance and how many packets it covers. */
function rollGroup(stbl: Mp4Box): { distance: number; members: number } | null {
  const sgpd = stbl.children.find(
    (each) => each.type === "sgpd" && each.body.toString("latin1", 4, 8) === "roll"
  )
  const sbgp = stbl.children.find(
    (each) => each.type === "sbgp" && each.body.toString("latin1", 4, 8) === "roll"
  )
  if (sgpd === undefined || sbgp === undefined) return null
  // sgpd v1: version/flags, grouping type, default length, entry count, then one int16 per entry.
  const distance = sgpd.body.readInt16BE(sgpd.body[0] === 1 ? 16 : 12)
  // sbgp v0: version/flags, grouping type, entry count, then (sample count, description index).
  let members = 0
  for (let entry = 0; entry < sbgp.body.readUInt32BE(8); entry++) {
    if (sbgp.body.readUInt32BE(16 + entry * 8) !== 0)
      members += sbgp.body.readUInt32BE(12 + entry * 8)
  }
  return { distance, members }
}

interface Container {
  readonly movie: { timescale: number; duration: number }
  readonly video: {
    tkhd: number
    media: { timescale: number; duration: number }
    edits: Edit[] | null
  }
  readonly sound: {
    tkhd: number
    media: { timescale: number; duration: number }
    edits: Edit[] | null
    packets: number
    roll: { distance: number; members: number } | null
  }
}

function readContainer(file: Buffer): Container {
  const top = parseBoxes(file)
  const moov = top.find((box) => box.type === "moov")
  if (moov === undefined) throw new Error("no moov")
  const traks = moov.children.filter((box) => box.type === "trak")
  const handler = (trak: Mp4Box) =>
    child(child(trak, "mdia"), "hdlr").body.toString("latin1", 8, 12)
  const pick = (kind: string) => {
    const found = traks.filter((trak) => handler(trak) === kind)
    if (found.length !== 1) throw new Error(`expected one "${kind}" track, found ${found.length}`)
    return found[0]!
  }
  const video = pick("vide")
  const sound = pick("soun")
  const stbl = (trak: Mp4Box) => child(child(child(trak, "mdia"), "minf"), "stbl")
  return {
    movie: header(child(moov, "mvhd")),
    video: {
      tkhd: header(child(video, "tkhd")).duration,
      media: header(child(child(video, "mdia"), "mdhd")),
      edits: edits(video),
    },
    sound: {
      tkhd: header(child(sound, "tkhd")).duration,
      media: header(child(child(sound, "mdia"), "mdhd")),
      edits: edits(sound),
      packets: child(stbl(sound), "stsz").body.readUInt32BE(8),
      roll: rollGroup(stbl(sound)),
    },
  }
}

// ------------------------------------------------------------------------------- the clicks

/**
 * For each expected click position, the lag (in samples) at which the decoded sound best matches
 * the fixture's click — 20 ms of a 1 kHz sine starting at the position — within ±`search`, and how
 * strong that match is relative to a perfect, full-level click. Plain JavaScript with nothing
 * from outside, because it also runs in the page, passed there as its source text.
 */
function findClicks(
  samples: Float32Array,
  sampleRate: number,
  positions: readonly number[],
  search: number
): { lag: number; strength: number }[] {
  const length = Math.round(sampleRate * 0.02)
  const tone = new Float32Array(length)
  for (let i = 0; i < length; i++) tone[i] = Math.sin((2 * Math.PI * 1000 * i) / sampleRate)
  // The fixture's click is 0.6 × the tone; a perfect match scores 0.6 × Σ tone².
  let ideal = 0
  for (let i = 0; i < length; i++) ideal += 0.6 * tone[i]! * tone[i]!
  return positions.map((position) => {
    let best = Number.NEGATIVE_INFINITY
    let lag = 0
    for (let d = -search; d <= search; d++) {
      const start = position + d
      if (start < 0 || start + length > samples.length) continue
      let score = 0
      for (let i = 0; i < length; i++) score += samples[start + i]! * tone[i]!
      if (score > best) {
        best = score
        lag = d
      }
    }
    return { lag, strength: best / ideal }
  })
}

/** Decodes the export in the page with Web Audio, at 48 kHz, and finds the clicks there. */
async function webAudioClicks(page: Page, fileName: string, positions: readonly number[]) {
  return page.evaluate(
    async ({ name, rate, at, search, finder }) => {
      const directory = await navigator.storage.getDirectory()
      const file = await (await directory.getFileHandle(name)).getFile()
      const context = new OfflineAudioContext(2, 1, rate)
      const decoded = await context.decodeAudioData(await file.arrayBuffer())
      const find = new Function(`return (${finder})`)() as typeof findClicks
      return {
        length: decoded.length,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        clicks: find(decoded.getChannelData(0), decoded.sampleRate, at, search),
      }
    },
    {
      name: fileName,
      rate: SAMPLE_RATE,
      at: positions,
      search: SEARCH,
      finder: findClicks.toString(),
    }
  )
}

/** Decodes the export on the host with ffmpeg, to mono 48 kHz floats, and finds the clicks there. */
function ffmpegClicks(file: string, positions: readonly number[]) {
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", String(SAMPLE_RATE)].concat([
      "-f",
      "f32le",
      "-c:a",
      "pcm_f32le",
      "-",
    ]),
    { maxBuffer: 1 << 30 }
  )
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4)
  return { length: samples.length, clicks: findClicks(samples, SAMPLE_RATE, positions, SEARCH) }
}

/** ffprobe's reading of the container: the format's and each stream's duration, in seconds. */
function ffprobeDurations(file: string) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type,duration,start_time",
    "-of",
    "json",
    file,
  ]).toString()
  const parsed = JSON.parse(out) as {
    format: { duration: string }
    streams: { codec_type: string; duration: string; start_time: string }[]
  }
  const stream = (kind: string) => parsed.streams.find((each) => each.codec_type === kind)!
  return {
    format: Number(parsed.format.duration),
    video: Number(stream("video").duration),
    videoStart: Number(stream("video").start_time),
    audio: Number(stream("audio").duration),
    audioStart: Number(stream("audio").start_time),
  }
}

// ----------------------------------------------------------------------------- the export

async function exportThroughTheDialog(page: Page, picker: FilePicker, name: string) {
  await page.getByTestId("export-open").click()
  const dialog = page.getByTestId("export-dialog")
  await expect(
    dialog.locator('[data-testid="export-quality"][data-quality="standard"] input')
  ).toBeChecked({ timeout: 10_000 })
  // AAC, not the Opus fallback: the edit list is AAC's (ADR 0014).
  await expect(dialog.getByTestId("export-sound")).toHaveAttribute("data-sound", "available")
  await picker.queueSave(name)
  await dialog.getByTestId("export-start").click()
  const done = dialog.getByTestId("export-done")
  await expect(done).toBeVisible({ timeout: 150_000 })
  const bytes = Number(await done.getAttribute("data-bytes"))
  await dialog.getByTestId("export-dismiss").click()
  const file = await picker.readFile(name)
  expect(file.length).toBe(bytes)
  return file
}

/** The Timeline's length in Frames, as the Clips on screen state it. */
async function timelineFrames(page: Page): Promise<number> {
  const clips = page.getByTestId("timeline-clip")
  let end = 0
  for (let index = 0; index < (await clips.count()); index++) {
    const clip = clips.nth(index)
    end = Math.max(
      end,
      Number(await clip.getAttribute("data-start-frame")) +
        Number(await clip.getAttribute("data-duration-frames"))
    )
  }
  return end
}

/**
 * Every assertion of this file, on one export: `clips` says where each Clip starts and how many
 * whole Source seconds — clicks — it carries.
 */
async function checkExport(
  page: Page,
  file: Buffer,
  name: string,
  durationFrames: number,
  clips: readonly { startFrame: number; seconds: number }[]
) {
  const expectedSeconds = frameToSeconds(TIMEBASE, durationFrames)
  const samplesTotal =
    frameToSampleIndex(TIMEBASE, SAMPLE_RATE, durationFrames) -
    frameToSampleIndex(TIMEBASE, SAMPLE_RATE, 0)
  /** `ticks` on a clock of `timescale` is exactly the Timeline's length — integers only. */
  const isTimelineLong = (ticks: number, timescale: number) =>
    ticks * TIMEBASE.numerator === durationFrames * TIMEBASE.denominator * timescale

  // ---- The container, exactly.
  const box = readContainer(file)
  const { movie, video, sound } = box
  const where = JSON.stringify(box)
  expect(isTimelineLong(movie.duration, movie.timescale), `mvhd: ${where}`).toBe(true)
  expect(movie.duration / movie.timescale).toBe(expectedSeconds)
  expect(isTimelineLong(video.tkhd, movie.timescale), `video tkhd: ${where}`).toBe(true)
  expect(isTimelineLong(video.media.duration, video.media.timescale), `video mdhd: ${where}`).toBe(
    true
  )
  if (video.edits !== null) {
    // Mediabunny's own: the whole picture, from its start.
    expect(video.edits).toEqual([{ segmentDuration: video.tkhd, mediaTime: 0, rate: 1 }])
  }
  // The sound: one edit, starting after the priming and lasting exactly the Timeline.
  expect(sound.edits, `sound elst: ${where}`).toHaveLength(1)
  const edit = sound.edits![0]!
  expect(edit.rate).toBe(1)
  expect(isTimelineLong(edit.segmentDuration, movie.timescale), `sound elst: ${where}`).toBe(true)
  expect(sound.tkhd).toBe(edit.segmentDuration)
  expect(sound.media.timescale).toBe(SAMPLE_RATE)
  expect(edit.mediaTime, "the priming the edit skips").toBeGreaterThan(0)
  // The media covers the edit, and by less than one packet more: the padding past it was dropped.
  const mediaAfterEdit = sound.media.duration - edit.mediaTime
  expect(mediaAfterEdit).toBeGreaterThanOrEqual(samplesTotal)
  expect(mediaAfterEdit).toBeLessThan(samplesTotal + AAC_PACKET)
  expect(sound.roll, "the AAC roll group AVFoundation needs").toEqual({
    distance: -1,
    members: sound.packets,
  })

  // ---- ffprobe's reading of the same boxes.
  const onDisk = test.info().outputPath(name)
  writeFileSync(onDisk, file)
  const probed = ffprobeDurations(onDisk)
  expect(probed.format).toBeCloseTo(expectedSeconds, 6)
  expect(probed.video).toBeCloseTo(expectedSeconds, 6)
  expect(probed.audio).toBeCloseTo(expectedSeconds, 6)
  expect(probed.videoStart).toBe(0)
  expect(probed.audioStart).toBe(0)

  // ---- The picture's own packets: one per Frame, the last starting one Frame before the end.
  const track = await openExport(page, name)
  expect(track.timestamps).toHaveLength(durationFrames)
  expect(track.timestamps[0]).toBe(0)
  expect(track.timestamps.at(-1)).toBeCloseTo(frameToSeconds(TIMEBASE, durationFrames - 1), 6)

  // ---- The clicks, where the Timeline puts them, in both decoders.
  const positions = clips.flatMap((clip) =>
    Array.from(
      { length: clip.seconds },
      (_, second) =>
        frameToSampleIndex(TIMEBASE, SAMPLE_RATE, clip.startFrame) + second * SAMPLE_RATE
    )
  )
  const chrome = await webAudioClicks(page, name, positions)
  const ffmpeg = ffmpegClicks(onDisk, positions)

  expect(chrome.sampleRate).toBe(SAMPLE_RATE)
  expect(chrome.channels).toBe(2)
  expect(chrome.length, "Web Audio honours the edit's end: the Timeline's samples exactly").toBe(
    samplesTotal
  )
  expect(ffmpeg.length).toBeGreaterThanOrEqual(samplesTotal)
  expect(ffmpeg.length).toBeLessThan(samplesTotal + AAC_PACKET)

  for (const [decoder, found] of [
    ["Web Audio", chrome.clicks],
    ["ffmpeg", ffmpeg.clicks],
  ] as const) {
    found.forEach((click, index) => {
      const at = `${decoder}: the click at Timeline sample ${positions[index]} (${(
        positions[index]! / SAMPLE_RATE
      ).toFixed(3)} s)`
      expect(Math.abs(click.lag), `${at} is ${click.lag} samples off`).toBeLessThanOrEqual(
        TOLERANCE
      )
      expect(click.strength, `${at} is too faint to be the click`).toBeGreaterThan(0.5)
    })
  }

  const lags = (found: readonly { lag: number }[]) => found.map((click) => click.lag)
  const range = (values: number[]) => `${Math.min(...values)}…${Math.max(...values)}`
  const ends = (values: number[]) =>
    `first 3 [${values.slice(0, 3).join(", ")}], last 3 [${values.slice(-3).join(", ")}]`
  const mediabunnySeconds = await page.evaluate(
    async ({ url, fileName }) => {
      interface AudioTrack {
        computeDuration(): Promise<number>
      }
      const mb = (await import(/* @vite-ignore */ url)) as {
        Input: new (init: { source: unknown; formats: unknown }) => {
          getPrimaryAudioTrack(): Promise<AudioTrack | null>
        }
        BlobSource: new (blob: Blob) => unknown
        ALL_FORMATS: unknown
      }
      const directory = await navigator.storage.getDirectory()
      const blob = await (await directory.getFileHandle(fileName)).getFile()
      const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS })
      return (await input.getPrimaryAudioTrack())!.computeDuration()
    },
    { url: MEDIABUNNY_URL, fileName: name }
  )
  test.info().annotations.push(
    {
      type: "container",
      description:
        `mvhd ${movie.duration}/${movie.timescale}, video tkhd ${video.tkhd}, ` +
        `video mdhd ${video.media.duration}/${video.media.timescale}, sound elst segment ` +
        `${edit.segmentDuration} from media ${edit.mediaTime}/${sound.media.timescale} ` +
        `(priming), sound media ${sound.media.duration}, ${sound.packets} packets, roll ` +
        `${sound.roll?.distance} — Timeline ${durationFrames} Frames = ${expectedSeconds} s`,
    },
    {
      type: "ffprobe",
      description: `format ${probed.format} s, video ${probed.video} s, audio ${probed.audio} s`,
    },
    {
      type: "decoded samples",
      description:
        `Timeline ${samplesTotal}; Web Audio ${chrome.length}; ffmpeg ${ffmpeg.length} ` +
        `(+${ffmpeg.length - samplesTotal}); Mediabunny computeDuration ${mediabunnySeconds} s ` +
        `(packet-based, not asserted)`,
    },
    {
      type: "click lag, samples",
      description:
        `${positions.length} clicks — Web Audio ${range(lags(chrome.clicks))}, ` +
        `${ends(lags(chrome.clicks))}; ffmpeg ${range(lags(ffmpeg.clicks))}, ` +
        `${ends(lags(ffmpeg.clicks))}`,
    }
  )
}

// ------------------------------------------------------------------------------- the specs

test("a 30 fps Project exports exactly its length, its clicks on the sample (SC-006)", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  const frames = await timelineFrames(page)
  expect(frames).toBe(900)

  const name = "export-duration-30.mp4"
  const file = await exportThroughTheDialog(page, picker, name)
  await checkExport(page, file, name, frames, [{ startFrame: 0, seconds: 30 }])
})

test("60 s of a 30 fps and a 29.97 Source in a 30 fps Project, in sync to the last click (SC-006)", async ({
  page,
}) => {
  test.setTimeout(240_000)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue("sync-1080p30.mp4")
  await importFixture(page, 1)
  await picker.queue("sync-1080p2997.mp4")
  await importFixture(page, 2)
  const clips = page.getByTestId("timeline-clip")
  // The 29.97 Source's 899 Frames (29.9966 s) cover 900 Project Frames (import-and-scrub.spec.ts);
  // its sound runs on Source time, so its clicks fall on the Project's whole seconds 30…59 and the
  // last 3.4 ms of the Timeline are silence.
  await expect(clips.nth(1)).toHaveAttribute("data-start-frame", "900")
  await expect(clips.nth(1)).toHaveAttribute("data-duration-frames", "900")
  const frames = await timelineFrames(page)
  expect(frames).toBe(1800)

  const name = "export-duration-60.mp4"
  const file = await exportThroughTheDialog(page, picker, name)
  await checkExport(page, file, name, frames, [
    { startFrame: 0, seconds: 30 },
    { startFrame: 900, seconds: 30 },
  ])
})
