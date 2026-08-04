import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

import type { EngineCapabilities } from "@cutroom/engine/protocol"
import type { PixelSize, Scene, Timebase } from "@cutroom/model"

// The engine's skeleton, exercised where it is the only place it can be: a real worker, in real
// Chrome, with a real OffscreenCanvas transferred into it and a real GPU behind that.
//
// Vitest cannot reach a line of this. `packages/model` runs in node, which has no `Worker`, no
// `OffscreenCanvas`, no WebGL and no WebCodecs — and mocking those would test the mocks. So the
// riskiest part of the whole project (does PixiJS run in a worker? does Vite serve it into one?
// does this browser encode anything?) is proved here or not at all.
//
// How the worker is reached: the Vite dev server serves `packages/engine/src/worker.ts`
// transformed, over its `/@fs/` path — the monorepo root is inside Vite's allow list because
// `pnpm-workspace.yaml` sits there — so the page can `new Worker(url, { type: "module" })` on the
// engine's real entry point. No harness worker in between and no re-export, so nothing here can
// pass while the module itself does not work.

const workerEntry = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/engine/src/worker.ts"
)

// `/@fs/` + the absolute path, each segment escaped: the repository lives under a directory with a
// space in its name, and an unescaped space is where this stops being a URL.
const WORKER_URL = `/@fs${workerEntry.split(path.sep).map(encodeURIComponent).join("/")}`

// The Project under test. 640×360 is big enough that a wrong frame size cannot coincide with the
// right one and small enough to read every pixel back instantly; the Timebase is the awkward one
// on purpose, since nothing in the engine may do arithmetic with it (R7).
//
// Typed against `@cutroom/model` and `@cutroom/engine/protocol` rather than written as loose
// object literals, which is the point of T029 asserted at compile time: these are the declarations
// the worker narrows on the other side of `postMessage`, reached from `apps/editor` through the
// engine's own `exports` map. A field renamed in the protocol stops this file compiling.
const FRAME_SIZE: PixelSize = { width: 640, height: 360 }
const TIMEBASE: Timebase = { numerator: 30000, denominator: 1001 }

/** An empty Scene at the Project's frame size — correct, and what the worker should show. */
const EMPTY_SCENE: Scene = { timebase: TIMEBASE, frameSize: FRAME_SIZE, clips: [] }

interface EngineEventRecord {
  readonly type: string
  readonly [field: string]: unknown
}

/** What `startEngine` hands back inside the page. Mirrors the harness installed below. */
interface EngineHarness {
  /** Posts `init`, transferring the canvas. Separate from starting the worker so that a test can
   * send something else first. */
  init(timebase: unknown, frameSize: unknown): void
  send(message: unknown): void
  next(type: string, timeoutMs?: number): Promise<EngineEventRecord>
  seen(): EngineEventRecord[]
  /** The rendered pixels, read back off the placeholder canvas the worker was given control of. */
  pixels(): Promise<{
    width: number
    height: number
    uniform: [number, number, number, number] | null
  }>
}

declare global {
  // `var` rather than `const`: a global installed by `addInitScript` is only declarable this way.
  var startEngine: (workerUrl: string) => EngineHarness
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.startEngine = (workerUrl: string) => {
      // A placeholder canvas, in the document, deliberately the *wrong* size. Everything the
      // worker is asked to do afterwards has to move it to the Project's frame size, so a test
      // that passes because the canvas happened to be right already is not available.
      const placeholder = document.createElement("canvas")
      placeholder.width = 16
      placeholder.height = 9
      document.body.appendChild(placeholder)
      const offscreen = placeholder.transferControlToOffscreen()

      const worker = new Worker(workerUrl, { type: "module" })
      const seen: { type: string; [field: string]: unknown }[] = []
      const waiting: (() => void)[] = []

      const arrived = (event: { type: string; [field: string]: unknown }) => {
        seen.push(event)
        for (const wake of waiting.splice(0)) wake()
      }

      worker.addEventListener("message", (event: MessageEvent) => {
        arrived(event.data as { type: string; [field: string]: unknown })
      })
      // A worker that dies before it can say `fatal` is exactly the failure invariant 5 is about,
      // so it is recorded under a type the protocol does not have. A test asserting `fatal` cannot
      // then be satisfied by the page merely noticing that the worker fell over.
      worker.addEventListener("error", (event: ErrorEvent) => {
        arrived({ type: "worker-died", reason: event.message || "the worker raised an error" })
      })

      return {
        init: (timebase: unknown, frameSize: unknown) => {
          worker.postMessage({ type: "init", canvas: offscreen, timebase, frameSize }, [offscreen])
        },
        send: (message: unknown) => {
          worker.postMessage(message)
        },
        seen: () => seen.slice(),

        next: (type: string, timeoutMs = 20_000) =>
          new Promise<{ type: string; [field: string]: unknown }>((resolve, reject) => {
            const deadline = setTimeout(() => {
              reject(
                new Error(
                  `waited ${timeoutMs}ms for "${type}"; saw ${JSON.stringify(seen.map((event) => event.type))}`
                )
              )
            }, timeoutMs)

            const look = () => {
              const found = seen.find((event) => event.type === type)
              if (!found) {
                waiting.push(look)
                return
              }
              clearTimeout(deadline)
              resolve(found)
            }
            look()
          }),

        pixels: async () => {
          // The worker's WebGL frames reach the placeholder canvas when the compositor next runs,
          // so two animation frames pass before anything is read.
          await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))

          const bitmap = await createImageBitmap(placeholder)
          const probe = new OffscreenCanvas(bitmap.width, bitmap.height)
          const context = probe.getContext("2d")
          if (!context) throw new Error("no 2d context to read the rendered Frame back through")
          context.drawImage(bitmap, 0, 0)

          const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
          const first: [number, number, number, number] = [
            data[0] ?? -1,
            data[1] ?? -1,
            data[2] ?? -1,
            data[3] ?? -1,
          ]
          let uniform = true
          for (let at = 0; at < data.length; at += 4) {
            if (
              data[at] !== first[0] ||
              data[at + 1] !== first[1] ||
              data[at + 2] !== first[2] ||
              data[at + 3] !== first[3]
            ) {
              uniform = false
              break
            }
          }
          return {
            width: bitmap.width,
            height: bitmap.height,
            uniform: uniform ? first : null,
          }
        },
      }
    }
  })
})

test("the worker starts and answers `ready` with what this browser can really encode", async ({
  page,
}) => {
  await page.goto("/")

  const capabilities = await page.evaluate(
    async ({ workerUrl, timebase, frameSize }) => {
      const engine = globalThis.startEngine(workerUrl)
      engine.init(timebase, frameSize)
      const ready = await engine.next("ready")
      return ready.capabilities as EngineCapabilities
    },
    { workerUrl: WORKER_URL, timebase: TIMEBASE, frameSize: FRAME_SIZE }
  )

  // Recorded rather than merely asserted: which codecs this platform encodes is a fact we have
  // been assuming, and the run that measures it should say what it found.
  console.log(
    `engine renderer: ${capabilities.renderer}\n` +
      `encodable video: ${JSON.stringify(capabilities.video)}\n` +
      `encodable audio: ${JSON.stringify(capabilities.audio.filter((entry) => entry.encodable).map((entry) => entry.codec))}\n` +
      `refused audio:  ${JSON.stringify(capabilities.audio.filter((entry) => !entry.encodable).map((entry) => entry.codec))}`
  )

  // PixiJS really did initialise against the transferred canvas. This is the assertion the whole
  // task exists for: from the main thread the canvas is gone, so a worker compositing on the GPU
  // and a worker that silently failed to are indistinguishable without it.
  expect(capabilities.renderer).toBe("webgl")
  expect(capabilities.frameSize).toEqual(FRAME_SIZE)

  // The probe asked about every codec Mediabunny knows and answered every one with a boolean —
  // nothing omitted, nothing assumed.
  expect(capabilities.video.length).toBeGreaterThan(0)
  expect(capabilities.audio.length).toBeGreaterThan(0)
  for (const entry of [...capabilities.video, ...capabilities.audio]) {
    expect(typeof entry.codec).toBe("string")
    expect(typeof entry.encodable).toBe("boolean")
  }

  // ADR 0006 makes Chrome the supported surface and quickstart measures H.264/AAC on it, so on
  // this browser these two are not "plausible", they are required — and required *at the frame
  // size*, which is the question `canEncode` alone does not answer.
  expect(capabilities.video.find((entry) => entry.codec === "avc")).toEqual({
    codec: "avc",
    encodable: true,
    atFrameSize: true,
  })
  expect(capabilities.audio.find((entry) => entry.codec === "aac")?.encodable).toBe(true)
})

test("a Scene is accepted and a Frame renders at the Project's frame size", async ({ page }) => {
  await page.goto("/")

  const result = await page.evaluate(
    async ({ workerUrl, timebase, frameSize, scene }) => {
      const engine = globalThis.startEngine(workerUrl)
      engine.init(timebase, frameSize)
      await engine.next("ready")

      engine.send({ type: "scene", revision: 1, scene })
      engine.send({ type: "render-frame", frame: 0, reason: "scrub" })
      const rendered = await engine.next("frame-rendered")

      return { rendered, pixels: await engine.pixels(), seen: engine.seen().map((e) => e.type) }
    },
    { workerUrl: WORKER_URL, timebase: TIMEBASE, frameSize: FRAME_SIZE, scene: EMPTY_SCENE }
  )

  expect(result.rendered).toEqual({ type: "frame-rendered", frame: 0, revision: 1 })

  // The canvas the worker was handed was 16×9. It is the Project's frame size now, which only
  // something inside the worker could have done.
  expect({ width: result.pixels.width, height: result.pixels.height }).toEqual(FRAME_SIZE)

  // Empty, and *rendered* empty: a Scene with no Clips is opaque black across the whole raster.
  // An untouched canvas would read back transparent, so the alpha is what says PixiJS cleared it
  // rather than that nothing happened.
  expect(result.pixels.uniform).toEqual([0, 0, 0, 255])

  expect(result.seen).not.toContain("fatal")
})

test("a newer Scene with a different frame size moves the canvas", async ({ page }) => {
  await page.goto("/")

  // The Scene is authoritative about the frame size and `init` is not. An export carries its own
  // frozen Scene (FR-019) and the Project's frame size can change while the worker is running, so
  // a renderer that only ever believed `init` would write the wrong raster in both cases.
  const resized = { width: 480, height: 270 }

  const result = await page.evaluate(
    async ({ workerUrl, timebase, frameSize, scene, resized }) => {
      const engine = globalThis.startEngine(workerUrl)
      engine.init(timebase, frameSize)
      await engine.next("ready")

      engine.send({ type: "scene", revision: 1, scene })
      engine.send({ type: "render-frame", frame: 0, reason: "scrub" })
      await engine.next("frame-rendered")
      const atInitSize = await engine.pixels()

      engine.send({ type: "scene", revision: 2, scene: { ...scene, frameSize: resized } })
      engine.send({ type: "render-frame", frame: 1, reason: "scrub" })
      await engine.next("frame-rendered")

      return { atInitSize, afterwards: await engine.pixels() }
    },
    {
      workerUrl: WORKER_URL,
      timebase: TIMEBASE,
      frameSize: FRAME_SIZE,
      scene: EMPTY_SCENE,
      resized,
    }
  )

  expect({ width: result.atInitSize.width, height: result.atInitSize.height }).toEqual(FRAME_SIZE)
  expect({ width: result.afterwards.width, height: result.afterwards.height }).toEqual(resized)
  expect(result.afterwards.uniform).toEqual([0, 0, 0, 255])
})

test("a Scene older than the one the worker holds is ignored", async ({ page }) => {
  await page.goto("/")

  const result = await page.evaluate(
    async ({ workerUrl, timebase, frameSize, scene }) => {
      const engine = globalThis.startEngine(workerUrl)
      engine.init(timebase, frameSize)
      await engine.next("ready")

      // Revision 7 first, then a Scene that left earlier and arrived later — a smaller Project, so
      // that accepting it would be visible in the pixels and not only in the reported revision.
      engine.send({ type: "scene", revision: 7, scene })
      engine.send({
        type: "scene",
        revision: 2,
        scene: { ...scene, frameSize: { width: 320, height: 180 } },
      })
      engine.send({ type: "render-frame", frame: 12, reason: "clock" })
      const rendered = await engine.next("frame-rendered")

      // And an equal revision is the same Scene arriving twice, not a newer one.
      engine.send({
        type: "scene",
        revision: 7,
        scene: { ...scene, frameSize: { width: 100, height: 50 } },
      })
      engine.send({ type: "render-frame", frame: 13, reason: "clock" })
      await engine.next("frame-rendered", 20_000)

      return { rendered, pixels: await engine.pixels() }
    },
    { workerUrl: WORKER_URL, timebase: TIMEBASE, frameSize: FRAME_SIZE, scene: EMPTY_SCENE }
  )

  expect(result.rendered).toEqual({ type: "frame-rendered", frame: 12, revision: 7 })
  expect({ width: result.pixels.width, height: result.pixels.height }).toEqual(FRAME_SIZE)
})

test("a message the engine cannot recognise becomes `fatal`, not silence", async ({ page }) => {
  await page.goto("/")

  const reasons = await page.evaluate(
    async ({ workerUrl, timebase, frameSize }) => {
      const engine = globalThis.startEngine(workerUrl)
      engine.init(timebase, frameSize)
      await engine.next("ready")

      // Three ways to be wrong: a `type` the protocol does not have, a message that is not an
      // object at all, and nothing whatsoever.
      engine.send({ type: "make-me-a-sandwich" })
      const named = await engine.next("fatal")

      const before = engine.seen().length
      engine.send(42)
      engine.send(null)
      await new Promise((settle) => setTimeout(settle, 1000))
      const after = engine.seen().slice(before)

      return {
        named: named.reason as string,
        stack: typeof named.stack,
        afterwards: after.map((event) => ({ type: event.type, reason: event.reason })),
      }
    },
    { workerUrl: WORKER_URL, timebase: TIMEBASE, frameSize: FRAME_SIZE }
  )

  expect(reasons.named).toContain("make-me-a-sandwich")
  expect(reasons.stack).toBe("string")

  // Not one of them is allowed to be swallowed: three bad messages, three `fatal`s and no
  // dead worker.
  expect(reasons.afterwards).toHaveLength(2)
  for (const event of reasons.afterwards) expect(event.type).toBe("fatal")
})

test("a message the engine recognises but has not built yet says so rather than going quiet", async ({
  page,
}) => {
  await page.goto("/")

  const fatal = await page.evaluate(
    async ({ workerUrl, timebase, frameSize }) => {
      const engine = globalThis.startEngine(workerUrl)
      engine.init(timebase, frameSize)
      await engine.next("ready")

      engine.send({ type: "transport", state: "playing", fromFrame: 0 })
      return await engine.next("fatal")
    },
    { workerUrl: WORKER_URL, timebase: TIMEBASE, frameSize: FRAME_SIZE }
  )

  expect(fatal.reason).toContain("transport")
})

test("a Frame asked for before there is a Scene is reported dropped, not answered", async ({
  page,
}) => {
  await page.goto("/")

  const dropped = await page.evaluate(
    async ({ workerUrl, timebase, frameSize }) => {
      const engine = globalThis.startEngine(workerUrl)
      engine.init(timebase, frameSize)
      await engine.next("ready")

      engine.send({ type: "render-frame", frame: 0, reason: "scrub" })
      const event = await engine.next("frames-dropped")
      return { event, seen: engine.seen().map((entry) => entry.type) }
    },
    { workerUrl: WORKER_URL, timebase: TIMEBASE, frameSize: FRAME_SIZE }
  )

  expect(dropped.event).toEqual({ type: "frames-dropped", count: 1 })
  expect(dropped.seen).not.toContain("frame-rendered")
  expect(dropped.seen).not.toContain("fatal")
})
