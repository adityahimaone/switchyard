package kanban

import (
	"bytes"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type WorkspacePreview struct {
	Path      string `json:"path"`
	MIME      string `json:"mime"`
	Body      string `json:"body,omitempty"`
	Bytes     int    `json:"bytes"`
	Truncated bool   `json:"truncated,omitempty"`
	IsBinary  bool   `json:"is_binary,omitempty"`
}

func ListWorkspaceFiles(ws Workspace, path string, maxDepth, maxEntries int) ([]WorkspaceFile, error) {
	if maxDepth < 0 || maxDepth > 20 {
		return nil, fmt.Errorf("invalid depth")
	}
	if maxEntries <= 0 || maxEntries > 1000 {
		return nil, fmt.Errorf("invalid entry limit")
	}
	resolved, err := ResolveWorkspaceFile(ws, path)
	if err != nil {
		return nil, err
	}
	if resolved.Transport != "local" {
		return nil, fmt.Errorf("remote workspace requires node-agent")
	}
	info, err := os.Stat(resolved.LocalPath)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("path is not directory")
	}
	out := make([]WorkspaceFile, 0, maxEntries)
	err = filepath.Walk(resolved.LocalPath, func(name string, entry os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, _ := filepath.Rel(resolved.LocalPath, name)
		if rel == "." {
			return nil
		}
		depth := strings.Count(filepath.ToSlash(rel), "/")
		if depth > maxDepth {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if len(out) >= maxEntries {
			return filepath.SkipDir
		}
		out = append(out, WorkspaceFile{Name: entry.Name(), Path: filepath.ToSlash(rel), IsDir: entry.IsDir(), Size: entry.Size()})
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, err
}

func PreviewWorkspaceFile(ws Workspace, path string, maxBytes int) (WorkspacePreview, error) {
	if maxBytes <= 0 || maxBytes > 1<<20 {
		return WorkspacePreview{}, fmt.Errorf("invalid preview limit")
	}
	resolved, err := ResolveWorkspaceFile(ws, path)
	if err != nil {
		return WorkspacePreview{}, err
	}
	if resolved.Transport != "local" {
		return WorkspacePreview{Path: resolved.Path, MIME: "application/octet-stream"}, fmt.Errorf("remote workspace requires node-agent")
	}
	f, err := os.Open(resolved.LocalPath)
	if err != nil {
		return WorkspacePreview{}, err
	}
	defer f.Close()
	buf := make([]byte, maxBytes+1)
	n, err := f.Read(buf)
	if err != nil && n == 0 {
		return WorkspacePreview{}, err
	}
	data := buf[:n]
	p := WorkspacePreview{Path: resolved.Path, MIME: mime.TypeByExtension(filepath.Ext(resolved.Path)), Bytes: len(data)}
	if p.MIME == "" {
		p.MIME = http.DetectContentType(data)
	}
	if len(data) > maxBytes {
		p.Truncated = true
		data = data[:maxBytes]
	}
	p.Bytes = len(data)
	p.IsBinary = bytes.IndexByte(data, 0) >= 0 || !strings.HasPrefix(p.MIME, "text/") && p.MIME != "application/json"
	if !p.IsBinary {
		p.Body = string(data)
	}
	return p, nil
}

func DownloadWorkspaceFile(ws Workspace, path string) (WorkspaceFileResult, error) {
	resolved, err := ResolveWorkspaceFile(ws, path)
	if err != nil {
		return WorkspaceFileResult{}, err
	}
	if resolved.Transport != "local" {
		return resolved, fmt.Errorf("remote workspace requires node-agent")
	}
	info, err := os.Stat(resolved.LocalPath)
	if err != nil {
		return WorkspaceFileResult{}, err
	}
	if info.IsDir() {
		return WorkspaceFileResult{}, fmt.Errorf("path is directory")
	}
	return resolved, nil
}
