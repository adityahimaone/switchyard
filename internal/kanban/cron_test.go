package kanban

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCronJobsDecodeAndFilter(t *testing.T) {
	raw := []byte(`{"jobs":[{"id":"one","name":"One","enabled":true,"state":"scheduled","schedule_display":"every hour"},{"id":"two","name":"Two","enabled":false,"state":"paused"}]}`)
	jobs, err := decodeCronJobs(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(jobs) != 2 || jobs[0].ID != "one" || jobs[1].Enabled {
		t.Fatalf("unexpected jobs: %+v", jobs)
	}
}

func TestCronListReadsFromFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := os.MkdirAll(filepath.Join(home, "cron"), 0o755); err != nil {
		t.Fatal(err)
	}
	payload := map[string]any{"jobs": []CronJob{
		{ID: "one", Name: "One", Enabled: true, State: "scheduled"},
		{ID: "two", Name: "Two", Enabled: false, State: "paused"},
	}}
	raw, _ := json.Marshal(payload)
	if err := os.WriteFile(filepath.Join(home, "cron", "jobs.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	all, err := ListCronJobs(true)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("all len=%d want 2", len(all))
	}
	active, err := ListCronJobs(false)
	if err != nil {
		t.Fatal(err)
	}
	if len(active) != 1 || active[0].ID != "one" {
		t.Fatalf("active: %+v", active)
	}
}

func TestCronPauseUsesCommand(t *testing.T) {
	old := cronCommand
	defer func() { cronCommand = old }()
	var got []string
	cronCommand = func(name string, args ...string) ([]byte, error) {
		got = append([]string{name}, args...)
		return []byte("ok"), nil
	}
	if err := PauseCronJob("abc123"); err != nil {
		t.Fatal(err)
	}
	if len(got) != 4 || got[0] != "hermes" || got[1] != "cron" || got[2] != "pause" || got[3] != "abc123" {
		t.Fatalf("pause command: %v", got)
	}
	if err := PauseCronJob("bad id"); err == nil {
		t.Fatal("bad id accepted")
	}
}

func TestCronCreateRequiresSchedule(t *testing.T) {
	if err := CreateCronJob(CronCreateRequest{Name: "x"}); err == nil {
		t.Fatal("empty schedule accepted")
	}
}

func TestCronValidateID(t *testing.T) {
	if err := validateCronID(""); err == nil {
		t.Fatal("empty id accepted")
	}
	if err := validateCronID("good-id_123"); err != nil {
		t.Fatal(err)
	}
}
