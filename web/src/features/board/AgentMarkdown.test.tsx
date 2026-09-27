import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentMarkdown } from "./AgentMarkdown"

const html = (src: string) => renderToStaticMarkup(<AgentMarkdown text={src} />)

describe("AgentMarkdown", () => {
  it("renders headings as real elements", () => {
    const out = html("## What changed")
    expect(out).toContain("<h3")
    expect(out).not.toContain("##")
  })

  it("renders bold and inline code", () => {
    const out = html("Added **3 files** to `lexer.ts`")
    expect(out).toMatch(/<strong[^>]*>3 files<\/strong>/)
    expect(out).toMatch(/<code[^>]*>lexer\.ts<\/code>/)
  })

  it("renders unordered lists as list items", () => {
    const out = html("- one\n- two")
    expect(out).toContain("<ul")
    expect(out.match(/<li/g)?.length).toBe(2)
  })

  it("renders ordered lists", () => {
    expect(html("1. first\n2. second")).toContain("<ol")
  })

  it("renders gfm tables with header cells", () => {
    const out = html("| file | lines |\n| --- | --- |\n| a.ts | 10 |")
    expect(out).toContain("<table")
    expect(out).toContain("<th")
    expect(out).toContain("a.ts")
  })

  it("renders fenced code blocks with a language label", () => {
    const out = html("```ts\nconst a = 1\n```")
    expect(out).toContain("<pre")
    expect(out).toContain("TS")
    expect(out).toContain("const a = 1")
  })

  it("renders blockquotes", () => {
    expect(html("> careful")).toContain("<blockquote")
  })

  it("drops raw html instead of emitting it", () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">')
    expect(out).not.toContain("<script")
    expect(out).not.toContain("onerror")
  })

  it("marks external links as noopener", () => {
    const out = html("[docs](https://example.com)")
    expect(out).toContain('rel="noopener noreferrer nofollow"')
    expect(out).toContain('target="_blank"')
  })

  it("escapes stray angle brackets in prose", () => {
    expect(html("a < b and c > d")).not.toContain("<b")
  })
})
