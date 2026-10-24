// How a failure is put into words for the user (T093).
//
// One rule for every failure the user can hit: **a plain statement first, in the product's own
// terms** (CONTEXT.md — a Source, a Clip, a Project, the Timeline; never "media"), **then the action
// that helps, if there is one, and the technical detail last, folded away** (`Notice`'s "Details").
// The platform's and the engine's own words are kept — they are what a bug report needs — but they
// are never the first thing the user reads, and nothing reaches the screen as `[object Object]`.
//
// Everything here is pure, so the wording is unit-tested without a browser.

/** A plain statement and what to do about it — the two lines a refusal notice shows. */
export interface RefusalWords {
  readonly title: string
  readonly explanation: string
}

/**
 * Why an edit did not happen, in the User's terms (screens.md SCR-02 "error (edit refused)").
 *
 * `reason` is a model `RefusalReason` (contracts/public-api.md) or one of the two empty
 * `splitTargets` cases. An edit refused is a rule the User can act on at once, not something
 * broken, so each line says what to do next. A reason this build does not know still gets words,
 * because a notice that says nothing is worse than a general one.
 */
/**
 * The refusals a rule function predicts and the User can act on. Their notice is the words alone;
 * any other refusal is unexpected and also carries the reducer's message under Details
 * (screens.md SCR-02, "error (unexpected refusal)").
 */
const ACTIONABLE_REFUSALS: ReadonlySet<string> = new Set([
  "selection-not-under-frame",
  "nothing-under-frame",
  "track-limit",
  "last-track",
])

export function isActionableRefusal(reason: string): boolean {
  return ACTIONABLE_REFUSALS.has(reason)
}

export function explainRefusal(reason: string): RefusalWords {
  switch (reason) {
    case "selection-not-under-frame":
      return {
        title: "No selected Clip is under the Playhead.",
        explanation:
          "Move the Playhead inside a selected Clip, past its first Frame, or clear the Selection to split every Clip under it.",
      }
    case "nothing-under-frame":
      return {
        title: "No Clip is under the Playhead.",
        explanation: "Move the Playhead onto a Clip, past its first Frame, and split again.",
      }
    case "track-limit":
      return {
        title: "A Project has at most two video Tracks for now.",
        explanation: "Put the Clip on one of the two Tracks you have.",
      }
    case "last-track":
      return {
        title: "A Project always keeps at least one Track.",
        explanation: "Delete the Clips on it instead, if you want the Timeline empty.",
      }
    case "overlap":
      return {
        title: "Clips can't overlap on a Track.",
        explanation: "Make room first, or place the Clips somewhere free.",
      }
    case "before-timeline-start":
      return {
        title: "Nothing can start before the Timeline's first Frame.",
        explanation: "Place the Clips at Frame 0 or later.",
      }
    case "too-short":
      return {
        title: "A Clip has to be at least one Frame long.",
        explanation: "Delete the Clip instead, if you want none of it.",
      }
    case "source-bounds":
      return {
        title: "A Clip can only show what its Source holds.",
        explanation: "The Clip already reaches the start or end of its Source.",
      }
    case "unknown-clip":
      return {
        title: "That Clip is no longer on the Timeline.",
        explanation: "Select the Clips you want and try again.",
      }
    case "unknown-track":
      return {
        title: "That Track is no longer in the Project.",
        explanation: "Try again on one of the Tracks shown.",
      }
    case "unknown-source":
      return {
        title: "That Source is no longer in the Project.",
        explanation: "Import the file again to use it.",
      }
    default:
      // duplicate-id, no-project, invalid, or a reason a newer model has: none of them is
      // something the User did, so the notice says the edit did not happen and keeps the detail.
      return {
        title: "That edit could not be made.",
        explanation: "Nothing was changed. The details say why, for a bug report.",
      }
  }
}

/** The thrown value's name, when it has one (`NotAllowedError`, `QuotaExceededError`, …). */
export function errorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const name = (error as { name?: unknown }).name
  return typeof name === "string" && name !== "" ? name : undefined
}

function oneValue(value: unknown): string {
  if (value === undefined || value === null) return "No further detail was given."
  if (typeof value === "string") return value === "" ? "No further detail was given." : value
  if (typeof value !== "object") return String(value)

  if (
    value instanceof Error ||
    (typeof DOMException !== "undefined" && value instanceof DOMException)
  ) {
    const { name, message } = value as Error
    if (message === "") return name
    return name === "Error" || message.startsWith(`${name}:`) ? message : `${name}: ${message}`
  }

  const message = (value as { message?: unknown }).message
  if (typeof message === "string" && message !== "") {
    const name = errorName(value)
    return name === undefined ? message : `${name}: ${message}`
  }

  const kind = value.constructor?.name
  const type = (value as { type?: unknown }).type
  if (typeof type === "string" && kind !== undefined && kind !== "Object") {
    return `${kind} "${type}"` // an Event, typically — what it was is the useful part
  }
  try {
    const json = JSON.stringify(value)
    if (json !== undefined && json !== "{}") return json
  } catch {
    // circular, or holds a BigInt — fall through
  }
  return kind !== undefined && kind !== "Object"
    ? `A ${kind} was thrown, with no message.`
    : "An unrecognised value was thrown, with no message."
}

/**
 * The technical detail of a thrown value, for "Details". Always a legible string: an `Error` or a
 * `DOMException` as `Name: message`, an `Event` by its kind and type, a plain object as JSON, and
 * never `[object Object]`. Causes are followed, because the outermost message is often a wrapper.
 */
export function technicalDetail(error: unknown): string {
  const lines = [oneValue(error)]
  let cause =
    typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined
  for (let depth = 0; cause !== undefined && depth < 4; depth += 1) {
    lines.push(`Caused by: ${oneValue(cause)}`)
    cause =
      typeof cause === "object" && cause !== null ? (cause as { cause?: unknown }).cause : undefined
  }
  return lines.join("\n")
}

/**
 * Why a file the user picked could not be read, as a sentence about the file. Keyed on the
 * DOMException name the File System Access API raises, because that is the only part of it that is
 * stable across browsers and locales.
 */
export function fileProblem(error: unknown): string {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "SecurityError":
      return "The browser did not give Cutroom permission to read it."
    case "NotFoundError":
      return "It is no longer where it was picked from."
    case "NotReadableError":
      return "It could not be read. It may be open in another program, or on a drive that is no longer connected."
    default:
      return "It could not be read."
  }
}

/** Why a write to this browser's storage failed, as a sentence the user can act on. */
export function storageProblem(error: unknown): string {
  switch (errorName(error)) {
    case "QuotaExceededError":
      return "This browser has run out of space for Cutroom's storage. Free up some disk space, then try again."
    case "InvalidStateError":
    case "UnknownError":
    case "AbortError":
      return "The browser could not use Cutroom's storage just now."
    default:
      return "The browser's storage did not accept the write."
  }
}

/** Where in an export a failure happened. */
export type ExportFailureStage =
  /** The save dialog itself failed to open. */
  | "choosing"
  /** The destination was chosen and could not be opened for writing. */
  | "opening"
  /** The sound mix failed; the export was stopped rather than finished silent (FR-024). */
  | "mixing"
  /** The engine was making the file. */
  | "running"
  /** The engine finished, and the file could not be committed to the destination. */
  | "committing"

/** What the user is offered after an export that did not finish. */
export type ExportFailureAction = "try-again" | "choose-another-name" | "reload"

export interface ExportFailureWords {
  /** The plain statement: what happened. */
  readonly title: string
  /** What it means, or what to do about it. */
  readonly explanation: string
  readonly action: ExportFailureAction
}

/**
 * Puts an export failure into words. `reason` is the raw detail — the engine's `export-failed`
 * reason or the platform's error — and is matched only for the few causes a user can act on
 * differently; everything else gets an honest "something went wrong", with the detail in Details.
 */
export function explainExportFailure(
  stage: ExportFailureStage,
  reason: string,
  fileName: string | null
): ExportFailureWords {
  const where = fileName === null ? "the destination" : fileName

  if (/EngineFatalError|engine stopped|engine was closed/i.test(reason)) {
    return {
      title: "The export stopped because Cutroom's engine stopped.",
      explanation: "Reload the page to start the engine again, then export again.",
      action: "reload",
    }
  }
  if (/QuotaExceeded|not enough space|no space|disk (is )?full/i.test(reason)) {
    return {
      title: "There was not enough space to save the file.",
      explanation: "Free up some space, or save it somewhere else.",
      action: "choose-another-name",
    }
  }
  if (/NotAllowedError|SecurityError|permission/i.test(reason)) {
    return {
      title: `Cutroom was not allowed to write to ${where}.`,
      explanation: "Choose another place to save it.",
      action: "choose-another-name",
    }
  }
  if (/went offline or was relinked/i.test(reason)) {
    return {
      title: "A Source went Offline or was relinked while the export ran.",
      explanation:
        "The rest of the file would no longer have matched the Timeline. Once every Source is back, export again.",
      action: "try-again",
    }
  }

  switch (stage) {
    case "choosing":
      return {
        title: "The save dialog could not be opened.",
        explanation: "Nothing was exported. Try again.",
        action: "try-again",
      }
    case "opening":
      return {
        title: `${where} could not be opened for writing.`,
        explanation: "Choose another name or another place to save it.",
        action: "choose-another-name",
      }
    case "mixing":
      return {
        title: "The sound could not be mixed.",
        explanation:
          "The export was stopped rather than finished without the sound it was started with.",
        action: "try-again",
      }
    case "committing":
      return {
        title: `The finished file could not be saved to ${where}.`,
        explanation: "Try again, or save it somewhere else.",
        action: "try-again",
      }
    case "running":
      return {
        title: "Something went wrong while the file was being made.",
        explanation: "Try again. If it keeps happening, the Details say what went wrong.",
        action: "try-again",
      }
  }
}

/** Reloads the page: the action for an engine that stopped, or storage held by another tab. */
export function reloadPage(): void {
  window.location.reload()
}
