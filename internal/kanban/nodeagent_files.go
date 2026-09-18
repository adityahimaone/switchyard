package kanban

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type NodeFileRequest struct {
	Workspace  string `json:"workspace"`
	Path       string `json:"path"`
	Content    string `json:"content,omitempty"`
	MaxBytes   int    `json:"max_bytes,omitempty"`
	MaxDepth   int    `json:"max_depth,omitempty"`
	MaxEntries int    `json:"max_entries,omitempty"`
}

func nodeAgentFileOp(op string, ws Workspace, path string, body any) ([]byte, error) {
	if ws.Host == "" || ws.Host == "localhost" || ws.Host == "127.0.0.1" {
		return nil, fmt.Errorf("not a remote workspace")
	}
	c := &http.Client{Timeout: 30 * time.Second}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/api/workspace/%s", nodeAgentBase(), op)
	req, err := http.NewRequest("POST", url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if tok := nodeAgentToken(); tok != "" {
		req.Header.Set("X-Node-Agent-Token", tok)
	}
	resp, err := c.Do(req)
	if err != nil {
		return nil, fmt.Errorf("node-agent unreachable: %w", err)
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("node-agent %s %d: %s", op, resp.StatusCode, trimErrStr(string(out)))
	}
	return out, nil
}

func ListNodeAgentFiles(ws Workspace, path string, maxDepth, maxEntries int) ([]WorkspaceFile, error) {
	body := NodeFileRequest{Workspace: ws.Path, Path: path, MaxDepth: maxDepth, MaxEntries: maxEntries}
	raw, err := nodeAgentFileOp("files/list", ws, path, body)
	if err != nil {
		return nil, err
	}
	var files []WorkspaceFile
	if err := json.Unmarshal(raw, &files); err != nil {
		return nil, fmt.Errorf("bad response: %w", err)
	}
	return files, nil
}

func PreviewNodeAgentFile(ws Workspace, path string, maxBytes int) (*WorkspacePreview, error) {
	body := NodeFileRequest{Workspace: ws.Path, Path: path, MaxBytes: maxBytes}
	raw, err := nodeAgentFileOp("files/preview", ws, path, body)
	if err != nil {
		return nil, err
	}
	var prev WorkspacePreview
	if err := json.Unmarshal(raw, &prev); err != nil {
		return nil, fmt.Errorf("bad response: %w", err)
	}
	return &prev, nil
}

func DownloadNodeAgentFile(ws Workspace, path string) ([]byte, string, error) {
	body := NodeFileRequest{Workspace: ws.Path, Path: path}
	raw, err := nodeAgentFileOp("files/download", ws, path, body)
	if err != nil {
		return nil, "", err
	}
	// ponytail: assumes JSON envelope; upgrade to raw stream when node-agent supports it
	var envelope struct {
		Content  string `json:"content"`
		MIME     string `json:"mime"`
		Encoding string `json:"encoding"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, "", fmt.Errorf("bad response: %w", err)
	}
	return []byte(envelope.Content), envelope.MIME, nil
}

func EditNodeAgentFile(ws Workspace, path, content string) error {
	body := NodeFileRequest{Workspace: ws.Path, Path: path, Content: content}
	_, err := nodeAgentFileOp("files/edit", ws, path, body)
	return err
}

func UploadNodeAgentFile(ws Workspace, path string, data []byte) error {
	body := NodeFileRequest{Workspace: ws.Path, Path: path, Content: string(data)}
	_, err := nodeAgentFileOp("files/upload", ws, path, body)
	return err
}

func MkdirNodeAgent(ws Workspace, path string) error {
	body := NodeFileRequest{Workspace: ws.Path, Path: path}
	_, err := nodeAgentFileOp("files/mkdir", ws, path, body)
	return err
}

func RenameNodeAgentFile(ws Workspace, oldPath, newPath string) error {
	body := NodeFileRequest{Workspace: ws.Path, Path: oldPath, Content: newPath}
	_, err := nodeAgentFileOp("files/rename", ws, oldPath, body)
	return err
}

func DeleteNodeAgentFile(ws Workspace, path string) error {
	body := NodeFileRequest{Workspace: ws.Path, Path: path}
	_, err := nodeAgentFileOp("files/delete", ws, path, body)
	return err
}

func StartNodeAgentTerminal(ws Workspace, command string) (TerminalSession, error) {
	if ws.Host == "" || ws.Host == "localhost" || ws.Host == "127.0.0.1" {
		return TerminalSession{}, fmt.Errorf("not a remote workspace")
	}
	command = strings.TrimSpace(command)
	if command == "" {
		return TerminalSession{}, fmt.Errorf("command required")
	}
	body := map[string]string{"workspace": ws.Path, "command": command}
	raw, err := nodeAgentFileOp("terminal/start", ws, "", body)
	if err != nil {
		return TerminalSession{}, err
	}
	var result struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return TerminalSession{}, fmt.Errorf("bad response: %w", err)
	}
	return TerminalSession{SessionID: result.SessionID, Transport: "node-agent", Host: ws.Host}, nil
}
