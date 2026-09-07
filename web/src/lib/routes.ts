import type { Page } from "@/lib/sidebar-preferences"

export type AppRoute = {
  page: Page
  slug?: string
  taskId?: string
}

const PAGES = new Set<Page>([
  "overview", "board", "command-center", "workspaces", "profiles", "providers", "logs", "skills",
  "memory", "flow", "agent-mapping", "settings",
])

export function parseRoute(pathname: string): AppRoute {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent)
  const [root, second, third] = parts

  if (root === "board") {
    return {
      page: "board",
      slug: second || "f8-saas",
      taskId: third === "task" ? parts[3] : undefined,
    }
  }

  if (root === "command-center") {
    return { page: "command-center", slug: second || "f8-saas", taskId: third }
  }

  if (root && PAGES.has(root as Page)) return { page: root as Page }
  return { page: "board", slug: "f8-saas" }
}

export function pagePath(page: Page, slug: string, taskId?: string): string {
  if (page === "board") {
    return taskId
      ? `/board/${encodeURIComponent(slug)}/task/${encodeURIComponent(taskId)}`
      : `/board/${encodeURIComponent(slug)}`
  }
  if (page === "command-center") {
    return `/command-center/${encodeURIComponent(slug)}/${encodeURIComponent(taskId ?? "")}`
  }
  return `/${page}`
}
