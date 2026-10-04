import * as React from "react"
import { motion } from "motion/react"
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"
import type { Status } from "@/api"
import { StatusLamp, STATUS_LABEL, statusColor } from "@/components/ui/status-lamp"
import { cn } from "@/lib/utils"

/** Empty copy says what is true and what to do. No fake action offered. */
const EMPTY_COPY: Partial<Record<Status, { title: string; hint: string }>> = {
  triage: { title: "Nothing in triage", hint: "New tasks land here until you triage them." },
  todo: { title: "Nothing queued", hint: "Ready tasks wait here for the next dispatch." },
  scheduled: { title: "Nothing scheduled", hint: "Tasks with a future start time wait here." },
  ready: { title: "Nothing ready", hint: "Move a task to Ready to queue it for a worker." },
  running: { title: "Nothing running", hint: "Ready tasks start on the next dispatch, within 30 seconds." },
  blocked: { title: "Nothing blocked", hint: "Tasks that fail or wait on you land here." },
  review: { title: "Nothing to review", hint: "Finished tasks wait here until you approve the diff." },
  done: { title: "Nothing done yet", hint: "Approved tasks are collected here." },
  archived: { title: "Nothing archived", hint: "Archived tasks are kept here, out of the way." },
}

let entrancePlayed = false

/**
 * True only the first time the board mounts in a session. Drives the one
 * orchestrated moment: column tracks drawing in, left to right, staggered.
 */
export function useBoardEntrance(): boolean {
  const [enter] = React.useState(() => {
    const first = !entrancePlayed
    entrancePlayed = true
    return first
  })
  return enter
}

/** Wrap each card so moves between columns animate by position only. */
export function CardSlot({ children }: { children: ReactNode }) {
  return (
    <motion.li layout="position" transition={{ type: "spring", stiffness: 500, damping: 40 }}>
      {children}
    </motion.li>
  )
}

type BoardColumnProps = {
  status: Status
  count: number
  /** Column order, used to stagger the track-draw animation. */
  index?: number
  title?: string
  actions?: ReactNode
  /** True while a card is dragged over a valid drop target. */
  isOver?: boolean
  /** Rendered when the column is empty and nothing is being dragged. */
  empty?: ReactNode
  children?: ReactNode
  className?: string
} & Pick<HTMLAttributes<HTMLUListElement>, "onDragOver" | "onDragLeave" | "onDrop">

export function BoardColumn({
  status,
  count,
  index = 0,
  title,
  actions,
  isOver,
  empty,
  children,
  className,
  ...dropHandlers
}: BoardColumnProps) {
  const headingId = React.useId()
  const copy = EMPTY_COPY[status]
  return (
    <section
      aria-labelledby={headingId}
      /* The column is the ONE blur layer in the board. Everything inside it —
         the cards — is deliberately unblurred, because their backdrop is
         already this blurred panel and blurring it again would diffuse
         nothing while doubling the compositing-layer cost on the densest page
         in the app.

         `--glass-tint-strong` rather than `--glass-tint`, because this is the
         only panel in the app with a full-height bright orb directly behind it
         and body text running down its middle. At the panel tint the column
         washed out: the empty-state copy measured against the orb peak fell
         under the 4.5 bar even though the token-level check passed, because
         that check assumes one flat tint rather than a 90px blur gradient
         passing under the text. The stronger tier keeps the material and buys
         the contrast back. */
      className={cn(
        "glass glass-spotlight flex w-[296px] shrink-0 flex-col rounded-panel p-2",
        "bg-[var(--glass-tint-strong)]",
        className
      )}
      style={{ "--lamp": statusColor(status), "--i": index } as CSSProperties}
    >
      <header className="px-1 pb-2">
        <div className="flex h-8 items-center gap-2">
          <StatusLamp status={status} showLabel={false} />
          <h2 id={headingId} className="text-sm font-semibold text-ink">
            {title ?? STATUS_LABEL[status]}
          </h2>
          <span className="tabular text-xs text-ink-3">{count}</span>
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </div>
        <div className="track-line" aria-hidden />
      </header>

      <ul
        data-over={isOver || undefined}
        /* `bg-well` came off here: the column itself is now the glass panel, so
           an opaque fill on its scroll container would cover it and the column
           would read as a glass frame around a flat well — two materials where
           the design calls for one. The drop state is signalled with an accent
           border and an *inset* glow instead, which is legible without needing
           a fill change at all. */
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-control",
          "border border-transparent transition-[border-color,box-shadow] duration-150",
          "data-[over]:border-accent/60 data-[over]:shadow-[inset_0_0_40px_-12px_var(--c-accent)]"
        )}
        {...dropHandlers}
      >
        {/*
          Children.toArray drops null/undefined, so a caller that passes
          `cards.map(...)` plus a trailing `undefined` still reads as empty.
          React.Children.count does not, and would suppress the empty copy.
        */}
        {React.Children.toArray(children).length > 0 ? (
          children
        ) : (
          <li className="px-2 py-6 text-sm">
            <p className="font-medium text-ink-2">{copy?.title ?? "No tasks"}</p>
            <p className="mt-1 max-w-[32ch] text-xs text-ink-3">
              {copy?.hint ?? "Drag a card here or create a task."}
            </p>
          </li>
        )}
        {empty}
      </ul>
    </section>
  )
}
