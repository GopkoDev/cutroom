// The edit list that tells a player where an exported file's sound really starts and ends.
//
// **Why the file needs one.** An AAC encoder emits samples of its own — its *priming* — before the
// first sample it was given (Chrome's, through WebCodecs: 2112 at 48 kHz, measured), and pads the
// end out past the last. Nothing in the bitstream or in WebCodecs' output says so: the first
// `EncodedAudioChunk` is stamped 0 and `decoderConfig.description` is a bare AudioSpecificConfig.
// A decoder handed those packets plays the priming as sound, so every sample of the mix comes out
// late by it (44 ms) and the track runs on past the last Frame. MP4 says "this track's sound is
// the media from sample N, for D seconds" with an edit list — `trak/edts/elst`, one edit,
// `media_time = N`, `segment_duration = D` (ISO/IEC 14496-12 §8.6.6) — which is what Apple's and
// ffmpeg's own encoders write for exactly this.
//
// **The `roll` group is not optional in practice.** AVFoundation (QuickTime Player, Safari) reads
// an AAC track with an edit list but *no* `sgpd`/`sbgp` of grouping type `roll` as a legacy file,
// and trims its own assumed 2112 samples of priming on top of the edit: the sound then comes out
// 44 ms *early*. With the group — roll distance −1, every sample a member, as both Apple's and
// ffmpeg's muxers write it — it takes the edit list as the whole story. (Measured with
// `AVAssetReader` against files that differed only in that group. Without any edit list it assumes
// 2112, which is why QuickTime alone played the unedited export in sync.) So a sound track that
// gets an edit here gets the group too, when its codec is one that pre-rolls (`rollDistance`).
//
// **Why it is written here, after the fact.** Mediabunny 1.52 writes an edit list only to *delay* a
// track whose first timestamp is positive (an empty edit, then `media_time = 0`), refuses negative
// timestamps, has no option for an encoder delay, and writes no sample groups. So the export lets
// Mediabunny write its `moov` and replaces it, at the same position, with one that carries the
// edit. That is sound only because of how the export lays the file out — `fastStart: false`, not
// fragmented — which puts the `moov` last, after the `mdat` every chunk offset points into: the
// rewritten box may grow, and nothing after it moves. `run.ts` checks that the `moov` really is the
// end of the file before it writes this one.

/** The boxes this rewrite descends into; every other box is carried as its bytes. */
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"])

/** A container's children, or a leaf's payload (everything after its header). */
interface Box {
  readonly type: string
  children: Box[] | null
  readonly payload: Uint8Array
}

const U32_LIMIT = 2 ** 32
const I32_LIMIT = 2 ** 31

function parse(bytes: Uint8Array, from: number, to: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const boxes: Box[] = []
  let at = from
  while (at < to) {
    if (to - at < 8) throw new Error(`edit list: a truncated box header at byte ${at} of the moov`)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    let size = view.getUint32(at)
    let body = at + 8
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8))
      body = at + 16
    } else if (size === 0) {
      size = to - at
    }
    if (size < body - at || at + size > to) {
      throw new Error(`edit list: the "${type}" box at byte ${at} of the moov overruns its parent`)
    }
    const end = at + size
    boxes.push({
      type,
      children: CONTAINERS.has(type) ? parse(bytes, body, end) : null,
      payload: bytes.subarray(body, end),
    })
    at = end
  }
  return boxes
}

function serialize(boxes: readonly Box[]): Uint8Array {
  const parts = boxes.map((each) =>
    leaf(each.type, each.children === null ? each.payload : serialize(each.children))
  )
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}

/** A box of `type` around `payload`, with a 32-bit size. */
function leaf(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.byteLength
  if (size >= U32_LIMIT) throw new Error(`edit list: a "${type}" box too large to write`)
  const out = new Uint8Array(size)
  new DataView(out.buffer).setUint32(0, size)
  for (let index = 0; index < 4; index++) out[4 + index] = type.charCodeAt(index)
  out.set(payload, 8)
  return out
}

function all(parent: Box, type: string): Box[] {
  return (parent.children ?? []).filter((child) => child.type === type)
}

function only(parent: Box, type: string): Box {
  const found = all(parent, type)
  if (found.length !== 1) {
    throw new Error(`edit list: expected one "${type}" in "${parent.type}", found ${found.length}`)
  }
  return found[0]!
}

function viewOf(payload: Uint8Array): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
}

/** A copy of `box` with `payload` in place of its own, as a leaf. */
function replaced(box: Box, payload: Uint8Array): Box {
  return { type: box.type, children: null, payload }
}

// Full-box field offsets, by version: version/flags (4), creation and modification times (4 or 8
// each), then — for `mvhd` and `mdhd` — the timescale (4) and the duration; for `tkhd`, the track
// ID and a reserved word (4 each) and then the duration.

function timescaleOf(header: Box): number {
  const wide = header.payload[0] === 1
  return viewOf(header.payload).getUint32(wide ? 4 + 8 + 8 : 4 + 4 + 4)
}

function durationAt(header: Box): { at: number; wide: boolean } {
  const wide = header.payload[0] === 1
  const times = wide ? 4 + 8 + 8 : 4 + 4 + 4
  return { at: header.type === "tkhd" ? times + 4 + 4 : times + 4, wide }
}

function durationOf(header: Box): number {
  const { at, wide } = durationAt(header)
  const view = viewOf(header.payload)
  return wide ? Number(view.getBigUint64(at)) : view.getUint32(at)
}

function withDuration(header: Box, value: number): Box {
  const payload = header.payload.slice()
  const { at, wide } = durationAt(header)
  const view = viewOf(payload)
  if (wide) view.setBigUint64(at, BigInt(value))
  else if (value < U32_LIMIT) view.setUint32(at, value)
  else throw new Error(`edit list: a duration of ${value} does not fit the "${header.type}" box`)
  return replaced(header, payload)
}

/** `edts` holding one `elst` entry: play `segmentDuration` of the media from `mediaTime`, at 1×. */
function editBox(segmentDuration: number, mediaTime: number): Box {
  const wide = segmentDuration >= U32_LIMIT || mediaTime >= I32_LIMIT
  const payload = new Uint8Array(wide ? 4 + 4 + 8 + 8 + 4 : 4 + 4 + 4 + 4 + 4)
  const view = viewOf(payload)
  view.setUint8(0, wide ? 1 : 0) // version; the flags stay 0
  view.setUint32(4, 1) // entry count
  if (wide) {
    view.setBigUint64(8, BigInt(segmentDuration))
    view.setBigInt64(16, BigInt(mediaTime))
    view.setInt16(24, 1) // media_rate_integer; the fraction stays 0
  } else {
    view.setUint32(8, segmentDuration)
    view.setInt32(12, mediaTime)
    view.setInt16(16, 1)
  }
  return { type: "edts", children: [{ type: "elst", children: null, payload }], payload }
}

/** `sgpd` + `sbgp` of type `roll`: every one of `samples` decodes after `rollDistance` more. */
function rollGroup(samples: number, rollDistance: number): Box[] {
  const description = new Uint8Array(4 + 4 + 4 + 4 + 2)
  const sgpd = viewOf(description)
  sgpd.setUint8(0, 1) // version 1: a default description length follows
  description.set([0x72, 0x6f, 0x6c, 0x6c], 4) // "roll"
  sgpd.setUint32(8, 2) // default_length: one int16
  sgpd.setUint32(12, 1) // entry count
  sgpd.setInt16(16, rollDistance)

  const membership = new Uint8Array(4 + 4 + 4 + 4 + 4)
  const sbgp = viewOf(membership)
  membership.set([0x72, 0x6f, 0x6c, 0x6c], 4)
  sbgp.setUint32(8, 1) // entry count
  sbgp.setUint32(12, samples)
  sbgp.setUint32(16, 1) // group_description_index: the one entry above
  return [
    { type: "sgpd", children: null, payload: description },
    { type: "sbgp", children: null, payload: membership },
  ]
}

/**
 * `stbl` and `mdhd` cut to the track's first `keep` samples (packets), or as they are if it has no
 * more. The bytes of the samples dropped stay in the `mdat`, unreferenced.
 */
function keepFirstSamples(stbl: Box, mdhd: Box, keep: number): Box {
  const stsz = only(stbl, "stsz")
  const sizes = viewOf(stsz.payload)
  const count = sizes.getUint32(8)
  if (keep >= count) return mdhd

  const swap = (from: Box, to: Box) => stbl.children!.splice(stbl.children!.indexOf(from), 1, to)
  const word = (...values: number[]) => {
    const out = new Uint8Array(values.length * 4)
    values.forEach((value, index) => viewOf(out).setUint32(index * 4, value))
    return out
  }
  const join = (head: Uint8Array, body: Uint8Array) => {
    const out = new Uint8Array(head.byteLength + body.byteLength)
    out.set(head)
    out.set(body, head.byteLength)
    return out
  }

  // stsz: version/flags, sample_size, sample_count, then a size per sample if sample_size is 0.
  const fixed = sizes.getUint32(4)
  swap(
    stsz,
    replaced(
      stsz,
      join(
        stsz.payload.slice(0, 12),
        fixed === 0 ? stsz.payload.slice(12, 12 + keep * 4) : new Uint8Array(0)
      )
    )
  )
  viewOf(only(stbl, "stsz").payload).setUint32(8, keep)

  // stts: runs of (sample_count, sample_delta), cut after `keep` samples; their sum is the media's
  // new duration.
  const stts = only(stbl, "stts")
  const times = viewOf(stts.payload)
  const runs: number[] = []
  let left = keep
  let duration = 0
  for (let entry = 0; entry < times.getUint32(4) && left > 0; entry++) {
    const samples = Math.min(left, times.getUint32(8 + entry * 8))
    const delta = times.getUint32(12 + entry * 8)
    runs.push(samples, delta)
    duration += samples * delta
    left -= samples
  }
  swap(stts, replaced(stts, join(word(0, runs.length / 2), word(...runs))))

  // stsc and stco/co64: how many samples each chunk holds, cut after `keep` samples, re-encoded
  // as runs of (first_chunk, samples_per_chunk, sample_description_index).
  const offsets = all(stbl, "stco")[0] ?? only(stbl, "co64")
  const offsetSize = offsets.type === "co64" ? 8 : 4
  const chunks = viewOf(offsets.payload).getUint32(4)
  const stsc = only(stbl, "stsc")
  const table = viewOf(stsc.payload)
  const entries = table.getUint32(4)
  const perChunk: { samples: number; description: number }[] = []
  for (let entry = 0; entry < entries; entry++) {
    const first = table.getUint32(8 + entry * 12)
    const next = entry + 1 < entries ? table.getUint32(8 + (entry + 1) * 12) : chunks + 1
    for (let chunk = first; chunk < next; chunk++) {
      perChunk.push({
        samples: table.getUint32(12 + entry * 12),
        description: table.getUint32(16 + entry * 12),
      })
    }
  }
  left = keep
  const kept: { samples: number; description: number }[] = []
  for (const chunk of perChunk) {
    if (left === 0) break
    kept.push({ samples: Math.min(left, chunk.samples), description: chunk.description })
    left -= kept[kept.length - 1]!.samples
  }
  const encoded: number[] = []
  kept.forEach((chunk, index) => {
    const previous = kept[index - 1]
    if (previous?.samples === chunk.samples && previous.description === chunk.description) return
    encoded.push(index + 1, chunk.samples, chunk.description)
  })
  swap(stsc, replaced(stsc, join(word(0, encoded.length / 3), word(...encoded))))
  const offsetTable = offsets.payload.slice(0, 8 + kept.length * offsetSize)
  viewOf(offsetTable).setUint32(4, kept.length)
  swap(offsets, replaced(offsets, offsetTable))

  // stss, if a sound track has one: the sync samples that are still there.
  for (const stss of all(stbl, "stss")) {
    const syncs = viewOf(stss.payload)
    const remaining: number[] = []
    for (let entry = 0; entry < syncs.getUint32(4); entry++) {
      const sample = syncs.getUint32(8 + entry * 4)
      if (sample <= keep) remaining.push(sample)
    }
    swap(stss, replaced(stss, join(word(0, remaining.length), word(...remaining))))
  }

  return withDuration(mdhd, duration)
}

/** What a sound track's edit says. */
export interface SoundEdit {
  /**
   * The sample of the track's media that is the export's sample 0 — the encoder's priming — on
   * the track's own clock (`mdhd`), given that clock's ticks per second. Positive.
   */
  readonly mediaTime: (mediaTimescale: number) => number
  /**
   * How long the sound plays from there — the export's samples — on the movie's clock (`mvhd`),
   * given that clock's ticks per second. Only the file knows either clock, so both are asked.
   */
  readonly segmentDuration: (movieTimescale: number) => number
  /**
   * The codec's pre-roll in packets as `roll` declares it (−1 for AAC), or `null` for a codec that
   * has none and gets no sample group.
   */
  readonly rollDistance: number | null
}

/**
 * `moov` — one whole `moov` box, exactly as Mediabunny wrote it — with an edit on its one sound
 * track: the sound starts `mediaTime` into the track's media and plays for `segmentDuration`, the
 * track's and the movie's durations say so, and — with a `rollDistance` — every sample is in a
 * `roll` group. Every other byte is kept. The result is never shorter than `moov`.
 */
export function withSoundEdit(moov: Uint8Array, edit: SoundEdit): Uint8Array {
  const top = parse(moov, 0, moov.byteLength)
  if (top.length !== 1 || top[0]!.type !== "moov") {
    throw new Error("edit list: expected exactly one moov box")
  }
  const root = top[0]!
  const mvhd = only(root, "mvhd")
  const traks = all(root, "trak")
  const sounds = traks.filter((trak) => {
    const hdlr = only(only(trak, "mdia"), "hdlr")
    // hdlr: version/flags, pre_defined, then the four-character handler type.
    return String.fromCharCode(...hdlr.payload.subarray(8, 12)) === "soun"
  })
  if (sounds.length !== 1) {
    throw new Error(`edit list: expected one sound track, found ${sounds.length}`)
  }
  const sound = sounds[0]!
  if (all(sound, "edts").length > 0) {
    // Mediabunny writes one only for a track that starts late, and the export's sound starts at 0.
    throw new Error("edit list: the sound track already has an edit list")
  }

  const mdia = only(sound, "mdia")
  const mdhd = only(mdia, "mdhd")
  const stbl = only(only(mdia, "minf"), "stbl")
  const mediaTimescale = timescaleOf(mdhd)
  const mediaTime = edit.mediaTime(mediaTimescale)
  const segmentDuration = edit.segmentDuration(timescaleOf(mvhd))
  if (!Number.isSafeInteger(mediaTime) || mediaTime <= 0) {
    throw new RangeError(`edit list: media time must be a positive integer, got ${mediaTime}`)
  }
  if (!Number.isSafeInteger(segmentDuration) || segmentDuration <= 0) {
    throw new RangeError(`edit list: segment duration must be positive, got ${segmentDuration}`)
  }

  // Packets that start after the edit ends — the encoder's padding, the whole of its last packet
  // or two — are left out of the track, as Apple's and ffmpeg's muxers leave them out. A player
  // that honours the edit's end never decodes them; one that does not (Mediabunny's demuxer, the
  // ffmpeg command line) then runs on past the last Frame by less than one packet, not by two.
  const editEnd = mediaTime + edit.segmentDuration(mediaTimescale)
  {
    const times = viewOf(only(stbl, "stts").payload)
    let keep = 0
    let start = 0
    for (let entry = 0; entry < times.getUint32(4) && start < editEnd; entry++) {
      const samples = times.getUint32(8 + entry * 8)
      const delta = times.getUint32(12 + entry * 8)
      const needed = delta === 0 ? samples : Math.min(samples, Math.ceil((editEnd - start) / delta))
      keep += needed
      start += needed * delta
    }
    if (start < editEnd) {
      throw new Error("edit list: the sound track ends before the export's last sample")
    }
    const cut = keepFirstSamples(stbl, mdhd, keep)
    mdia.children!.splice(mdia.children!.indexOf(mdhd), 1, cut)
  }

  if (edit.rollDistance !== null) {
    if (all(stbl, "sgpd").length > 0 || all(stbl, "sbgp").length > 0) {
      throw new Error("edit list: the sound track already has sample groups")
    }
    // stsz: version/flags, sample_size, sample_count.
    const samples = viewOf(only(stbl, "stsz").payload).getUint32(8)
    stbl.children!.push(...rollGroup(samples, edit.rollDistance))
  }

  // The edit straight after the track header, where ISO/IEC 14496-12 and Apple both put it.
  const children = sound.children!
  const tkhd = only(sound, "tkhd")
  children.splice(children.indexOf(tkhd), 1, withDuration(tkhd, segmentDuration))
  children.splice(children.indexOf(only(sound, "mdia")), 0, editBox(segmentDuration, mediaTime))

  // The movie lasts as long as its longest track now says.
  const longest = Math.max(...traks.map((trak) => durationOf(only(trak, "tkhd"))))
  root.children!.splice(root.children!.indexOf(mvhd), 1, withDuration(mvhd, longest))

  return serialize(top)
}
