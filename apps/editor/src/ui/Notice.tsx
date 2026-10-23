// The one shape every failure the user can hit is shown in (T093).
//
// A plain statement of what happened, in the product's terms; a sentence of what it means or what
// to do; the action, when there is one, as a button right there; and the technical detail last,
// folded under "Details" so it is available for a bug report without being the first thing read.
// See `failure-wording.ts` for the words themselves.
//
// `tone` separates the two kinds of thing shown this way: a **failure** (red — something the user
// asked for did not happen) and a **state** that needs attention (amber — an Offline Source, a
// Timeline that can only be exported without sound), which Principle V says is not an error.

import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface NoticeAction {
  readonly label: string
  readonly onClick: () => void
  readonly testId?: string
  readonly disabled?: boolean
  /** The first action is the one that leads; the rest are outlined. */
  readonly variant?: "default" | "outline"
}

export interface NoticeProps {
  readonly testId: string
  readonly tone?: "failure" | "attention" | "dark"
  /** The plain statement: what happened. */
  readonly title: ReactNode
  /** What it means, or what to do about it. */
  readonly children?: ReactNode
  readonly actions?: readonly NoticeAction[]
  /** The platform's or the engine's own words, folded away. */
  readonly details?: string | null
  readonly className?: string
  /** Extra `data-*` attributes on the notice itself, for specs that read state off it. */
  readonly data?: Readonly<Record<`data-${string}`, string>>
}

const TONE = {
  failure: "border-destructive/40 bg-destructive/10",
  attention: "border-amber-500/40 bg-amber-500/10",
  dark: "border-white/20 bg-white/5 text-white",
} as const

export function Notice({
  testId,
  tone = "failure",
  title,
  children,
  actions = [],
  details,
  className,
  data,
}: NoticeProps) {
  return (
    <div
      {...data}
      data-testid={testId}
      role={tone === "attention" ? "status" : "alert"}
      className={cn("flex flex-col gap-1.5 rounded-md border p-2 text-xs", TONE[tone], className)}
    >
      <p data-testid={`${testId}-title`} className="font-medium">
        {title}
      </p>
      {children === undefined ? null : <div className="flex flex-col gap-1">{children}</div>}
      {actions.length === 0 ? null : (
        <div className="flex flex-wrap gap-1">
          {actions.map((action, index) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant ?? (index === 0 ? "default" : "outline")}
              data-testid={action.testId}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
      {details === undefined || details === null || details === "" ? null : (
        <details data-testid={`${testId}-details`} className="opacity-80">
          <summary className="cursor-pointer select-none">Details</summary>
          <pre className="mt-1 max-h-40 overflow-y-auto font-mono text-[0.625rem] break-words whitespace-pre-wrap">
            {details}
          </pre>
        </details>
      )}
    </div>
  )
}
