import { HtLoader } from "@/components/HtLoader"

type LoadingVariant = "board" | "detail" | "page"

type LoadingStateProps = {
  /** Kept for call-site compatibility. All page loading uses one visual language. */
  variant?: LoadingVariant
  label?: string
  description?: string
}

export default function LoadingState({
  label = "Memuat data",
  description = "Menyiapkan halaman ini.",
}: LoadingStateProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6" role="status" aria-label={label} aria-live="polite">
      <div className="flex w-full max-w-xs flex-col items-center text-center">
        <HtLoader size={72} label={label} />
        <p className="mt-5 text-sm font-medium text-[var(--color-ink)]">{label}</p>
        <p className="mt-1.5 text-xs leading-5 text-[var(--color-ink-3)]">{description}</p>
      </div>
    </div>
  )
}
