package kanban

import (
	"fmt"
	"math"
	"strconv"
	"time"
)

// Energy aggregation over the sampler store (power_sample.go).
//
// The plug reports a draw only when it changes, but the sampler takes one
// reading a minute, so consecutive samples are treated as the endpoints of a
// trapezoid and integrated. Day buckets and date parsing are fixed to WIB, the
// plug's timezone.

// wib is the plug's timezone. Fixed offset: Indonesia has no DST.
var wib = time.FixedZone("WIB", 7*3600)

// gapMax is the longest interval credited as continuous draw. A longer gap means
// the VPS or the plug was offline for that stretch, so the interval is skipped
// rather than credited with kWh that were never measured.
const gapMax = 300 * time.Second

// DefaultTariffPerKWh is the fallback price (PLN R-1/1300VA non-subsidised).
const DefaultTariffPerKWh = 1444.70

type EnergyDay struct {
	Date string  `json:"date"` // WIB calendar day, YYYY-MM-DD
	KWh  float64 `json:"kwh"`
	Rp   float64 `json:"rp"`
}

type EnergyRange struct {
	NodeID       string      `json:"node_id"`
	From         int64       `json:"from"` // unix seconds, inclusive
	To           int64       `json:"to"`   // unix seconds, exclusive
	TariffPerKWh float64     `json:"tariff_per_kwh"`
	TotalKWh     float64     `json:"total_kwh"`
	TotalRp      float64     `json:"total_rp"`
	Days         int         `json:"days"`
	AvgKWhPerDay float64     `json:"avg_kwh_per_day"`
	AvgRpPerDay  float64     `json:"avg_rp_per_day"`
	Daily        []EnergyDay `json:"daily"`
	Samples      int         `json:"samples"`
	SpanSeconds  int64       `json:"span_seconds"`
	// CoverageFrom is the earliest sample ever stored for this node (unix
	// seconds, 0 when none). The UI compares it to From to warn that the
	// requested range predates the data instead of showing a misleading total.
	CoverageFrom int64 `json:"coverage_from"`
}

type sample struct {
	ts    int64
	watts float64
}

// PowerEnergyRange integrates the stored draw over [from, to) and prices it.
func PowerEnergyRange(nodeID string, from, to time.Time, tariff float64) (EnergyRange, error) {
	fromS, toS := from.Unix(), to.Unix()
	out := EnergyRange{
		NodeID:       nodeID,
		From:         fromS,
		To:           toS,
		TariffPerKWh: tariff,
		Daily:        []EnergyDay{},
		Days:         daysTouched(fromS, toS),
	}
	if toS <= fromS {
		return out, fmt.Errorf("range end must be after start")
	}

	db, err := openPowerDB()
	if err != nil {
		return out, err
	}
	defer db.Close()

	if err := db.QueryRow(`SELECT COALESCE(MIN(ts),0) FROM power_samples WHERE node_id=?`, nodeID).
		Scan(&out.CoverageFrom); err != nil {
		return out, err
	}

	rows, err := db.Query(
		`SELECT ts, watts FROM power_samples WHERE node_id=? AND ts>=? AND ts<? ORDER BY ts`,
		nodeID, fromS, toS)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	var samples []sample
	for rows.Next() {
		var s sample
		if err := rows.Scan(&s.ts, &s.watts); err != nil {
			return out, err
		}
		samples = append(samples, s)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	out.Samples = len(samples)
	if len(samples) < 2 {
		return out, nil // one reading is not an interval; nothing to integrate
	}
	out.SpanSeconds = samples[len(samples)-1].ts - samples[0].ts

	perDay := map[string]float64{}
	total := 0.0
	for i := 1; i < len(samples); i++ {
		t0, t1 := samples[i-1].ts, samples[i].ts
		if dt := time.Duration(t1-t0) * time.Second; dt <= 0 || dt > gapMax {
			continue
		}
		kwh := (samples[i-1].watts + samples[i].watts) / 2 * float64(t1-t0) / 3600 / 1000
		total += kwh
		day := time.Unix(t0, 0).In(wib).Format("2006-01-02")
		perDay[day] += kwh
	}

	out.TotalKWh = round(total, 3)
	out.TotalRp = math.Round(total * tariff)
	for day, kwh := range perDay {
		out.Daily = append(out.Daily, EnergyDay{Date: day, KWh: round(kwh, 3), Rp: math.Round(kwh * tariff)})
	}
	sortEnergyDays(out.Daily)
	if out.Days > 0 {
		out.AvgKWhPerDay = round(total/float64(out.Days), 3)
		out.AvgRpPerDay = math.Round(total * tariff / float64(out.Days))
	}
	return out, nil
}

// PowerEnergy parses the request's from/to and prices the range with the node's
// configured tariff. Empty arguments default to the last 24 hours.
func PowerEnergy(nodeID, fromRaw, toRaw string) (EnergyRange, error) {
	tariff := DefaultTariffPerKWh
	if cfg, err := loadPowerConfig(); err == nil {
		for _, t := range cfg.Targets {
			if t.NodeID == nodeID && t.TariffPerKWh > 0 {
				tariff = t.TariffPerKWh
			}
		}
	}

	now := time.Now()
	from, to := now.Add(-24*time.Hour), now
	if fromRaw != "" {
		t, err := parseRangeArg(fromRaw, false)
		if err != nil {
			return EnergyRange{}, fmt.Errorf("from: %w", err)
		}
		from = t
	}
	if toRaw != "" {
		t, err := parseRangeArg(toRaw, true)
		if err != nil {
			return EnergyRange{}, fmt.Errorf("to: %w", err)
		}
		to = t
	}
	return PowerEnergyRange(nodeID, from, to, tariff)
}

// parseRangeArg accepts unix seconds or a YYYY-MM-DD date in WIB. A date is
// inclusive: `inclusiveEnd` shifts it to the following midnight so a range of
// "2026-10-01".."2026-10-03" covers the whole of the 3rd.
func parseRangeArg(v string, inclusiveEnd bool) (time.Time, error) {
	// strconv rejects trailing junk, unlike Sscanf("%d") which would read the
	// leading "2026" out of "2026-10-03" and call it unix seconds.
	if n, err := strconv.ParseInt(v, 10, 64); err == nil {
		return time.Unix(n, 0), nil
	}
	d, err := time.ParseInLocation("2006-01-02", v, wib)
	if err != nil {
		return time.Time{}, fmt.Errorf("want unix seconds or YYYY-MM-DD, got %q", v)
	}
	if inclusiveEnd {
		d = d.AddDate(0, 0, 1)
	}
	return d, nil
}

// daysTouched counts the WIB calendar days spanned by [fromS, toS).
func daysTouched(fromS, toS int64) int {
	if toS <= fromS {
		return 0
	}
	fd := time.Unix(fromS, 0).In(wib)
	ld := time.Unix(toS-1, 0).In(wib)
	start := time.Date(fd.Year(), fd.Month(), fd.Day(), 0, 0, 0, 0, wib)
	end := time.Date(ld.Year(), ld.Month(), ld.Day(), 0, 0, 0, 0, wib)
	return int(end.Sub(start).Hours()/24) + 1
}

func sortEnergyDays(days []EnergyDay) {
	for i := 1; i < len(days); i++ {
		for j := i; j > 0 && days[j].Date < days[j-1].Date; j-- {
			days[j], days[j-1] = days[j-1], days[j]
		}
	}
}

func round(v float64, dp int) float64 {
	p := math.Pow(10, float64(dp))
	return math.Round(v*p) / p
}
