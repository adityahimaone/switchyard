import { useQuery } from "@tanstack/react-query"
import { getTask, type Task } from "../../api"

/**
 * useFullTask returns the task with its complete agent result.
 *
 * The board list ships a 16 KB preview per card, because one real result is
 * 2.5 MB and the board could not paint until megabytes arrived. A detail view
 * is the one place that needs the whole text, so it fetches it once, on open,
 * and only when the list actually truncated something.
 */
export function useFullTask(slug: string, task: Task): Task {
  const truncated = Boolean(task.result_truncated)
  const { data } = useQuery({
    queryKey: ["task", slug, task.id, "full"],
    queryFn: () => getTask(slug, task.id),
    enabled: truncated,
    staleTime: 30_000,
  })
  // Keep the list's fresher status/verify fields and take only the full
  // result, so an in-flight poll cannot be overwritten by an older detail read.
  return truncated && data ? { ...task, result: data.result, result_truncated: false } : task
}
