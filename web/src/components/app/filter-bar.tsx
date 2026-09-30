import type { ReactNode } from "react"
import { ChevronDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

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
      <span className="tabular text-xs text-ink-3" aria-live="polite">
        {shown === total ? `${total}` : `${shown} of ${total}`}
      </span>
      {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
    </div>
  )
}
