import { useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useSoundSettings } from "@/hooks/useSettings"
import { applySoundPreferences, syncSoundEngine } from "@/lib/sound"
import { SettingRow, SettingsSection } from "../settings-parts"
import { useSetting } from "../useSetting"
import { LATEST_CHANGE_KEY } from "@/components/latest-change"

const REFRESH_KEY = "kb-refresh-interval"
const PING_KEY = "kb-ping-interval"
const SOUND_HOVER_KEY = "kb-sound-hover"
const SOUND_CLICK_KEY = "kb-sound-click"

const REFRESH_OPTS = [
  { label: "5s", value: "5000" },
  { label: "10s", value: "10000" },
  { label: "15s", value: "15000" },
  { label: "30s", value: "30000" },
  { label: "60s", value: "60000" },
]

const PING_OPTS = [
  { label: "10s", value: "10000" },
  { label: "30s", value: "30000" },
  { label: "60s", value: "60000" },
  { label: "Off", value: "0" },
]

export default function GeneralTab() {
  const [refreshMs, setRefresh] = useSetting(REFRESH_KEY, 15000)
  const [pingMs, setPing] = useSetting(PING_KEY, 30000)
  const [hover, setHover] = useSetting(SOUND_HOVER_KEY, true)
  const [click, setClick] = useSetting(SOUND_CLICK_KEY, true)
  const [latestChange, setLatestChange] = useSetting(LATEST_CHANGE_KEY, 0)
  const sound = useSoundSettings()

  // The engine caches its configuration, so re-apply when a preference changes.
  useEffect(() => { syncSoundEngine() }, [sound.enabled, sound.volume])
  useEffect(() => { applySoundPreferences() }, [hover, click])

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Polling" description="How often the app refetches live state.">
        <SettingRow
          label="Board refresh"
          help="How often tasks and health are re-fetched."
          htmlFor="set-refresh"
        >
          <Select value={String(refreshMs)} onValueChange={(v) => setRefresh(Number(v))}>
            <SelectTrigger id="set-refresh" size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Workspace ping"
          help="How often hosts are probed for reachability."
          htmlFor="set-ping"
        >
          <Select value={String(pingMs)} onValueChange={(v) => setPing(Number(v))}>
            <SelectTrigger id="set-ping" size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PING_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Sidebar"
        description="What the navigation rail shows alongside the page list."
      >
        <SettingRow
          label="Latest change card"
          help="Shows the release note at the foot of the sidebar. Off by default."
          htmlFor="set-latest-change"
        >
          <Switch
            id="set-latest-change"
            onCheckedChange={(v) => setLatestChange(v ? 1 : 0)}
            checked={latestChange === 1}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Sound"
        description="Feedback for board events. Uses the cuelume engine."
      >
        <SettingRow label="Enable sound" htmlFor="set-sound-on">
          <Switch
            id="set-sound-on"
            checked={sound.enabled}
            onCheckedChange={sound.setEnabled}
          />
        </SettingRow>
        <SettingRow label="Volume" htmlFor="set-sound-vol">
          <input
            id="set-sound-vol"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sound.volume}
            onChange={(e) => sound.setVolume(Number(e.target.value))}
            className="w-32 accent-[var(--c-accent)]"
          />
        </SettingRow>
        <SettingRow label="Hover sounds" htmlFor="set-sound-hover">
          <Switch id="set-sound-hover" checked={hover} onCheckedChange={setHover} />
        </SettingRow>
        <SettingRow label="Click sounds" htmlFor="set-sound-click">
          <Switch id="set-sound-click" checked={click} onCheckedChange={setClick} />
        </SettingRow>
      </SettingsSection>
    </div>
  )
}
