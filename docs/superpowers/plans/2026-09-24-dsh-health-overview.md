# DSH Health Overview — Implementation Plan

> **面向 AI 代理的工作者：** Required subskills: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Show DSH liveness (binary + profile config) per remote node in Kanban Overview.

**Architecture:** node-agent agent probes dsh on each node (`dsh --version` + `dsh --profile headless --dump-config`), caches result (TTL env `DSH_HEALTH_INTERVAL_SECONDS`, default 60), piggybacks result on heartbeat every 4th cycle. node-agent server stores `dsh_health` on Node; kanban-board VPS `/api/nodes` passthrough already exposes node fields; Overview NodeFleetCard renders per-node DSH sub-block. No new endpoints, no manual refresh button (cut for minimal).

**Tech stack:** Go (node-agent agent + server, kanban-board), React + TanStack Query (OverviewPage).

**Design doc:** `docs/superpowers/specs/2026-09-24-dsh-health-overview-design.md`

---

## File structure

- Create: `~/apps/node-agent/internal/heartbeat/dsh.go` — DSH probe + result struct + TTL cache
- Modify: `~/apps/node-agent/internal/heartbeat/registry.go` — add `DSHHealth` field to Node
- Modify: `~/apps/node-agent/internal/transport/transport.go` — add `DSHHealth` to HeartbeatRequest
- Modify: `~/apps/node-agent/cmd/agent/main.go` — probe loop, embed in heartbeat
- Modify: `~/apps/node-agent/cmd/server/main.go` — store DSHHealth on heartbeat/register
- Modify: `/home/adityahimaone/apps/kanban-board/internal/kanban/nodeagent.go` — add `DSHHealth` to NodeAgentStatus node struct
- Modify: `/home/adityahimaone/apps/kanban-board/web/src/features/overview/OverviewPage.tsx` — NodeFleetCard DSH sub-block
- Create: `~/apps/node-agent/internal/heartbeat/dsh_test.go` — unit tests

---

### 任务 1: DSH probe + cache (node-agent heartbeat pkg)

**文件：**
- 创建：`~/apps/node-agent/internal/heartbeat/dsh.go`
- 测试：`~/apps/node-agent/internal/heartbeat/dsh_test.go`

- [ ] **步骤 1: 编写失败的测试**

```go
package heartbeat

import (
	"testing"
	"time"
)

func TestDSHProbeParsesVersionAndModel(t *testing.T) {
	h, err := ProbeDSH("dsh", `
# == @deepseek-ai/dsh-base
- id: llm
  name: '@deepseek-ai/dsh-llm'
    provider: deepseek-official
    model: deepseek-flash
    apiKeyEnv: DEEPSEEK_API_KEY
`)
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	if !h.OK {
		t.Fatalf("ok = false, want true")
	}
	if h.Version == "" || h.Model != "deepseek-flash" || h.Provider != "deepseek-official" {
		t.Fatalf("got %+v", h)
	}
}

func TestDSHProbeMissingBinary(t *testing.T) {
	h, err := ProbeDSH("/nonexistent/dsh", "")
	if err == nil || h.Error == "" {
		t.Fatalf("want error for missing binary, got %+v err=%v", h, err)
	}
	if h.OK {
		t.Fatalf("ok = true for missing binary")
	}
}
```

- [ ] **步骤 2: 运行测试验证失败**

运行：`cd ~/apps/node-agent && go test ./internal/heartbeat/ -run TestDSH -v`
预期：FAIL, undefined `ProbeDSH`

- [ ] **步骤 3: 编写最少实现**

```go
package heartbeat

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

// DSHHealth is the DSH liveness result for one node.
type DSHHealth struct {
	OK        bool   `json:"ok"`
	Version   string `json:"version,omitempty"`
	Model     string `json:"model,omitempty"`
	Provider  string `json:"provider,omitempty"`
	Error     string `json:"error,omitempty"`
	CheckedAt int64  `json:"checked_at"`
}

var (
	modelRe    = regexp.MustCompile(`(?m)^\s+model:\s+(\S+)`)
	providerRe = regexp.MustCompile(`(?m)^\s+provider:\s+(\S+)`)
)

// ProbeDSH checks dsh binary + headless profile config. bin is the resolved
// dsh path; dumpOut is captured `--dump-config` output (empty when binary
// missing). No model call — config-level liveness only.
func ProbeDSH(bin, dumpOut string) (DSHHealth, error) {
	h := DSHHealth{CheckedAt: time.Now().Unix()}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "--version")
	// launchd PATH omits Homebrew; mirror dshCommandEnv.
	cmd.Env = append(os.Environ(), "PATH=/opt/homebrew/bin:/usr/local/bin:"+os.Getenv("PATH"))
	b, err := cmd.CombinedOutput()
	if err != nil {
		h.Error = "no_binary"
		return h, fmt.Errorf("dsh --version: %w", err)
	}
	h.Version = strings.TrimSpace(string(b))
	if dumpOut != "" {
		if m := modelRe.FindStringSubmatch(dumpOut); len(m) == 2 {
			h.Model = m[1]
		}
		if m := providerRe.FindStringSubmatch(dumpOut); len(m) == 2 {
			h.Provider = m[1]
		}
	}
	h.OK = true
	if h.Model == "" {
		h.Model = "unknown"
	}
	return h, nil
}

// DSHProbeCache caches probe results with TTL.
type DSHProbeCache struct {
	mu  sync.Mutex
	ttl time.Duration
	val DSHHealth
	at  time.Time
}

func NewDSHProbeCache(ttl time.Duration) *DSHProbeCache {
	if ttl <= 0 {
		ttl = 60 * time.Second
	}
	return &DSHProbeCache{ttl: ttl}
}

// Get returns cached value if fresh, else runs probe and caches.
func (c *DSHProbeCache) Get(bin string) DSHHealth {
	c.mu.Lock()
	defer c.mu.Unlock()
	if bin == "" || time.Since(c.at) < c.ttl {
		if bin != "" && c.at.IsZero() {
			// no cache yet — fall through and probe
		} else {
			return c.val
		}
	}
	h, _ := ProbeDSH(bin, dumpConfig(bin))
	c.val = h
	c.at = time.Now()
	return c.val
}

func dumpConfig(bin string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "--profile", "headless", "--dump-config")
	cmd.Env = append(os.Environ(), "PATH=/opt/homebrew/bin:/usr/local/bin:"+os.Getenv("PATH"))
	b, _ := cmd.CombinedOutput()
	return string(b)
}
```

- [ ] **步骤 4: 运行测试验证通过**

运行：`cd ~/apps/node-agent && go test ./internal/heartbeat/ -run TestDSH -v`
预期：PASS

- [ ] **步骤 5: Commit**

```bash
cd ~/apps/node-agent && git add internal/heartbeat/dsh.go internal/heartbeat/dsh_test.go && git commit -m "feat: dsh liveness probe + cache"
```

---

### 任务 2: 注册/心跳携带 DSHHealth (transport + registry)

**文件：**
- 修改：`~/apps/node-agent/internal/transport/transport.go`
- 修改：`~/apps/node-agent/internal/heartbeat/registry.go`

- [ ] **步骤 1: transport HeartbeatRequest + RegisterRequest 加字段**

```go
type HeartbeatRequest struct {
	NodeID   string     `json:"node_id"`
	Status   string     `json:"status"`
	DSHHealth *heartbeat.DSHHealth `json:"dsh_health,omitempty"`
}
```
import `"kanban-agent/internal/heartbeat"`（module path per go.mod）。RegisterRequest 同样加 `DSHHealth *heartbeat.DSHHealth json:"dsh_health,omitempty"`。

- [ ] **步骤 2: registry Node 加字段**

```go
DSHHealth *DSHHealth `json:"dsh_health,omitempty"`
```

- [ ] **步骤 3: server main store**

`cmd/server/main.go` register handler + heartbeat handler:
```go
reg.Upsert(&heartbeat.Node{NodeID: req.NodeID, ..., DSHHealth: req.DSHHealth})
// heartbeat:
if n, ok := reg.Get(id); ok {
	n.DSHHealth = req.DSHHealth
	reg.Upsert(n)
}
```

- [ ] **步骤 4: 测试构建**

运行：`cd ~/apps/node-agent && go build ./...`
预期：成功

- [ ] **步骤 5: Commit**

```bash
cd ~/apps/node-agent && git add internal/transport/transport.go internal/heartbeat/registry.go cmd/server/main.go && git commit -m "feat: carry dsh_health on register and heartbeat"
```

---

### 任务 3: agent probe loop + heartbeat 携带

**文件：**
- 修改：`~/apps/node-agent/cmd/agent/main.go`

- [ ] **步骤 1: probe cache初始化**

startMain 处（register 前后）：
```go
dshCache := heartbeat.NewDSHProbeCache(60 * time.Second)
dshBin := findBin("dsh")
```
interval env: `DSH_HEALTH_INTERVAL_SECONDS`（默认60）→ `time.Duration(secs)*time.Second`。

- [ ] **步骤 2: heartbeatLoop 携带**

```go
func heartbeatLoop(server, nodeID string, dshCache *heartbeat.DSHProbeCache, dshBin string) {
	cycle := 0
	for {
		time.Sleep(15 * time.Second)
		status := "idle"
		if atomic.LoadInt32(&busy) == 1 {
			status = "busy"
		}
		var h *heartbeat.DSHHealth
		if cycle%4 == 0 {
			v := dshCache.Get(dshBin)
			h = &v
		}
		cycle++
		_ = postJSON(server+"/api/nodes/"+nodeID+"/heartbeat", transport.HeartbeatRequest{NodeID: nodeID, Status: status, DSHHealth: h})
	}
}
```
调用处 `go heartbeatLoop(server, nodeID, dshCache, dshBin)`。register 也在开头带一次 DSHHealth。

- [ ] **步骤 3: 测试构建**

运行：`cd ~/apps/node-agent && go build ./... && go vet ./...`
预期：成功

- [ ] **步骤 4: Commit**

```bash
cd ~/apps/node-agent && git add cmd/agent/main.go && git commit -m "feat: probe dsh on agent heartbeat"
```

---

### 任务 4: VPS passthrough + Overview UI

**文件：**
- 修改：`/home/adityahimaone/apps/kanban-board/internal/kanban/nodeagent.go`
- 修改：`/home/adityahimaone/apps/kanban-board/web/src/features/overview/OverviewPage.tsx`

- [ ] **步骤 1: VPS node struct 加 DSHHealth**

```go
Nodes []struct {
	...
	DSHHealth *heartbeat.DSHHealth `json:"dsh_health,omitempty"` // import kanban-agent/internal/heartbeat — VPS module path? check go.mod; if different module, inline struct
}
```
VPS kanban-board 不 import node-agent module（不同 repo）。改成内联：
```go
DSHHealth *struct {
	OK        bool   `json:"ok"`
	Version   string `json:"version,omitempty"`
	Model     string `json:"model,omitempty"`
	Provider  string `json:"provider,omitempty"`
	Error     string `json:"error,omitempty"`
	CheckedAt int64  `json:"checked_at"`
} `json:"dsh_health,omitempty"`
```

- [ ] **步骤 2: Overview UI NodeFleetCard 加 DSH 行**

```tsx
{n.dsh_health && (
  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-mono">
    <span className={`size-1.5 rounded-full ${n.dsh_health.ok ? "bg-emerald-400" : "bg-rose-400"}`} />
    {n.dsh_health.ok
      ? `DSH live · v${n.dsh_health.version} · ${n.dsh_health.model}`
      : `DSH down · ${n.dsh_health.error}`}
  </div>
)}
```
NodeHealth interface 加 `dsh_health?: { ok: boolean; version?: string; model?: string; provider?: string; error?: string; checked_at?: number }`。

- [ ] **步骤 3: 前端 build**

运行：`cd /home/adityahimaone/apps/kanban-board/web && pnpm build`
预期：success

- [ ] **步骤 4: VPS 测试 + 构建**

运行：`cd /home/adityahimaone/apps/kanban-board && go test ./... && go vet ./... && go build -o bin/kanban-board ./cmd/server && git diff --check`
预期：全绿

- [ ] **步骤 5: Commit**

```bash
cd /home/adityahimaone/apps/kanban-board && git add internal/kanban/nodeagent.go web/src/features/overview/OverviewPage.tsx && git commit -m "feat: show dsh liveness in overview node fleet"
```

---

### 任务 5: Deploy 验证

- [ ] **步骤 1: node-agent 想 build Mac**

```bash
cd ~/apps/node-agent && GOOS=darwin GOARCH=arm64 go build -o dist/node-agent-darwin-arm64 ./cmd/agent
scp dist/node-agent-darwin-arm64 mac-tailscale:~/.hermes/bin/node-agent
ssh mac-tailscale 'launchctl kickstart -k gui/$(id -u)/com.hermes.nodeagent 2>/dev/null || pkill -f node-agent'
```

- [ ] **步骤 2: VPS kanban-board 想 build + restart（现 PM2 流程）**

```bash
cd /home/adityahimaone/apps/kanban-board/web && pnpm build
cd /home/adityahimaone/apps/kanban-board && go build -o bin/kanban-board ./cmd/server
pm2 restart kanban-board
```

- [ ] **步骤 3: live verify**

```bash
curl -s localhost:8790/api/nodes | jq '.nodes[] | {node_id, dsh_health}'
```
预期：mac node 有 `dsh_health.ok=true`，version=0.1.6-alpha.2（或当前），model/provider 非空。

- [ ] **步骤 4: push 两 repo**

```bash
cd ~/apps/node-agent && git push
cd /home/adityahimaone/apps/kanban-board && git push
```

---

## 自检

- 规格覆盖：binary+config probe (任务1), cache TTL (任务1), heartbeat 携带 (任务3), VPS passthrough (任务4), Overview 显示 (任务4), tests (任务1/4), deploy (任务5). ✓
- 无占位符。所有步骤含真实代码。✓
- 类型一致：DSHHealth across transport/heartbeat/VPS inline struct 字段名对齐 (ok/version/model/provider/error/checked_at). ✓
- 按用户"最小化/简单"砍掉：manual refresh button、new endpoint、model smoke、force param。✓