// The unsupported-browser notice (FR-023), shown on arrival rather than discovered during use.
//
// **This gate fails closed.** If anything it depends on is missing it renders the notice and does not
// render the editor at all. A half-working editor is the failure FR-023 names: the user imports
// footage, edits for ten minutes, and finds out at export that this browser was never going to
// work. Telling them on arrival costs them nothing they had not already lost.
//
// What counts as supported is decided in `capability-check.ts`; this file only says it.

import type { ReactNode } from "react"

import { insecureContext, missingCapabilities } from "./capability-check"

export interface CapabilityGateProps {
  readonly children: ReactNode
}

/**
 * Renders the editor, or the reason it cannot be rendered here.
 *
 * The check runs during render rather than in an effect, so an unsupported browser never sees a
 * flash of an editor that was never going to work.
 */
export function CapabilityGate({ children }: CapabilityGateProps) {
  const insecure = insecureContext()
  const missing = insecure ? [] : missingCapabilities()

  if (!insecure && missing.length === 0) return <>{children}</>

  return (
    <main
      data-testid="capability-gate"
      className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 p-8"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-medium">Cutroom cannot run in this browser</h1>
        <p className="text-sm text-muted-foreground">
          Cutroom edits video entirely on your own machine, which needs capabilities this browser
          does not offer. It runs in Google Chrome and Microsoft Edge on the desktop.
        </p>
      </div>

      {insecure ? (
        <p data-testid="capability-insecure" className="text-sm">
          This page is not being served over a secure connection, which removes the file access
          Cutroom is built on. Open it over <code>https://</code> or from <code>localhost</code>.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm">What is missing here:</p>
          <ul data-testid="capability-missing" className="flex flex-col gap-2 text-sm">
            {missing.map((capability) => (
              <li key={capability.name} className="flex flex-col">
                <code className="text-xs">{capability.name}</code>
                <span className="text-muted-foreground">Needed for {capability.needed}.</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}
