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

const port = 5173
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: "./e2e",
  // Playback, export and A/V sync specs are timing measurements against one machine; running them
  // beside each other would make each one's numbers depend on the others.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
