"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * A single-date picker: a trigger button that opens the shadcn Calendar in a
 * Popover. The value is a `YYYY-MM-DD` string (the shape the energy API and the
 * `<input type="date">` it replaces both speak), parsed and formatted in LOCAL
 * time so the day never shifts across the UTC boundary — `new Date("2026-10-01")`
 * would read as the previous day west of Greenwich.
 */
export function parseISODate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return undefined
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function formatISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const label = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })

export function DatePicker({
  value,
  onChange,
  min,
  max,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (iso: string) => void
  min?: string
  max?: string
  ariaLabel: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = parseISODate(value)
  const from = min ? parseISODate(min) : undefined
  const to = max ? parseISODate(max) : undefined
  const disabled: NonNullable<React.ComponentProps<typeof Calendar>["disabled"]> = [
    ...(from ? [{ before: from }] : []),
    ...(to ? [{ after: to }] : []),
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={ariaLabel}
          className={cn("justify-start gap-1.5 text-[10px] font-normal", !selected && "text-ink-3", className)}
        >
          <CalendarDays aria-hidden className="text-ink-3" />
          {selected ? label.format(selected) : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          disabled={disabled.length ? disabled : undefined}
          onSelect={(d) => {
            if (!d) return
            onChange(formatISODate(d))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
