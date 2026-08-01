import { fileURLToPath } from "node:url"

import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import prettier from "eslint-config-prettier/flat"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint from "typescript-eslint"

import noImportOutsideRepo from "./eslint-rules/no-import-outside-repo.js"

// One flat config for the whole workspace. `apps/editor` arrived from the Vite scaffold with a
// config of its own; its React rules were folded in here rather than left to drift, so there is a
// single place where a rule is turned on and a single `eslint .` at the root that runs it.

const repoRoot = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/coverage/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "packages/engine/test/fixtures/**",
  ]),

  {
    name: "cutroom/base",
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },

  {
    // ADR 0010: the prototype lives beside the repository, so the thing to block is the climb out.
    name: "cutroom/no-import-outside-repo",
    files: ["apps/**/*.{js,mjs,ts,tsx}", "packages/**/*.{js,mjs,ts,tsx}"],
    plugins: { cutroom: { rules: { "no-import-outside-repo": noImportOutsideRepo } } },
    rules: { "cutroom/no-import-outside-repo": ["error", { root: repoRoot }] },
  },

  {
    name: "cutroom/editor",
    files: ["apps/editor/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    // shadcn generates these files and re-generates them on update; every one of them exports a
    // `cva` variants object beside its component, which Fast Refresh dislikes and which we do not
    // get to restructure. Turning the rule off here is cheaper than a patch that `shadcn add`
    // overwrites.
    name: "cutroom/editor-generated-ui",
    files: ["apps/editor/src/components/ui/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  {
    // packages/model has no DOM lib and no browser globals on purpose (constitution, Principle
    // boundary for the model): naming `document` here is an undefined variable, not a warning.
    name: "cutroom/model",
    files: ["packages/model/**/*.ts"],
    languageOptions: { globals: {} },
  },

  {
    name: "cutroom/engine",
    files: ["packages/engine/**/*.ts"],
    languageOptions: { globals: { ...globals.worker, ...globals.browser } },
  },

  {
    name: "cutroom/node",
    files: [
      "scripts/**/*.{js,mjs,ts}",
      "eslint-rules/**/*.js",
      "*.config.{js,ts}",
      "apps/*/*.config.{js,ts}",
      "apps/*/e2e/**/*.ts",
      "packages/*/*.config.{js,ts}",
    ],
    languageOptions: { globals: globals.node },
  },

  prettier,
])
