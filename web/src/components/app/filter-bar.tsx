import type { ReactNode } from "react"
import { ChevronDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export interface FilterOption { value: string; label: string }

/** Shows the chosen value ("Platform: Mac"), not an empty label. */
export function FilterChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  const current = options.find((o) => o.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span className="text-ink-3">{label}:</span>
          <span className="max-w-32 truncate">{current?.label ?? value}</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FilterBar({
  query, onQueryChange, placeholder = "Search", shown, total, children, trailing,
}: {
  query: string
  onQueryChange: (q: string) => void
  placeholder?: string
  shown: number
  total: number
  children?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-64">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-8"
        />
      </div>
      {children}
      {/* A bare number next to the search box read as stray data — it had no
          noun and no container, so "12" was ambiguous between matches, results
          and items. The badge gives it a shape and keeps the noun in the
          placeholder, so the number reads as a count of what the field searches.

          `h-8` matches `Input` exactly (both from this design system). The
          badge's own default is `text-xs px-2 py-0.5`, which is a ~20px pill —
          visibly shorter than the 32px search box it sits beside, so the row
          looked misaligned rather than deliberate.

          `w-auto` fights the row stretching it. This is a direct flex child of a
          `flex-wrap` row, so its default `flex-basis: auto` resolves against the
          remaining space and it grows to fill it — a one-character count came out
          as a 300px-wide pill. Sizing to the content keeps the aspect ratio
          honest: the badge should be a count, not a panel. */}
      <Badge
        variant="outline"
        aria-live="polite"
        className="tabular h-8 w-auto flex-none gap-0 self-center border-line bg-well px-2 text-[13px] font-normal text-ink-3"
      >
        {shown === total ? total : `${shown} of ${total}`}
      </Badge>
      {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
    </div>
  )
}
