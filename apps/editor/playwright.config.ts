import { defineConfig, devices } from "@playwright/test"

// Chromium only, on purpose: ADR 0006 makes Chrome and Edge the whole supported surface, so a
// second browser here would only prove things about a product nobody can run.
//
// `channel: "chrome"` rather than Playwright's bundled Chromium, for one reason: quickstart.md
// names Google Chrome 150 as the browser SC-004 and SC-005 are measured against, and a throughput
// number is only a verdict on the machine and browser it names. (The bundled build was probed too
// and does decode and encode H.264/AAC through WebCodecs on macOS, so this is a choice about
// matching the reference machine, not a workaround for missing codecs.)
//
// File System Access permissions — what "pre-granted where possible" turned out to mean:
//   * `context.grantPermissions()` accepts only storage-access, clipboard-read, clipboard-write.
//   * CDP `Browser.setPermission` rejects every File System Access spelling tried — file-system,
//     fileSystem, file-system-handles, filesystem, file-system-write, fileSystemWrite — with
//     "Invalid PermissionDescriptor name". Chrome exposes no permission descriptor for it.
//   * `showOpenFilePicker()` opens a native dialog that Playwright cannot drive: no `filechooser`
//     event fires (that hook is for `<input type=file>` only) and the promise never settles, in
//     headed mode as well as headless.
// So there is nothing to pre-grant. The tasks that import a Source (T053–T058) will have to
// replace `showOpenFilePicker` through `page.addInitScript` with a stub that hands back a handle
// over a fixture, and read the fixtures from `packages/engine/test/fixtures/`. Recorded here so
// that is discovered once rather than in each spec.

// The default run reuses the dev server on 5173 if one is up. A watched server hot-reloads CSS and
// modules into the page under test whenever a file changes, which corrupts timing measurements and,
// after model or engine edits, can leave a spec driving a second store instance. So the `@slow`
// measurements always start a fresh server of their own, and `CUTROOM_E2E_PORT` gives any run one.
const slow = Boolean(process.env.CUTROOM_E2E_SLOW)
const port = Number(process.env.CUTROOM_E2E_PORT ?? (slow ? 5191 : 5173))
const baseURL = `http://localhost:${port}`
const reuseExistingServer = !process.env.CI && !slow && process.env.CUTROOM_E2E_PORT === undefined

export default defineConfig({
  testDir: "./e2e",
  // Playback, export and A/V sync specs are timing measurements against one machine; running them
  // beside each other would make each one's numbers depend on the others.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  // The two ten-minute measurements (T069 A/V sync, T072 sustained rate) are tagged `@slow` and
  // left out of the default run, which they would lengthen by over twenty minutes. Run them on
  // their own, one after the other: `pnpm test:e2e:slow` (sets CUTROOM_E2E_SLOW=1, greps @slow).
  grepInvert: slow ? undefined : /@slow/,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "on-first-retry",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],

  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer,
    timeout: 120_000,
  },
})
