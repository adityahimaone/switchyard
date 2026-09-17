package kanban

import "testing"

func TestChatWorkspacePinProjectTagPersistence(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("Initial title", "hermes", "default", "", "")
	if err != nil {
		t.Fatal(err)
	}
	pinned := true
	projectID := "proj_test"
	if _, err = UpdateChatSession(s.ID, nil, nil, nil, nil, nil, &pinned, &projectID); err != nil {
		t.Fatal(err)
	}
	got, err := GetChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Pinned || got.ProjectID != projectID {
		t.Fatalf("persist failed: %+v", got)
	}
	items, err := ListChatSessions(false, "", "1", projectID, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || !items[0].Pinned || items[0].ProjectID != projectID {
		t.Fatalf("filtered list=%+v", items)
	}
	unpin := false
	if _, err = UpdateChatSession(s.ID, nil, nil, nil, nil, nil, &unpin, nil); err != nil {
		t.Fatal(err)
	}
	got, err = GetChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Pinned {
		t.Fatalf("unpin failed: %+v", got)
	}
}

func TestChatWorkspaceTagsExtractOnTitleUpdate(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("No tags", "hermes", "default", "", "")
	if err != nil {
		t.Fatal(err)
	}
	title := "Ship #Api #api #Cleanup done"
	if _, err = UpdateChatSession(s.ID, &title, nil, nil, nil, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	got, err := GetChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Tags) != 2 || got.Tags[0] != "api" || got.Tags[1] != "cleanup" {
		t.Fatalf("tags=%v", got.Tags)
	}
	items, err := ListChatSessions(false, "", "", "", "API")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("tag filter miss: %+v", items)
	}
}

func TestChatWorkspaceProjectTagsAndSearch(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("Ship #API #api", "hermes", "default", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = CreateChatMessage(s.ID, "user", "find needle", ""); err != nil {
		t.Fatal(err)
	}
	items, err := ListChatSessions(false, "needle", "", "", "api")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || len(items[0].Tags) != 1 || items[0].Tags[0] != "api" {
		t.Fatalf("items=%+v", items)
	}
}

func TestChatProjectNamesAreCaseInsensitive(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if _, err := CreateChatProject("Agents", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateChatProject(" agents ", ""); err == nil {
		t.Fatal("duplicate project name accepted")
	}
}

func TestChatWorkspacePortabilityAndFork(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("Portable", "hermes", "default", "/tmp/workspace", "model")
	if err != nil {
		t.Fatal(err)
	}
	if err := SetHermesSessionID(s.ID, "external-secret"); err != nil {
		t.Fatal(err)
	}
	first, err := CreateChatMessage(s.ID, "user", "first", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = CreateChatMessage(s.ID, "assistant", "second", ""); err != nil {
		t.Fatal(err)
	}
	dup, err := DuplicateChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if dup.ID == s.ID {
		t.Fatal("duplicate reused session id")
	}
	dupMessages, err := ListChatMessages(dup.ID)
	if err != nil || len(dupMessages) != 2 {
		t.Fatalf("duplicate messages: %v %+v", err, dupMessages)
	}
	fork, err := ForkChatSession(s.ID, first.ID)
	if err != nil {
		t.Fatal(err)
	}
	forkMessages, err := ListChatMessages(fork.ID)
	if err != nil || len(forkMessages) != 1 {
		t.Fatalf("fork messages: %v %+v", err, forkMessages)
	}
	lineage, err := ChatLineageForSession(fork.ID)
	if err != nil || lineage.Source == nil || lineage.Source.SessionID != s.ID {
		t.Fatalf("lineage: %v %+v", err, lineage)
	}
	exported, err := ExportChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if exported.Session.HermesSessionID != "" {
		t.Fatal("external session leaked")
	}
	imported, err := ImportChatSession(*exported)
	if err != nil {
		t.Fatal(err)
	}
	if imported.ID == s.ID {
		t.Fatal("import reused session id")
	}
}

func TestNormalizeChatRunKind(t *testing.T) {
	if NormalizeChatRunKind("reasoning") != "reasoning" {
		t.Fatal("canonical kind changed")
	}
	if NormalizeChatRunKind("weird") != "unknown" {
		t.Fatal("unknown kind not normalized")
	}
}
