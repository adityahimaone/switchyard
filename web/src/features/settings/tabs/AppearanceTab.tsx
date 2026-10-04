import { useEffect, useState } from "react"
import { SettingRow, SettingsSection, Segmented, PalettePicker } from "../settings-parts"
import {
  applyDensity, applyMotion, readDensity, readMotion,
  type Density, type MotionPreference, type ThemePalette, type ThemePreference,
} from "@/hooks/useSettings"
import { usePalette, useTheme } from "@/hooks/useSettings"

/**
 * The swatches are literal hex values, not `var(--c-*)`.
 *
 * A swatch has to show the palette it represents, but the live document is
 * painted in whichever palette is currently active — so a swatch reading
 * `var(--c-canvas)` would render Signal Blue on all three cards and the control
 * would show nothing at all. The values are therefore hardcoded here, and they
 * are the *light* mode of each palette for that reason: the label beside them is
 * ink-coloured in both modes, and a dark swatch against a dark card in dark mode
 * would be the one option that disappears.
 *
 * They must be kept in step with `themes.css`. Nothing enforces that, which is
 * why each entry repeats the palette name in its hint.
 */
const PALETTE_OPTIONS: { value: ThemePalette; label: string; hint: string; swatch: [string, string, string] }[] = [
  { value: "signal", label: "Signal Blue", hint: "Default · cool blue", swatch: ["#f2f4fd", "#ffffff", "#2f57c4"] },
  { value: "lime", label: "Lime forest", hint: "Near-white · lime accent", swatch: ["#fbfcf8", "#ffffff", "#aff33e"] },
  { value: "zen", label: "Zen linen", hint: "Warm paper · charcoal", swatch: ["#e9e4d8", "#f4efe4", "#2e2e2e"] },
]

/**
 * Appearance writes four things: the palette attribute, the theme class,
 * `data-density` and `data-motion` on <html>. Each is persisted under its own key
 * so the values survive a reload, and applied on mount so the first paint matches.
 *
 * Palette and theme are separate axes on purpose — a palette supplies both a
 * light and a dark variant, so there is one picker for colour and another for
 * mode. Collapsing them into one control would force "Lime forest dark" to be a
 * separate option from "Lime forest light" and would double the list for no gain.
 */
export default function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const { palette, setPalette } = usePalette()
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
      <div className="py-3">
        <p className="text-sm font-medium text-ink">Palette</p>
        <p className="mt-0.5 max-w-[56ch] text-xs text-ink-3">
          Colour theme. Each palette has its own light and dark variant, so this is
          separate from the mode below.
        </p>
        <div className="mt-3">
          <PalettePicker<ThemePalette> value={palette} onChange={setPalette} options={PALETTE_OPTIONS} />
        </div>
      </div>

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
