import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Profile, Task, TaskComment } from "../../api"
import { DiscussionPanel } from "./DiscussionPanel"

/* Static render, like AgentMarkdown.test.tsx: no DOM and no effects, so this
   pins what each state *shows*. Scroll, timers and the optimistic mutation are
   behaviour and are covered by discussion.test.ts (the decisions) and by
   running the app. */

const task = (over: Partial<Task> = {}): Task =>
  ({ id: "t1", title: "Install pen", status: "review", assignee: "", ...over }) as Task

const profiles = ["default", "jihyo", "karina"].map((name) => ({ name, valid: true }) as Profile)

let id = 1
const msg = (author: string, body: string, at = 1_000_000 - 600): TaskComment =>
  ({ id: id++, task_id: "t1", author, body, created_at: at })

function render(over: {
  task?: Partial<Task>
  comments: TaskComment[]
  seenId?: number | null
  isLoading?: boolean
}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <DiscussionPanel
        slug="main"
        task={task(over.task)}
        profiles={profiles}
        comments={over.comments}
        isLoading={over.isLoading ?? false}
        seenId={over.seenId === undefined ? null : over.seenId}
      />
    </QueryClientProvider>,
  )
}

describe("DiscussionPanel", () => {
  it("renders agent messages as markdown and the user's as plain text", () => {
    const out = render({ comments: [msg("default", "Ran **3 checks**"), msg("board-ui", "<b>ok</b> thanks")] })
    expect(out).toMatch(/<strong[^>]*>3 checks<\/strong>/)
    expect(out).toContain("You")
    // The user's text must be escaped, never interpreted.
    expect(out).toContain("&lt;b&gt;ok&lt;/b&gt; thanks")
    expect(out).not.toContain("<b>ok</b>")
  })

  it("shows an empty state with no messages", () => {
    expect(render({ comments: [] })).toContain("No messages yet")
  })

  it("marks the first unread agent reply with a New divider and a count", () => {
    const a = msg("default", "old")
    const b = msg("default", "fresh one")
    const c = msg("default", "fresh two")
    const out = render({ comments: [a, b, c], seenId: a.id })
    expect(out).toContain('role="separator"')
    expect(out).toContain("New · 2")
  })

  it("shows no divider when everything has been seen", () => {
    const a = msg("default", "old")
    expect(render({ comments: [a], seenId: a.id })).not.toContain('role="separator"')
  })

  it("shows no divider before the baseline has loaded", () => {
    expect(render({ comments: [msg("default", "x")], seenId: null })).not.toContain('role="separator"')
  })

  it("shows a working indicator naming the agent when the user spoke last and the task runs", () => {
    const out = render({ task: { status: "running" }, comments: [msg("default", "hi"), msg("board-ui", "status?")] })
    expect(out).toContain("default is working")
  })

  it("shows queued copy after a blocked task comment requeues the cached task", () => {
    const justNow = Math.floor(Date.now() / 1000) - 5
    const out = render({ task: { status: "todo" }, comments: [msg("default", "hi"), msg("board-ui", "retry", justNow)] })
    expect(out).toContain("Queued for default")
    expect(out).not.toContain("Saved, but not delivered")
  })

  it("reports a review comment as delivered after the agent returns to review", () => {
    const justNow = Math.floor(Date.now() / 1000) - 5
    const out = render({ task: { status: "review" }, comments: [msg("default", "done"), msg("board-ui", "sync codegraph", justNow)] })
    expect(out).toContain("Comment delivered")
    expect(out).not.toContain("Saved, but not delivered")
  })

  it("escalates a comment that has been queued for a long time", () => {
    const longAgo = Math.floor(Date.now() / 1000) - 600
    const out = render({ task: { status: "todo" }, comments: [msg("default", "hi"), msg("board-ui", "retry", longAgo)] })
    expect(out).toContain("Still queued")
    expect(out).not.toContain("Queued for default")
  })

  it("warns that a comment on a done, unassigned task is saved but not delivered", () => {
    const out = render({ task: { status: "done", assignee: "" }, comments: [msg("default", "done"), msg("board-ui", "one more thing")] })
    expect(out).toContain("Saved, but not delivered")
    expect(out).toContain("no assignee")
  })

  it("shows no status line when an agent has the last word", () => {
    const out = render({ task: { status: "running" }, comments: [msg("board-ui", "q"), msg("default", "a")] })
    expect(out).not.toContain("is working")
    expect(out).not.toContain("Queued for")
  })

  it("defaults the reply target to the last agent who spoke when nothing is assigned", () => {
    const out = render({ comments: [msg("jihyo", "hello")] })
    expect(out).toContain("Message @jihyo")
    expect(out).toMatch(/aria-pressed="true"[^>]*>(?:<svg[\s\S]*?<\/svg>)?@jihyo/)
  })

  it("prefers the assignee as the target", () => {
    const out = render({ task: { assignee: "karina" }, comments: [msg("jihyo", "hello")] })
    expect(out).toContain("Message @karina")
  })

  it("tells the user what sending will do for a review task", () => {
    expect(render({ comments: [msg("default", "x")] })).toContain("back to todo")
  })

  it("exposes the thread as a polite live log for assistive tech", () => {
    const out = render({ comments: [msg("default", "x")] })
    expect(out).toContain('role="log"')
    expect(out).toContain('aria-live="polite"')
  })

  it("documents the keys: Enter sends, Shift+Enter is a new line", () => {
    expect(render({ comments: [] })).toContain("new line")
  })
})
