import { dirname, isAbsolute, relative, resolve } from "node:path"

/**
 * Forbids any import whose target resolves outside the repository root.
 *
 * ADR 0010 keeps the Lovable UI prototype outside this repository precisely so that reaching it
 * has to climb out of the source tree. This rule makes that climb a lint failure rather than
 * something a reviewer has to notice. It names no folder: whatever sits beside the repository is
 * off limits, today's prototype and tomorrow's scratch copy alike.
 *
 * Only relative (`./`, `../`) and absolute (`/…`) specifiers can escape. Bare specifiers are
 * package names, resolved by the package manager inside the tree, so they are left alone.
 *
 * `forbid` lists repository paths that are off limits in the same way. A gitignored copy of the
 * prototype kept under `docs/reference/` for reading sits inside the root, so without it the
 * copy would be one plausible-looking relative import away.
 */

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow importing from outside the repository root (ADR 0010)",
    },
    schema: [
      {
        type: "object",
        properties: {
          root: { type: "string" },
          forbid: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      outside:
        '"{{specifier}}" resolves to {{target}}, outside the repository root. Nothing beside the repository may be imported (ADR 0010).',
      forbidden:
        '"{{specifier}}" resolves into {{area}}, a reference copy kept for reading. It may not be imported (ADR 0010).',
    },
  },

  create(context) {
    const root = resolve(context.options[0]?.root ?? process.cwd())
    const forbidden = (context.options[0]?.forbid ?? []).map((p) => resolve(root, p))
    const from = dirname(context.filename)

    const check = (node, specifier) => {
      if (typeof specifier !== "string" || specifier.length === 0) return
      const escapes = specifier.startsWith(".") || isAbsolute(specifier)
      if (!escapes) return

      const target = resolve(from, specifier)
      const step = relative(root, target)
      if (step === ".." || step.startsWith(`..${"/"}`) || isAbsolute(step)) {
        context.report({ node, messageId: "outside", data: { specifier, target } })
        return
      }
      const area = forbidden.find((f) => target === f || target.startsWith(`${f}/`))
      if (area) {
        context.report({
          node,
          messageId: "forbidden",
          data: { specifier, area: relative(root, area) },
        })
      }
    }

    const fromSource = (node) => {
      if (node.source) check(node.source, node.source.value)
    }

    return {
      ImportDeclaration: fromSource,
      ExportNamedDeclaration: fromSource,
      ExportAllDeclaration: fromSource,
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node.source, node.source.value)
      },
      CallExpression(node) {
        const isRequire = node.callee.type === "Identifier" && node.callee.name === "require"
        const [first] = node.arguments
        if (isRequire && first?.type === "Literal") check(first, first.value)
      },
    }
  },
}

export default rule
