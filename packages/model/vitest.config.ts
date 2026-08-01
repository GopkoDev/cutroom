import { defineConfig } from "vitest/config"

// `packages/model` is the one package the constitution forbids browser APIs in, because it is
// meant to be lifted into the backend later. That rule is only worth anything if breaking it
// fails, so this environment is deliberately bare: plain Node, no jsdom, no happy-dom, no shims.
// A `document` or an `OffscreenCanvas` reached for here is a ReferenceError at run time, not a
// review comment. test/environment.test.ts asserts the bareness so that a future config change
// cannot quietly restore it.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
  },
})
