package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// TestNoRoutesLostDuringExtraction guards the mechanical refactor that split
// main() into per-resource registerXRoutes files.
//
// The failure this catches is silent and severe: a route dropped while moving
// code between files still compiles and still passes every other test, and the
// UI just 404s on one screen. The inventory below was captured before the
// split; any handler added or removed must update it deliberately.
//
// The routes are read from the source with go/ast rather than from a live
// ServeMux, because net/http exposes no way to enumerate registered patterns.
func TestNoRoutesLostDuringExtraction(t *testing.T) {
	got := routesRegisteredInSource(t)

	var missing, added []string
	for r := range expectedRoutes {
		if !got[r] {
			missing = append(missing, r)
		}
	}
	for r := range got {
		if _, ok := expectedRoutes[r]; !ok {
			added = append(added, r)
		}
	}
	sort.Strings(missing)
	sort.Strings(added)
	if len(missing) > 0 {
		t.Errorf("%d route(s) disappeared during extraction:\n  %s",
			len(missing), strings.Join(missing, "\n  "))
	}
	if len(added) > 0 {
		t.Errorf("%d route(s) added without updating expectedRoutes:\n  %s",
			len(added), strings.Join(added, "\n  "))
	}
	if t.Failed() {
		t.Log("If a route was intentionally added or removed, update expectedRoutes in this file.")
	}
}

// routesRegisteredInSource walks the package and returns every
// mux.HandleFunc("METHOD PATH", ...) literal, keyed "METHOD PATH".
func routesRegisteredInSource(t *testing.T) map[string]bool {
	t.Helper()
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", func(fi os.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go")
	}, 0)
	if err != nil {
		t.Fatalf("parse package: %v", err)
	}
	out := map[string]bool{}
	for _, pkg := range pkgs {
		for _, f := range pkg.Files {
			ast.Inspect(f, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || len(call.Args) == 0 {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || sel.Sel.Name != "HandleFunc" {
					return true
				}
				lit, ok := call.Args[0].(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					return true
				}
				pattern, err := strconv.Unquote(lit.Value)
				if err != nil {
					return true
				}
				out[pattern] = true
				return true
			})
		}
	}
	return out
}

// TestEveryRouteGroupIsWired proves main() still registers every route group.
// A registerXRoutes function that exists but is never called would leave its
// whole surface 404ing while every other test still passed.
func TestEveryRouteGroupIsWired(t *testing.T) {
	groups := []string{
		"registerAuthRoutes",
		"registerBoardsRoutes",
		"registerProfilesRoutes",
		"registerWorkspaceIdentityRoutes",
		"registerSettingsRoutes",
		"registerRuntimeRoutes",
		"registerOverviewRoutes",
		"registerCronRoutes",
		"registerKnowledgeRoutes",
		"registerEcosystemRoutes",
		"registerChatRoutes",
		"registerWorkspaceFileRoutes",
		"registerAttachmentRoutes",
	}
	src, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, g := range groups {
		if !strings.Contains(string(src), g+"(mux)") {
			t.Errorf("main.go never calls %s(mux); that group's routes are unreachable", g)
		}
	}
}

// TestMainGoIsSmall guards against the file regrowing into a monolith. The
// point of the split was that main() only wires things together.
func TestMainGoIsSmall(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(".", "main.go"))
	if err != nil {
		t.Fatal(err)
	}
	const limit = 500
	if n := strings.Count(string(raw), "\n"); n > limit {
		t.Errorf("main.go is %d lines, over the %d-line budget; extract another route group", n, limit)
	}
}

// expectedRoutes is the full API surface, captured from every non-test file in
// cmd/server at HEAD — that is, BEFORE the extraction split moved main()'s
// handlers into per-resource files.
//
// It is an independent baseline rather than a restatement of the current code,
// so it detects a route that went missing during the move. Regenerate with:
//
//	scripts/gen_route_inventory.sh
var expectedRoutes = map[string]bool{
	"DELETE /api/attachments/{id}":                                    true,
	"DELETE /api/boards/{slug}/tasks/{id}":                            true,
	"DELETE /api/boards/{slug}/tasks/{id}/attachments/{attId}":        true,
	"DELETE /api/boards/{slug}/tasks/{id}/dependencies/{dependsOnID}": true,
	"DELETE /api/chat/messages/{id}/attachments/{attId}":              true,
	"DELETE /api/chat/projects/{id}":                                  true,
	"DELETE /api/chat/sessions/{id}":                                  true,
	"DELETE /api/cron/jobs/{id}":                                      true,
	"DELETE /api/ecosystem/extensions/{id}":                           true,
	"DELETE /api/ecosystem/mcp/{id}":                                  true,
	"DELETE /api/profiles/{name}":                                     true,
	"DELETE /api/profiles/{name}/avatar":                              true,
	"DELETE /api/providers/{name}":                                    true,
	"DELETE /api/settings/execution-history":                          true,
	"DELETE /api/workspace/avatar":                                    true,
	"DELETE /api/workspaces/{id}":                                     true,
	"DELETE /api/workspaces/{id}/files":                               true,
	"GET /api/attachments/orphans":                                    true,
	"GET /api/attachments/{id}":                                       true,
	"GET /api/attachments/{id}/download":                              true,
	"GET /api/auth/status":                                            true,
	"GET /api/boards":                                                 true,
	"GET /api/boards/{slug}/export":                                   true,
	"GET /api/boards/{slug}/health":                                   true,
	"GET /api/boards/{slug}/leases":                                   true,
	"GET /api/boards/{slug}/tasks":                                    true,
	"GET /api/boards/{slug}/tasks/{id}/attachments":                   true,
	"GET /api/boards/{slug}/tasks/{id}/comments":                      true,
	"GET /api/boards/{slug}/tasks/{id}/dependencies":                  true,
	"GET /api/boards/{slug}/tasks/{id}/diff":                          true,
	"GET /api/boards/{slug}/tasks/{id}/events":                        true,
	"GET /api/boards/{slug}/tasks/{id}/health":                        true,
	"GET /api/boards/{slug}/tasks/{id}/runs":                          true,
	"GET /api/boards/{slug}/tasks/{id}/worker-log":                    true,
	"GET /api/chat/active":                                            true,
	"GET /api/chat/daemon-health":                                     true,
	"GET /api/chat/messages/{id}/attachments":                         true,
	"GET /api/chat/projects":                                          true,
	"GET /api/chat/runs/{id}":                                         true,
	"GET /api/chat/runs/{id}/events":                                  true,
	"GET /api/chat/sessions":                                          true,
	"GET /api/chat/sessions/{id}":                                     true,
	"GET /api/chat/sessions/{id}/active-run":                          true,
	"GET /api/chat/sessions/{id}/export":                              true,
	"GET /api/chat/sessions/{id}/lineage":                             true,
	"GET /api/chat/sessions/{id}/messages":                            true,
	"GET /api/chat/sessions/{id}/transcript":                          true,
	"GET /api/cron/doctor":                                            true,
	"GET /api/cron/jobs":                                              true,
	"GET /api/cron/jobs/{id}/runs":                                    true,
	"GET /api/cron/status":                                            true,
	"GET /api/ecosystem/extensions":                                   true,
	"GET /api/ecosystem/gateway":                                      true,
	"GET /api/ecosystem/mcp":                                          true,
	"GET /api/ecosystem/mcp/servers":                                  true,
	"GET /api/ecosystem/mcp/toolsets":                                 true,
	"GET /api/events/stream":                                          true,
	"GET /api/flow/active":                                            true,
	"GET /api/logs":                                                   true,
	"GET /api/memory":                                                 true,
	"GET /api/nodes":                                                  true,
	"GET /api/notifications":                                          true,
	"GET /api/overview":                                               true,
	"GET /api/overview/activity":                                      true,
	"GET /api/overview/queue-trend":                                   true,
	"GET /api/overview/review":                                        true,
	"GET /api/profiles":                                               true,
	"GET /api/profiles-full":                                          true,
	"GET /api/profiles/{name}":                                        true,
	"GET /api/profiles/{name}/avatar":                                 true,
	"GET /api/profiles/{profile}/memory/{scope}":                      true,
	"GET /api/profiles/{profile}/skills":                              true,
	"GET /api/profiles/{profile}/skills/{skill}":                      true,
	"GET /api/providers":                                              true,
	"GET /api/settings/attachment-analysis":                           true,
	"GET /api/settings/executors":                                     true,
	"GET /api/settings/jev":                                           true,
	"GET /api/skills":                                                 true,
	"GET /api/skills/content":                                         true,
	"GET /api/workspace":                                              true,
	"GET /api/workspace/avatar":                                       true,
	"GET /api/workspaces":                                             true,
	"GET /api/workspaces/{id}/codegraph":                              true,
	"GET /api/workspaces/{id}/codegraph/jobs/{jobID}":                 true,
	"GET /api/workspaces/{id}/files":                                  true,
	"GET /api/workspaces/{id}/files/download":                         true,
	"GET /api/workspaces/{id}/files/preview":                          true,
	"GET /api/workspaces/{id}/history":                                true,
	"GET /api/workspaces/{id}/logs":                                   true,
	"GET /api/workspaces/{id}/ping":                                   true,
	"PATCH /api/boards/{slug}":                                        true,
	"PATCH /api/boards/{slug}/tasks/{id}/assignee":                    true,
	"PATCH /api/boards/{slug}/tasks/{id}/status":                      true,
	"PATCH /api/chat/projects/{id}":                                   true,
	"PATCH /api/chat/sessions/{id}":                                   true,
	"PATCH /api/cron/jobs/{id}":                                       true,
	"POST /api/ai/improve-prompt":                                     true,
	"POST /api/attachments":                                           true,
	"POST /api/attachments/{id}/analyze":                              true,
	"POST /api/auth/login":                                            true,
	"POST /api/auth/logout":                                           true,
	"POST /api/auth/password":                                         true,
	"POST /api/boards":                                                true,
	"POST /api/boards/import":                                         true,
	"POST /api/boards/{slug}/tasks":                                   true,
	"POST /api/boards/{slug}/tasks/validate":                          true,
	"POST /api/boards/{slug}/tasks/bulk":                              true,
	"POST /api/boards/{slug}/tasks/reorder":                           true,
	"POST /api/boards/{slug}/tasks/{id}/approve":                      true,
	"POST /api/boards/{slug}/tasks/{id}/attachments":                  true,
	"POST /api/boards/{slug}/tasks/{id}/clone":                        true,
	"POST /api/boards/{slug}/tasks/{id}/comments":                     true,
	"POST /api/boards/{slug}/tasks/{id}/dependencies":                 true,
	"POST /api/boards/{slug}/tasks/{id}/gate":                         true,
	"POST /api/boards/{slug}/tasks/{id}/release":                      true,
	"POST /api/boards/{slug}/tasks/{id}/retry":                        true,
	"POST /api/boards/{slug}/tasks/{id}/run":                          true,
	"POST /api/boards/{slug}/tasks/{id}/start":                        true,
	"POST /api/boards/{slug}/tasks/{id}/stop":                         true,
	"POST /api/chat/messages/{id}/attachments":                        true,
	"POST /api/chat/projects":                                         true,
	"POST /api/chat/runs/{id}/retry":                                  true,
	"POST /api/chat/runs/{id}/stop":                                   true,
	"POST /api/chat/sessions":                                         true,
	"POST /api/chat/sessions/import":                                  true,
	"POST /api/chat/sessions/{id}/archive":                            true,
	"POST /api/chat/sessions/{id}/duplicate":                          true,
	"POST /api/chat/sessions/{id}/fork":                               true,
	"POST /api/chat/sessions/{id}/messages":                           true,
	"POST /api/chat/sessions/{id}/unarchive":                          true,
	"POST /api/cron/jobs":                                             true,
	"POST /api/cron/jobs/{id}/pause":                                  true,
	"POST /api/cron/jobs/{id}/resume":                                 true,
	"POST /api/cron/jobs/{id}/run":                                    true,
	"POST /api/ecosystem/extensions":                                  true,
	"POST /api/ecosystem/mcp":                                         true,
	"POST /api/ecosystem/mcp/{id}/test":                               true,
	"POST /api/flow/seed":                                             true,
	"POST /api/notifications/read-all":                                true,
	"POST /api/notifications/{id}/read":                               true,
	"POST /api/profiles":                                              true,
	"POST /api/profiles/{name}/activate":                              true,
	"POST /api/profiles/{name}/avatar":                                true,
	"POST /api/providers":                                             true,
	"POST /api/providers/{name}/models/discover":                      true,
	"POST /api/remote/dispatch":                                       true,
	"POST /api/workspace/avatar":                                      true,
	"POST /api/workspaces":                                            true,
	"POST /api/workspaces/ping":                                       true,
	"POST /api/workspaces/{id}/codegraph/index":                       true,
	"POST /api/workspaces/{id}/files/mkdir":                           true,
	"POST /api/workspaces/{id}/files/rename":                          true,
	"POST /api/workspaces/{id}/files/upload":                          true,
	"PUT /api/profiles/{name}":                                        true,
	"PUT /api/profiles/{name}/avatar-url":                             true,
	"PUT /api/profiles/{profile}/memory/{scope}":                      true,
	"PUT /api/profiles/{profile}/skills/{skill}":                      true,
	"PUT /api/providers/{name}":                                       true,
	"PUT /api/settings/attachment-analysis":                           true,
	"PUT /api/settings/executors":                                     true,
	"PUT /api/settings/jev":                                           true,
	"PUT /api/workspace":                                              true,
	"PUT /api/workspace/avatar-url":                                   true,
	"PUT /api/workspaces/{id}":                                        true,
	"PUT /api/workspaces/{id}/files/edit":                             true,
}
