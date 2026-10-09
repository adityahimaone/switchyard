/**
 * The app has no router. `Page` is the set of things the user can navigate to,
 * and the manifest (components/app-shell/app-shared.tsx) is the single nav list.
 * `parseRoute` / `pagePath` in lib/routes.ts turn a page into a URL.
 */
export type Page =
  | "overview"
  | "board"
  | "workspaces"
  | "profiles"
  | "providers"
  | "logs"
  | "skills"
  | "memory"
  | "agent-mapping"
  | "knowledge"
  | "cron"
  | "ecosystem"
  | "chat"
  | "projects"
  | "settings"
