package kanban

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNodeAgentFileOpRejectsLocalWorkspace(t *testing.T) {
	_, err := ListNodeAgentFiles(Workspace{ID: "local", Path: "/tmp", Host: "localhost"}, ".", 1, 10)
	if err == nil {
		t.Fatal("local workspace sent to node-agent")
	}
}

func TestNodeAgentFileOpUsesBoundedJSONContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspace/files/list" || r.Method != http.MethodPost {
			http.Error(w, "wrong route", http.StatusNotFound)
			return
		}
		var req NodeFileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Workspace != "/Users/adit/project" || req.MaxEntries != 25 {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode([]WorkspaceFile{{Name: "main.go", Path: "main.go"}})
	}))
	defer server.Close()
	t.Setenv("KANBAN_NODE_AGENT", server.URL)
	files, err := ListNodeAgentFiles(Workspace{ID: "mac", Path: "/Users/adit/project", Host: "mac-tailscale"}, ".", 3, 25)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].Path != "main.go" {
		t.Fatalf("unexpected files: %+v", files)
	}
}
