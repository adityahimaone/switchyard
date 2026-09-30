//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

// detachProcessGroup puts the child in its own process group so a timeout kill
// or a signal reaches the whole tree (hermes spawns helpers of its own).
func detachProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
