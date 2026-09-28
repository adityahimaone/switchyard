package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// forbiddenTools are domain operations that must never be reachable from this
// MCP surface. Workspace save/delete feed unvalidated Host/Path into `sh -lc`
// and `ssh`; approval commits and pushes; bulk mutation is unvalidated.
var forbiddenTools = []string{
	"create_task", "update_task", "delete_task",
	"status_transition", "assign", "add_comment", "archive_task",
	"run_task", "retry_task", "stop_task", "clone_task", "release_task",
	"bulk_transition", "bulk_assign", "reorder_tasks",
	"approve", "import_board", "delete_board",
	"save_workspace", "delete_workspace",
	"delete_workspace_file", "rename_workspace_file", "upload_workspace_file",
	"clear_execution_history",
	"run_chat", "start_terminal", "dispatch_remote",
}

func TestToolSurfaceIsReadOnly(t *testing.T) {
	tools := readOnlyTools()
	for _, name := range forbiddenTools {
		if _, ok := tools[name]; ok {
			t.Fatalf("mutating tool %q is exposed over MCP", name)
		}
	}
	// Every exposed tool must have a description and a schema.
	for name := range tools {
		if handlerDesc(name) == "" {
			t.Fatalf("tool %q has no description", name)
		}
		if schema := handlerSchema(name); schema["type"] != "object" {
			t.Fatalf("tool %q has a non-object schema: %#v", name, schema)
		}
	}
}

func TestToolSpecsAreSortedAndUnique(t *testing.T) {
	srv := &server{tools: readOnlyTools()}
	specs := srv.toolSpecs()
	if len(specs) != len(readOnlyTools()) {
		t.Fatalf("spec count %d != handler count %d", len(specs), len(readOnlyTools()))
	}
	for i := 1; i < len(specs); i++ {
		if specs[i-1].Name >= specs[i].Name {
			t.Fatalf("tools not sorted/unique: %q then %q", specs[i-1].Name, specs[i].Name)
		}
	}
}

func TestHandleInitialize(t *testing.T) {
	srv := &server{tools: readOnlyTools()}
	resp, ok := srv.handle(context.Background(), &request{JSONRPC: "2.0", ID: json.RawMessage("1"), Method: "initialize"})
	if !ok || resp.Error != nil {
		t.Fatalf("initialize failed: %#v", resp)
	}
	info, _ := resp.Result.(map[string]any)
	if info["protocolVersion"] != protocolVersion {
		t.Fatalf("protocol version = %v", info["protocolVersion"])
	}
}

func TestHandleIgnoresNotifications(t *testing.T) {
	srv := &server{tools: readOnlyTools()}
	if _, ok := srv.handle(context.Background(), &request{JSONRPC: "2.0", Method: "notifications/initialized"}); ok {
		t.Fatal("notification should not produce a response")
	}
}

func TestHandleUnknownMethod(t *testing.T) {
	srv := &server{tools: readOnlyTools()}
	resp, ok := srv.handle(context.Background(), &request{JSONRPC: "2.0", ID: json.RawMessage("7"), Method: "resources/list"})
	if !ok || resp.Error == nil || resp.Error.Code != -32601 {
		t.Fatalf("expected method-not-found, got %#v", resp)
	}
}

func TestCallUnknownToolIsToolError(t *testing.T) {
	srv := &server{tools: readOnlyTools()}
	result := srv.call(context.Background(), json.RawMessage(`{"name":"create_task","arguments":{}}`))
	if result["isError"] != true {
		t.Fatalf("unknown tool should be a tool error: %#v", result)
	}
}

func TestCallReportsHandlerErrorWithoutKillingTheServer(t *testing.T) {
	srv := &server{tools: readOnlyTools()}
	// A missing board is an input error, surfaced as isError rather than a
	// protocol failure.
	result := srv.call(context.Background(), json.RawMessage(`{"name":"list_tasks","arguments":{}}`))
	if result["isError"] != true {
		t.Fatalf("expected a tool error for a missing board: %#v", result)
	}
	content, _ := result["content"].([]map[string]any)
	if len(content) == 0 || !strings.Contains(content[0]["text"].(string), "board") {
		t.Fatalf("error text should mention the missing field: %#v", content)
	}
}

func TestListTasksRejectsInvalidStatus(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	srv := &server{tools: readOnlyTools()}
	result := srv.call(context.Background(),
		json.RawMessage(`{"name":"list_tasks","arguments":{"board":"default","status":"not-a-status"}}`))
	if result["isError"] != true {
		t.Fatalf("invalid status should surface as an error: %#v", result)
	}
}

func TestCodegraphReportRequiresWorkspace(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	srv := &server{tools: readOnlyTools()}
	result := srv.call(context.Background(), json.RawMessage(`{"name":"codegraph_report","arguments":{}}`))
	if result["isError"] != true {
		t.Fatalf("missing workspace_id should be an error: %#v", result)
	}
}

func TestCodegraphReportUnknownWorkspace(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := os.MkdirAll(home, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "workspaces.json"), []byte("[]"), 0o600); err != nil {
		t.Fatal(err)
	}
	srv := &server{tools: readOnlyTools()}
	result := srv.call(context.Background(),
		json.RawMessage(`{"name":"codegraph_report","arguments":{"workspace_id":"nope"}}`))
	if result["isError"] != true {
		t.Fatalf("unknown workspace should be an error: %#v", result)
	}
}

func TestListMCPDoesNotLeakSecrets(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := os.MkdirAll(home, 0o700); err != nil {
		t.Fatal(err)
	}
	config := "mcp_servers:\n  github:\n    command: npx\n    env:\n      GITHUB_TOKEN: ghp_supersecret\n"
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte(config), 0o600); err != nil {
		t.Fatal(err)
	}
	srv := &server{tools: readOnlyTools()}
	result := srv.call(context.Background(), json.RawMessage(`{"name":"list_mcp_servers","arguments":{}}`))
	if result["isError"] == true {
		t.Fatalf("tool error: %#v", result)
	}
	content, _ := result["content"].([]map[string]any)
	if len(content) == 0 {
		t.Fatalf("no content: %#v", result)
	}
	if text := content[0]["text"].(string); strings.Contains(text, "ghp_supersecret") {
		t.Fatalf("secret leaked through the MCP server: %s", text)
	}
}

func TestArgCoercion(t *testing.T) {
	if got := argString(map[string]any{"k": "v"}, "k"); got != "v" {
		t.Fatalf("argString = %q", got)
	}
	if got := argString(map[string]any{"k": 3}, "k"); got != "" {
		t.Fatalf("non-string should coerce to empty, got %q", got)
	}
	if got := argInt(map[string]any{"k": float64(7)}, "k"); got != 7 {
		t.Fatalf("argInt = %d", got)
	}
	if got := argInt(map[string]any{}, "k"); got != 0 {
		t.Fatalf("missing arg should be 0, got %d", got)
	}
}
