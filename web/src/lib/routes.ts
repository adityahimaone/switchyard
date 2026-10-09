import type { Page } from "@/lib/sidebar-preferences"

export type AppRoute = {
  page: Page
  slug?: string
  taskId?: string
  chatSessionID?: string
  projectID?: string
}

const PAGES = new Set<Page>([
  "overview", "board", "workspaces", "profiles", "providers", "logs", "skills",
  "memory", "agent-mapping", "knowledge", "cron", "ecosystem", "chat", "projects", "settings",
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

  if (root === "chat") return { page: "chat", chatSessionID: second }
  if (root === "projects") {
    // `/projects` and `/projects/-/<session>` are the landing (all projects);
    // `/projects/<id>[/<session>]` is a project. Without the `-` sentinel a
    // landing-view session id would be parsed as a project id.
    if (second === "-") return { page: "projects", chatSessionID: third }
    return { page: "projects", projectID: second, chatSessionID: third }
  }
  if (root && PAGES.has(root as Page)) return { page: root as Page }
  return { page: "overview", slug: "f8-saas" }
}

export function pagePath(page: Page, slug: string, taskId?: string): string {
  if (page === "board") {
    return taskId
      ? `/board/${encodeURIComponent(slug)}/task/${encodeURIComponent(taskId)}`
      : `/board/${encodeURIComponent(slug)}`
  }
  if (page === "chat" && slug) return `/chat/${encodeURIComponent(slug)}`
  if (page === "projects" && slug) return `/projects/${encodeURIComponent(slug)}`
  return `/${page}`
}
