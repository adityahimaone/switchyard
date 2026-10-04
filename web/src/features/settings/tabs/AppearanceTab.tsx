import { useEffect, useState } from "react"
import { SettingRow, SettingsSection, Segmented } from "../settings-parts"
import {
  applyDensity, applyEffects, applyMotion, readDensity, readEffects, readMotion,
  type Density, type EffectsPreference, type MotionPreference, type ThemePreference,
} from "@/hooks/useSettings"
import { useTheme } from "@/hooks/useSettings"

/**
 * Appearance writes four things to <html>: the theme class, `data-density`,
 * `data-motion` and `data-effects`. Each is persisted under its own key so the
 * values survive a reload, and applied on mount so the first paint matches —
 * the theme and effects keys are also read by the pre-paint script in
 * index.html, which is why those two must stay in sync with it.
 */
export default function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const [density, setDensityState] = useState<Density>(readDensity)
  const [motion, setMotionState] = useState<MotionPreference>(readMotion)
  const [effects, setEffectsState] = useState<EffectsPreference>(readEffects)

  useEffect(() => {
    try { localStorage.setItem("kb-density", density) } catch {}
    applyDensity(density)
  }, [density])

  useEffect(() => {
    try { localStorage.setItem("kb-motion", motion) } catch {}
    applyMotion(motion)
  }, [motion])

  useEffect(() => {
    try { localStorage.setItem("kb-effects", effects) } catch {}
    applyEffects(effects)
  }, [effects])

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

      {/* Deliberately worded as a performance setting rather than an aesthetic
          one, because that is what it is: the glass, its shadows and every
          colour stay exactly as they are, and only the blur radius, the drifting
          orbs and the grain are traded away. Someone on a slow GPU or a laptop
          on battery should be able to predict what turning this on does. */}
      <SettingRow
        label="Reduce effects"
        help="Lowers blur and stops background motion to help on slower GPUs and battery. Colours and glass surfaces are unchanged."
      >
        <Segmented<EffectsPreference>
          label="Reduce effects"
          value={effects}
          onChange={setEffectsState}
          options={[
            { value: "system", label: "System" },
            { value: "lite", label: "On" },
          ]}
        />
      </SettingRow>
    </SettingsSection>
  )
}
