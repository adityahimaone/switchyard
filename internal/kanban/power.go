package kanban

import (
	"bufio"
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

// Power control for worker nodes behind a smart plug / Wake-on-LAN relay.
//
// The board server runs on the always-on VPS, the only host that can reach the
// Tuya cloud and drive the LAN relay, so a power action shells out to a per-node
// script declared in ~/.hermes/kanban/power-targets.json. Nothing the caller
// sends is interpolated into a command: the node id selects a config entry and
// the action selects one of that entry's fixed script paths.

type PowerTarget struct {
	NodeID  string   `json:"node_id"`
	Label   string   `json:"label"`
	Actions []string `json:"actions"`
	// Hosts are the workspace SSH hosts (e.g. "windows-tailscale") this target
	// powers, so the Workspaces page can attach buttons to the right card.
	Hosts []string `json:"hosts,omitempty"`
}

type powerTargetCfg struct {
	NodeID string   `json:"node_id"`
	Label  string   `json:"label"`
	Hosts  []string `json:"hosts"`
	On     string   `json:"on"`
	Off    string   `json:"off"`
	Cycle  string   `json:"cycle"`
	Status string   `json:"status"`
}

type powerConfig struct {
	Targets []powerTargetCfg `json:"targets"`
}

func powerConfigPath() string {
	return filepath.Join(hermesHome(), "kanban", "power-targets.json")
}

func loadPowerConfig() (powerConfig, error) {
	var cfg powerConfig
	raw, err := os.ReadFile(powerConfigPath())
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil // no targets configured -> feature simply off
		}
		return cfg, err
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return cfg, fmt.Errorf("power-targets.json: %w", err)
	}
	return cfg, nil
}

// PowerTargets lists the nodes that expose power control, for the UI.
func PowerTargets() ([]PowerTarget, error) {
	cfg, err := loadPowerConfig()
	if err != nil {
		return nil, err
	}
	out := make([]PowerTarget, 0, len(cfg.Targets))
	for _, t := range cfg.Targets {
		var actions []string
		if t.On != "" {
			actions = append(actions, "on")
		}
		if t.Off != "" {
			actions = append(actions, "off")
		}
		if t.Cycle != "" {
			actions = append(actions, "cycle")
		}
		if t.Status != "" {
			actions = append(actions, "status")
		}
		if len(actions) == 0 {
			continue
		}
		out = append(out, PowerTarget{NodeID: t.NodeID, Label: t.Label, Actions: actions, Hosts: t.Hosts})
	}
	return out, nil
}

// powerTimeout bounds a power action. A cold WOL/plug boot polls SSH for up to
// ~180s, so the cycle path needs the long leash.
const powerTimeout = 240 * time.Second

// resolvePowerScript maps nodeID+action to the fixed script path from config.
func resolvePowerScript(nodeID, action string) (string, error) {
	cfg, err := loadPowerConfig()
	if err != nil {
		return "", err
	}
	var target *powerTargetCfg
	for i := range cfg.Targets {
		if cfg.Targets[i].NodeID == nodeID {
			target = &cfg.Targets[i]
			break
		}
	}
	if target == nil {
		return "", fmt.Errorf("no power control configured for node %q", nodeID)
	}
	var script string
	switch action {
	case "on":
		script = target.On
	case "off":
		script = target.Off
	case "cycle":
		script = target.Cycle
	case "status":
		script = target.Status
	default:
		return "", fmt.Errorf("unknown power action %q", action)
	}
	if script == "" {
		return "", fmt.Errorf("power action %q not configured for node %q", action, nodeID)
	}
	return expandHome(script), nil
}

// PowerAction runs the configured script for nodeID+action and returns its
// combined output.
func PowerAction(nodeID, action string) (string, error) {
	script, err := resolvePowerScript(nodeID, action)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), powerTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, script)
	cmd.Env = os.Environ()
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errBuf.String())
		if msg != "" {
			return out.String(), fmt.Errorf("%s: %s", err.Error(), msg)
		}
		return out.String(), err
	}
	return out.String(), nil
}

// PowerActionStream runs the configured script and calls onLine for every line
// of its combined stdout+stderr as it is produced, so a caller can relay a live
// boot log. It returns the terminal error, if any, once the script exits.
func PowerActionStream(ctx context.Context, nodeID, action string, onLine func(string)) error {
	script, err := resolvePowerScript(nodeID, action)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, powerTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, script)
	cmd.Env = os.Environ()

	pr, pw, err := os.Pipe()
	if err != nil {
		return err
	}
	cmd.Stdout = pw
	cmd.Stderr = pw
	if err := cmd.Start(); err != nil {
		pr.Close()
		pw.Close()
		return err
	}
	// Close our write end so the reader sees EOF when the child exits.
	pw.Close()

	sc := bufio.NewScanner(pr)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for sc.Scan() {
		onLine(sc.Text())
	}
	pr.Close()

	if err := cmd.Wait(); err != nil {
		return err
	}
	return nil
}

func expandHome(p string) string {
	if strings.HasPrefix(p, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, p[2:])
	}
	return p
}
