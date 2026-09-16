package kanban

import (
	"strings"
	"testing"
)

func TestEnsureAttachmentsSchema(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	db, err := ensureAttachmentsDB()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, tbl := range []string{"attachments", "task_attachments", "chat_message_attachments"} {
		if _, err := db.Exec("SELECT COUNT(*) FROM " + tbl); err != nil {
			t.Fatalf("missing table %s: %v", tbl, err)
		}
	}
}

func TestSniffAllowed(t *testing.T) {
	cases := []struct {
		data []byte
		mime string
		ok   bool
	}{
		{[]byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"), "image/png", true},
		// minimal JPEG header (FF D8 FF)
		{[]byte("\xff\xd8\xff\xe0\x00\x10JFIF"), "image/jpeg", true},
		// PDF header
		{[]byte("%PDF-1.4 fake pdf content"), "application/pdf", true},
		// SVG — blocked
		{[]byte("<svg xmlns='http://www.w3.org/2000/svg'><rect/>"), "", false},
		// exe — blocked
		{[]byte("MZ\x90\x00\x03\x00"), "", false},
	}
	for _, c := range cases {
		mime, ok := sniffAllow(c.data)
		if ok != c.ok || (c.ok && mime != c.mime) {
			t.Fatalf("sniffAllow => %q,%v want %q,%v (data prefix %q)", mime, ok, c.mime, c.ok, string(c.data[:minInt(len(c.data), 10)]))
		}
	}
}

func TestStoreDedupBySHA(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	// Use PNG header + payload so both calls pass and dedup by SHA.
	pngHeader := string([]byte("\x89PNG\r\n\x1a\nhello-bytes-png"))
	b, err := StoreAttachment(strings.NewReader(pngHeader), "b.png", int64(len(pngHeader)))
	if err != nil {
		t.Fatal(err)
	}
	c, err := StoreAttachment(strings.NewReader(pngHeader), "c.png", int64(len(pngHeader)))
	if err != nil {
		t.Fatal(err)
	}
	if b.ID != c.ID {
		t.Fatalf("expected dedup same ID, got %s vs %s", b.ID, c.ID)
	}
	if b.StorageProvider != "local" {
		t.Fatalf("expected local provider, got %q", b.StorageProvider)
	}
}

func TestStoreRejectsLargeAndUnsupported(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	// unsupported
	if _, err := StoreAttachment(strings.NewReader("MZ\x90\x00"), "bad.exe", 4); err == nil {
		t.Fatal("expected error for unsupported type")
	}
	// empty
	if _, err := StoreAttachment(strings.NewReader(""), "empty.png", 0); err == nil {
		t.Fatal("expected error for empty file")
	}
}

func TestLinkAndFetch(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	pngHeader := string([]byte("\x89PNG\r\n\x1a\nfetch-bytes"))
	a, err := StoreAttachment(strings.NewReader(pngHeader), "x.png", int64(len(pngHeader)))
	if err != nil {
		t.Fatal(err)
	}
	if err := LinkTaskAttachment("default", "t1", a.ID); err != nil {
		t.Fatal(err)
	}
	if err := LinkChatAttachment("m1", a.ID); err != nil {
		t.Fatal(err)
	}
	ts, err := ListTaskAttachments("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if len(ts) != 1 || ts[0].ID != a.ID {
		t.Fatalf("task attach mismatch %+v", ts)
	}
	ms, err := ListChatAttachments("m1")
	if err != nil {
		t.Fatal(err)
	}
	if len(ms) != 1 {
		t.Fatalf("chat attach mismatch %+v", ms)
	}
	data, err := ReadAttachment(a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != pngHeader {
		t.Fatalf("read back mismatch")
	}
}

func TestCapabilityGating(t *testing.T) {
	if CanAnalyze("gpt-4o", "image/png") != true {
		t.Fatal("gpt-4o should analyze png")
	}
	if CanAnalyze("text-model", "image/png") != false {
		t.Fatal("text model cannot analyze image")
	}
	if CanAnalyze("gpt-4o", "application/pdf") != true {
		t.Fatal("gpt-4o should analyze pdf")
	}
	if CanAnalyze("claude-3-5-sonnet-20241022", "image/jpeg") != true {
		t.Fatal("claude should analyze jpeg")
	}
	if CanAnalyze("", "image/png") != false {
		t.Fatal("empty model cannot analyze")
	}
}
