import { memo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check, Copy, WrapText } from "lucide-react"
import { toastGlobal } from "../../api"

/* LLM answers arrive as markdown. Rendering it as a document instead of a
   <pre> block is the difference between skimming an answer and reading raw
   asterisks. Raw HTML is disabled: answer text is model output, and
   `skipHtml` plus remark-gfm's default (no rehype-raw) means no script or
   event-handler injection from a compromised or confused model. */

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const [wrap, setWrap] = useState(false)
  const label = (lang || "text").toUpperCase()

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toastGlobal("Copied", "success")
      setTimeout(() => setCopied(false), 1400)
    } catch {
      toastGlobal("Copy failed", "error")
    }
  }

  return (
    <figure className="group/code my-3 overflow-hidden rounded-lg border border-[var(--c-line)] bg-[var(--c-well)]">
      <figcaption className="flex items-center gap-1.5 border-b border-[var(--c-line)] bg-[var(--c-line)]/30 px-2.5 py-1.5">
        <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">{label}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-pressed={wrap}
            onClick={() => setWrap((v) => !v)}
            aria-label={wrap ? "Disable line wrap" : "Enable line wrap"}
            title={wrap ? "Disable line wrap" : "Enable line wrap"}
            className={`inline-flex size-6 items-center justify-center rounded transition-colors ${
              wrap ? "bg-[var(--c-accent-tint)] text-[var(--c-accent)]" : "text-ink-3 hover:bg-[var(--c-line)]/50 hover:text-ink-2"
            }`}
          >
            <WrapText className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy code"
            title="Copy code"
            className="inline-flex size-6 items-center justify-center rounded text-ink-3 transition-colors hover:bg-[var(--c-line)]/50 hover:text-ink-2"
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </figcaption>
      <pre
        className={`overflow-x-auto p-3 font-mono text-body leading-relaxed text-ink-2 ${
          wrap ? "whitespace-pre-wrap break-words" : ""
        }`}
      >
        <code>{code}</code>
      </pre>
    </figure>
  )
}

function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <code className="rounded border border-[var(--c-line)] bg-[var(--c-line)]/40 px-1 py-0.5 font-mono text-meta text-ink-2">
      {children}
    </code>
  )
}

const components = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-2 mt-5 text-lg font-semibold tracking-tight text-ink first:mt-0">{children}</h3>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-2 mt-5 text-base font-semibold tracking-tight text-ink first:mt-0">{children}</h3>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1.5 mt-4 text-body font-semibold uppercase tracking-[0.1em] text-ink-3 first:mt-0">{children}</h4>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h5 className="mb-1.5 mt-3 text-meta font-semibold uppercase tracking-[0.1em] text-ink-3 first:mt-0">{children}</h5>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-2 text-body leading-relaxed text-ink-2 first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-2 space-y-1.5 pl-1 text-body text-ink-2">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-2 list-decimal space-y-1.5 pl-5 text-body text-ink-2 marker:text-ink-3">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="flex gap-2">
      <span className="mt-[0.45em] size-1 shrink-0 rounded-full bg-ink-4" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-3 border-l-2 border-[var(--c-line-strong)] bg-[var(--c-accent-tint)]/40 py-1.5 pl-3 pr-2 text-body italic text-ink-3">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-[var(--c-line)]" />,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  del: ({ children }: { children?: React.ReactNode }) => <del className="text-ink-3 line-through">{children}</del>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-[var(--color-info)] underline decoration-[var(--c-line-strong)] underline-offset-2 transition-colors hover:decoration-[var(--c-accent)]"
    >
      {children}
    </a>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const raw = String(children ?? "")
    const isBlock = raw.includes("\n") || /language-/.test(className ?? "")
    if (isBlock) {
      return <CodeBlock code={raw.replace(/\n$/, "")} lang={className?.replace(/language-/, "")} />
    }
    return <InlineCode>{children}</InlineCode>
  },
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-[var(--c-line)]">
      <table className="w-full border-collapse text-body">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-[var(--c-line)]/30">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-b border-[var(--c-line)] px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.1em] text-ink-3">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-b border-[var(--c-line)]/50 px-3 py-2 align-top text-ink-2 last:border-b-0">
      {children}
    </td>
  ),
  input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} disabled className="mr-1.5 size-3 accent-[var(--c-accent)] align-middle" readOnly />
  ),
}

export const AgentMarkdown = memo(function AgentMarkdown({ text }: { text: string }) {
  return (
    <div className="[&_table]:text-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={components as never}
        disallowedElements={["script", "style", "iframe", "object", "embed", "form", "input"]}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
