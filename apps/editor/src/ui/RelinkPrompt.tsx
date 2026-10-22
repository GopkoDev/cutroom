// What the user is offered for each Offline Source (T052, FR-021, FR-022).
//
// Offline is a normal product state, not an error (Principle V), so this is a prompt beside the
// Preview rather than a dialog in front of it: the Timeline stays usable, the Clips stay where they
// are and render empty, and the user relinks when they are ready.
//
// Which action leads depends on the reason, because each reason has a different shortest way back:
//
//   * `needs-permission` — the handle is here, so **Allow access** is one click and no file
//     chooser. This is every local Source after a reload (ADR 0005). Finding the file is still
//     offered, for the user who has since moved it.
//   * `never-linked-here`, `unreachable`, `unreadable` — there is no handle that works, so the file
//     has to be **found** again. The file picked is checked against the Source's fingerprint
//     before anything is rebound, and a different file is refused with what was different.
//
// Both click handlers make their browser call — `requestPermission` or the file picker — as their
// first act, because each needs a live user gesture and an `await` before it can lose one.

import { useState } from "react"

import type { Source } from "@cutroom/model"

import { Button } from "@/components/ui/button"
import { useEditorStore, type SourceOfflineReason } from "@/store"
import { regrantAccess, relinkPickedFile, type RelinkResult } from "@/store/relink"
import type { SourceStatusTracker } from "@/store/source-status"

import { pickOneFile } from "./file-picker"

/** Why it is Offline, as the user reads it. */
function explain(why: SourceOfflineReason | undefined): string {
  switch (why?.reason) {
    case "needs-permission":
      return "The browser needs your permission to read it again."
    case "never-linked-here":
      return "This browser has never been told where the file is."
    case "unreachable":
      return `The file is no longer where it was${why.detail === undefined ? "." : ` — ${why.detail}.`}`
    case "unreadable":
      return `The file could not be read${why.detail === undefined ? "." : ` — ${why.detail}.`}`
    default:
      return "The file cannot be reached."
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function OfflineSource({
  source,
  why,
  tracker,
}: {
  source: Source
  why: SourceOfflineReason | undefined
  tracker: SourceStatusTracker
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function settle(result: Promise<RelinkResult>) {
    setBusy(true)
    setFailure(null)
    const answer = await result.catch((error: unknown) => ({
      ok: false as const,
      message: describe(error),
    }))
    setBusy(false)
    if (!answer.ok) setFailure(answer.message)
  }

  function onAllow() {
    // `regrantAccess` takes the handle synchronously and requests permission before any await.
    void settle(regrantAccess(source.id, { tracker, store: useEditorStore }))
  }

  function onFind() {
    // The picker is the first thing awaited inside this click.
    const picking = pickOneFile()
    void settle(
      picking.then(async (handle): Promise<RelinkResult> => {
        if (handle === null) return { ok: true } // closed the picker: nothing to report
        return relinkPickedFile(source.id, handle, {
          store: useEditorStore,
          tracker,
          now: () => new Date().toISOString(),
        })
      })
    )
  }

  const canRegrant =
    why?.reason === "needs-permission" && tracker.handleFor(source.id) !== undefined

  return (
    <li
      data-testid="relink-source"
      data-source-id={source.id}
      data-reason={why?.reason}
      className="flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs"
    >
      <p>
        <span className="font-medium">{source.name}</span> is Offline. {explain(why)} Its Clips stay
        on the Timeline and show nothing until it is back.
      </p>
      <div className="flex gap-1">
        {canRegrant ? (
          <Button size="sm" data-testid="relink-allow" disabled={busy} onClick={onAllow}>
            Allow access
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={canRegrant ? "outline" : "default"}
          data-testid="relink-find"
          disabled={busy}
          onClick={onFind}
        >
          Find the file…
        </Button>
      </div>
      {failure === null ? null : (
        <p data-testid="relink-failure" role="alert" className="text-destructive">
          {failure}
        </p>
      )}
    </li>
  )
}

export function RelinkPrompt({ tracker }: { tracker: SourceStatusTracker | null }) {
  const project = useEditorStore((state) => state.project)
  const sourceStatus = useEditorStore((state) => state.sourceStatus)
  const sourceOffline = useEditorStore((state) => state.sourceOffline)

  if (tracker === null || project === null) return null
  const offline = project.sources.filter((source) => sourceStatus[source.id] === "offline")
  if (offline.length === 0) return null

  return (
    <ul
      data-testid="relink-prompt"
      aria-label="Offline Sources"
      className="flex flex-col gap-2 p-3"
    >
      {offline.map((source) => (
        <OfflineSource
          key={source.id}
          source={source}
          why={sourceOffline[source.id]}
          tracker={tracker}
        />
      ))}
    </ul>
  )
}
