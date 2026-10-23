import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { GitBranch, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select"
import { listWorkspaceBranches, toastGlobal, workspaceGitCheckout, workspaceGitPull } from "@/api"
import { cn } from "@/lib/utils"

/**
 * The branch control shared by the chat composer and the New-task dialog.
 *
 * Both surfaces need the same three things — the workspace's local branches, the
 * branch that is checked out right now, and a way to fast-forward it — and both
 * used to be served by nothing at all. The only difference between them is what
 * picking a branch means:
 *
 * - `mode="switch"` (chat) checks the branch out, because a chat turn edits the
 *   workspace and the operator expects the branch chip to say where those edits
 *   will land. This mutates the checkout, so it is the operator's click and
 *   never a side effect of loading the page.
 * - `mode="base"` (New task) only records the choice, because there it is the
 *   start-point for a per-task worktree, not something to move HEAD to.
 *
 * The git calls are local-workspace only. A remote workspace has no checkout on
 * this host, so the server refuses and the refusal is shown where the control
 * is rather than being swallowed.
 */

export type BranchPickerMode = "switch" | "base"

/** git reports the reason on the first line; the rest is usually advice. */
function firstLine(text: string): string {
  const line = (text ?? "").trim().split("\n")[0]?.trim() ?? ""
  return line
}

export function BranchPicker({
  workspaceId,
  value,
  onChange,
  mode = "base",
  feedback = "inline",
  compact = false,
  selectDisabled = false,
  disabled,
  triggerClassName,
  triggerSize = "sm",
  className,
}: {
  /** The workspace whose checkout this control reads. Renders nothing without one. */
  workspaceId?: string
  /** mode="base": the chosen start-point. "" means "current HEAD". Ignored in switch mode. */
  value?: string
  onChange?: (branch: string) => void
  mode?: BranchPickerMode
  /**
   * Where pull/checkout results go. "toast" is for the composer, whose chip row
   * has no room for a second line; "inline" is for the dialog, which does.
   */
  feedback?: "inline" | "toast"
  /** Icon-only pull button, for the composer's crowded chip row. */
  compact?: boolean
  /**
   * Locks the branch list while leaving Pull live. The New-task dialog uses it
   * under Workspace isolation, where the branch is not a parameter of anything —
   * the card runs on whatever is checked out, so the control reports that branch
   * instead of pretending a different one could be chosen.
   */
  selectDisabled?: boolean
  disabled?: boolean
  triggerClassName?: string
  triggerSize?: "sm" | "default"
  className?: string
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const report = useCallback(
    (next: { kind: "ok" | "err"; text: string }) => {
      if (feedback === "toast") toastGlobal(next.text, next.kind === "ok" ? "success" : "error")
      else setNote(next)
    },
    [feedback],
  )

  const branchesQuery = useQuery({
    queryKey: ["workspace-branches", workspaceId],
    queryFn: () => listWorkspaceBranches(workspaceId!),
    enabled: !!workspaceId,
    // A branch list is cheap but not free, and it goes stale the moment anything
    // else touches the repo. Refetched explicitly after pull/checkout rather
    // than polled.
    staleTime: 30_000,
    // A workspace that is not a git repo is a normal state, not a transient
    // failure — retrying three times just delays the message.
    retry: false,
  })

  const refresh = useCallback(() => {
    void branchesQuery.refetch()
    void qc.invalidateQueries({ queryKey: ["workspace-branches", workspaceId] })
  }, [branchesQuery, qc, workspaceId])

  const pull = useMutation({
    mutationFn: () => workspaceGitPull(workspaceId!),
    onSuccess: (res) => {
      report(
        res.success
          ? { kind: "ok", text: firstLine(res.output) || "Already up to date." }
          : { kind: "err", text: res.error || "git pull failed" },
      )
      // Refetch even on failure: a refused pull can still have moved the branch
      // list (a fetch updates remote-tracking refs).
      refresh()
    },
    onError: (e) => report({ kind: "err", text: (e as Error).message }),
  })

  const checkout = useMutation({
    mutationFn: (branch: string) => workspaceGitCheckout(workspaceId!, branch),
    onSuccess: (res, branch) => {
      report(
        res.success
          ? { kind: "ok", text: `Switched to ${branch}` }
          : { kind: "err", text: res.error || "git checkout failed" },
      )
      refresh()
    },
    onError: (e) => report({ kind: "err", text: (e as Error).message }),
  })

  if (!workspaceId) return null

  const branches = branchesQuery.data?.branches ?? []
  const current = branchesQuery.data?.current ?? ""
  const busy = pull.isPending || checkout.isPending
  const loadError = branchesQuery.error ? (branchesQuery.error as Error).message : ""
  // Radix SelectValue only renders its placeholder when value is "" (or
  // undefined). Passing a sentinel with no mounted SelectItem leaves the
  // trigger completely blank while loading, on error, or on detached HEAD.
  const hasHeadSentinel = mode === "base" && !selectDisabled
  const selected = !branchesQuery.data
    ? ""
    : mode === "switch"
      ? current || ""
      : value || current || (hasHeadSentinel ? "__head" : "")
  const placeholder =
    !branchesQuery.data
      ? branchesQuery.isLoading
        ? "Loading branches…"
        : loadError
          ? "Branches unavailable"
          : "No branches"
      : branches.length === 0
        ? "No branches"
        : "Detached HEAD"

  const branchOptions = useMemo<SearchSelectOption[]>(() => {
    const list: SearchSelectOption[] = []
    if (mode === "base" && !selectDisabled) {
      list.push({
        value: "__head",
        label: "Current HEAD",
        sublabel: current ? `Checked out: ${current}` : undefined,
        icon: <GitBranch className="size-3.5 text-ink-3" aria-hidden />,
      })
    }
    for (const b of branches) {
      list.push({
        value: b,
        label: b,
        badge: b === current ? "current" : undefined,
        icon: <GitBranch className="size-3.5 text-ink-3" aria-hidden />,
      })
    }
    return list
  }, [branches, current, mode, selectDisabled])

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <SearchSelect
          value={selected}
          disabled={disabled || selectDisabled || busy || !branchesQuery.data}
          onValueChange={(next) => {
            setNote(null)
            if (mode === "switch") checkout.mutate(next)
            else onChange?.(next === "__head" ? "" : next)
          }}
          options={branchOptions}
          placeholder={placeholder}
          searchPlaceholder="Search branches…"
          emptyMessage={loadError || "No branches found"}
          size={triggerSize}
          triggerClassName={cn("min-w-0 [&>span]:truncate", triggerClassName)}
          title={loadError || (current ? `On branch ${current}` : undefined)}
        />

        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          className={cn(
            "shrink-0 gap-1.5 rounded-control text-xs font-medium transition-[transform,background-color] duration-150 active:scale-95",
            "border-line/60 bg-surface/50 hover:bg-surface/80 dark:bg-well/30 dark:hover:bg-well/60 text-ink-2 hover:text-ink",
            compact ? "size-8 rounded-control p-0" : "h-9 px-3",
          )}
          disabled={disabled || busy}
          onClick={() => {
            setNote(null)
            pull.mutate()
          }}
          aria-label="Git pull"
          title="git pull --ff-only in this workspace"
        >
          {pull.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {!compact && "Pull"}
        </Button>
      </div>

      {feedback === "inline" && (note || loadError) && (
        <p
          role={note?.kind === "err" || (!note && loadError) ? "alert" : "status"}
          className={cn(
            "truncate text-2xs",
            note?.kind === "err" || (!note && loadError) ? "text-danger-text" : "text-ink-3",
          )}
          title={note?.text ?? loadError}
        >
          {note?.text ?? loadError}
        </p>
      )}
    </div>
  )
}
