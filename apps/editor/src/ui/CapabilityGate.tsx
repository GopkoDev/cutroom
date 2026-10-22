// Says so on arrival when this browser cannot run Cutroom (FR-023), instead of letting the user get
// as far as importing a file before something fails.
//
// What is checked is what the product cannot work around: the file picker that gives Sources a
// durable address (ADR 0005), the OffscreenCanvas the engine renders into, and WebCodecs for
// decoding and encoding. Which *codecs* the machine supports is a different, later question the
// engine answers by asking (Principle I); this gate is only about the APIs existing at all.

import type { ReactNode } from "react"

import { missingCapabilities } from "./capability-check"

export function CapabilityGate({ children }: { children: ReactNode }) {
  const missing = missingCapabilities()
  if (missing.length === 0) return <>{children}</>

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6 text-sm">
      <h1 className="text-base font-medium">This browser can&apos;t run Cutroom</h1>
      <p>
        Cutroom edits video entirely on your machine, and it needs browser features this one
        doesn&apos;t have:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {missing.map((item) => (
          <li key={item.name}>
            <code className="font-mono text-xs">{item.name}</code> — {item.why}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Open Cutroom in a recent desktop version of Google Chrome or Microsoft Edge.
      </p>
    </main>
  )
}
