package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"strconv"
	"strings"

	"kanban-board/internal/kanban"
)

// Canvas Studio HTTP surface. See internal/kanban/canvas.go for the model and
// the mitigations; this file is the thin authenticated API plus the token-gated
// reverse proxy that serves each session's dev server.

func withCanvasView(s *kanban.CanvasSession) *kanban.CanvasSession {
	base := kanban.CanvasViewBase(s.ID)
	switch s.Framework {
	case "next":
		s.ViewURL = base + "canvas"
	case "vite":
		s.ViewURL = base + "canvas/"
	default:
		s.ViewURL = base
	}
	return s
}

func registerCanvasRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/canvas/sessions", func(w http.ResponseWriter, r *http.Request) {
		list, err := kanban.ListCanvasSessions()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		for i := range list {
			withCanvasView(&list[i])
		}
		writeJSON(w, http.StatusOK, list)
	})

	mux.HandleFunc("POST /api/canvas/sessions", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			WorkspaceID string `json:"workspace_id"`
			Title       string `json:"title"`
			Brief       string `json:"brief"`
			Executor    string `json:"executor"`
			Model       string `json:"model"`
			DialKit     bool   `json:"dialkit"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		s, err := kanban.CreateCanvasSession(body.WorkspaceID, body.Title, body.Executor, body.Model, body.DialKit, nil)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(body.Brief) != "" {
			_ = kanban.SendCanvasMessage(s.ID, body.Brief)
			s, _ = kanban.GetCanvasSession(s.ID)
		}
		writeJSON(w, http.StatusCreated, withCanvasView(s))
	})

	mux.HandleFunc("GET /api/canvas/sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		s, err := kanban.GetCanvasSession(r.PathValue("id"))
		if err != nil {
			fail(w, fmt.Errorf("canvas session not found"), http.StatusNotFound)
			return
		}
		msgs, _ := kanban.CanvasMessages(s.ID)
		writeJSON(w, http.StatusOK, map[string]any{"session": withCanvasView(s), "messages": msgs})
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/messages", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Message string `json:"message"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := kanban.SendCanvasMessage(r.PathValue("id"), body.Message); err != nil {
			fail(w, err, http.StatusConflict)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "working"})
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/start", func(w http.ResponseWriter, r *http.Request) {
		s, err := kanban.StartCanvasServer(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, withCanvasView(s))
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/stop", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.StopCanvasServer(r.PathValue("id")); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/fork", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Title string `json:"title"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body)
		s, err := kanban.ForkCanvasSession(r.PathValue("id"), body.Title)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusCreated, withCanvasView(s))
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/discard", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.DiscardCanvasSession(r.PathValue("id")); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "discarded"})
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/promote", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Board string `json:"board"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body)
		if strings.TrimSpace(body.Board) == "" {
			fail(w, fmt.Errorf("board required"), http.StatusBadRequest)
			return
		}
		id, err := kanban.PromoteCanvasSession(r.PathValue("id"), body.Board)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"task_id": id, "board": body.Board})
	})

	mux.HandleFunc("GET /api/canvas/sessions/{id}/files", func(w http.ResponseWriter, r *http.Request) {
		files, err := kanban.GetCanvasFiles(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, files)
	})

	mux.HandleFunc("PUT /api/canvas/sessions/{id}/files", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Files map[string]string `json:"files"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 16<<20)).Decode(&body); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := kanban.SaveCanvasFiles(r.PathValue("id"), body.Files); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// In-browser instant sandbox route for 0ms visual editing with DialKit.
	mux.HandleFunc("GET /canvas-sandbox/{id}", canvasSandboxHandler)

	// Token-gated proxy. It sits outside /api/ on purpose: the sandboxed iframe
	// has an opaque origin and sends no cookie, so the URL token is the
	// credential. The token only grants this one session's dev server.
	mux.HandleFunc("GET /canvas-view/{id}/{token}/{rest...}", canvasProxyHandler)
}

func canvasSandboxHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := kanban.GetCanvasSession(id); err != nil {
		http.Error(w, "canvas session not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	w.Header().Set("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://esm.sh https://fonts.googleapis.com https://fonts.gstatic.com data: blob:; frame-ancestors 'self'")
	w.Write([]byte(canvasSandboxHTML))
}

const canvasSandboxHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- Tailwind CDN, DialKit CSS, Babel Standalone, Lucide Icons Web CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://unpkg.com/dialkit@2.0.2/dist/styles.css" />
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          borderRadius: {
            'custom': 'var(--dialkit-radius, 16px)'
          },
          colors: {
            'dialkit-accent': 'var(--dialkit-accent, #6366f1)'
          }
        }
      }
    }
  </script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@19",
      "react/jsx-runtime": "https://esm.sh/react@19/jsx-runtime",
      "react-dom": "https://esm.sh/react-dom@19",
      "react-dom/client": "https://esm.sh/react-dom@19/client",
      "dialkit": "https://esm.sh/dialkit@2.0.2",
      "motion": "https://esm.sh/motion@12.4.7",
      "motion/react": "https://esm.sh/motion@12.4.7/react",
      "framer-motion": "https://esm.sh/framer-motion@14.6.0",
      "lucide-react": "https://esm.sh/lucide-react@0.475.0",
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
      transition: background-color 150ms ease, color 150ms ease;
    }
  </style>
</head>
<body class="dialkit-root">
  <div id="root"></div>

  <script type="module">
    import React from 'react';
    import ReactDOM from 'react-dom/client';
    import * as DialKit from 'dialkit';
    import * as Motion from 'motion/react';
    import * as FramerMotion from 'framer-motion';
    import * as LucideIcons from 'lucide-react';
    import clsx from 'clsx';
    import { twMerge } from 'tailwind-merge';

    window.React = React;
    window.ReactDOM = ReactDOM;
    window.DialKit = DialKit;
    window.Motion = Motion;
    window.FramerMotion = FramerMotion;
    window.lucide = LucideIcons;

    let currentFiles = {};
    let currentEntry = '';
    let currentProps = { theme: 'dark', radius: 16, padding: 24, scale: 100, accentColor: '#6366f1' };
    let root = null;
    const moduleCache = {};

    function cleanPath(p) {
      return (p || '').replace(/^[./@]+/, '');
    }

    function resolveCode(path) {
      if (currentFiles[path]) return currentFiles[path];
      const clean = cleanPath(path);
      for (const k in currentFiles) {
        if (cleanPath(k) === clean || k.endsWith(clean)) return currentFiles[k];
      }
      return null;
    }

    function requireModule(modulePath) {
      if (modulePath === 'react' || modulePath === 'react/jsx-runtime') return React;
      if (modulePath === 'react-dom' || modulePath === 'react-dom/client') return ReactDOM;
      if (modulePath === 'dialkit') return DialKit;
      if (modulePath === 'motion' || modulePath === 'motion/react') return Motion;
      if (modulePath === 'framer-motion') return FramerMotion;
      if (modulePath === 'lucide-react') return LucideIcons;
      if (modulePath === 'clsx') return clsx;
      if (modulePath === 'tailwind-merge') return { twMerge };

      if (moduleCache[modulePath]) return moduleCache[modulePath];

      const rawCode = resolveCode(modulePath);
      if (!rawCode) {
        console.warn('Could not resolve import:', modulePath);
        return {};
      }

      const transformed = Babel.transform(rawCode, {
        presets: ['env', 'react', 'typescript'],
        filename: modulePath
      }).code;

      const exports = {};
      const module = { exports };
      const fn = new Function('require', 'exports', 'module', 'React', transformed);
      fn(requireModule, exports, module, React);

      moduleCache[modulePath] = module.exports || exports;
      return moduleCache[modulePath];
    }

    function applyDialKitStyles() {
      const isDark = currentProps.theme === 'dark';
      const themeVal = isDark ? 'dark' : 'light';

      document.documentElement.setAttribute('data-theme', themeVal);
      document.documentElement.setAttribute('data-color-scheme', themeVal);
      if (document.body) {
        document.body.setAttribute('data-theme', themeVal);
        document.body.setAttribute('data-color-scheme', themeVal);
      }

      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('light', !isDark);
      if (document.body) {
        document.body.classList.toggle('dark', isDark);
        document.body.classList.toggle('light', !isDark);
      }

      const r = (currentProps.radius !== undefined ? currentProps.radius : 16) + 'px';
      const p = (currentProps.padding !== undefined ? currentProps.padding : 24) + 'px';
      const a = currentProps.accentColor || '#6366f1';

      document.documentElement.style.setProperty('--dialkit-radius', r, 'important');
      document.documentElement.style.setProperty('--dialkit-padding', p, 'important');
      document.documentElement.style.setProperty('--dialkit-accent', a, 'important');
      document.documentElement.style.setProperty('--accent', a, 'important');

      if (document.body) {
        document.body.style.setProperty('--dialkit-radius', r, 'important');
        document.body.style.setProperty('--dialkit-padding', p, 'important');
        document.body.style.setProperty('--dialkit-accent', a, 'important');
        document.body.style.setProperty('--accent', a, 'important');
      }

      const scaler = document.getElementById('canvas-scaler');
      if (scaler) {
        scaler.style.transform = 'scale(' + ((currentProps.scale || 100) / 100) + ')';
        scaler.className = 'p-6 flex flex-col items-center justify-center min-h-screen ' + (isDark ? 'bg-[#0f1115] text-[#e6edf3]' : 'bg-[#f8f9fa] text-[#1a1a1a]');
      }
    }

    function renderComponent() {
      try {
        if (!currentEntry) {
          const keys = Object.keys(currentFiles).filter(k => !k.includes('._') && !k.includes('.DS_Store'));
          currentEntry = keys.find(k => k.endsWith('.html')) || keys.find(k => k.endsWith('.tsx') && !k.endsWith('page.tsx')) || keys[0];
        }
        if (!currentEntry) {
          window.parent.postMessage({ type: 'CANVAS_STATUS', status: 'ready' }, '*');
          return;
        }

        const rawCode = resolveCode(currentEntry);
        if (!rawCode) {
          window.parent.postMessage({ type: 'CANVAS_STATUS', status: 'error', error: 'File ' + currentEntry + ' not found' }, '*');
          return;
        }

        // --- Dual Engine Branch 1: Pure Vanilla HTML + Tailwind + Lucide CDN ---
        if (currentEntry.endsWith('.html') || (!currentEntry.endsWith('.tsx') && !currentEntry.endsWith('.jsx') && rawCode.trim().startsWith('<'))) {
          let markup = rawCode;
          const bodyMatch = rawCode.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch) markup = bodyMatch[1];

          const container = document.getElementById('root');
          if (root) {
            try { root.unmount(); } catch (_) {}
            root = null;
          }
          const isDark = currentProps.theme === 'dark';
          container.innerHTML = '<div id="canvas-scaler" style="transform: scale(' + ((currentProps.scale || 100) / 100) + '); transform-origin: top center;" class="p-6 flex flex-col items-center justify-center min-h-screen ' + (isDark ? 'bg-[#0f1115] text-[#e6edf3]' : 'bg-[#f8f9fa] text-[#1a1a1a]') + '">' + markup + '</div>';

          // Apply DialKit tokens with !important
          applyDialKitStyles();

          // Auto-render Lucide icons (<i data-lucide="..."></i>)
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
          }

          // Execute any inline scripts
          const scripts = container.querySelectorAll('script');
          scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
          });

          window.parent.postMessage({ type: 'CANVAS_STATUS', status: 'ready' }, '*');
          return;
        }

        // --- Dual Engine Branch 2: React TSX via Babel Standalone ---
        for (const k in moduleCache) delete moduleCache[k];

        const transformed = Babel.transform(rawCode, {
          presets: ['env', 'react', 'typescript'],
          filename: currentEntry
        }).code;

        const exports = {};
        const module = { exports };
        const fn = new Function('require', 'exports', 'module', 'React', transformed);
        fn(requireModule, exports, module, React);

        let Comp = module.exports?.default || exports.default;
        if (!Comp) {
          for (const key in module.exports) {
            if (typeof module.exports[key] === 'function') {
              Comp = module.exports[key];
              break;
            }
          }
        }
        if (!Comp) {
          for (const key in exports) {
            if (typeof exports[key] === 'function') {
              Comp = exports[key];
              break;
            }
          }
        }

        if (!Comp) {
          throw new Error('No React component exported in ' + currentEntry);
        }

        const container = document.getElementById('root');
        if (!root) root = ReactDOM.createRoot(container);

        // Auto-inject DialKit.DialRoot if not explicitly in user component
        const hasDialRoot = /<DialRoot\b/.test(rawCode);
        const compEl = React.createElement(Comp, currentProps);
        const appWithDialRoot = hasDialRoot
          ? compEl
          : React.createElement(React.Fragment, null,
              compEl,
              DialKit.DialRoot ? React.createElement(DialKit.DialRoot, {
                position: 'bottom-right',
                theme: currentProps.theme === 'light' ? 'light' : 'dark',
                productionEnabled: true
              }) : null
            );

        root.render(
          React.createElement('div', {
            id: 'canvas-scaler',
            style: {
              transform: 'scale(' + ((currentProps.scale || 100) / 100) + ')',
              transformOrigin: 'top center',
            },
            className: 'p-6 flex flex-col items-center justify-center min-h-screen ' + (currentProps.theme === 'dark' ? 'bg-[#0f1115] text-[#e6edf3]' : 'bg-[#f8f9fa] text-[#1a1a1a]')
          }, appWithDialRoot)
        );

        applyDialKitStyles();
        window.parent.postMessage({ type: 'CANVAS_STATUS', status: 'ready' }, '*');
      } catch (err) {
        console.error(err);
        window.parent.postMessage({ type: 'CANVAS_STATUS', status: 'error', error: err.message }, '*');
        const container = document.getElementById('root');
        if (!root) root = ReactDOM.createRoot(container);
        root.render(
          React.createElement('div', {
            className: 'p-6 m-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 font-mono text-xs'
          }, [
            React.createElement('div', { key: 't', className: 'font-semibold text-sm mb-2' }, 'Render Error'),
            React.createElement('div', { key: 'm', className: 'whitespace-pre-wrap' }, err.message || String(err))
          ])
        );
      }
    }

    window.addEventListener('message', (e) => {
      if (e.data?.type === 'LOAD_CANVAS') {
        currentFiles = e.data.files || {};
        currentEntry = e.data.entryFile || '';
        if (e.data.props) currentProps = { ...currentProps, ...e.data.props };
        renderComponent();
      } else if (e.data?.type === 'UPDATE_DIALKIT') {
        currentProps = { ...currentProps, ...e.data.props };
        applyDialKitStyles();
        if (currentEntry && (currentEntry.endsWith('.tsx') || currentEntry.endsWith('.jsx'))) {
          renderComponent();
        }
      }
    });

    window.parent.postMessage({ type: 'CANVAS_FRAME_READY' }, '*');
  </script>
</body>
</html>`

func canvasProxyHandler(w http.ResponseWriter, r *http.Request) {
	id, token := r.PathValue("id"), r.PathValue("token")
	if !kanban.CanvasViewTokenValid(id, token) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	s, err := kanban.GetCanvasSession(id)
	if err != nil || s.Status == "discarded" || s.Server != "running" {
		http.Error(w, "canvas dev server is not running", http.StatusServiceUnavailable)
		return
	}
	upstream, err := kanban.CanvasUpstream(s)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	kanban.TouchCanvasSession(id)

	prefix := strings.TrimSuffix(kanban.CanvasViewBase(id), "/")
	rp := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = "http"
			req.URL.Host = upstream
			req.Host = upstream
			if s.Framework != "vite" { // vite serves under its --base, next does not
				p := strings.TrimPrefix(req.URL.Path, prefix)
				if p == "" {
					p = "/"
				}
				req.URL.Path, req.URL.RawPath = p, ""
			}
			req.Header.Del("Cookie") // never forward the board session to canvas code
			req.Header.Set("Accept-Encoding", "identity")
		},
		ModifyResponse: func(resp *http.Response) error {
			h := resp.Header
			h.Del("Content-Security-Policy")
			h.Del("X-Frame-Options")
			h.Set("X-Frame-Options", "SAMEORIGIN")
			h.Set("Content-Security-Policy", "frame-ancestors 'self'")
			if s.Framework == "next" && isRewritableType(h.Get("Content-Type")) {
				raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
				resp.Body.Close()
				if err != nil {
					return err
				}
				raw = rewriteNextPaths(raw, prefix)
				resp.Body = io.NopCloser(bytes.NewReader(raw))
				h.Set("Content-Length", strconv.Itoa(len(raw)))
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			http.Error(w, "canvas upstream error: "+err.Error(), http.StatusBadGateway)
		},
	}
	rp.ServeHTTP(w, r)
}

func isRewritableType(ct string) bool {
	ct = strings.ToLower(ct)
	return strings.Contains(ct, "text/html") || strings.Contains(ct, "javascript") || strings.Contains(ct, "text/css")
}

// rewriteNextPaths prefixes Next's absolute /_next/ asset URLs so they resolve
// through the proxy. Next.js cannot take a base path from the command line, and
// changing next.config would be an edit outside the canvas allow list.
func rewriteNextPaths(body []byte, prefix string) []byte {
	out := body
	for _, lead := range []string{`"`, `'`, "(", "`"} {
		out = bytes.ReplaceAll(out, []byte(lead+"/_next/"), []byte(lead+prefix+"/_next/"))
	}
	return out
}
