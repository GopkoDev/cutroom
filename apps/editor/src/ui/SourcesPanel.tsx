// The Source list (T038, FR-001, FR-002, FR-004). Named for what it holds: CONTEXT.md lists
// "Media" among the words to avoid for a Source.
//
// Two jobs. **Bringing a file in**: a click opens the file picker — as the click handler's first
// act, since the picker needs a live user gesture — and the handle it returns goes to
// `importPickedFile`, which hands the `File` to the engine, remembers the handle in the link table
// and runs the import commands, in that order and for reasons stated there. Nothing is copied into
// the product's storage (FR-004). **Showing what is in the Project**: one row per Source, with its
// name and its duration once the engine has read the file (FR-002), and whether it can be read
// right now.
//
// A refusal is shown here, in words, beside the button that caused it, and the Project is left
// exactly as it was (FR-003): `importPickedFile` writes nothing until the engine has said yes.
//
// The duration is the Source's own length laid on the Project's grid — how many of the Project's
// Frames it covers, which is exactly the length its Clip is given (T041) — and shown as a timecode
// through the Timebase module. The Source's rational seconds are never turned into a float to print.

import { useState } from "react"

import { framesForDuration, type Project, type Source } from "@cutroom/model"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { putSourceLink } from "@/storage/source-links"
import { useEditorStore, type SourceStatus } from "@/store"
import { importPickedFile } from "@/store/import-source"
import type { SourceStatusTracker } from "@/store/source-status"

import { pickOneFile } from "./file-picker"
import { formatTimecode } from "./timecode"

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The Source's length in the Project's Frames, as a timecode and a count. */
function durationOf(project: Project, source: Source): string {
  try {
    const frames = framesForDuration(project.timebase, source.duration)
    return `${formatTimecode(project.timebase, frames)} · ${frames} Frames`
  } catch {
    // `parseProject` has already checked both ratios, so this is unreachable for a loaded Project;
    // a row that renders is still better than a panel that throws.
    return "unknown length"
  }
}

const STATUS_LABEL: Record<SourceStatus | "checking", string> = {
  linked: "Linked",
  offline: "Offline",
  checking: "Checking…",
}

type ImportState =
  | { readonly state: "idle" }
  | { readonly state: "reading" }
  | { readonly state: "refused"; readonly name: string; readonly reason: string }

export function SourcesPanel({ tracker }: { tracker: SourceStatusTracker | null }) {
  const project = useEditorStore((state) => state.project)
  const sourceStatus = useEditorStore((state) => state.sourceStatus)
  const [importing, setImporting] = useState<ImportState>({ state: "idle" })

  async function onImport() {
    if (tracker === null) return
    let handle: FileSystemFileHandle | null
    try {
      // First act of the click: the picker needs the gesture, and an `await` before it can lose it.
      handle = await pickOneFile()
    } catch (error) {
      setImporting({ state: "refused", name: "The file", reason: describe(error) })
      return
    }
    if (handle === null) return // the user closed the picker

    setImporting({ state: "reading" })
    const outcome = await importPickedFile(handle, {
      store: useEditorStore,
      tracker,
      putSourceLink,
      newId: () => crypto.randomUUID(),
      now: () => new Date().toISOString(),
    })
    setImporting(
      outcome.status === "imported"
        ? { state: "idle" }
        : { state: "refused", name: outcome.name, reason: outcome.reason }
    )
  }

  const sources = project?.sources ?? []

  return (
    <section
      data-testid="sources-panel"
      aria-label="Sources"
      className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">Sources</h2>
        <Button
          variant="outline"
          size="sm"
          data-testid="import-source"
          disabled={tracker === null || importing.state === "reading"}
          onClick={() => void onImport()}
        >
          Import…
        </Button>
      </div>

      {importing.state === "reading" ? (
        <p data-testid="import-pending" className="text-xs text-muted-foreground">
          Reading the file…
        </p>
      ) : null}

      {importing.state === "refused" ? (
        <p
          data-testid="import-refusal"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs"
        >
          <span className="font-medium">{importing.name} cannot be used.</span> {importing.reason}
        </p>
      ) : null}

      {sources.length === 0 || project === null ? (
        <p className="text-xs text-muted-foreground">
          Nothing here yet. Bringing a video in is what gives this Project its frame size and its
          Timebase.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs">
          {sources.map((source) => {
            const status = sourceStatus[source.id] ?? "checking"
            return (
              <li
                key={source.id}
                data-testid="source-row"
                data-source-id={source.id}
                data-status={status}
                className="flex flex-col gap-0.5 rounded-md px-1 py-1"
              >
                <span data-testid="source-name" className="truncate font-medium">
                  {source.name}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span data-testid="source-duration" className="font-mono tabular-nums">
                    {durationOf(project, source)}
                  </span>
                  <span
                    data-testid="source-status"
                    className={cn("ml-auto", status === "offline" && "text-destructive")}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
