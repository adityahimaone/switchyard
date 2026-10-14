import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { PowerTarget } from "@/api"
import { HostPowerControl, powerActionMeta } from "./WorkspacesPage"

const target = (over: Partial<PowerTarget> = {}): PowerTarget => ({
  node_id: "windows",
  label: "Windows PC",
  actions: ["on", "cycle", "off"],
  hosts: ["windows-tailscale"],
  ...over,
})

const render = (online: boolean, actions = ["on", "cycle", "off"]) =>
  renderToStaticMarkup(
    <HostPowerControl
      targets={[target({ actions })]}
      nodeOnline={new Map([["windows", online]])}
      onAction={() => {}}
    />,
  )

/** The button tag that carries the given aria-label, so its own attrs can be read. */
const button = (html: string, label: string) =>
  html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? ""

/**
 * The disabled ATTRIBUTE, not the `disabled:` Tailwind variants that every
 * button's class string carries.
 */
const isDisabled = (tag: string) => / disabled(?![:=])/.test(tag)

/**
 * The panel is the only place a host can be powered from, so it has to name the
 * host and its state, gate the impossible action, and stay absent for a section
 * whose hosts have no target.
 */
describe("HostPowerControl", () => {
  it("names the host and its live state", () => {
    expect(render(true)).toContain("Windows PC")
    expect(render(true)).toContain("running")
    expect(render(false)).toContain("off")
  })

  it("gates power on while the host is reachable, and power off while it is not", () => {
    const up = render(true)
    expect(isDisabled(button(up, "Power on Windows PC"))).toBe(true)
    expect(isDisabled(button(up, "Power off Windows PC"))).toBe(false)

    const down = render(false)
    expect(isDisabled(button(down, "Power on Windows PC"))).toBe(false)
    expect(isDisabled(button(down, "Power off Windows PC"))).toBe(true)
  })

  it("renders only the actions the target declares", () => {
    const html = render(false, ["on"])
    expect(button(html, "Power on Windows PC")).not.toBe("")
    expect(button(html, "Restart Windows PC")).toBe("")
    expect(button(html, "Power off Windows PC")).toBe("")
  })

  it("renders nothing for a section with no target", () => {
    expect(
      renderToStaticMarkup(
        <HostPowerControl targets={[]} nodeOnline={new Map()} onAction={() => {}} />,
      ),
    ).toBe("")
  })
})

/**
 * Every power action asks for confirmation, so the dialog's verb and severity
 * come from here. A restart is destructive to work in progress; powering a
 * machine on is not.
 */
describe("powerActionMeta", () => {
  it("marks power off and restart destructive, power on not", () => {
    expect(powerActionMeta("off")).toMatchObject({ verb: "Power off", variant: "destructive" })
    expect(powerActionMeta("cycle")).toMatchObject({ verb: "Restart", variant: "destructive" })
    expect(powerActionMeta("on")).toMatchObject({ verb: "Power on", variant: "signal" })
  })

  it("names the host in the confirmation copy", () => {
    for (const action of ["on", "cycle", "off"]) {
      expect(powerActionMeta(action).note("Windows PC")).toContain("Windows PC")
    }
  })

  it("falls back to power off for an unknown action rather than rendering blank", () => {
    expect(powerActionMeta("nope").verb).toBe("Power off")
  })
})
