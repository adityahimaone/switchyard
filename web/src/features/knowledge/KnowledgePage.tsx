import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Menu,
  Palette,
  Search,
  Sparkles,
  Workflow,
  X,
  FileCode2,
} from "lucide-react"
import { DOCS, type DocItem } from "./docsData"
import type { Page } from "@/lib/sidebar-preferences"

export default function KnowledgePage({
  onSelectPage,
}: {
  onSelectPage?: (page: Page) => void
}) {
  const [activeId, setActiveId] = useState<string>("pen-dev-canvas")
  const [searchQuery, setSearchQuery] = useState("")
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const articleContentRef = useRef<HTMLDivElement>(null)

  // Find active doc
  const activeDoc = useMemo(
    () => DOCS.find((d) => d.id === activeId) ?? DOCS[0],
    [activeId]
  )

  // Filter docs by search query
  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return DOCS
    return DOCS.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.subtitle.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q) ||
        doc.sections.some(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.content.toLowerCase().includes(q)
        )
    )
  }, [searchQuery])

  // Group filtered docs by category
  const categories = useMemo(() => {
    const map = new Map<string, DocItem[]>()
    for (const doc of filteredDocs) {
      const list = map.get(doc.category) ?? []
      list.push(doc)
      map.set(doc.category, list)
    }
    return Array.from(map.entries())
  }, [filteredDocs])

  // Keyboard shortcut: '/' to focus search, 'Esc' to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearchQuery("")
        searchInputRef.current?.blur()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Copy code handler with momentary checkmark feedback
  const handleCopyCode = useCallback((code: string, id: string) => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopiedCodeId(id)
    setTimeout(() => {
      setCopiedCodeId((cur) => (cur === id ? null : cur))
    }, 1800)
  }, [])

  // Copy link handler
  const handleCopyPageLink = useCallback(() => {
    const url = window.location.origin + window.location.pathname + "#" + activeDoc.slug
    navigator.clipboard.writeText(url).catch(() => {})
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 1800)
  }, [activeDoc.slug])

  // Scroll to section smoothly
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  // Active doc index for previous/next pagination
  const currentIndex = DOCS.findIndex((d) => d.id === activeDoc.id)
  const prevDoc = currentIndex > 0 ? DOCS[currentIndex - 1] : null
  const nextDoc = currentIndex < DOCS.length - 1 ? DOCS[currentIndex + 1] : null

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* Top Bar / Breadcrumb Header */}
      <header className="flex h-13 shrink-0 items-center justify-between border-b border-line bg-surface/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="rounded-control p-1.5 text-ink-3 transition-colors hover:bg-well hover:text-ink md:hidden"
            aria-label="Toggle docs navigation"
          >
            {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          <nav className="flex items-center gap-1.5 font-mono text-xs text-ink-3">
            <span className="flex items-center gap-1 text-ink-2 font-medium">
              <BookOpen className="size-3.5 text-accent-text" />
              <span>Knowledge</span>
            </span>
            <ChevronRight className="size-3 text-ink-4" />
            <span className="hidden sm:inline">{activeDoc.category}</span>
            <ChevronRight className="hidden sm:inline size-3 text-ink-4" />
            <span className="text-ink font-semibold truncate max-w-[200px] sm:max-w-none">
              {activeDoc.title}
            </span>
          </nav>
        </div>

        {/* Global Search and Quick Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-4" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search docs… (press /)"
              className="h-8 w-44 sm:w-64 rounded-control border border-line bg-canvas/70 pl-8 pr-7 text-xs text-ink placeholder:text-ink-4 transition-all focus:border-accent focus:bg-canvas focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 p-0.5 text-ink-4 hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyPageLink}
            title="Copy shareable link"
            className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-raised px-2.5 text-xs font-medium text-ink-2 transition-[transform,colors] duration-150 ease-[var(--ease-out-expo)] hover:bg-well active:scale-[0.97]"
          >
            {copiedLink ? (
              <>
                <Check className="size-3.5 text-success-text" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5 text-ink-3" />
                <span>Share</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Documentation Shell (3 columns: Nav, Content, Table of Contents) */}
      <div className="flex min-h-0 flex-1 overflow-hidden relative">
        {/* Column 1: Left Navigation Sidebar */}
        <aside
          className={`absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-line bg-surface transition-transform duration-200 ease-[var(--ease-out-expo)] md:static md:translate-x-0 ${
            mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xs uppercase tracking-[0.16em] text-accent-text font-semibold">
                Documentation
              </span>
              <span className="rounded-full bg-well px-1.5 py-0.2 font-mono text-[10px] text-ink-3">
                {DOCS.length} guides
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-control p-1 text-ink-3 hover:bg-well md:hidden"
            >
              <X className="size-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-6">
            {categories.map(([category, docs]) => (
              <div key={category} className="space-y-1">
                <p className="px-2.5 font-mono text-2xs font-semibold uppercase tracking-[0.14em] text-ink-4">
                  {category}
                </p>
                <div className="space-y-0.5">
                  {docs.map((doc) => {
                    const isSelected = doc.id === activeDoc.id
                    const Icon = doc.icon
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => {
                          setActiveId(doc.id)
                          setMobileNavOpen(false)
                          if (articleContentRef.current) {
                            articleContentRef.current.scrollTop = 0
                          }
                        }}
                        className={`group relative flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-xs transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-expo)] active:scale-[0.98] ${
                          isSelected
                            ? "bg-accent-tint/70 font-semibold text-accent-text"
                            : "text-ink-2 hover:bg-well hover:text-ink"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon
                            className={`size-3.5 shrink-0 transition-colors ${
                              isSelected
                                ? "text-accent-text"
                                : "text-ink-3 group-hover:text-ink"
                            }`}
                          />
                          <span className="truncate">{doc.title}</span>
                        </div>
                        {doc.badge && (
                          <span
                            className={`ml-2 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                              doc.badge === "Design"
                                ? "bg-accent/20 text-accent-text font-medium"
                                : doc.badge === "Core"
                                ? "bg-review/20 text-review-text font-medium"
                                : doc.badge === "Safety"
                                ? "bg-danger/20 text-danger-text font-medium"
                                : "bg-well text-ink-3"
                            }`}
                          >
                            {doc.badge}
                          </span>
                        )}
                        {isSelected && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar Footer Link */}
          <div className="border-t border-line p-3 bg-well/25">
            <div className="flex items-center justify-between text-[11px] text-ink-3">
              <span>Switchyard v0.3.0</span>
              {onSelectPage && (
                <button
                  type="button"
                  onClick={() => onSelectPage("agent-mapping")}
                  className="font-mono text-accent-text hover:underline inline-flex items-center gap-1"
                >
                  <span>Flow Map</span>
                  <ExternalLink className="size-2.5" />
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Column 2: Center Reading Canvas */}
        <main
          ref={articleContentRef}
          className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-10 lg:px-12 scroll-smooth"
        >
          <article className="mx-auto max-w-3xl space-y-8">
            {/* Document Header */}
            <header className="border-b border-line pb-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-line bg-raised p-1.5 text-accent-text">
                  <activeDoc.icon className="size-4" />
                </span>
                <span className="font-mono text-2xs uppercase tracking-[0.16em] text-accent-text font-semibold">
                  {activeDoc.category}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                {activeDoc.title}
              </h1>

              <p className="text-sm sm:text-base leading-relaxed text-ink-2">
                {activeDoc.subtitle}
              </p>

              {/* Meta tags */}
              <div className="flex flex-wrap items-center gap-3 pt-2 text-2xs text-ink-3 font-mono">
                <span className="flex items-center gap-1">
                  <span>⏱</span>
                  <span>{activeDoc.readTime}</span>
                </span>
                <span>•</span>
                <span>{activeDoc.updatedAt}</span>
                {activeDoc.badge && (
                  <>
                    <span>•</span>
                    <span className="rounded bg-well px-1.5 py-0.5 text-ink-2">
                      {activeDoc.badge}
                    </span>
                  </>
                )}
              </div>
            </header>

            {/* Quick Summary Banner */}
            <div className="rounded-card border border-accent/25 bg-accent-tint/30 p-4 leading-relaxed">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent-text font-mono">
                Executive Summary
              </p>
              <p className="mt-1 text-sm text-ink-2">{activeDoc.summary}</p>
            </div>

            {/* Document Content Sections */}
            <div className="space-y-10">
              {activeDoc.sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="space-y-4 scroll-mt-20"
                >
                  <div className="group flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-ink">
                      {section.title}
                    </h2>
                    <a
                      href={`#${section.id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink-4 hover:text-ink"
                      title="Link to section"
                    >
                      #
                    </a>
                  </div>

                  <p className="text-sm leading-relaxed text-ink-2">
                    {section.content}
                  </p>

                  {/* Callout Box */}
                  {section.callout && (
                    <div
                      className={`rounded-card border p-4 text-xs leading-relaxed transition-all ${
                        section.callout.type === "craft"
                          ? "border-accent/40 bg-well/70 shadow-xs"
                          : section.callout.type === "tip"
                          ? "border-success/30 bg-success-tint/20 text-ink"
                          : section.callout.type === "warning"
                          ? "border-danger/30 bg-danger-tint/20 text-ink"
                          : "border-line bg-well/40 text-ink-2"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-ink">
                        {section.callout.type === "craft" ? (
                          <Sparkles className="size-3.5 text-accent-text" />
                        ) : null}
                        <span className="font-mono text-2xs uppercase tracking-wider">
                          {section.callout.title}
                        </span>
                      </div>
                      <p className="mt-1.5 text-ink-2">
                        {section.callout.body}
                      </p>
                    </div>
                  )}

                  {/* Code Snippet Box with Copy Button */}
                  {section.codeSnippet && (
                    <div className="overflow-hidden rounded-card border border-line bg-canvas">
                      <div className="flex items-center justify-between border-b border-line bg-well/40 px-3 py-1.5 text-2xs font-mono text-ink-3">
                        <div className="flex items-center gap-1.5">
                          <FileCode2 className="size-3.5 text-ink-4" />
                          <span>{section.codeSnippet.filename || "Terminal"}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyCode(
                              section.codeSnippet!.code,
                              `${section.id}-code`
                            )
                          }
                          className="flex items-center gap-1 rounded px-2 py-0.5 text-ink-3 hover:bg-raised hover:text-ink transition-[transform,colors] duration-150 ease-[var(--ease-out-expo)] active:scale-[0.95]"
                        >
                          {copiedCodeId === `${section.id}-code` ? (
                            <>
                              <Check className="size-3 text-success-text" />
                              <span className="text-success-text">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-ink-2 selection:bg-accent-tint">
                        <code>{section.codeSnippet.code}</code>
                      </pre>
                    </div>
                  )}

                  {/* Markdown-style Table */}
                  {section.table && (
                    <div className="overflow-x-auto rounded-card border border-line bg-surface/50">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-line bg-well/50 text-[10px] uppercase font-mono tracking-wider text-ink-3">
                          <tr>
                            {section.table.headers.map((h, i) => (
                              <th key={i} className="px-3.5 py-2.5 font-semibold">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line text-ink-2">
                          {section.table.rows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className="transition-colors hover:bg-well/35"
                            >
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={`px-3.5 py-2.5 align-top ${
                                    cIdx === 0
                                      ? "font-mono font-medium text-ink"
                                      : cIdx === 1
                                      ? "text-ink-2"
                                      : "text-ink-3"
                                  }`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>

            {/* Bottom Pagination Links */}
            <footer className="border-t border-line pt-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {prevDoc ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(prevDoc.id)
                      if (articleContentRef.current) {
                        articleContentRef.current.scrollTop = 0
                      }
                    }}
                    className="flex flex-col items-start rounded-card border border-line bg-surface p-4 text-left transition-[transform,background-color,border-color] duration-150 ease-[var(--ease-out-expo)] hover:border-accent/40 hover:bg-well/40 active:scale-[0.98]"
                  >
                    <span className="flex items-center gap-1 font-mono text-2xs text-ink-3 uppercase tracking-wider">
                      <ArrowLeft className="size-3" />
                      <span>Previous</span>
                    </span>
                    <span className="mt-1 font-semibold text-sm text-ink truncate w-full">
                      {prevDoc.title}
                    </span>
                  </button>
                ) : <div />}

                {nextDoc ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(nextDoc.id)
                      if (articleContentRef.current) {
                        articleContentRef.current.scrollTop = 0
                      }
                    }}
                    className="flex flex-col items-end rounded-card border border-line bg-surface p-4 text-right transition-[transform,background-color,border-color] duration-150 ease-[var(--ease-out-expo)] hover:border-accent/40 hover:bg-well/40 active:scale-[0.98]"
                  >
                    <span className="flex items-center gap-1 font-mono text-2xs text-ink-3 uppercase tracking-wider">
                      <span>Next</span>
                      <ArrowRight className="size-3" />
                    </span>
                    <span className="mt-1 font-semibold text-sm text-ink truncate w-full">
                      {nextDoc.title}
                    </span>
                  </button>
                ) : <div />}
              </div>

              {/* Helpful feedback micro-interaction */}
              <div className="flex items-center justify-between rounded-card border border-line bg-well/30 px-4 py-3 text-xs text-ink-3">
                <span>Was this guide accurate and helpful?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      const btn = e.currentTarget
                      btn.textContent = "Thank you! ✨"
                      btn.classList.add("text-success-text", "font-medium")
                    }}
                    className="rounded-control border border-line bg-raised px-2.5 py-1 text-ink-2 hover:bg-well active:scale-[0.97] transition-[transform,colors]"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const btn = e.currentTarget
                      btn.textContent = "Feedback noted"
                    }}
                    className="rounded-control border border-line bg-raised px-2.5 py-1 text-ink-2 hover:bg-well active:scale-[0.97] transition-[transform,colors]"
                  >
                    No
                  </button>
                </div>
              </div>
            </footer>
          </article>
        </main>

        {/* Column 3: Right Sidebar ("On This Page" / Quick Actions) */}
        <aside className="hidden xl:flex w-64 shrink-0 flex-col border-l border-line bg-surface/50 p-6 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <p className="font-mono text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">
                On This Page
              </p>
              <nav className="mt-3 space-y-1">
                {activeDoc.sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className="block w-full text-left text-xs text-ink-3 hover:text-ink truncate py-1 transition-colors hover:translate-x-0.5"
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            </div>

            {/* Quick Interactive Actions */}
            <div className="border-t border-line pt-6 space-y-3">
              <p className="font-mono text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">
                Quick Actions
              </p>

              {onSelectPage && (
                <>
                  <button
                    type="button"
                    onClick={() => onSelectPage("agent-mapping")}
                    className="flex w-full items-center gap-2 rounded-control border border-line bg-raised p-2 text-left text-xs font-medium text-ink-2 hover:border-accent/30 hover:bg-well hover:text-ink transition-[transform,colors] active:scale-[0.97]"
                  >
                    <Workflow className="size-3.5 text-accent-text" />
                    <span>View in Flow Map</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectPage("canvas")}
                    className="flex w-full items-center gap-2 rounded-control border border-line bg-raised p-2 text-left text-xs font-medium text-ink-2 hover:border-accent/30 hover:bg-well hover:text-ink transition-[transform,colors] active:scale-[0.97]"
                  >
                    <Palette className="size-3.5 text-accent-text" />
                    <span>Open Canvas Studio</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleCopyPageLink}
                className="flex w-full items-center gap-2 rounded-control border border-line bg-raised p-2 text-left text-xs font-medium text-ink-2 hover:bg-well hover:text-ink transition-[transform,colors] active:scale-[0.97]"
              >
                {copiedLink ? (
                  <>
                    <Check className="size-3.5 text-success-text" />
                    <span>Page Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5 text-ink-3" />
                    <span>Copy Page URL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
