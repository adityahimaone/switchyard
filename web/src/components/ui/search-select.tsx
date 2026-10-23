import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

export interface SearchSelectOption {
  value: string
  label: string
  sublabel?: string
  badge?: string
  icon?: React.ReactNode
  disabled?: boolean
}

export interface SearchSelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  modal?: boolean
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  sideOffset?: number
  showTriggerBadge?: boolean
  options: SearchSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  contentClassName?: string
  size?: "sm" | "default"
  id?: string
  ariaLabel?: string
  title?: string
}

export function SearchSelect({
  value: controlledValue,
  defaultValue,
  onValueChange,
  open: controlledOpen,
  onOpenChange,
  modal = false,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  showTriggerBadge = false,
  options,
  placeholder = "Select an option…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches found",
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
  size = "default",
  id,
  ariaLabel,
  title,
}: SearchSelectProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
  const [query, setQuery] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)

  const isControlledOpen = controlledOpen !== undefined
  const open = isControlledOpen ? controlledOpen : internalOpen

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlledOpen) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlledOpen, onOpenChange]
  )

  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : internalValue

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  )

  const filteredOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(q)
      const matchValue = opt.value.toLowerCase().includes(q)
      const matchSub = opt.sublabel?.toLowerCase().includes(q)
      return matchLabel || matchValue || matchSub
    })
  }, [options, query])

  // Reset search and active index when opened/closed
  React.useEffect(() => {
    if (open) {
      setQuery("")
      const idx = filteredOptions.findIndex((opt) => opt.value === value)
      setActiveIndex(idx >= 0 ? idx : 0)
    }
  }, [open, value])

  const selectOption = React.useCallback(
    (val: string) => {
      if (!isControlled) setInternalValue(val)
      onValueChange?.(val)
      setOpen(false)
    },
    [isControlled, onValueChange]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        setOpen(true)
      }
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const current = filteredOptions[activeIndex]
      if (current && !current.disabled) {
        selectOption(current.value)
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className={cn("relative w-full", className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={modal}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel || placeholder}
            title={title}
            aria-expanded={open}
            onKeyDown={handleKeyDown}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-control border border-line/60 bg-surface/50 px-3 text-sm text-ink tracking-[-0.01em] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none",
              "transition-[border-color,background-color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)]",
              "hover:border-line-strong hover:bg-surface/80 dark:bg-well/30 dark:hover:bg-well/60",
              "focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30",
              "active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "h-8 py-1 text-xs" : "h-9 py-2",
              triggerClassName
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left whitespace-nowrap">
              {selectedOption ? (
                <>
                  {selectedOption.icon && (
                    <span className="shrink-0 text-ink-3 [&_svg]:size-3.5">{selectedOption.icon}</span>
                  )}
                  <span className="truncate">{selectedOption.label}</span>
                  {showTriggerBadge && selectedOption.badge && (
                    <span className="shrink-0 rounded bg-well px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                      {selectedOption.badge}
                    </span>
                  )}
                </>
              ) : (
                <span className="truncate text-ink-4">{placeholder}</span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-ink-3 opacity-60 transition-transform duration-200 ease-[var(--ease-out-expo)]",
                open && "rotate-180"
              )}
            />
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={12}
            avoidCollisions
            className={cn(
              "z-[110] flex w-[var(--radix-popover-trigger-width)] min-w-[14rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-panel",
              "border border-line/60 bg-raised/95 text-ink shadow-float backdrop-blur-2xl saturate-150 dark:bg-raised/90 outline-none",
              "transition-[opacity,transform] duration-180 ease-[var(--ease-out-expo)]",
              "data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0",
              "data-[state=open]:scale-100 data-[state=open]:opacity-100",
              "data-[side=bottom]:data-[state=closed]:translate-y-[-4px] data-[side=bottom]:data-[state=open]:translate-y-0",
              "data-[side=top]:data-[state=closed]:translate-y-[4px] data-[side=top]:data-[state=open]:translate-y-0",
              contentClassName
            )}
          >
            {/* Apple inline search header */}
            <div className="relative flex items-center border-b border-line/50 bg-well/30 px-2.5 py-2">
              <Search className="size-3.5 shrink-0 text-ink-4" aria-hidden />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                autoFocus
                className="ml-2 w-full bg-transparent text-xs text-ink placeholder:text-ink-4 outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setActiveIndex(0)
                  }}
                  className="rounded-full p-0.5 text-ink-4 hover:bg-well hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Options list */}
            <div
              role="listbox"
              className="max-h-60 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-line-strong/30"
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-ink-3">
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value
                  const isActive = idx === activeIndex
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled}
                      onClick={() => !opt.disabled && selectOption(opt.value)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        "relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-xs outline-none select-none",
                        "transition-colors duration-100",
                        isActive && "bg-accent/10 text-ink",
                        isSelected && "font-medium text-accent",
                        opt.disabled && "pointer-events-none opacity-40"
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2 truncate">
                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        <div className="flex min-w-0 flex-1 flex-col truncate">
                          <span className="truncate">{opt.label}</span>
                          {opt.sublabel && (
                            <span className="truncate font-mono text-[10px] text-ink-3">
                              {opt.sublabel}
                            </span>
                          )}
                        </div>
                        {opt.badge && (
                          <span className="shrink-0 rounded bg-well px-1 py-0.5 font-mono text-[9px] text-ink-3">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="size-3.5 shrink-0 text-accent" aria-hidden />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}
