import { describe, expect, it, vi } from "vitest"

import { applyCommand, importSequence, type Project, type Source } from "@cutroom/model"

import {
  avcCodecString,
  estimateRemainingMs,
  formatBitrate,
  formatDuration,
  probeExportOffer,
  readiness,
  timelineHasSound,
  videoBitrate,
  webCodecsSupport,
  type AudioQuestion,
  type EncoderSupport,
  type ExportOffer,
  type VideoQuestion,
} from "./export-settings"

const HD = { width: 1920, height: 1080 }

/** A machine that answers yes to everything except what `refuse` picks out. */
function machine(refuse: {
  video?: (q: VideoQuestion) => boolean
  audio?: (q: AudioQuestion) => boolean
}): EncoderSupport & { videoAsked: VideoQuestion[]; audioAsked: AudioQuestion[] } {
  const videoAsked: VideoQuestion[] = []
  const audioAsked: AudioQuestion[] = []
  return {
    videoAsked,
    audioAsked,
    async video(question) {
      videoAsked.push(question)
      return !(refuse.video?.(question) ?? false)
    },
    async audio(question) {
      audioAsked.push(question)
      return !(refuse.audio?.(question) ?? false)
    },
  }
}

function source(id: string, hasAudio: boolean): Source {
  return {
    id,
    name: `${id}.mp4`,
    address: { kind: "local-file" },
    fingerprint: { size: 1, lastModified: 1 },
    duration: { numerator: 10, denominator: 1 },
    timebase: { numerator: 30, denominator: 1 },
    dimensions: HD,
    hasAudio,
    codecs: {},
  }
}

function projectWith(...sources: Source[]): Project {
  let project: Project | null = null
  for (const [index, each] of sources.entries()) {
    for (const command of importSequence(project, {
      at: "2026-10-23T10:00:00.000Z",
      source: each,
      clipId: `clip-${index}`,
      projectId: "project-1",
      trackId: "track-1",
    })) {
      project = applyCommand(project, command).project
    }
  }
  if (project === null) throw new Error("no Sources")
  return project
}

describe("bitrates", () => {
  it("are the spec's figures at 1080p", () => {
    expect(videoBitrate("high", HD)).toBe(16_000_000)
    expect(videoBitrate("standard", HD)).toBe(8_000_000)
    expect(videoBitrate("draft", HD)).toBe(4_000_000)
  })

  it("scale by pixel count at other sizes", () => {
    // 1280×720 has 4/9 of the pixels of 1920×1080.
    expect(videoBitrate("standard", { width: 1280, height: 720 })).toBe(3_555_556)
    expect(videoBitrate("high", { width: 3840, height: 2160 })).toBe(64_000_000)
    expect(videoBitrate("draft", { width: 640, height: 360 })).toBe(444_444)
  })

  it("scale by area, not by width alone", () => {
    expect(videoBitrate("standard", { width: 1920, height: 540 })).toBe(4_000_000)
  })
})

describe("the codec string the probe asks about", () => {
  it("is H.264 High at the lowest level that fits size and bitrate, as Mediabunny builds it", () => {
    expect(avcCodecString(1920, 1080, 8_000_000)).toBe("avc1.640028") // level 4
    expect(avcCodecString(1920, 1080, 16_000_000)).toBe("avc1.640028")
    expect(avcCodecString(1920, 1080, 32_000_000)).toBe("avc1.640029") // 4.1 for the bitrate
    expect(avcCodecString(1280, 720, 3_555_556)).toBe("avc1.64001f") // 3.1
    expect(avcCodecString(3840, 2160, 64_000_000)).toBe("avc1.640033") // 5.1
  })
})

describe("webCodecsSupport", () => {
  it("asks VideoEncoder with the exact configuration, and reads a rejection as no", async () => {
    const isConfigSupported = vi.fn(async (config: VideoEncoderConfig) => ({
      supported: config.bitrate === 8_000_000,
    }))
    const support = webCodecsSupport({ VideoEncoder: { isConfigSupported } })

    expect(await support.video({ codec: "avc", ...HD, bitrate: 8_000_000 })).toBe(true)
    expect(await support.video({ codec: "avc", ...HD, bitrate: 16_000_000 })).toBe(false)
    expect(isConfigSupported).toHaveBeenCalledWith(
      expect.objectContaining({
        codec: "avc1.640028",
        width: 1920,
        height: 1080,
        bitrate: 8_000_000,
        bitrateMode: "variable",
        avc: { format: "avc" },
      })
    )

    const throwing = webCodecsSupport({
      VideoEncoder: {
        isConfigSupported: async () => {
          throw new TypeError("malformed")
        },
      },
    })
    expect(await throwing.video({ codec: "avc", ...HD, bitrate: 8_000_000 })).toBe(false)
  })

  it("refuses odd sizes for H.264 without asking, as the encoder in the worker would", async () => {
    const isConfigSupported = vi.fn(async () => ({ supported: true }))
    const support = webCodecsSupport({ VideoEncoder: { isConfigSupported } })
    expect(await support.video({ codec: "avc", width: 1919, height: 1080, bitrate: 1 })).toBe(false)
    expect(isConfigSupported).not.toHaveBeenCalled()
  })

  it("says no when the browser has no encoder at all", async () => {
    const support = webCodecsSupport({})
    expect(await support.video({ codec: "avc", ...HD, bitrate: 8_000_000 })).toBe(false)
    expect(
      await support.audio({ codec: "aac", sampleRate: 48_000, channels: 2, bitrate: 192_000 })
    ).toBe(false)
  })

  it("asks AudioEncoder for AAC-LC at 192 kbps stereo", async () => {
    const isConfigSupported = vi.fn(async () => ({ supported: true }))
    const support = webCodecsSupport({ AudioEncoder: { isConfigSupported } })
    await support.audio({ codec: "aac", sampleRate: 48_000, channels: 2, bitrate: 192_000 })
    expect(isConfigSupported).toHaveBeenCalledWith({
      codec: "mp4a.40.2",
      numberOfChannels: 2,
      sampleRate: 48_000,
      bitrate: 192_000,
      aac: { format: "aac" },
    })
  })
})

describe("probeExportOffer", () => {
  it("asks about every quality at its own bitrate and the Project's frame size", async () => {
    const support = machine({})
    const offer = await probeExportOffer({ width: 1280, height: 720 }, true, support)

    expect(support.videoAsked).toEqual([
      { codec: "avc", width: 1280, height: 720, bitrate: 7_111_111 },
      { codec: "avc", width: 1280, height: 720, bitrate: 3_555_556 },
      { codec: "avc", width: 1280, height: 720, bitrate: 1_777_778 },
    ])
    expect(offer.qualities.map((q) => q.available)).toEqual([true, true, true])
    expect(offer.preselected).toBe("standard")
  })

  it("keeps a quality the machine refuses, marked unavailable, rather than hiding it", async () => {
    const offer = await probeExportOffer(
      HD,
      true,
      machine({ video: (q) => q.bitrate > 10_000_000 })
    )
    expect(offer.qualities).toEqual([
      { quality: "high", bitrate: 16_000_000, available: false },
      { quality: "standard", bitrate: 8_000_000, available: true },
      { quality: "draft", bitrate: 4_000_000, available: true },
    ])
    expect(offer.preselected).toBe("standard")
  })

  it("preselects Draft, then High, when Standard is unavailable", async () => {
    const noStandard = await probeExportOffer(
      HD,
      true,
      machine({ video: (q) => q.bitrate === 8_000_000 })
    )
    expect(noStandard.preselected).toBe("draft")

    const onlyHigh = await probeExportOffer(
      HD,
      true,
      machine({ video: (q) => q.bitrate !== 16_000_000 })
    )
    expect(onlyHigh.preselected).toBe("high")

    const none = await probeExportOffer(HD, true, machine({ video: () => true }))
    expect(none.preselected).toBeNull()
  })

  it("offers AAC at 48 kHz, 192 kbps stereo, when the machine has it", async () => {
    const offer = await probeExportOffer(HD, true, machine({}))
    expect(offer.sound).toEqual({
      kind: "available",
      settings: { codec: "aac", bitrate: 192_000, sampleRate: 48_000, channels: 2 },
    })
  })

  it("falls back to 44.1 kHz, then to Opus, before saying there is no sound encoder", async () => {
    const at441 = await probeExportOffer(
      HD,
      true,
      machine({ audio: (q) => q.sampleRate === 48_000 })
    )
    expect(at441.sound).toMatchObject({
      kind: "available",
      settings: { codec: "aac", sampleRate: 44_100 },
    })

    const opus = await probeExportOffer(HD, true, machine({ audio: (q) => q.codec === "aac" }))
    expect(opus.sound).toMatchObject({
      kind: "available",
      settings: { codec: "opus", sampleRate: 48_000 },
    })

    const none = await probeExportOffer(HD, true, machine({ audio: () => true }))
    expect(none.sound).toEqual({ kind: "no-encoder" })
  })

  it("does not ask about sound for a Timeline that has none", async () => {
    const support = machine({ audio: () => true })
    const offer = await probeExportOffer(HD, false, support)
    expect(offer.sound).toEqual({ kind: "silent-timeline" })
    expect(support.audioAsked).toEqual([])
  })
})

describe("timelineHasSound", () => {
  it("is true when any Clip's Source has sound, and false when none does", () => {
    expect(timelineHasSound(projectWith(source("a", false)))).toBe(false)
    expect(timelineHasSound(projectWith(source("a", false), source("b", true)))).toBe(true)
  })
})

describe("readiness", () => {
  const offerWith = (sound: ExportOffer["sound"]): ExportOffer => ({
    frameSize: HD,
    qualities: [
      { quality: "high", bitrate: 16_000_000, available: false },
      { quality: "standard", bitrate: 8_000_000, available: true },
      { quality: "draft", bitrate: 4_000_000, available: true },
    ],
    sound,
    preselected: "standard",
  })
  const aac = { codec: "aac", bitrate: 192_000, sampleRate: 48_000, channels: 2 } as const

  it("starts with the chosen quality's bitrate and the sound settings", () => {
    expect(
      readiness(
        offerWith({ kind: "available", settings: aac }),
        { quality: "draft", withoutSound: false },
        300
      )
    ).toEqual({
      ok: true,
      settings: { video: { codec: "avc", bitrate: 4_000_000 }, audio: aac },
    })
  })

  it("refuses an unavailable quality, an empty Timeline, and no choice at all", () => {
    const offer = offerWith({ kind: "available", settings: aac })
    expect(readiness(offer, { quality: "high", withoutSound: false }, 300).ok).toBe(false)
    expect(readiness(offer, { quality: "standard", withoutSound: false }, 0).ok).toBe(false)
    expect(readiness(offer, { quality: null, withoutSound: false }, 300).ok).toBe(false)
  })

  it("without a sound encoder, refuses until the user explicitly chooses no sound (FR-024)", () => {
    const offer = offerWith({ kind: "no-encoder" })
    const refused = readiness(offer, { quality: "standard", withoutSound: false }, 300)
    expect(refused).toMatchObject({ ok: false })
    expect(refused.ok ? "" : refused.why).toMatch(/cannot encode sound/)

    expect(readiness(offer, { quality: "standard", withoutSound: true }, 300)).toEqual({
      ok: true,
      settings: { video: { codec: "avc", bitrate: 8_000_000 }, audio: null },
    })
  })

  it("exports a Timeline with no sound without sound, and without asking", () => {
    expect(
      readiness(
        offerWith({ kind: "silent-timeline" }),
        { quality: "standard", withoutSound: false },
        300
      )
    ).toEqual({ ok: true, settings: { video: { codec: "avc", bitrate: 8_000_000 }, audio: null } })
  })
})

describe("progress", () => {
  it("estimates what is left from the pace so far", () => {
    expect(estimateRemainingMs(10_000, 0, 300)).toBeNull()
    expect(estimateRemainingMs(10_000, 100, 300)).toBe(20_000)
    expect(estimateRemainingMs(10_000, 300, 300)).toBe(0)
  })

  it("formats wall-clock durations and bitrates for reading", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(65_400)).toBe("1:05")
    expect(formatDuration(3_725_000)).toBe("1:02:05")
    expect(formatBitrate(8_000_000)).toBe("8 Mbps")
    expect(formatBitrate(3_555_556)).toBe("3.6 Mbps")
  })
})
