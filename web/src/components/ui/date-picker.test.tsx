import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { Calendar } from "./calendar"
import { DatePicker, formatISODate, parseISODate } from "./date-picker"

/**
 * The date picker must speak the same `YYYY-MM-DD` string the energy API and
 * the native `<input type="date">` it replaced both use, and it must parse in
 * LOCAL time: `new Date("2026-10-01")` is parsed as UTC midnight and reads back
 * as 2026-09-30 west of Greenwich, which would silently shift every range.
 */
describe("ISO date round-trip", () => {
  it("parses a date as local midnight, not UTC", () => {
    const d = parseISODate("2026-10-01")!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(9) // October
    expect(d.getDate()).toBe(1)
  })

  it("round-trips without drifting a day", () => {
    expect(formatISODate(parseISODate("2026-10-01")!)).toBe("2026-10-01")
    expect(formatISODate(parseISODate("2026-01-01")!)).toBe("2026-01-01")
    expect(formatISODate(parseISODate("2026-12-31")!)).toBe("2026-12-31")
  })

  it("returns undefined for an empty or malformed value", () => {
    expect(parseISODate("")).toBeUndefined()
    expect(parseISODate("nonsense")).toBeUndefined()
    expect(parseISODate("2026-10")).toBeUndefined()
  })
})

describe("DatePicker trigger", () => {
  const render = (props: Partial<Parameters<typeof DatePicker>[0]> = {}) =>
    renderToStaticMarkup(<DatePicker value="" onChange={() => {}} ariaLabel="From date" {...props} />)

  it("prompts when empty and shows the day once chosen", () => {
    expect(render()).toContain("Pick a date")
    expect(render({ value: "2026-10-03" })).toContain("03 Oct 2026")
  })

  it("carries the aria-label it was given", () => {
    expect(render({ ariaLabel: "To date" })).toContain('aria-label="To date"')
  })
})

/**
 * The vendored shadcn Calendar, rendered directly: it is the piece a broken
 * react-day-picker upgrade or a dropped token would take out, and a closed
 * Popover never mounts it.
 */
describe("Calendar", () => {
  it("renders a month grid with the selected day marked", () => {
    const html = renderToStaticMarkup(
      <Calendar mode="single" required selected={new Date(2026, 9, 3)} defaultMonth={new Date(2026, 9, 1)} />,
    )
    expect(html).toContain("October 2026")
    // A day cell for the selected date, flagged as the single selection.
    expect(html).toContain('data-selected-single="true"')
  })
})
