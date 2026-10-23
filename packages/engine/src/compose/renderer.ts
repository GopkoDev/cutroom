// PixiJS, inside the worker, drawing into the transferred OffscreenCanvas (ADR 0003, R6).
//
// One scene graph, rendered on demand: for the Preview when the clock asks, for an Export once per
// Frame. That is Principle III made concrete — Preview and Export are not two pipelines that agree,
// they are one pipeline asked at different rates, so an Export cannot show something the Preview
// did not.
//
// The constraint R6 imposes and this module has to keep: nothing in the scene may depend on DOM
// measurement or events. There is no `document` here to measure against. Overlays that need one —
// selection handles, guides, safe areas — belong to the React layer above the canvas, not to the
// scene below it.

import { Container, DOMAdapter, WebWorkerAdapter, autoDetectRenderer } from "pixi.js"

import type { PixelSize, Scene } from "@cutroom/model"

import { createSceneClipSprite, type ClipPicture, type SceneClipSprite } from "./scene-clip"

// Before anything at all is constructed — which is why this is a module side effect rather than the
// first line of `createSceneRenderer`.
//
// PixiJS reaches for the DOM in a dozen places (creating a canvas to rasterise into, reading a base
// URL, asking for a font face set) and routes every one of them through `DOMAdapter`, whose default
// is the browser adapter. There is no `document` in a worker, so the default fails — and it fails
// deep inside Pixi, at whichever of those places happens to be reached first, which is a stack
// trace about text metrics rather than about the environment. Setting the adapter at import time
// means it is set before any code in this module can run, and before any module that imports this
// one can construct anything either.
//
// The cost of stating it this way: importing this module from a Window context would install a
// worker adapter in a page that has a real DOM. Only `worker.ts` imports it, and that is the whole
// of the rule.
DOMAdapter.set(WebWorkerAdapter)

/**
 * The engine's picture of the Timeline, and the one thing that turns it into pixels.
 *
 * Deliberately narrow. A caller can render a Scene at a Frame, ask what backend it got, and throw
 * it away; it cannot reach the PixiJS renderer, the stage or the canvas. That is what keeps the
 * scene graph an implementation detail of this module rather than something the message loop in
 * `worker.ts` starts reasoning about.
 */
export interface SceneRenderer {
  /**
   * What PixiJS reports itself as — `"webgl"`, `"webgpu"` or `"canvas"`.
   *
   * Carried out to `ready` because it is invisible from the main thread: the canvas has been
   * transferred, so a worker compositing on the GPU and a worker that silently failed to look
   * exactly alike from outside.
   */
  readonly name: string

  /**
   * Composites one Frame of a Scene onto the canvas, replacing whatever was there.
   *
   * `pictures` are the decoded pictures of the SceneClips that cover this Frame and have one, in
   * the Scene's back-to-front order; whoever decoded them (playback/stream.ts) has already decided
   * which Clips those are. A Clip with no picture here is not drawn, and nothing else is either —
   * so a Frame no Clip covers composites to the empty stage, black, rather than to whatever the
   * last Frame showed (FR-008, T047).
   *
   * The pictures are canvases on loan from their sinks. They are uploaded to the GPU during this
   * call and may be handed back as soon as it returns.
   *
   * The canvas is resized first if the Scene asks for a different frame size. The Scene is
   * authoritative about that and the `init` message is not: an export carries its own frozen Scene
   * (FR-019), and the Project's frame size can have changed since the worker started.
   */
  renderScene(scene: Scene, pictures: readonly ClipPicture[]): void

  /** Releases the GPU context. */
  destroy(): void
}

/**
 * Stands up a renderer against the canvas the main thread transferred.
 *
 * `resolution: 1` and `autoDensity: false` are the point of the whole exercise rather than
 * defaults worth accepting quietly. Everything a Preview shows is also what an Export writes, so
 * the backing store has to be exactly the Project's frame size — one canvas pixel per picture
 * pixel — on a retina display as on any other. A device pixel ratio scaling the Preview would make
 * the two disagree, and `autoDensity` is a CSS-pixel adjustment that has no meaning without a DOM
 * anyway.
 *
 * `antialias: false` for the same reason: there is nothing to antialias. Frames are rectangular
 * pictures composited at whole-pixel positions, and multisampling a full-screen quad costs fill
 * rate to change nothing.
 *
 * The background is opaque black rather than transparent. An empty Scene has to *be* something,
 * and what an exported Frame with no Clips over it contains is black — H.264 has no alpha channel
 * to be transparent in. A transparent Preview would show whatever the page put behind the canvas
 * and quietly stop being a picture of what the Export would produce.
 */
export async function createSceneRenderer(
  canvas: OffscreenCanvas,
  frameSize: PixelSize
): Promise<SceneRenderer> {
  const renderer = await autoDetectRenderer({
    canvas,
    width: frameSize.width,
    height: frameSize.height,
    resolution: 1,
    autoDensity: false,
    antialias: false,
    backgroundColor: 0x000000,
    backgroundAlpha: 1,
    clearBeforeRender: true,
  })

  // The root of the scene graph, kept for the lifetime of the renderer. Rebuilding it per Frame
  // would throw away the per-Clip render state — a texture — that `SceneClip.clipId` exists to let
  // the worker keep across Scene revisions.
  const stage = new Container()

  // One sprite per SceneClip that was drawn in the last Frame, by `clipId`. A Clip that is not
  // drawn loses its sprite and with it its GPU texture: its sink is dropped at the same moment
  // (canvas-sink.ts `retainSinks`), so the canvas the texture wraps would not come back anyway.
  const sprites = new Map<string, SceneClipSprite>()

  return {
    name: renderer.name,

    renderScene(scene: Scene, pictures: readonly ClipPicture[]): void {
      if (renderer.width !== scene.frameSize.width || renderer.height !== scene.frameSize.height) {
        renderer.resize(scene.frameSize.width, scene.frameSize.height)
      }

      // The stage is re-populated in full each Frame rather than patched: the order of `pictures`
      // is the draw order, and re-adding in that order is the whole of keeping it — a Clip that
      // moved between Tracks, or one that stopped covering the Frame, needs no special case.
      stage.removeChildren()
      const drawn = new Set<string>()
      for (const picture of pictures) {
        let sprite = sprites.get(picture.clipId)
        if (sprite === undefined) {
          sprite = createSceneClipSprite()
          sprites.set(picture.clipId, sprite)
        }
        sprite.show(picture)
        stage.addChild(sprite.sprite)
        drawn.add(picture.clipId)
      }
      for (const [clipId, sprite] of sprites) {
        if (!drawn.has(clipId)) {
          sprite.destroy()
          sprites.delete(clipId)
        }
      }

      // `clearBeforeRender` makes this the clear as well as the composite: whatever the previous
      // Frame left is gone before this one is drawn, so a Frame is never a picture of two Frames —
      // and a Frame with no pictures is the opaque black background and nothing else.
      renderer.render(stage)
    },

    destroy(): void {
      for (const sprite of sprites.values()) sprite.destroy()
      sprites.clear()
      stage.destroy()
      renderer.destroy()
    },
  }
}
