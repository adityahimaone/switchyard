# Tooling

- Git Credential Manager ships with Git for Windows but is **not on PATH** (`Get-Command git-credential-manager` fails). Invoke it by full path:
  `& "C:\Program Files\Git\mingw64\bin\git-credential-manager.exe" <args>`
  Useful subcommands: `github list`, `github logout <account>`, `--version`. Confidence: 0.9
- GitHub account is `adityahimaone`. `gh` CLI is **not** installed on this machine, so it is not an alternative auth path. Confidence: 0.9
- Commit author identity is `aditya.himawan <aditya.himawan@fast-8.com>`, set in the global `.gitconfig`, and that is what `user.name` / `user.email` still report. Confidence: 0.9
- The author name/email is **intentionally different** from the GitHub handle `adityahimaone`. Offered an amend to align the author with the handle, the user chose to leave it. Don't propose rewriting commit authorship for cosmetic consistency. Confidence: 0.8
- The global `.gitconfig` has no `github` section, so `credential.helper=manager` picks whichever account GCM has cached — that account applies to **every** GitHub repo on the machine, not per-repo. Push failures with 403/`Permission denied` are usually an account mismatch here, not a repo or network problem. Confidence: 0.85
- Repos live under `C:/Development/<repo>`; use the `git -C <path>` form for git commands. Confidence: 0.85
- The default shell is Windows, not bash. `cd web; pnpm build` does not behave — pass `cwd` as a parameter to the shell command tool instead of chaining a `cd`. Confidence: 0.9
- Chaining multiple commands with `;` in one shell call corrupts argument parsing (it truncated `git rm -r --quiet <paths>` and the call failed). Run one command per call. Confidence: 0.85
- Heredocs do not work in this shell — `git commit -F - <<'EOF'` silently fails. Write the message to a file with the write tool, then `git commit -F <path>`. Confidence: 0.9
- Output redirection to `$TEMP` followed by `tail` produced no visible output. Pipe the full output and let the tool capture it. Confidence: 0.75
- PowerShell is available as its own tool and is the reliable way to verify a frontend change without a browser: `Invoke-WebRequest http://localhost:5173/src/index.css` then regex-match the served CSS for the tokens/utilities you added. This catches Tailwind/PostCSS compile failures that a clean typecheck misses. Confidence: 0.85
- `agent-browser` is **not** installed, so the browser skill cannot be used for visual verification. Verify compiled CSS and computed values instead; don't promise screenshots. Confidence: 0.85
- The Switchyard web app is pnpm + Vite + React 19, and `pnpm build` runs `tsc -b` first. `npx tsc -b --pretty false` is a fast intermediate typecheck gate to run before committing to a slow full build. Confidence: 0.8
- Commit messages carry a `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>` trailer. Confidence: 0.9
