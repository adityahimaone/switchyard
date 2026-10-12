import { useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { GitBranch, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  // Radix Select items need non-empty values, so a detached HEAD needs a
  // sentinel — switch mode has no item for it (every choice there is a real
  // branch), and base mode's "Current HEAD" item *is* that sentinel.
  //
  // In base mode the trigger reports the branch the work will actually start
  // from: an explicit pick wins, otherwise the checked-out branch. Showing
  // "Current HEAD" as a literal label would hide the one fact the control
  // exists to convey.
  const selected =
    mode === "switch" ? current || "__detached" : value || current || "__head"
  const placeholder =
    !branchesQuery.data
      ? branchesQuery.isLoading
        ? "Loading branches…"
        : loadError
          ? "Branches unavailable"
          : "No branches"
      : "Detached HEAD"

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <Select
          value={selected}
          disabled={disabled || selectDisabled || busy || !branchesQuery.data}
          onValueChange={(next) => {
            setNote(null)
            if (mode === "switch") checkout.mutate(next)
            else onChange?.(next === "__head" ? "" : next)
          }}
        >
          <SelectTrigger
            size={triggerSize}
            className={cn("min-w-0 [&>span]:truncate", triggerClassName)}
            aria-label="Branch"
            disabled={disabled || selectDisabled || busy}
            title={loadError || (current ? `On branch ${current}` : undefined)}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className="max-w-[22rem]">
            {mode === "base" && !selectDisabled && (
              <SelectItem value="__head" className="text-sm">
                Current HEAD
              </SelectItem>
            )}
            {branches.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-ink-3">{loadError || "No branches"}</p>
            ) : (
              branches.map((b) => (
                <SelectItem key={b} value={b} className="truncate" title={b}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <GitBranch className="size-3 shrink-0 text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{b}</span>
                    {b === current && <span className="shrink-0 text-2xs text-accent-text">current</span>}
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "shrink-0 gap-1 text-2xs",
            /* `size-7` in compact mode, not `size-8`: the composer's chip row is
               28px tall (`PROMPT_CHIP`'s `h-7`), and a 32px round button in it
               made the whole row 32px and left the pull sitting proud of the
               branch chip it belongs to. */
            compact ? "size-7 rounded-full p-0" : "h-7 px-2",
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
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3" aria-hidden />
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
