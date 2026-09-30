# Tooling

- Develops primarily on a Windows host. Expect Windows paths, PowerShell/cmd.exe
  semantics, and awareness of how the two differ (e.g. `&` chains commands in
  cmd but is PowerShell's job operator; `where` is not a reliable existence
  probe — `Get-Command` is). Confidence: 0.8
- The Windows dev machine has **no administrator rights**, so tools must be
  installed portably rather than via MSI. Working pattern: download the official
  zip, extract to `%LOCALAPPDATA%\Programs\<Tool>`, append `go\bin` to the
  user-level PATH via `[Environment]::SetEnvironmentVariable(..., "User")`.
  Confidence: 0.7
- Node/pnpm are supplied by Volta; Go was installed separately and is not
  Volta-managed. Expects missing toolchains to be installed as part of a setup
  task rather than treated as a blocker. Confidence: 0.6
- Stale persistent environment variables (user/machine scope) from previous
  installs are a recurring source of silent misbehaviour here. Check
  User/Machine/Process scopes before concluding a config file is wrong.
  Confidence: 0.65
- **WSL is available and is the way to exercise Linux-bound behaviour from this
  host.** `wsl -d Ubuntu -e bash -lc '...'` works, and the Windows tree is
  reachable at `/mnt/c/...`. Install Go there without sudo — download the
  tarball, `tar -C ~/sdk -xzf go.tgz`, prepend `~/sdk/go/bin` to PATH — because
  `sudo` silently stalls on an unattended password prompt. The WSL user
  (`adit`) differs from the Windows user, so tests asserting an absolute
  `/home/<name>/...` path fail for environmental reasons, not code ones.
  Confidence: 0.7
- When verifying formatting on a Windows checkout, `gofmt -l` flags nearly
  every file because of CRLF noise from checkout settings. Judge real formatting
  by content instead: run `gofmt -w` on the touched files and see whether git
  reports a substantive change. A copy-through-temp-file trick (`type f > f.tmp`)
  does not work — cmd's `type` re-adds CRLF. Confidence: 0.65