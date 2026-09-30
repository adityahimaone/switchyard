import { useEffect, useState } from "react"
import { SettingRow, SettingsSection, Segmented } from "../settings-parts"
import {
  applyDensity, applyMotion, readDensity, readMotion,
  type Density, type MotionPreference, type ThemePreference,
} from "@/hooks/useSettings"
import { useTheme } from "@/hooks/useSettings"

/**
 * Appearance writes three things: the theme class, `data-density` and
 * `data-motion` on <html>. Each is persisted under its own key so the values
 * survive a reload, and applied on mount so the first paint matches.
 */
export default function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const [density, setDensityState] = useState<Density>(readDensity)
  const [motion, setMotionState] = useState<MotionPreference>(readMotion)

  useEffect(() => {
    try { localStorage.setItem("kb-density", density) } catch {}
    applyDensity(density)
  }, [density])

  useEffect(() => {
    try { localStorage.setItem("kb-motion", motion) } catch {}
    applyMotion(motion)
  }, [motion])

  return (
    <SettingsSection title="Appearance" description="How Switchyard looks on this device.">
      <SettingRow label="Theme" help="Choose light, dark, or match your system.">
        <Segmented<ThemePreference>
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </SettingRow>

      <SettingRow
        label="Density"
        help="Compact fits about 20% more rows on screen."
      >
        <Segmented<Density>
          label="Density"
          value={density}
          onChange={setDensityState}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
      </SettingRow>

      <SettingRow
        label="Reduce motion"
        help="Turns off the board intro, the status pulse and card movement."
      >
        <Segmented<MotionPreference>
          label="Reduce motion"
          value={motion}
          onChange={setMotionState}
          options={[
            { value: "system", label: "System" },
            { value: "reduce", label: "On" },
          ]}
        />
      </SettingRow>
    </SettingsSection>
  )
}
