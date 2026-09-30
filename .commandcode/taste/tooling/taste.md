# Tooling

- Git Credential Manager ships with Git for Windows but is **not on PATH** (`Get-Command git-credential-manager` fails). Invoke it by full path:
  `& "C:\Program Files\Git\mingw64\bin\git-credential-manager.exe" <args>`
  Useful subcommands: `github list`, `github logout <account>`, `--version`. Confidence: 0.9
- GitHub account is `adityahimaone`. `gh` CLI is **not** installed on this machine, so it is not an alternative auth path. Confidence: 0.9
- Commit author identity is `aditya.himawan <aditya.himawan@fast-8.com>`, set in the global `.gitconfig`, and that is what `user.name` / `user.email` still report. Confidence: 0.9
- The author name/email is **intentionally different** from the GitHub handle `adityahimaone`. Offered an amend to align the author with the handle, the user chose to leave it. Don't propose rewriting commit authorship for cosmetic consistency. Confidence: 0.8
- The global `.gitconfig` has no `github` section, so `credential.helper=manager` picks whichever account GCM has cached — that account applies to **every** GitHub repo on the machine, not per-repo. Push failures with 403/`Permission denied` are usually an account mismatch here, not a repo or network problem. Confidence: 0.85
- Repos live under `C:/Development/<repo>`; use the `git -C <path>` form for git commands. Confidence: 0.85
