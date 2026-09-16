import { play as cuelumePlay, setEnabled as setCuelumeEnabled, setVolume as setCuelumeVolume } from "cuelume"
import { readBool, SOUND_KEY, VOLUME_KEY, SOUND_HOVER_KEY, SOUND_CLICK_KEY, SOUND_OUTCOME_KEY } from "@/hooks/useSettings"

const CLICK_ATTRS = ["data-cuelume-press", "data-cuelume-release", "data-cuelume-toggle"] as const
const HOVER_ATTR = "data-cuelume-hover"
const ORIG_SUFFIX = "-orig"

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    return raw !== null ? Number(JSON.parse(raw)) : 0.6
  } catch { return 0.6 }
}

export function syncSoundEngine() {
  const enabled = readBool(SOUND_KEY, true)
  const vol = readVolume()
  setCuelumeEnabled(enabled)
  setCuelumeVolume(vol)
}

export function playOutcome(cue: string = "success") {
  const master = readBool(SOUND_KEY, true)
  const outcome = readBool(SOUND_OUTCOME_KEY, true)
  if (!master || !outcome) return
  cuelumePlay(cue as never)
}

function stashAndRemove(el: Element, attr: string) {
  if (!el.hasAttribute(attr)) return
  const val = el.getAttribute(attr) ?? ""
  el.setAttribute(attr + ORIG_SUFFIX, val)
  el.removeAttribute(attr)
}

function restoreAttr(el: Element, attr: string) {
  const origKey = attr + ORIG_SUFFIX
  if (!el.hasAttribute(origKey)) return
  const val = el.getAttribute(origKey) ?? ""
  el.removeAttribute(origKey)
  // empty string means bare attribute (no value) — set as empty
  el.setAttribute(attr, val)
}

function sweep(root: ParentNode, enable: boolean, attrs: readonly string[]) {
  for (const attr of attrs) {
    const sel = `[${attr}], [${attr + ORIG_SUFFIX}]`
    root.querySelectorAll(sel).forEach((el) => {
      if (enable) restoreAttr(el, attr)
      else if (el.hasAttribute(attr)) stashAndRemove(el, attr)
    })
  }
}

export function applySoundPreferences() {
  const hover = readBool(SOUND_HOVER_KEY, true)
  const click = readBool(SOUND_CLICK_KEY, true)
  // hover
  sweep(document, hover, [HOVER_ATTR])
  // click
  sweep(document, click, CLICK_ATTRS)
  // sync engine for master/volume
  syncSoundEngine()
}

let observer: MutationObserver | null = null

export function watchSoundPreferences() {
  applySoundPreferences()
  if (observer) observer.disconnect()
  observer = new MutationObserver((mutations) => {
    const hover = readBool(SOUND_HOVER_KEY, true)
    const click = readBool(SOUND_CLICK_KEY, true)
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue
        // handle the node itself plus descendants
        const roots: Element[] = [node, ...Array.from(node.querySelectorAll("*"))]
        for (const el of roots) {
          if (!hover && el.hasAttribute(HOVER_ATTR)) stashAndRemove(el, HOVER_ATTR)
          if (!click) for (const a of CLICK_ATTRS) if (el.hasAttribute(a)) stashAndRemove(el, a)
        }
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  const onStorage = (e: StorageEvent) => {
    if (e.key === SOUND_KEY || e.key === VOLUME_KEY) syncSoundEngine()
    if (e.key === SOUND_HOVER_KEY || e.key === SOUND_CLICK_KEY || e.key === SOUND_KEY) applySoundPreferences()
    if (e.key === SOUND_OUTCOME_KEY) { /* toaster reads live */ }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener("storage", onStorage)
    observer?.disconnect()
    observer = null
  }
}
