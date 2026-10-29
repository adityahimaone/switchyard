import { describe, expect, it } from "vitest"
import { formatDuration, pushState } from "./CompletionSummary"

const git = (over: Partial<Parameters<typeof pushState>[0]> = {}) => ({
  available: true, files: 0, insertions: 0, deletions: 0, ahead: 0, behind: 0, dirty: 0, ...over,
})

describe("formatDuration", () => {
  it("reads wall time the way a reviewer says it", () => {
    expect(formatDuration(0)).toBe("—")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(211)).toBe("3m 31s")
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe("3h 5m")
  })
})

describe("pushState", () => {
  it("never claims pushed without an upstream", () => {
    expect(pushState(git({ upstream: "origin/main" })).label).toBe("pushed")
    expect(pushState(git()).label).toBe("no upstream")
    expect(pushState(git({ upstream: "origin/main", ahead: 2 }))).toEqual({ label: "2 unpushed", tone: "warn" })
    expect(pushState(git({ available: false })).label).toBe("unknown")
  })
})

/* Render proof: the panel must actually show the derived values, not just
   compute them. The query cache is prefilled so no fetch happens. */
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CompletionSummary } from "./CompletionSummary"
import type { Task } from "../../api"

describe("CompletionSummary", () => {
  const task = { id: "t_1", status: "done", executor: "dsh", completed_at: 1125 } as Task
  const data = {
    model: "deepseek-account:DeepSeek-V4.1-Flash",
    executor: "dsh",
    execution_mode: "agentic",
    attempt: 1,
    started_at: 1000,
    completed_at: 1125,
    duration_seconds: 125,
    log: { path: "/home/u/.hermes/kanban/logs/t_1.log", bytes: 2048, modified: 1, available: true },
    git: {
      available: true, branch: "main", head: "abcdef0123456789", short: "abcdef0",
      subject: "feat(x): land it", author: "Adit", committed_at: 1793194247,
      files: 2, insertions: 10, deletions: 3,
      file_list: ["a.ts", "b.ts"], upstream: "origin/main", ahead: 0, behind: 0, dirty: 0,
    },
  }

  it("shows model, total time, log file and commit state", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    qc.setQueryData(["completion", "default", "t_1"], data)
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <CompletionSummary slug="default" task={task} />
      </QueryClientProvider>,
    )
    expect(html).toContain("deepseek-account:DeepSeek-V4.1-Flash")
    expect(html).toContain("2m 5s")
    expect(html).toContain("t_1.log")
    expect(html).toContain("feat(x): land it")
    expect(html).toContain("pushed")
    expect(html).toContain("Committed and pushed")
    expect(html).not.toContain("uncommitted")
  })

  it("renders nothing while the card is still running", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <CompletionSummary slug="default" task={{ id: "t_2", status: "running" } as Task} />
      </QueryClientProvider>,
    )
    expect(html).toBe("")
  })
})
