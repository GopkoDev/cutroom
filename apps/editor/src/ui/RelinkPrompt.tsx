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

import { technicalDetail } from "./failure-wording"
import { pickOneFile } from "./file-picker"
import { Notice } from "./Notice"

/**
 * Why it is Offline, as the user reads it. The platform's or the engine's own words, when there
 * are any, are shown under "Details" rather than here (T093).
 */
function explain(why: SourceOfflineReason | undefined): string {
  switch (why?.reason) {
    case "needs-permission":
      return "The browser needs your permission to read it again."
    case "never-linked-here":
      return "This browser has never been told where the file is."
    case "unreachable":
      return "The file is no longer where it was."
    case "unreadable":
      return "The file is there, but it could not be read as this Source."
    default:
      return "The file cannot be reached."
  }
}

type Failure = { readonly message: string; readonly detail?: string }

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
  const [failure, setFailure] = useState<Failure | null>(null)

  async function settle(result: Promise<RelinkResult>, failedToStart: string) {
    setBusy(true)
    setFailure(null)
    const answer: RelinkResult = await result.catch((error: unknown) => ({
      ok: false as const,
      message: failedToStart,
      detail: technicalDetail(error),
    }))
    setBusy(false)
    if (!answer.ok) setFailure({ message: answer.message, detail: answer.detail })
  }

  function onAllow() {
    // `regrantAccess` takes the handle synchronously and requests permission before any await.
    void settle(
      regrantAccess(source.id, { tracker, store: useEditorStore }),
      "The browser did not ask for permission. Click Allow access again."
    )
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
      }),
      "The file picker could not be opened. Click Find the file… again."
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
      {why?.detail === undefined ? null : (
        <details data-testid="relink-source-details" className="opacity-80">
          <summary className="cursor-pointer select-none">Details</summary>
          <pre className="mt-1 font-mono text-[0.625rem] break-words whitespace-pre-wrap">
            {why.detail}
          </pre>
        </details>
      )}
      {failure === null ? null : (
        <Notice testId="relink-failure" title={failure.message} details={failure.detail} />
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
