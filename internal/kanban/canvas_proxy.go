package kanban

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
	"os/exec"
	"strconv"
	"sync"
	"time"
)

// Canvas dev servers run on a worker and are reached through an SSH local
// forward (the same alias the codegraph/workspace features already use), or
// directly when the workspace is local. The browser never talks to the worker:
// it talks to /canvas-view/{id}/{token}/, which the control plane proxies.
//
// The token is an HMAC of the session id under a per-process secret, handed
// out only by the authenticated session API. The framed page is served from
// that path inside a sandboxed iframe (no allow-same-origin), so agent-written
// canvas code runs in an opaque origin and cannot read the board's cookie or
// call the board API.

var canvasSecret = func() []byte {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return b
}()

// CanvasViewToken returns the URL token authorising the proxy for a session.
func CanvasViewToken(id string) string {
	m := hmac.New(sha256.New, canvasSecret)
	m.Write([]byte(id))
	return hex.EncodeToString(m.Sum(nil))[:32]
}

// CanvasViewTokenValid is a constant-time check.
func CanvasViewTokenValid(id, token string) bool {
	return hmac.Equal([]byte(CanvasViewToken(id)), []byte(token))
}

// CanvasViewBase is the URL prefix a session is served under.
func CanvasViewBase(id string) string {
	return "/canvas-view/" + id + "/" + CanvasViewToken(id) + "/"
}

type canvasTunnel struct {
	cmd       *exec.Cmd
	localPort int
}

var (
	canvasTunnelMu sync.Mutex
	canvasTunnels  = map[string]*canvasTunnel{}
)

func isLocalHost(h string) bool { return h == "" || h == "localhost" || h == "127.0.0.1" }

func freeLocalPort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// CanvasUpstream returns host:port the proxy should dial for a running
// session, opening the SSH forward when the worker is remote.
func CanvasUpstream(s *CanvasSession) (string, error) {
	if s.Port == 0 {
		return "", fmt.Errorf("dev server has no port yet")
	}
	if isLocalHost(s.Host) {
		return net.JoinHostPort("127.0.0.1", strconv.Itoa(s.Port)), nil
	}
	canvasTunnelMu.Lock()
	defer canvasTunnelMu.Unlock()
	if t, ok := canvasTunnels[s.ID]; ok && t.cmd.ProcessState == nil {
		return net.JoinHostPort("127.0.0.1", strconv.Itoa(t.localPort)), nil
	}
	lp, err := freeLocalPort()
	if err != nil {
		return "", err
	}
	cmd := exec.Command("ssh", "-N",
		"-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-o", "ExitOnForwardFailure=yes",
		"-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
		"-L", fmt.Sprintf("127.0.0.1:%d:127.0.0.1:%d", lp, s.Port), s.Host)
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("ssh tunnel: %w", err)
	}
	go func() { _ = cmd.Wait() }()
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(lp))
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		if c, err := net.DialTimeout("tcp", addr, 300*time.Millisecond); err == nil {
			c.Close()
			canvasTunnels[s.ID] = &canvasTunnel{cmd: cmd, localPort: lp}
			return addr, nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	_ = cmd.Process.Kill()
	return "", fmt.Errorf("ssh tunnel to %s did not come up", s.Host)
}

func closeCanvasTunnel(id string) {
	canvasTunnelMu.Lock()
	defer canvasTunnelMu.Unlock()
	if t, ok := canvasTunnels[id]; ok {
		if t.cmd.Process != nil {
			_ = t.cmd.Process.Kill()
		}
		delete(canvasTunnels, id)
	}
}

// StartCanvasReaper stops idle dev servers on a timer until ctx is cancelled.
func StartCanvasReaper(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			ReapIdleCanvasServers(now)
		}
	}
}
