import { useEffect, useState } from "react"
import { PalettePicker, SettingRow, SettingsSection, Segmented } from "../settings-parts"
import {
  applyDensity, applyEffects, applyMotion, readDensity, readEffects, readMotion,
  type Density, type EffectsPreference, type MotionPreference, type ThemePalette, type ThemePreference,
} from "@/hooks/useSettings"
import { usePalette, useTheme } from "@/hooks/useSettings"

/**
 * The three-band swatches below are the palettes' own literal values, on purpose:
 * showing the resolved token would defeat the point of a swatch, which is to let
 * you compare the ground, the surface and the accent side by side. They mirror
 * `themes.css` by definition — if one changes, the other is stale.
 */
const PALETTE_OPTIONS: { value: ThemePalette; label: string; hint: string; swatch: [string, string, string] }[] = [
  { value: "signal", label: "Signal Blue", hint: "Default · cool blue", swatch: ["#f2f4fd", "#ffffff", "#2f57c4"] },
  { value: "lime", label: "Lime forest", hint: "Near-white · lime accent", swatch: ["#fbfcf8", "#ffffff", "#aff33e"] },
  { value: "zen", label: "Zen linen", hint: "Warm paper · charcoal", swatch: ["#e9e4d8", "#f4efe4", "#2e2e2e"] },
]

/**
 * Appearance writes five things to <html>: the palette attribute, the theme class,
 * `data-density`, `data-motion` and `data-effects`. Each is persisted under its own
 * key so the values survive a reload, and applied on mount so the first paint
 * matches — the theme, palette and effects keys are also read by the pre-paint
 * script in index.html, which is why those three must stay in sync with it.
 *
 * Palette and theme are separate axes on purpose — a palette supplies both a light
 * and a dark variant, so there is one picker for colour and another for mode.
 * Collapsing them into one control would force "Lime forest dark" to be a separate
 * option from "Lime forest light" and would double the list for no gain.
 */
export default function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const { palette, setPalette } = usePalette()
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
      <PalettePicker<ThemePalette> value={palette} onChange={setPalette} options={PALETTE_OPTIONS} />

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
