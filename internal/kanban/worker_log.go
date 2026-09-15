package kanban

import (
	"fmt"
	"os"
	"path/filepath"
)

const workerLogMaxBytes = 256 << 10

type WorkerLog struct {
	Text      string `json:"text"`
	Offset    int64  `json:"offset"`
	Modified  int64  `json:"modified"`
	Available bool   `json:"available"`
}

func WorkerLogTail(slug, taskID string, offset int64) (WorkerLog, error) {
	if taskID == "" || filepath.Base(taskID) != taskID {
		return WorkerLog{}, fmt.Errorf("invalid task id")
	}
	if offset < 0 {
		offset = 0
	}
	logDir := filepath.Join(boardDir(slug), "logs")
	if slug == "default" {
		logDir = filepath.Join(hermesHome(), "kanban", "logs")
	}
	path := filepath.Join(logDir, taskID+".log")
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return WorkerLog{}, nil
	}
	if err != nil {
		return WorkerLog{}, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return WorkerLog{}, err
	}
	if offset > info.Size() {
		offset = 0
	}
	if info.Size()-offset > workerLogMaxBytes {
		offset = info.Size() - workerLogMaxBytes
	}
	if _, err := file.Seek(offset, 0); err != nil {
		return WorkerLog{}, err
	}
	buf := make([]byte, info.Size()-offset)
	n, err := file.Read(buf)
	if err != nil {
		return WorkerLog{}, err
	}
	return WorkerLog{Text: string(buf[:n]), Offset: offset + int64(n), Modified: info.ModTime().Unix(), Available: true}, nil
}

func AppendWorkerLog(slug, taskID, chunk string) error {
	if taskID == "" || chunk == "" {
		return nil
	}
	if filepath.Base(taskID) != taskID {
		return fmt.Errorf("invalid task id")
	}
	logDir := filepath.Join(boardDir(slug), "logs")
	if slug == "default" {
		logDir = filepath.Join(hermesHome(), "kanban", "logs")
	}
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(logDir, taskID+".log")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString(chunk)
	return err
}
