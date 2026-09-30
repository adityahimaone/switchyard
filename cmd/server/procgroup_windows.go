//go:build windows

package main

import "os/exec"

// detachProcessGroup is a no-op on Windows: syscall.SysProcAttr has no
// Setpgid field there. Windows kills the child directly instead.
func detachProcessGroup(cmd *exec.Cmd) {}
