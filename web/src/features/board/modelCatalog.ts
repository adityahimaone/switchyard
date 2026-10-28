import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { listExecutorModels, type ModelCatalogSource } from "@/api"
import { SearchSelectOption } from "@/components/ui/search-select"

/** Older than this and the picker asks the node to re-probe in the background. */
const STALE_CATALOG_MS = 90 * 1000
/** How long the picker keeps polling for the refreshed catalog. */
const REFRESH_WAIT_MS = 20 * 1000

export interface ExecutorModelsState {
  models: SearchSelectOption[]
  isLoading: boolean
  isError: boolean
  /** probed = the worker said so; cached = last list we saw; unverified = guess. */
  source?: ModelCatalogSource
  profile?: string
  nodeId?: string
  detail?: string
  fetchedAt?: number
  /** True while the worker has not reported this catalog yet. */
  isPending: boolean
  /** Ask the worker to re-probe now. */
  refresh: () => void
}

/**
 * Model list for one executor, asked from the node that would run the card.
 *
 * The workspace matters: it resolves the node, and the node owns the truth. That
 * is why the picker no longer disagrees with the worker about which dsh profile
 * or which Command Code build is in play.
 */
export function useExecutorModels(
  executor: string,
  opts: { workspace?: string; profile?: string } = {},
): ExecutorModelsState {
  const norm =
    executor === "cmd"
      ? "commandcode"
      : executor === "pen_cli" || executor === "pencil" || executor === "pen"
        ? "pen"
        : executor
  const isApplicable = norm === "dsh" || norm === "commandcode" || norm === "pen"
  const workspace = opts.workspace ?? ""
  const profile = opts.profile ?? ""
  const [awaitingRef, setAwaitingRef] = useState(false)
  const askedRef = useRef(false)
  const refreshStartedRef = useRef(0)

  const query = useQuery({
    queryKey: ["models", norm, profile, workspace],
    queryFn: () =>
      listExecutorModels(norm, {
        workspace: workspace || undefined,
        profile: profile || undefined,
      }),
    enabled: isApplicable,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Every open of the picker asks again. The answer is the node's own catalog
    // and the node caches it, so this is one cheap question, not a probe.
    refetchOnMount: "always",
    // A worker that has never reported its catalog answers "pending" and gets
    // asked again on the next heartbeat, so poll briefly instead of showing an
    // empty picker forever. The same applies while waiting for a refresh the
    // node has to do in the background.
    refetchInterval: (q) =>
      q.state.data?.source === "pending" ? 2000 : awaitingRef ? 3000 : false,
  })

  const refresh = useCallback(() => {
    void listExecutorModels(norm, {
      workspace: workspace || undefined,
      profile: profile || undefined,
      refresh: true,
    }).then(() => query.refetch())
  }, [norm, workspace, profile, query])

  // The catalog is only as fresh as the node's last probe. Ask for a re-probe
  // when what we got back is old, then poll until a newer answer lands, so the
  // picker converges on the current list instead of showing yesterday's.
  useEffect(() => {
    if (!isApplicable || !query.data || askedRef.current) return
    const ageMs = Date.now() - (query.data.fetched_at ?? 0) * 1000
    if (query.data.source !== "pending" && ageMs <= STALE_CATALOG_MS) return
    askedRef.current = true
    refreshStartedRef.current = Date.now()
    setAwaitingRef(true)
    refresh()
  }, [isApplicable, query.data, refresh])

  useEffect(() => {
    if (!awaitingRef) return
    const since = Date.now() - refreshStartedRef.current
    if (since > REFRESH_WAIT_MS) {
      setAwaitingRef(false)
      return
    }
    const t = setTimeout(() => setAwaitingRef(false), REFRESH_WAIT_MS - since)
    return () => clearTimeout(t)
  }, [awaitingRef, query.data])

  // A newer catalog arrived: stop polling.
  useEffect(() => {
    if (!awaitingRef || !query.data?.fetched_at) return
    if (query.data.fetched_at * 1000 >= refreshStartedRef.current) setAwaitingRef(false)
  }, [awaitingRef, query.data])


  if (!isApplicable) {
    return {
      models: [],
      isLoading: false,
      isError: false,
      isPending: false,
      refresh: () => {},
    }
  }

  const source = query.data?.source
  // No local fallback list. A hardcoded catalog was the bug: it advertised
  // thirteen models no profile declared, so a Mac worker saw "DeepSeek Account 2,
  // DeepSeek 2, 9router 7" while the profile it actually ran declared 1 419
  // different ids. An empty answer is the honest one, and source says why.
  const models = (query.data?.models ?? []) as SearchSelectOption[]

  return {
    models,
    isLoading: query.isLoading,
    isError: query.isError,
    source: source ?? (query.isError ? "unverified" : undefined),
    profile: query.data?.profile,
    nodeId: query.data?.node_id,
    detail: query.data?.detail,
    fetchedAt: query.data?.fetched_at,
    isPending: source === "pending",
    refresh,
  }
}
