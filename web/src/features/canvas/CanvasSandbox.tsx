import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"

export interface CanvasSandboxProps {
  files: Record<string, string>
  entryFile?: string
  dialkitProps: Record<string, any>
  frame: "freeform" | "desktop" | "tablet" | "mobile"
  zoom: number
  pan: { x: number; y: number }
  onPanChange: (pan: { x: number; y: number }) => void
  onZoomChange: (zoom: number) => void
  onControlsDiscovered?: (controls: any[]) => void
}

const FRAME_DIMENSIONS: Record<string, { width: string; height: string; label: string }> = {
  freeform: { width: "100%", height: "100%", label: "Responsive Stage" },
  desktop: { width: "1200px", height: "800px", label: "Desktop · 1200 × 800" },
  tablet: { width: "768px", height: "1024px", label: "Tablet · 768 × 1024" },
  mobile: { width: "375px", height: "812px", label: "iPhone 16 Pro · 375 × 812" },
}

export function CanvasSandbox({
  files,
  entryFile,
  dialkitProps,
  frame,
  zoom,
  pan,
  onPanChange,
  onZoomChange,
  onControlsDiscovered,
}: CanvasSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Determine entry point
  const activeEntry = useMemo(() => {
    if (entryFile && files[entryFile]) return entryFile
    const keys = Object.keys(files)
    const bento = keys.find((k) => k.includes("bento") || k.includes("component") || k.includes("hero"))
    if (bento) return bento
    const page = keys.find((k) => k.endsWith("page.tsx") || k.endsWith("page.jsx"))
    if (page) return page
    return keys[0] || "canvas/component.tsx"
  }, [entryFile, files])

  // Generate srcDoc bundle HTML
  const srcDoc = useMemo(() => {
    const serializedFiles = JSON.stringify(files)
    const activeEntryEscaped = JSON.stringify(activeEntry)
    const initialPropsEscaped = JSON.stringify(dialkitProps)

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          borderRadius: {
            'custom': 'var(--dialkit-radius, 16px)'
          }
        }
      }
    }
  </script>
  <!-- React 19, Lucide, Babel Standalone -->
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@19?dev",
      "react-dom": "https://esm.sh/react-dom@19?dev",
      "react-dom/client": "https://esm.sh/react-dom@19/client?dev",
      "lucide-react": "https://esm.sh/lucide-react@1.41.0?dev",
      "framer-motion": "https://esm.sh/framer-motion@11.11.17?dev",
      "clsx": "https://esm.sh/clsx@2.1.1",
      "tailwind-merge": "https://esm.sh/tailwind-merge@2.5.4"
    }
  }
  </script>
  <style>
    :root {
      --dialkit-radius: 16px;
      --dialkit-padding: 24px;
    }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .dialkit-root {
      transition: background-color 200ms ease, color 200ms ease;
    }
  </style>
</head>
<body class="dialkit-root">
  <div id="root"></div>

  <script type="module">
    import React, { useState, useEffect } from 'react';
    import ReactDOM from 'react-dom/client';
    import * as LucideIcons from 'lucide-react';

    window.React = React;
    window.ReactDOM = ReactDOM;
    window.lucide = LucideIcons;

    const files = ${serializedFiles};
    const entryFile = ${activeEntryEscaped};
    let currentProps = ${initialPropsEscaped};

    // Simple in-memory module registry
    const moduleCache = {};

    function resolveCode(path) {
      if (files[path]) return files[path];
      // strip relative prefixes
      const clean = path.replace(/^[@.\/]+/, '');
      for (const k in files) {
        if (k.endsWith(clean) || k.includes(clean)) return files[k];
      }
      return null;
    }

    function requireModule(modulePath) {
      if (modulePath === 'react') return React;
      if (modulePath === 'react-dom' || modulePath === 'react-dom/client') return ReactDOM;
      if (modulePath === 'lucide-react') return LucideIcons;

      if (moduleCache[modulePath]) return moduleCache[modulePath];

      const rawCode = resolveCode(modulePath);
      if (!rawCode) {
        console.warn('Could not resolve import:', modulePath);
        return {};
      }

      // Transpile module TSX to CommonJS via Babel
      const transformed = Babel.transform(rawCode, {
        presets: ['react', 'typescript'],
        filename: modulePath
      }).code;

      const exports = {};
      const module = { exports };
      
      const fn = new Function('require', 'exports', 'module', 'React', transformed);
      fn(requireModule, exports, module, React);

      moduleCache[modulePath] = module.exports;
      return module.exports;
    }

    function ErrorFallback({ error }) {
      return React.createElement('div', {
        className: 'p-6 m-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 font-mono text-xs'
      }, [
        React.createElement('div', { key: 't', className: 'font-semibold text-sm mb-2 flex items-center gap-2' }, 'Component Render Error'),
        React.createElement('div', { key: 'm', className: 'whitespace-pre-wrap leading-relaxed' }, error.message || String(error))
      ]);
    }

    let root = null;

    function renderActive() {
      try {
        const rawCode = resolveCode(entryFile);
        if (!rawCode) {
          window.parent.postMessage({ type: 'CANVAS_STATUS', status: 'error', error: 'No code in ' + entryFile }, '*');
          return;
        }

        // Clean module cache for hot reload
        for (const k in moduleCache) delete moduleCache[k];

        const transformed = Babel.transform(rawCode, {
          presets: ['react', 'typescript'],
          filename: entryFile
        }).code;

        const exports = {};
        const module = { exports };
        const fn = new Function('require', 'exports', 'module', 'React', transformed);
        fn(requireModule, exports, module, React);

        // Find primary component
        let Component = module.exports.default;
        if (!Component) {
          for (const key in module.exports) {
            if (typeof module.exports[key] === 'function') {
              Component = module.exports[key];
              break;
            }
          }
        }

        if (!Component) {
          throw new Error('No exported React component found in ' + entryFile);
        }

        // Apply visual tokens
        document.documentElement.classList.toggle('dark', currentProps.theme === 'dark');
        document.documentElement.style.setProperty('--dialkit-radius', (currentProps.radius || 16) + 'px');
        document.documentElement.style.setProperty('--dialkit-padding', (currentProps.padding || 24) + 'px');

        const container = document.getElementById('root');
        if (!root) root = ReactDOM.createRoot(container);

        root.render(
          React.createElement('div', {
            className: 'p-6 flex flex-col items-center justify-center min-h-screen ' + (currentProps.theme === 'dark' ? 'bg-[#0f1115] text-[#e6edf3]' : 'bg-[#f8f9fa] text-[#1a1a1a]')
          }, React.createElement(Component, currentProps))
        );

        window.parent.postMessage({ type: 'CANVAS_STATUS', status: 'ready' }, '*');
      } catch (err) {
        console.error(err);
        window.parent.postMessage({ type: 'CANVAS_STATUS', status: 'error', error: err.message }, '*');
        if (root) {
          root.render(React.createElement(ErrorFallback, { error: err }));
        }
      }
    }

    window.addEventListener('message', (e) => {
      if (e.data?.type === 'UPDATE_DIALKIT') {
        currentProps = { ...currentProps, ...e.data.props };
        renderActive();
      }
    });

    renderActive();
  </script>
</body>
</html>`
  }, [files, activeEntry, dialkitProps])

  // Handle postMessage communication from iframe
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "CANVAS_STATUS") {
        if (e.data.status === "ready") {
          setIsLoading(false)
          setRuntimeError(null)
          if (e.data.controls && onControlsDiscovered) {
            onControlsDiscovered(e.data.controls)
          }
        } else if (e.data.status === "error") {
          setIsLoading(false)
          setRuntimeError(e.data.error)
        }
      }
    }
    window.addEventListener("message", handleMsg)
    return () => window.removeEventListener("message", handleMsg)
  }, [])

  // Send prop changes to iframe live
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "UPDATE_DIALKIT", props: dialkitProps },
        "*"
      )
    }
  }, [dialkitProps])

  // Spacebar panning listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        setIsSpacePressed(true)
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        setIsSpacePressed(false)
        isPanningRef.current = false
      }
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [])

  // Mouse pan handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (isSpacePressed || e.button === 1) { // Space or middle mouse
      isPanningRef.current = true
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
      e.preventDefault()
    }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      onPanChange({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      })
    }
  }

  const onMouseUp = () => {
    isPanningRef.current = false
  }

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -10 : 10
      const nextZoom = Math.min(Math.max(zoom + delta, 25), 250)
      onZoomChange(nextZoom)
    } else if (isSpacePressed) {
      onPanChange({ x: pan.x - e.deltaX, y: pan.y - e.deltaY })
    }
  }

  const dim = FRAME_DIMENSIONS[frame]

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      className={`relative h-full w-full overflow-hidden select-none ${
        isSpacePressed ? (isPanningRef.current ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
      }`}
      style={{
        backgroundImage: "radial-gradient(circle, var(--c-line) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Pan & Zoom Transform Layer */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
          transformOrigin: "center center",
          transition: isPanningRef.current ? "none" : "transform 100ms ease-out",
        }}
      >
        <div
          className={`pointer-events-auto relative shadow-2xl transition-all duration-200 ${
            frame === "freeform" ? "h-full w-full max-w-6xl max-h-[85vh] rounded-2xl" : "rounded-3xl border border-[var(--c-line)] shadow-xl"
          }`}
          style={{
            width: dim.width,
            height: dim.height,
            background: dialkitProps.theme === "dark" ? "#0f1115" : "#ffffff",
          }}
        >
          {/* Frame Header Tag */}
          <div className="absolute -top-7 left-2 flex items-center gap-2 text-[11px] font-mono text-ink-3">
            <span>{dim.label}</span>
            {entryFile && <span className="opacity-60">• {entryFile}</span>}
          </div>

          {/* Sandboxed Live Evaluator */}
          <iframe
            ref={iframeRef}
            srcDoc={srcDoc}
            title="Live Canvas Component"
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
            className="h-full w-full rounded-inherit border-0 bg-transparent"
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-xs rounded-inherit">
              <Loader2 className="size-6 animate-spin text-ink-2" />
            </div>
          )}

          {runtimeError && (
            <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-rose-500/30 bg-rose-950/80 p-3 text-xs text-rose-200 backdrop-blur-md flex items-start gap-2.5">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 font-mono text-[11px] whitespace-pre-wrap">{runtimeError}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
