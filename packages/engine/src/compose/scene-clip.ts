// One SceneClip on the stage: its decoded picture as a PixiJS texture, placed in the Frame (R1).
//
// The picture arrives as a canvas on loan from the Clip's `CanvasSink` (sources/canvas-sink.ts).
// This module wraps that canvas as a texture source once and re-uploads it every Frame, so a Clip
// costs one GPU texture for its whole time on screen rather than one per Frame. It never keeps
// the *picture* — only the texture the picture is uploaded into — because the sink overwrites the
// canvas on its next pull (the pooling caveat recorded in canvas-sink.ts).
//
// Placement is the Project's frame size, not the Source's (FR-009): the Source's display size is
// fitted inside the Frame, aspect preserved, centred. What is outside the fitted rectangle is not
// painted at all — no bars of our own — so it shows whatever is beneath: a lower Track, or the
// stage's opaque black.

import { CanvasSource, Sprite, Texture } from "pixi.js"

import type { PixelSize } from "@cutroom/model"

/** Where a picture sits in the Frame, in whole pixels. */
export interface Placement {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * The largest rectangle with the Source's aspect that fits inside the Frame, centred: a Source
 * wider than the Frame fills its width and is letterboxed, a narrower one fills its height and is
 * pillarboxed, and one of the same aspect fills it exactly.
 *
 * Sizes are pixels, not time, so the rounding here is not the rounding Principle II reserves for
 * the Timebase module: a picture has to occupy a whole number of pixels, and the one inexact
 * dimension is rounded to the nearest one. The comparison is done by cross-multiplication rather
 * than by comparing two float aspect ratios, so a Source of exactly the Frame's aspect fills it
 * exactly. The offset is floored so the picture sits on whole pixels — an odd remainder leaves the
 * extra pixel at the bottom or right rather than straddling two.
 */
export function fitInside(source: PixelSize, frame: PixelSize): Placement {
  if (source.width <= 0 || source.height <= 0) {
    throw new RangeError(`fitInside: Source size ${source.width}×${source.height} is empty`)
  }
  let width: number
  let height: number
  if (source.width * frame.height >= source.height * frame.width) {
    width = frame.width
    height = Math.max(
      1,
      Math.min(frame.height, Math.round((frame.width * source.height) / source.width))
    )
  } else {
    height = frame.height
    width = Math.max(
      1,
      Math.min(frame.width, Math.round((frame.height * source.width) / source.height))
    )
  }
  return {
    x: Math.floor((frame.width - width) / 2),
    y: Math.floor((frame.height - height) / 2),
    width,
    height,
  }
}

/** A SceneClip's picture for one Frame, on loan until the Frame has been rendered. */
export interface ClipPicture {
  readonly clipId: string
  readonly canvas: OffscreenCanvas
  readonly placement: Placement
}

/** The stage object for one SceneClip, kept across Frames and Scene revisions by `clipId`. */
export interface SceneClipSprite {
  readonly sprite: Sprite
  /** Points the sprite at this Frame's picture. Must be followed by a render before the canvas is
   * handed back to its sink. */
  show(picture: ClipPicture): void
  /** Releases the GPU texture. The canvas belongs to the sink and is left alone. */
  destroy(): void
}

export function createSceneClipSprite(): SceneClipSprite {
  const sprite = new Sprite()
  let canvas: OffscreenCanvas | null = null
  let texture: Texture<CanvasSource> | null = null

  function dropTexture(): void {
    sprite.texture = Texture.EMPTY
    // `true` destroys the CanvasSource as well, which frees the GPU texture and forgets the
    // canvas; it does not touch the canvas itself, which is still the sink's.
    texture?.destroy(true)
    texture = null
    canvas = null
  }

  return {
    sprite,

    show(picture: ClipPicture): void {
      if (picture.canvas !== canvas || texture === null) {
        dropTexture()
        // Width, height and resolution are given explicitly because CanvasSource otherwise derives
        // them by dividing by a resolution it was not given, and then *resizes the canvas* to
        // match its idea of the size — which clears it. With them stated it agrees with the canvas
        // and leaves it alone.
        const source = new CanvasSource({
          resource: picture.canvas,
          width: picture.canvas.width,
          height: picture.canvas.height,
          resolution: 1,
        })
        texture = new Texture({ source })
        canvas = picture.canvas
        sprite.texture = texture
      } else {
        // Same canvas, new pixels: re-upload into the existing GPU texture on the next render.
        texture.source.update()
      }

      const { x, y, width, height } = picture.placement
      sprite.position.set(x, y)
      sprite.setSize(width, height)
    },

    destroy(): void {
      dropTexture()
      sprite.destroy()
    },
  }
}
