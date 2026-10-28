package kanban

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// NodeModelEntry mirrors node-agent's ModelEntry.
type NodeModelEntry struct {
	Value    string `json:"value"`
	Label    string `json:"label"`
	Sublabel string `json:"sublabel,omitempty"`
	Badge    string `json:"badge,omitempty"`
	Provider string `json:"provider,omitempty"`
	Pinned   bool   `json:"pinned,omitempty"`
	// Disabled marks a model the running host can route but a card cannot
	// (missing adapter, missing credential on the worker). The picker shows it
	// and refuses it; Note carries the reason.
	Disabled bool   `json:"disabled,omitempty"`
	Note     string `json:"note,omitempty"`
}

// NodeModelCatalog is the node-agent answer to "which models can this executor
// run on the node that owns this workspace".
//
// Source says how much to trust it: "probed" came from the worker itself,
// "pending" means the worker has not reported this catalog yet, "unavailable"
// means no node could be resolved at all.
type NodeModelCatalog struct {
	Executor  string           `json:"executor"`
	Profile   string           `json:"profile,omitempty"`
	NodeID    string           `json:"node_id,omitempty"`
	Source    string           `json:"source,omitempty"`
	Detail    string           `json:"detail,omitempty"`
	FetchedAt int64            `json:"fetched_at,omitempty"`
	ETag      string           `json:"etag,omitempty"`
	Models    []NodeModelEntry `json:"models"`
}

// FetchNodeModels asks node-agent which models the node owning workspace can
// run. node-agent resolves the node exactly like dispatch does, so the picker
// and the worker cannot disagree about which profile or install is meant.
func FetchNodeModels(executor, profile, workspace string, refresh bool) (*NodeModelCatalog, error) {
	q := url.Values{}
	q.Set("executor", executor)
	if profile != "" {
		q.Set("profile", profile)
	}
	if workspace != "" {
		q.Set("workspace", workspace)
	}
	if refresh {
		q.Set("refresh", "1")
	}
	endpoint := nodeAgentBase() + "/api/models?" + q.Encode()

	c := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	if tok := nodeAgentToken(); tok != "" {
		req.Header.Set("X-Node-Agent-Token", tok)
	}
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))

	var cat NodeModelCatalog
	_ = json.Unmarshal(body, &cat)
	if resp.StatusCode != http.StatusOK {
		if strings.TrimSpace(cat.Detail) != "" {
			return nil, fmt.Errorf("%s", cat.Detail)
		}
		return nil, fmt.Errorf("node-agent /api/models: HTTP %d", resp.StatusCode)
	}
	if cat.Source == "" {
		cat.Source = "probed"
	}
	return &cat, nil
}
