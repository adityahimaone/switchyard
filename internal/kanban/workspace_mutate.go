package kanban

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func localMutationPath(ws Workspace, path string) (string, error) {
	resolved, err := ResolveWorkspaceFile(ws, path)
	if err != nil {
		return "", err
	}
	if resolved.Transport != "local" {
		return "", fmt.Errorf("remote workspace requires node-agent")
	}
	return resolved.LocalPath, nil
}

func ensureParent(path string) error { return os.MkdirAll(filepath.Dir(path), 0755) }

func CreateWorkspaceFile(ws Workspace, path, content string) error {
	resolved, err := ResolveWorkspaceFile(ws, path)
	if err != nil {
		return err
	}
	if resolved.Transport != "local" {
		return fmt.Errorf("remote workspace requires node-agent")
	}
	if err := ensureParent(resolved.LocalPath); err != nil {
		return err
	}
	f, err := os.OpenFile(resolved.LocalPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.WriteString(f, content)
	return err
}

func AtomicEditWorkspaceFile(ws Workspace, path, content string) error {
	target, err := localMutationPath(ws, path)
	if err != nil {
		return err
	}
	if err := ensureParent(target); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".workspace-edit-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err = io.WriteString(tmp, content); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, target)
}

func MkdirWorkspaceFile(ws Workspace, path string) error {
	target, err := localMutationPath(ws, path)
	if err != nil {
		return err
	}
	return os.Mkdir(target, 0755)
}

func RenameWorkspaceFile(ws Workspace, oldPath, newPath string) error {
	oldTarget, err := localMutationPath(ws, oldPath)
	if err != nil {
		return err
	}
	newTarget, err := localMutationPath(ws, newPath)
	if err != nil {
		return err
	}
	if err := ensureParent(newTarget); err != nil {
		return err
	}
	return os.Rename(oldTarget, newTarget)
}

func DeleteWorkspaceFile(ws Workspace, path string) error {
	target, err := localMutationPath(ws, path)
	if err != nil {
		return err
	}
	return os.RemoveAll(target)
}

func UploadWorkspaceFile(ws Workspace, path string, src io.Reader, maxBytes int64) error {
	if maxBytes <= 0 || maxBytes > 100<<20 {
		return fmt.Errorf("invalid upload limit")
	}
	target, err := localMutationPath(ws, path)
	if err != nil {
		return err
	}
	if err := ensureParent(target); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".workspace-upload-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	written, copyErr := io.Copy(tmp, io.LimitReader(src, maxBytes+1))
	if copyErr != nil {
		tmp.Close()
		return copyErr
	}
	if written > maxBytes {
		tmp.Close()
		return fmt.Errorf("upload exceeds size limit")
	}
	if err = tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, target)
}
