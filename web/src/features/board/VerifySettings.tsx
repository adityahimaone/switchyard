import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Section } from "./taskDetailParts"
import type { Task, VerifyProfile } from "../../api"

/**
 * The editable half of verification: which rung applies, and which committed
 * design the task implements.
 *
 * Editable rather than fixed at create time because the honest answer often
 * depends on the diff, which only exists after the agent has run. A card created
 * on "Auto" can be forced up or down once you can see what it actually touched.
 *
 * The routed value is shown read-only underneath, because "I chose auto" and
 * "auto chose ui" are different facts and only the second one tells you what
 * will actually be checked.
 */
export function VerifySettings({
  slug: _slug,
  task,
  saving,
  onSave,
}: {
  slug: string
  task: Task
  saving: boolean
  onSave: (patch: { verify_profile?: VerifyProfile | ""; design_source?: string }) => void
}) {
  const [profile, setProfile] = useState<VerifyProfile | "">(task.verify_profile ?? "")
  const [design, setDesign] = useState(task.design_source ?? "")

  // Re-sync when the card changes underneath us — after a save, or when the
  // drawer is reopened on a different card. Without this the field would keep
  // showing a value the server no longer holds.
  useEffect(() => {
    setProfile(task.verify_profile ?? "")
    setDesign(task.design_source ?? "")
  }, [task.id, task.verify_profile, task.design_source])

  const profileDirty = profile !== (task.verify_profile ?? "")
  const designDirty = design.trim() !== (task.design_source ?? "")
  const dirty = profileDirty || designDirty

  function save() {
    onSave({ verify_profile: profile, design_source: design.trim() })
  }

  return (
    <Section title="Verification" className="mt-2.5">
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <div className="min-w-0">
          <Label className="block text-xs text-ink-3" htmlFor="detail-verify-profile">
            Verify profile
          </Label>
          <Select
            value={profile}
            onValueChange={(v) => setProfile(v as VerifyProfile | "")}
          >
            <SelectTrigger id="detail-verify-profile" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="">
              <SelectItem value="" className="text-sm">
                Auto — route from the diff
              </SelectItem>
              <SelectItem value="none" className="text-sm">
                None
              </SelectItem>
              <SelectItem value="fast" className="text-sm">
                Fast
              </SelectItem>
              <SelectItem value="ui" className="text-sm">
                UI
              </SelectItem>
              <SelectItem value="e2e" className="text-sm">
                E2E
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0">
          <Label className="block text-xs text-ink-3" htmlFor="detail-design-source">
            Design source
          </Label>
          <Input
            id="detail-design-source"
            value={design}
            onChange={(e) => setDesign(e.target.value)}
            placeholder="design/task-card.pen"
            className="mt-1 text-xs"
          />
        </div>
      </div>

      <p className="mt-1.5 text-2xs text-ink-3">
        {task.verify_profile
          ? "An explicit choice; routing will not override it."
          : task.verify_profile_effective
            ? `Auto-routed to ${task.verify_profile_effective} from the last diff.`
            : "Auto: the rung is decided from the files the agent changed."}
      </p>

      {task.verify_status && (
        <p className="mt-1 text-2xs text-ink-3">
          Last run: {task.verify_status}
          {task.verify_output ? " — open the review to read the output and see the screenshots." : ""}
        </p>
      )}

      {dirty && (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="signal" loading={saving} onClick={save}>
            Save verification settings
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setProfile(task.verify_profile ?? "")
              setDesign(task.design_source ?? "")
            }}
          >
            Discard
          </Button>
          <span className="text-2xs text-ink-3">Saving clears the previous verdict.</span>
        </div>
      )}
    </Section>
  )
}