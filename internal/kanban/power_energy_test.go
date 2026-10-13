package kanban

import (
	"testing"
	"time"
)

func wibTime(y int, mo time.Month, d, h, mi, s int) time.Time {
	return time.Date(y, mo, d, h, mi, s, 0, wib)
}

func seed(t *testing.T, node string, samples map[int64]float64) {
	t.Helper()
	for ts, w := range samples {
		if err := RecordPowerSample(node, ts, w); err != nil {
			t.Fatalf("seed %d: %v", ts, err)
		}
	}
}

// A minute apart at 200 W then 400 W integrates to the 300 W mean over 60s.
func TestPowerEnergyRangeIntegratesTrapezoid(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t0 := wibTime(2026, 10, 13, 10, 0, 0)
	seed(t, "windows", map[int64]float64{t0.Unix(): 200, t0.Unix() + 60: 400})

	r, err := PowerEnergyRange("windows", t0, t0.Add(2*time.Minute), 1000)
	if err != nil {
		t.Fatal(err)
	}
	if r.TotalKWh != 0.005 {
		t.Fatalf("want 0.005 kWh, got %v", r.TotalKWh)
	}
	if r.TotalRp != 5 {
		t.Fatalf("want Rp 5 at 1000/kWh, got %v", r.TotalRp)
	}
}

// A gap longer than gapMax means the box was offline: never credit phantom kWh.
func TestPowerEnergyRangeSkipsLongGap(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t0 := wibTime(2026, 10, 13, 10, 0, 0)
	seed(t, "windows", map[int64]float64{t0.Unix(): 500, t0.Unix() + 600: 500})

	r, err := PowerEnergyRange("windows", t0, t0.Add(20*time.Minute), 1000)
	if err != nil {
		t.Fatal(err)
	}
	if r.TotalKWh != 0 {
		t.Fatalf("want 0 kWh across a 10m gap, got %v", r.TotalKWh)
	}
}

// Intervals are bucketed by the WIB calendar day of their start, so a run that
// crosses midnight lands in two days.
func TestPowerEnergyRangeBucketsByWIBDay(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	base := wibTime(2026, 10, 13, 23, 59, 0)
	seed(t, "windows", map[int64]float64{
		base.Unix():       100,
		base.Unix() + 40:  100,
		base.Unix() + 80:  100, // 00:00:20 next day
		base.Unix() + 120: 100,
	})

	r, err := PowerEnergyRange("windows", base, base.Add(5*time.Minute), 1000)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Daily) != 2 {
		t.Fatalf("want 2 WIB day buckets, got %d (%+v)", len(r.Daily), r.Daily)
	}
	if r.Daily[0].Date != "2026-10-13" || r.Daily[1].Date != "2026-10-14" {
		t.Fatalf("buckets out of order or wrong: %+v", r.Daily)
	}
}

// coverage_from is the earliest sample ever stored, so the UI can warn that a
// requested range predates the data.
func TestPowerEnergyRangeReportsCoverage(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	seed(t, "windows", map[int64]float64{1000: 50, 2000: 50, 3000: 50})

	r, err := PowerEnergyRange("windows", time.Unix(1500, 0), time.Unix(4000, 0), 1000)
	if err != nil {
		t.Fatal(err)
	}
	if r.CoverageFrom != 1000 {
		t.Fatalf("want coverage_from 1000, got %d", r.CoverageFrom)
	}
}

func TestPowerEnergyRangeAveragesOverDaysTouched(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	// 2026-10-01 00:00 WIB .. 2026-10-03 inclusive == 3 days.
	from := wibTime(2026, 10, 1, 0, 0, 0)
	r, err := PowerEnergy("windows", "2026-10-01", "2026-10-03")
	if err != nil {
		t.Fatal(err)
	}
	if r.Days != 3 {
		t.Fatalf("want 3 days, got %d", r.Days)
	}
	if r.From != from.Unix() {
		t.Fatalf("from mismatch: %d vs %d", r.From, from.Unix())
	}
	if got, want := r.To, wibTime(2026, 10, 4, 0, 0, 0).Unix(); got != want {
		t.Fatalf("to (exclusive) mismatch: %d vs %d", got, want)
	}
	if r.TariffPerKWh != DefaultTariffPerKWh {
		t.Fatalf("want default tariff, got %v", r.TariffPerKWh)
	}
}

func TestParseRangeArg(t *testing.T) {
	if got, err := parseRangeArg("1000", false); err != nil || got.Unix() != 1000 {
		t.Fatalf("unix passthrough: %v %v", got, err)
	}
	got, err := parseRangeArg("2026-10-03", true)
	if err != nil {
		t.Fatal(err)
	}
	if want := wibTime(2026, 10, 4, 0, 0, 0); !got.Equal(want) {
		t.Fatalf("inclusive date end: got %v want %v", got, want)
	}
	if _, err := parseRangeArg("nonsense", false); err == nil {
		t.Fatal("want error for an unparseable arg")
	}
}

func TestPowerEnergyRangeRejectsInvertedRange(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if _, err := PowerEnergyRange("windows", time.Unix(2000, 0), time.Unix(1000, 0), 1000); err == nil {
		t.Fatal("want error when to <= from")
	}
}
