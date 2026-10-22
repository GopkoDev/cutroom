// Where the app lands when no Project is open — on arrival, and after every reload (FR-020).
//
// The store can already enumerate Projects (T027). This is the surface that makes that visible:
// without it, "MUST list existing Projects so one can be reopened" is satisfied by a function
// nobody can call, and quickstart's persistence walk-through asserts the screen rather than the
// store.
//
// Two things it deliberately does that a list would not have to.
//
// **A Project this build cannot open is listed and says so.** `listProjects` is generous where
// `loadProject` is strict, precisely so that a document written by a newer Cutroom still appears.
// Dropping it here would undo that: the user would conclude their work had been lost, which is both
// false and unrecoverable-looking. It is shown, greyed, with the reason in words.
//
// **A Project with no name is not given one.** `ProjectSummary.name` is `null` when the stored
// record carries nothing usable, and the summary's own comment says what to show in its place is
// this screen's decision. It is rendered as "Untitled Project" *here* and never written back —
// inventing a name in storage would turn a display choice into an edit.

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { listProjects, type ProjectSummary } from "@/storage/projects"
import { useEditorStore } from "@/store"

/**
 * When a Project was last touched, as a person reads it.
 *
 * `Intl.DateTimeFormat` in the browser's own locale rather than a format of ours: this is the one
 * place in the product where a stored ISO timestamp is shown to someone, and the Timebase rules
 * about never using floats have nothing to say about a wall-clock date.
 */
const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

function lastTouched(modifiedAt: string | null): string {
  if (modifiedAt === null) return "never saved"
  const instant = Date.parse(modifiedAt)
  return Number.isNaN(instant) ? "never saved" : WHEN.format(instant)
}

type Listing =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly projects: readonly ProjectSummary[] }
  | { readonly state: "failed"; readonly reason: string }

export function ProjectList() {
  const [listing, setListing] = useState<Listing>({ state: "loading" })
  const newProject = useEditorStore((state) => state.newProject)
  const openProject = useEditorStore((state) => state.openProject)
  const openFailure = useEditorStore((state) => state.openFailure)

  // Listed on mount and not refreshed afterwards, because this screen is unmounted the moment a
  // Project opens and mounted again on the way back — so "on mount" and "every time the list is
  // looked at" are the same occasion.
  useEffect(() => {
    let current = true
    void listProjects().then(
      (projects) => {
        if (current) setListing({ state: "ready", projects })
      },
      (error: unknown) => {
        // Only a broken database reaches here — one unreadable Project does not, by design. So the
        // message is about storage rather than about any one Project.
        if (current) {
          setListing({
            state: "failed",
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      }
    )
    return () => {
      current = false
    }
  }, [])

  return (
    <main
      data-testid="project-list"
      className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-8"
    >
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-medium">Projects</h1>
        <Button
          className="ml-auto"
          size="sm"
          data-testid="new-project"
          onClick={() => {
            newProject()
          }}
        >
          New Project
        </Button>
      </div>

      {openFailure !== null && (
        <p data-testid="open-failure" className="text-sm text-destructive">
          {openFailure}
        </p>
      )}

      {listing.state === "loading" && (
        <p data-testid="project-list-loading" className="text-sm text-muted-foreground">
          Looking for your Projects…
        </p>
      )}

      {listing.state === "failed" && (
        <p data-testid="project-list-failed" className="text-sm text-destructive">
          Your Projects could not be read from this browser&apos;s storage. {listing.reason}
        </p>
      )}

      {listing.state === "ready" && listing.projects.length === 0 && (
        <p data-testid="project-list-empty" className="text-sm text-muted-foreground">
          No Projects yet. Start one, then bring in a video — the first one you import gives the
          Project its frame size and its Timebase.
        </p>
      )}

      {listing.state === "ready" && listing.projects.length > 0 && (
        <ul className="flex flex-col gap-2">
          {listing.projects.map((summary) => (
            <li key={summary.id}>
              <button
                type="button"
                data-testid="project-row"
                data-project-id={summary.id}
                data-openable={String(summary.openable)}
                disabled={!summary.openable}
                onClick={() => {
                  void openProject(summary.id)
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <span data-testid="project-row-name" className="text-sm font-medium">
                  {summary.name ?? "Untitled Project"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Last modified {lastTouched(summary.modifiedAt)}
                </span>
                {!summary.openable && (
                  <span data-testid="project-row-unopenable" className="text-xs text-destructive">
                    Saved by a newer version of Cutroom (schema version{" "}
                    {summary.schemaVersion ?? "unreadable"}). This build cannot open it, and your
                    work is still here.
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
