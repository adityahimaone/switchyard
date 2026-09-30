/**
 * The app has no router. `Page` is the set of things the user can navigate to,
 * and the rail (components/app/app-rail.tsx) is the single nav manifest.
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
  | "settings"
