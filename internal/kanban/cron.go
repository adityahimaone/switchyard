package kanban

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// CronSchedule mirrors the on-disk schedule shape in ~/.hermes/cron/jobs.json.
type CronSchedule struct {
	Kind    string `json:"kind"`
	Expr    string `json:"expr"`
	Minutes int    `json:"minutes"`
	Display string `json:"display"`
}

type CronRepeat struct {
	Times     *int `json:"times"`
	Completed int  `json:"completed"`
}

type CronLastDispatch struct {
	ScheduledAt     string  `json:"scheduled_at"`
	DispatchedAt    string  `json:"dispatched_at"`
	LatenessSeconds float64 `json:"lateness_seconds"`
	Kind            string  `json:"kind"`
}

type CronJob struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Prompt            string            `json:"prompt"`
	Skills            []string          `json:"skills"`
	Skill             *string           `json:"skill"`
	Schedule          *CronSchedule     `json:"schedule"`
	ScheduleDisplay   string            `json:"schedule_display"`
	Repeat            *CronRepeat       `json:"repeat"`
	Deliver           string            `json:"deliver"`
	FailureDeliver    *string           `json:"failure_deliver"`
	Enabled           bool              `json:"enabled"`
	State             string            `json:"state"`
	PausedAt          *string           `json:"paused_at"`
	PausedReason      *string           `json:"paused_reason"`
	CreatedAt         string            `json:"created_at"`
	NextRunAt         *string           `json:"next_run_at"`
	LastRunAt         *string           `json:"last_run_at"`
	LastStatus        *string           `json:"last_status"`
	LastError         *string           `json:"last_error"`
	LastDeliveryError *string           `json:"last_delivery_error"`
	Script            *string           `json:"script"`
	NoAgent           bool              `json:"no_agent"`
	FailureStreak     int               `json:"failure_streak"`
	LastDispatch      *CronLastDispatch `json:"last_dispatch"`
	Model             *string           `json:"model"`
	Provider          *string           `json:"provider"`
	Continuity        bool              `json:"continuity"`
	Workdir           *string           `json:"workdir"`
	MonitorScript     *string           `json:"monitor_script"`
	MonitorURL        *string           `json:"monitor_url"`
}

type cronFile struct {
	Jobs []CronJob `json:"jobs"`
}

func cronJobsPath() string { return filepath.Join(hermesHome(), "cron", "jobs.json") }

// cronCommand is replaceable in tests.
var cronCommand = func(name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	// HERMES_HOME inherited from env; pass through explicitly when set.
	if h := os.Getenv("HERMES_HOME"); h != "" {
		cmd.Env = append(os.Environ(), "HERMES_HOME="+h)
	}
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errBuf.String())
		if msg != "" {
			return nil, fmt.Errorf("%s: %s", err.Error(), msg)
		}
		return nil, err
	}
	return out.Bytes(), nil
}

func decodeCronJobs(raw []byte) ([]CronJob, error) {
	var f cronFile
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil, err
	}
	if f.Jobs == nil {
		f.Jobs = []CronJob{}
	}
	return f.Jobs, nil
}

func ListCronJobs(all bool) ([]CronJob, error) {
	raw, err := os.ReadFile(cronJobsPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []CronJob{}, nil
		}
		return nil, err
	}
	jobs, err := decodeCronJobs(raw)
	if err != nil {
		return nil, err
	}
	if all {
		return jobs, nil
	}
	out := make([]CronJob, 0, len(jobs))
	for _, j := range jobs {
		if j.Enabled {
			out = append(out, j)
		}
	}
	return out, nil
}

func GetCronJob(id string) (*CronJob, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("job id required")
	}
	jobs, err := ListCronJobs(true)
	if err != nil {
		return nil, err
	}
	for i := range jobs {
		if jobs[i].ID == id {
			return &jobs[i], nil
		}
	}
	return nil, fmt.Errorf("job %q not found", id)
}

func validateCronID(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("job id required")
	}
	if strings.ContainsAny(id, " \t\n/\\") {
		return fmt.Errorf("invalid job id %q", id)
	}
	if len(id) > 64 {
		return fmt.Errorf("job id too long")
	}
	return nil
}

func PauseCronJob(id string) error {
	if err := validateCronID(id); err != nil {
		return err
	}
	_, err := cronCommand("hermes", "cron", "pause", id)
	return err
}

func ResumeCronJob(id string) error {
	if err := validateCronID(id); err != nil {
		return err
	}
	_, err := cronCommand("hermes", "cron", "resume", id)
	return err
}

func RunCronJob(id string) error {
	if err := validateCronID(id); err != nil {
		return err
	}
	_, err := cronCommand("hermes", "cron", "run", id)
	return err
}

func DeleteCronJob(id string) error {
	if err := validateCronID(id); err != nil {
		return err
	}
	_, err := cronCommand("hermes", "cron", "remove", id)
	return err
}

type CronCreateRequest struct {
	Name            string   `json:"name"`
	Schedule        string   `json:"schedule"`
	Prompt          string   `json:"prompt"`
	Deliver         string   `json:"deliver"`
	FailureDeliver  string   `json:"failure_deliver"`
	Skills          []string `json:"skills"`
	Script          string   `json:"script"`
	NoAgent         bool     `json:"no_agent"`
	Workdir         string   `json:"workdir"`
	Model           string   `json:"model"`
	Provider        string   `json:"provider"`
	ReasoningEffort string   `json:"reasoning_effort"`
	Continuity      bool     `json:"continuity"`
	MonitorScript   string   `json:"monitor_script"`
	MonitorURL      string   `json:"monitor_url"`
	Paused          bool     `json:"paused"`
	PausedReason    string   `json:"paused_reason"`
	Repeat          *int     `json:"repeat"`
}

type CronEditRequest struct {
	Name            *string  `json:"name"`
	Schedule        *string  `json:"schedule"`
	Prompt          *string  `json:"prompt"`
	Deliver         *string  `json:"deliver"`
	FailureDeliver  *string  `json:"failure_deliver"`
	Skills          []string `json:"skills"`
	ClearSkills     bool     `json:"clear_skills"`
	Script          *string  `json:"script"`
	NoAgent         *bool    `json:"no_agent"`
	Workdir         *string  `json:"workdir"`
	Model           *string  `json:"model"`
	Provider        *string  `json:"provider"`
	ReasoningEffort *string  `json:"reasoning_effort"`
	Continuity      *bool    `json:"continuity"`
	MonitorScript   *string  `json:"monitor_script"`
	MonitorURL      *string  `json:"monitor_url"`
}

func CreateCronJob(req CronCreateRequest) error {
	sched := strings.TrimSpace(req.Schedule)
	if sched == "" {
		return fmt.Errorf("schedule required")
	}
	args := []string{"cron", "create"}
	if strings.TrimSpace(req.Name) != "" {
		args = append(args, "--name", strings.TrimSpace(req.Name))
	}
	if strings.TrimSpace(req.Deliver) != "" {
		args = append(args, "--deliver", strings.TrimSpace(req.Deliver))
	}
	if strings.TrimSpace(req.FailureDeliver) != "" {
		args = append(args, "--failure-deliver", strings.TrimSpace(req.FailureDeliver))
	}
	for _, s := range req.Skills {
		if strings.TrimSpace(s) != "" {
			args = append(args, "--skill", strings.TrimSpace(s))
		}
	}
	if strings.TrimSpace(req.Script) != "" {
		args = append(args, "--script", strings.TrimSpace(req.Script))
	}
	if req.NoAgent {
		args = append(args, "--no-agent")
	}
	if strings.TrimSpace(req.Workdir) != "" {
		args = append(args, "--workdir", strings.TrimSpace(req.Workdir))
	}
	if strings.TrimSpace(req.Model) != "" {
		args = append(args, "--model", strings.TrimSpace(req.Model))
	}
	if strings.TrimSpace(req.Provider) != "" {
		args = append(args, "--provider", strings.TrimSpace(req.Provider))
	}
	if strings.TrimSpace(req.ReasoningEffort) != "" {
		args = append(args, "--reasoning-effort", strings.TrimSpace(req.ReasoningEffort))
	}
	if req.Continuity {
		args = append(args, "--continuity")
	}
	if strings.TrimSpace(req.MonitorScript) != "" {
		args = append(args, "--monitor-script", strings.TrimSpace(req.MonitorScript))
	}
	if strings.TrimSpace(req.MonitorURL) != "" {
		args = append(args, "--monitor-url", strings.TrimSpace(req.MonitorURL))
	}
	if req.Repeat != nil {
		args = append(args, "--repeat", fmt.Sprintf("%d", *req.Repeat))
	}
	if req.Paused {
		args = append(args, "--paused")
		if strings.TrimSpace(req.PausedReason) != "" {
			args = append(args, "--paused-reason", strings.TrimSpace(req.PausedReason))
		}
	}
	args = append(args, sched)
	if strings.TrimSpace(req.Prompt) != "" {
		args = append(args, strings.TrimSpace(req.Prompt))
	}
	_, err := cronCommand("hermes", args...)
	return err
}

func EditCronJob(id string, req CronEditRequest) error {
	if err := validateCronID(id); err != nil {
		return err
	}
	args := []string{"cron", "edit"}
	if req.Name != nil {
		args = append(args, "--name", *req.Name)
	}
	if req.Schedule != nil {
		args = append(args, "--schedule", *req.Schedule)
	}
	if req.Prompt != nil {
		args = append(args, "--prompt", *req.Prompt)
	}
	if req.Deliver != nil {
		args = append(args, "--deliver", *req.Deliver)
	}
	if req.FailureDeliver != nil {
		args = append(args, "--failure-deliver", *req.FailureDeliver)
	}
	if req.ClearSkills {
		args = append(args, "--clear-skills")
	} else if req.Skills != nil {
		for _, s := range req.Skills {
			if strings.TrimSpace(s) != "" {
				args = append(args, "--skill", strings.TrimSpace(s))
			}
		}
	}
	if req.Script != nil {
		args = append(args, "--script", *req.Script)
	}
	if req.NoAgent != nil {
		if *req.NoAgent {
			args = append(args, "--no-agent")
		} else {
			args = append(args, "--agent")
		}
	}
	if req.Workdir != nil {
		args = append(args, "--workdir", *req.Workdir)
	}
	if req.Model != nil {
		args = append(args, "--model", *req.Model)
	}
	if req.Provider != nil {
		args = append(args, "--provider", *req.Provider)
	}
	if req.ReasoningEffort != nil {
		args = append(args, "--reasoning-effort", *req.ReasoningEffort)
	}
	if req.Continuity != nil {
		if *req.Continuity {
			args = append(args, "--continuity")
		} else {
			args = append(args, "--no-continuity")
		}
	}
	if req.MonitorScript != nil {
		args = append(args, "--monitor-script", *req.MonitorScript)
	}
	if req.MonitorURL != nil {
		args = append(args, "--monitor-url", *req.MonitorURL)
	}
	args = append(args, id)
	_, err := cronCommand("hermes", args...)
	return err
}

type CronExecution struct {
	ID               string  `json:"id"`
	JobID            string  `json:"job_id"`
	Source           string  `json:"source"`
	Status           string  `json:"status"`
	ClaimedAt        string  `json:"claimed_at"`
	StartedAt        *string `json:"started_at"`
	FinishedAt       *string `json:"finished_at"`
	Error            *string `json:"error"`
	DeliveryOutcome  *string `json:"delivery_outcome"`
	ScheduledInstant *string `json:"scheduled_instant"`
}

func CronRuns(jobID string, limit int) ([]CronExecution, error) {
	if limit <= 0 || limit > 500 {
		limit = 20
	}
	args := []string{"cron", "runs", "--limit", fmt.Sprintf("%d", limit)}
	if strings.TrimSpace(jobID) != "" {
		if err := validateCronID(jobID); err != nil {
			return nil, err
		}
		args = append(args, jobID)
	}
	// hermes cron runs prints text table; use DB directly for structured data
	// Fallback: read executions.db via sqlite
	dbPath := filepath.Join(hermesHome(), "cron", "executions.db")
	return readCronExecutions(dbPath, jobID, limit)
}

func CronDoctor() (string, error) {
	out, err := cronCommand("hermes", "cron", "doctor")
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func CronStatus() (string, error) {
	out, err := cronCommand("hermes", "cron", "status")
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func readCronExecutions(dbPath, jobID string, limit int) ([]CronExecution, error) {
	// Use sqlite CLI via exec to avoid adding driver dependency.
	// If unavailable, return empty.
	if _, err := os.Stat(dbPath); err != nil {
		return []CronExecution{}, nil
	}
	query := fmt.Sprintf("SELECT id, job_id, source, status, claimed_at, started_at, finished_at, error, delivery_outcome, scheduled_instant FROM executions ORDER BY claimed_at DESC LIMIT %d", limit)
	if strings.TrimSpace(jobID) != "" {
		// quote jobID safely: validateCronID ensures no injection
		query = fmt.Sprintf("SELECT id, job_id, source, status, claimed_at, started_at, finished_at, error, delivery_outcome, scheduled_instant FROM executions WHERE job_id='%s' ORDER BY claimed_at DESC LIMIT %d", jobID, limit)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "sqlite3", "-json", dbPath, query)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return []CronExecution{}, nil
	}
	var rows []CronExecution
	if err := json.Unmarshal(out.Bytes(), &rows); err != nil {
		return []CronExecution{}, nil
	}
	if rows == nil {
		rows = []CronExecution{}
	}
	return rows, nil
}
