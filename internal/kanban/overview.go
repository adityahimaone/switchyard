package kanban

import (
	"bufio"
	"database/sql"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type OverviewMetric struct {
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryUsedMB  uint64  `json:"memory_used_mb"`
	MemoryTotalMB uint64  `json:"memory_total_mb"`
	Goroutines    int     `json:"goroutines"`
}

type OverviewFlow struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Value  int    `json:"value"`
}

type Overview struct {
	Metrics        OverviewMetric `json:"metrics"`
	TotalTasks     int            `json:"total_tasks"`
	RunningTasks   int            `json:"running_tasks"`
	CompletedTasks int            `json:"completed_tasks"`
	FailedTasks    int            `json:"failed_tasks"`
	QueueDepth     int            `json:"queue_depth"`
	Profiles       int            `json:"profiles"`
	Workspaces     int            `json:"workspaces"`
	UsageMode      string         `json:"usage_mode"`
	UsageNote      string         `json:"usage_note"`
	Flows          []OverviewFlow `json:"flows"`
	TaskHealth     map[string]int `json:"task_health"`
}

func cpuPercent() float64 {
	read := func() (uint64, uint64) {
		f, err := os.Open("/proc/stat")
		if err != nil {
			return 0, 0
		}
		defer f.Close()
		s := bufio.NewScanner(f)
		if !s.Scan() {
			return 0, 0
		}
		p := strings.Fields(s.Text())
		if len(p) < 5 {
			return 0, 0
		}
		var total, idle uint64
		for _, v := range p[1:] {
			n, _ := strconv.ParseUint(v, 10, 64)
			total += n
		}
		idle, _ = strconv.ParseUint(p[4], 10, 64)
		return total, idle
	}
	t1, i1 := read()
	time.Sleep(80 * time.Millisecond)
	t2, i2 := read()
	if t2 <= t1 || t2-t1 == 0 {
		return 0
	}
	return float64((t2-t1)-(i2-i1)) * 100 / float64(t2-t1)
}

func memoryUsage() (uint64, uint64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	defer f.Close()
	var total, available uint64
	s := bufio.NewScanner(f)
	for s.Scan() {
		p := strings.Fields(s.Text())
		if len(p) < 2 {
			continue
		}
		n, _ := strconv.ParseUint(p[1], 10, 64)
		switch p[0] {
		case "MemTotal:":
			total = n
		case "MemAvailable:":
			available = n
		}
	}
	return (total - available) / 1024, total / 1024
}

func OverviewData() (Overview, error) {
	boards, err := ListBoards()
	if err != nil {
		return Overview{}, err
	}
	profiles, err := ListProfiles()
	if err != nil {
		return Overview{}, err
	}
	workspaces, err := ListWorkspaces()
	if err != nil {
		return Overview{}, err
	}
	o := Overview{Profiles: len(profiles), Workspaces: len(workspaces), UsageMode: "activity", UsageNote: "Token/cost telemetry unavailable; flow shows real task activity by profile.", TaskHealth: OverviewHealthSummary()}
	for _, b := range boards {
		tasks, e := ListTasks(b.Slug)
		if e != nil {
			continue
		}
		for _, t := range tasks {
			o.TotalTasks++
			switch t.Status {
			case "running":
				o.RunningTasks++
			case "done":
				o.CompletedTasks++
			case "failed":
				o.FailedTasks++
			}
			if t.Assignee == "" {
				continue
			}
			o.Flows = append(o.Flows, OverviewFlow{Source: "Kanban", Target: t.Assignee, Value: 1})
			for _, p := range profiles {
				if p.Name != t.Assignee {
					continue
				}
				o.Flows = append(o.Flows, OverviewFlow{Source: p.Name, Target: p.Provider + " / " + p.Model, Value: 1})
				break
			}
		}
	}
	m, total := memoryUsage()
	o.Metrics = OverviewMetric{CPUPercent: cpuPercent(), MemoryUsedMB: m, MemoryTotalMB: total, Goroutines: runtime.NumGoroutine()}
	o.QueueDepth = o.TotalTasks - o.RunningTasks - o.CompletedTasks - o.FailedTasks
	if o.QueueDepth < 0 {
		o.QueueDepth = 0
	}
	return o, nil
}

// ActivityDay is one daily bucket of chat + task activity.
type ActivityDay struct {
	Date            string `json:"date"`             // YYYY-MM-DD (local)
	ChatMessages    int    `json:"chat_messages"`
	TaskDispatches  int    `json:"task_dispatches"`
	Total           int    `json:"total"`
}

// ActivitySummary aggregates daily activity for the last `days` days (inclusive
// of today). Chat counts come from chat.db messages; task dispatches from
// task_events (claimed/spawned/dispatched kinds) across all boards.
func ActivitySummary(days int) ([]ActivityDay, error) {
	if days < 1 {
		days = 1
	}
	if days > 365 {
		days = 365
	}
	buckets := make(map[string]*ActivityDay)
	var order []string
	now := time.Now()
	for i := days - 1; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		key := d.Format("2006-01-02")
		buckets[key] = &ActivityDay{Date: key}
		order = append(order, key)
	}

	// chat.db messages
	if db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&mode=ro", chatDBPath())); err == nil {
		rows, err := db.Query(`SELECT strftime('%Y-%m-%d', created_at, 'unixepoch', 'localtime') AS day, COUNT(*) FROM chat_messages GROUP BY day`)
		if err == nil {
			for rows.Next() {
				var day string
				var n int
				if rows.Scan(&day, &n) == nil {
					if b, ok := buckets[day]; ok {
						b.ChatMessages += n
						b.Total += n
					}
				}
			}
			rows.Close()
		}
		db.Close()
	}

	// task_events across every board
	boards, err := ListBoards()
	if err == nil {
		for _, b := range boards {
			db, derr := openDB(b.Slug)
			if derr != nil {
				continue
			}
			rows, rerr := db.Query(`SELECT strftime('%Y-%m-%d', created_at, 'unixepoch', 'localtime') AS day, COUNT(*) FROM task_events WHERE kind IN ('claimed','spawned','dispatched','status_changed') GROUP BY day`)
			if rerr == nil {
				for rows.Next() {
					var day string
					var n int
					if rows.Scan(&day, &n) == nil {
						if bk, ok := buckets[day]; ok {
							bk.TaskDispatches += n
							bk.Total += n
						}
					}
				}
				rows.Close()
			}
			db.Close()
		}
	}

	out := make([]ActivityDay, 0, len(order))
	for _, k := range order {
		out = append(out, *buckets[k])
	}
	return out, nil
}
