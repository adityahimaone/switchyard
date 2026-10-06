import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldCheck, ShieldX, ShieldQuestion } from "lucide-react"
import { rerunVerify, taskVerify, toastGlobal, type TaskVerify } from "../../api"
import { AttachmentLightbox, type LightboxAttachment } from "@/components/feedback/attachment-lightbox"

/**
 * The Verification block: what was checked, what routing decided, and the
 * screenshots that prove it.
 *
 * It renders images, which nothing else in the review surface does. That is
 * deliberate — a passing pixel diff means little to a human, and the whole point
 * of attaching screenshots is that a reviewer looks at them.
 *
 * Light and dark are shown as a pair rather than a slider. The visual suite
 * captures one frame per theme, and the failure this loop exists to catch — a
 * contrast or spacing regression that only appears in one of them — is invisible
 * unless both are on screen at once.
 */

type Verdict = "passed" | "failed" | "running" | "skipped" | "unavailable" | ""

/** Which theme a screenshot belongs to, inferred from its filename. */
function themeOf(filename: string): "light" | "dark" | null {
  const lower = filename.toLowerCase()
  if (lower.includes("dark")) return "dark"
  if (lower.includes("light")) return "light"
  return null
}

function statusTone(status: Verdict) {
  switch (status) {
    case "passed":
      return { text: "text-success-text", label: "passed" }
    case "failed":
      return { text: "text-danger-text", label: "failed" }
    case "running":
      return { text: "text-ink-2", label: "running" }
    default:
      // "skipped" and "unavailable" are honest degraded states, not failures,
      // and are worded so they cannot be misread as a pass.
      return { text: "text-ink-3", label: status || "not run" }
  }
}

function VerdictIcon({ status }: { status: Verdict }) {
  if (status === "passed") return <ShieldCheck className="size-3.5 text-success-text" aria-hidden />
  if (status === "failed") return <ShieldX className="size-3.5 text-danger-text" aria-hidden />
  return <ShieldQuestion className="size-3.5 text-ink-3" aria-hidden />
}

function Screenshot({ att }: { att: LightboxAttachment }) {
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<LightboxAttachment | null>(null)
  const theme = themeOf(att.filename)
  return (
    <figure className="min-w-0">
      <button
        type="button"
        onClick={() => setView(att)}
        title={`View ${att.filename} full size`}
        className="block w-full cursor-zoom-in"
      >
        {failed ? (
          <div className="flex h-28 items-center justify-center rounded-control border border-line bg-well px-3 text-center text-2xs text-ink-3">
            {att.filename}
            <br />
            preview unavailable — click to view
          </div>
        ) : (
          <img
            src={`/api/attachments/${att.id}`}
            alt={`${att.filename}${theme ? `, ${theme} theme` : ""}`}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-28 w-full rounded-control border border-line bg-canvas object-cover object-top"
          />
        )}
      </button>
      <figcaption className="mt-1 truncate font-mono text-2xs text-ink-3" title={att.filename}>
        {theme ? `${theme} · ` : ""}
        {att.filename}
      </figcaption>
      <AttachmentLightbox att={view} onClose={() => setView(null)} />
    </figure>
  )
}

function describeProfile(data: TaskVerify): string {
  const effective = data.profile_effective || "none"
  if (!data.profile) return `auto → ${effective}`
  return data.profile === effective ? data.profile : `${data.profile} (ran ${effective})`
}

export function VerificationBlock({ slug, taskId }: { slug: string; taskId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(true)

  const verify = useQuery({
    queryKey: ["verify", slug, taskId],
    queryFn: () => taskVerify(slug, taskId),
    retry: false,
  })

  const rerun = useMutation({
    mutationFn: () => rerunVerify(slug, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["verify", slug, taskId] })
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      toastGlobal("Verification re-run", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })

  const data = verify.data
  const status = (data?.status ?? "") as Verdict
  const tone = statusTone(status)
  const shots = (data?.attachments ?? []).filter((a) => a.mime.startsWith("image/"))
  const others = (data?.attachments ?? []).filter((a) => !a.mime.startsWith("image/"))

  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-control border border-line bg-well">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-ink-2">
        <VerdictIcon status={status} />
        <span className="min-w-0 flex-1 truncate">Verification</span>
        {verify.isLoading && <Loader2 className="size-3 animate-spin" aria-label="Loading" />}
        {data && <span className="shrink-0 text-2xs text-ink-3">{describeProfile(data)}</span>}
        <span className={`shrink-0 text-2xs ${tone.text}`}>{tone.label}</span>
      </summary>

      <div className="flex flex-col gap-3 px-3 pb-3">
        {data?.status === "unavailable" && (
          <p className="text-2xs text-ink-3">
            This node could not run the check. Nothing was verified — treat the card as unchecked,
            not as passed.
          </p>
        )}
        {data?.status === "skipped" && (
          <p className="text-2xs text-ink-3">
            Nothing to verify: the diff did not need a rung.
          </p>
        )}
        {status === "failed" && !data?.output && (
          <p className="text-2xs text-ink-3">Verification failed with no output recorded.</p>
        )}

        {shots.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {shots.map((a) => (
              <Screenshot key={a.id} att={a} />
            ))}
          </div>
        )}

        {others.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {others.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-control border border-line px-2 py-1 font-mono text-2xs text-ink-2 hover:bg-canvas"
                >
                  {a.filename}
                </a>
              </li>
            ))}
          </ul>
        )}

        {shots.length === 0 && others.length === 0 && status === "passed" && data?.profile_effective !== "none" && (
          <p className="text-2xs text-ink-3">
            The rung passed but produced no attachments. A UI or E2E rung is expected to leave
            evidence here.
          </p>
        )}

        {data?.output && (
          <pre className="max-h-48 overflow-auto rounded-control border border-line bg-canvas p-2 font-mono text-2xs leading-5 text-ink-2">
            {data.output}
          </pre>
        )}

        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={rerun.isPending}
            onClick={() => rerun.mutate()}
          >
            {rerun.isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            Re-run verify
          </Button>
        </div>
      </div>
    </details>
  )
}