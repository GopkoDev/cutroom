import { expect, test, type Page } from "@playwright/test"

import { installFilePicker } from "./file-picker"
import { importFixture, newProject, parkAt, play, stop } from "./playback"

// T072's finding, held down: while playing, a Frame shown re-renders only what shows the Playhead.
//
// Every `frame-rendered` moves the Playhead (the transport follows the picture, T062) and updates
// the Preview's "showing Frame …" line. When the shell's components read `playheadFrame` or that
// line's state themselves, each Frame re-rendered the whole editor — `EditorLayout`, the Source
// list, the Timeline with its ruler and Clips, the top bar — twice, thirty times a second: about
// half of the main thread's busy time during playback, measured, and on a slow moment long enough
// to miss a display frame, which at the wrong phase between the display and the audio clock skips
// a Frame (playback-rate.spec.ts). The fix gives the Playhead's readouts components of their own;
// this spec says which components may render while the picture runs.
//
// ## How renders are counted
//
// React reports every commit to `__REACT_DEVTOOLS_GLOBAL_HOOK__` if one is installed before it
// loads, which an init script can do. Each commit's tree is walked from the root, descending only
// into subtrees React actually processed in that commit (a subtree it skipped keeps its old child
// pointer, `fiber.child === fiber.alternate.child`), and a component counts as rendered when its
// `PerformedWork` flag is set — the flag React sets when the component's function ran. React
// Refresh, which Vite's dev server loads, wraps the same hook and passes commits through.

const FIXTURE = "sync-1080p30.mp4"
/** Frames to watch: two seconds of playback. */
const WATCH_FRAMES = 60

/** Components that draw something other than the Playhead, and so have no business per Frame. */
const SHELL = ["EditorLayout", "TopBar", "Timeline", "SourcesPanel", "RelinkPrompt"]

async function installRenderCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Fiber {
      type: unknown
      flags: number
      child: Fiber | null
      sibling: Fiber | null
      alternate: Fiber | null
    }
    const PERFORMED_WORK = 1
    const counts: Record<string, number> = {}
    const state = { counting: false, counts, commits: 0 }
    Object.defineProperty(window, "__renderCounter", { value: state })

    function nameOf(type: unknown): string | null {
      if (typeof type === "function") {
        const named = type as { displayName?: string; name?: string }
        return named.displayName ?? named.name ?? null
      }
      if (typeof type === "object" && type !== null) {
        // memo() and forwardRef() wrap the component.
        const wrapper = type as { type?: unknown; render?: unknown; displayName?: string }
        return wrapper.displayName ?? nameOf(wrapper.type ?? wrapper.render)
      }
      return null
    }

    function visit(fiber: Fiber): void {
      const name = nameOf(fiber.type)
      if (name !== null && (fiber.flags & PERFORMED_WORK) !== 0) {
        counts[name] = (counts[name] ?? 0) + 1
      }
      // A subtree React skipped in this commit still hangs off the same child it had before.
      if (fiber.alternate !== null && fiber.child === fiber.alternate.child) return
      for (let child = fiber.child; child !== null; child = child.sibling) visit(child)
    }

    const renderers = new Map<number, unknown>()
    Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
      configurable: true,
      writable: true,
      value: {
        supportsFiber: true,
        isDisabled: false,
        renderers,
        inject(renderer: unknown) {
          const id = renderers.size + 1
          renderers.set(id, renderer)
          return id
        },
        onCommitFiberRoot(_id: number, root: { current: Fiber }) {
          if (!state.counting) return
          state.commits += 1
          visit(root.current)
        },
        onCommitFiberUnmount() {},
        onPostCommitFiberRoot() {},
        checkDCE() {},
      },
    })
  })
}

async function counting(page: Page, on: boolean): Promise<void> {
  await page.evaluate((value) => {
    ;(window as unknown as { __renderCounter: { counting: boolean } }).__renderCounter.counting =
      value
  }, on)
}

async function renderCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() =>
    structuredClone(
      (window as unknown as { __renderCounter: { counts: Record<string, number> } }).__renderCounter
        .counts
    )
  )
}

const playheadFrame = async (page: Page) =>
  Number(await page.getByTestId("timeline-playhead").getAttribute("data-frame"))

test("a Frame shown while playing re-renders the Playhead's readouts, not the editor", async ({
  page,
}) => {
  await installRenderCounter(page)
  const picker = await installFilePicker(page)
  await newProject(page)
  await picker.queue(FIXTURE)
  await importFixture(page, 1)
  await parkAt(page, 0)

  // Counted from once playback is under way: Play itself flips the button, which is a render.
  await play(page)
  await expect.poll(() => playheadFrame(page)).toBeGreaterThan(0)
  const from = await playheadFrame(page)
  await counting(page, true)
  await expect
    .poll(() => playheadFrame(page), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(from + WATCH_FRAMES)
  await counting(page, false)
  const watched = (await playheadFrame(page)) - from
  const counts = await renderCounts(page)
  await stop(page)

  test.info().annotations.push({
    type: "renders",
    description: `${watched} Frames: ${JSON.stringify(counts)}`,
  })

  // The readouts did follow the picture: the Playhead, its Frame label and the timecode.
  await expect(page.getByTestId("playhead")).toHaveText(/^Frame \d+$/)
  expect(await page.getByTestId("timecode").textContent()).not.toBe("00:00:00:00")

  for (const component of SHELL) {
    expect(counts[component] ?? 0, `${component} renders over ${watched} Frames`).toBe(0)
  }
})
