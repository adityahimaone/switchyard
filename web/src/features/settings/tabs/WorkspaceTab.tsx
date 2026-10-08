import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type WorkspaceIdentity,
  getWorkspaceIdentity,
  saveWorkspaceIdentity,
  setWorkspaceAvatarUrl,
  uploadWorkspaceAvatar,
  removeWorkspaceAvatar,
  toastGlobal,
} from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ImagePlus, Link2, Loader2, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { SettingsSection } from "../settings-parts"

/** Shown wherever the workspace name is rendered but has not been set. */
export const WORKSPACE_NAME_FALLBACK = "Switchyard"

export const WORKSPACE_IDENTITY_KEY = ["workspace-identity"] as const

/**
 * The one query behind both this tab and the top bar. It is defined here rather
 * than in a lib/queries module so the name fallback lives with the rule that
 * produces it, and the top bar imports the fallback from the same place.
 */
export function useWorkspaceIdentity() {
  return useQuery<WorkspaceIdentity>({
    queryKey: WORKSPACE_IDENTITY_KEY,
    queryFn: getWorkspaceIdentity,
    // Identity changes rarely; the returned avatar URL changes with its content revision.
    staleTime: 60_000,
  })
}

/**
 * Initials for the fallback avatar. Lives here because three call sites render
 * it — this preview, the top-bar trigger and the account menu — and two copies
 * would drift.
 */
export function workspaceMonogram(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "SW"
  const words = trimmed.split(/\s+/)
  // Two words read better than two letters off the first one; a single short
  // word gives its own initials.
  const letters: string[] =
    words.length > 1 ? words.slice(0, 2).map((w) => w[0] ?? "") : [words[0].slice(0, 2)]
  return letters.join("").toUpperCase() || "SW"
}

/**
 * The server returns a content-revisioned URL for uploaded avatars, so the same
 * value refreshes every consumer as soon as the stored image changes.
 */
export function workspaceAvatarSrc(identity: WorkspaceIdentity | undefined): string {
  return identity?.avatar_url ?? ""
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export default function WorkspaceTab() {
  const qc = useQueryClient()
  const { data: loaded } = useWorkspaceIdentity()

  const [name, setName] = useState("")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarErr, setAvatarErr] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  // Seed the field from the server once, then leave it under the user's control.
  // Re-syncing on every change would discard a half-typed name whenever the
  // query refetches underneath us.
  useEffect(() => {
    if (loaded && !dirty) setName(loaded.name)
  }, [loaded, dirty])

  /** Writes the server's answer back into the cache so the top bar updates. */
  function apply(next: WorkspaceIdentity) {
    qc.setQueryData(WORKSPACE_IDENTITY_KEY, next)
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      apply(await saveWorkspaceIdentity(name))
      setDirty(false)
      toastGlobal("Workspace name saved", "success")
    } catch (err) {
      toastGlobal((err as Error).message, "error")
    } finally {
      setSaving(false)
    }
  }

  /**
   * Every avatar mutation shares this shape, and reports whether it landed so
   * the caller can celebrate only on success — otherwise a rejected upload
   * would still toast "Avatar updated".
   */
  async function runAvatarChange(fn: () => Promise<WorkspaceIdentity>): Promise<boolean> {
    setAvatarBusy(true)
    setAvatarErr(null)
    try {
      apply(await fn())
      return true
    } catch (err) {
      setAvatarErr((err as Error).message)
      return false
    } finally {
      setAvatarBusy(false)
    }
  }

  function onPicked(file: File) {
    // Also rejected server-side, which is the trust boundary. Catching it here
    // avoids uploading 2 MB only to be told the file is too large.
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarErr("Image must be 2 MB or smaller")
      return
    }
    void runAvatarChange(() => uploadWorkspaceAvatar(file)).then((ok) => {
      if (ok) toastGlobal("Avatar updated", "success")
    })
  }

  function onUrlSaved() {
    void runAvatarChange(() => setWorkspaceAvatarUrl(urlDraft)).then((ok) => {
      if (!ok) return
      setUrlDraft("")
      toastGlobal("Avatar updated", "success")
    })
  }

  function onRemoved() {
    void runAvatarChange(removeWorkspaceAvatar).then((ok) => {
      if (!ok) return
      setUrlDraft("")
      toastGlobal("Avatar removed", "success")
    })
  }

  const preview = workspaceAvatarSrc(loaded)
  const displayName = name.trim() || WORKSPACE_NAME_FALLBACK

  return (
    <SettingsSection
      title="Workspace"
      description="How this workspace is named and how it appears in the top bar."
    >
      <div className="flex flex-col gap-5 py-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 shrink-0 rounded-lg">
            {preview ? <AvatarImage src={preview} alt="" /> : null}
            <AvatarFallback className="rounded-lg bg-accent-tint text-lg font-medium text-accent-text">
              {workspaceMonogram(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{displayName}</p>
            <p className="mt-0.5 text-xs text-ink-3">
              {loaded?.avatar_url ? "Custom avatar" : "Monogram"}
            </p>
          </div>
        </div>

        <form onSubmit={saveName} className="flex flex-col gap-2">
          <Label htmlFor="workspace-name">Name</Label>
          <div className="flex items-center gap-2">
            <Input
              id="workspace-name"
              value={name}
              maxLength={64}
              placeholder={WORKSPACE_NAME_FALLBACK}
              onChange={(e) => {
                setName(e.target.value)
                setDirty(true)
              }}
              className="max-w-72"
            />
            <Button type="submit" variant="signal" loading={saving} disabled={!dirty}>
              Save
            </Button>
          </div>
          <p className="text-xs text-ink-3">
            Leave empty to fall back to &ldquo;{WORKSPACE_NAME_FALLBACK}&rdquo;.
          </p>
        </form>

        <div className="flex flex-col gap-2 border-t border-line pt-5">
          <Label>Avatar</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={avatarBusy}
              onClick={() => fileRef.current?.click()}
            >
              {avatarBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ImagePlus className="size-3.5" />
              )}
              Upload
            </Button>
            {!!preview && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatarBusy}
                onClick={onRemoved}
              >
                <Trash2 className="size-3.5" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-3">
            PNG / JPEG / GIF (animated) / WebP, max 2 MB
          </p>

          <div className="mt-2 flex items-end gap-1.5">
            <div className="min-w-0 flex-1">
              <Label htmlFor="workspace-avatar-url" className="text-[11px] text-ink-3">
                Or paste an image URL
              </Label>
              <Input
                id="workspace-avatar-url"
                value={urlDraft}
                placeholder="https://…/avatar.png"
                onChange={(e) => setUrlDraft(e.target.value)}
                className="mt-1 max-w-72 text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={avatarBusy || !urlDraft.trim()}
              onClick={onUrlSaved}
              className="h-8 shrink-0"
            >
              <Link2 className="size-3.5" /> Set
            </Button>
          </div>
          <p className="text-xs text-ink-3">Must be a public https image.</p>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPicked(f)
              // Reset so re-picking the same file fires change again.
              e.currentTarget.value = ""
            }}
          />
        </div>

        {avatarErr && (
          <p role="alert" className="text-sm text-danger-text">
            {avatarErr}
          </p>
        )}
      </div>
    </SettingsSection>
  )
}