# Preferences

- Prefers a **fully working end-to-end stack** over a partial one: declined the
  recommended "control plane only" scope in order to include the extra worker
  repo so tasks actually execute. Offer the minimal path, but expect the
  complete one. Confidence: 0.6
- Prefers self-contained, repo-local state: generated state (boards, auth,
  workspaces, tokens) belongs in a gitignored directory inside the repo, not in
  the real user profile, so it is easy to inspect and reset. Confidence: 0.55
- Prefers dev-mode run configurations (`go run` / dev server with hot reload,
  loopback ports) over production-like built binaries for local work. Keep
  documentation of the alternative, but make the dev path the default.
  Confidence: 0.55
- **Does not want pre-existing services torn down or "cleaned up."** Left a
  legacy scheduled task running even while it poll-errored and grew a ~9MB log,
  preferring reversible state. Anything that predates the task — scheduled
  tasks, installed binaries, user-level env vars — should be reported and left
  alone unless explicitly asked, with a documented stop command instead.
  Confidence: 0.65
- Gives terse, high-level instructions and expects the agent to drive the
  investigation to completion and report findings, rather than checking in at
  each step. Exceptions where checking in is welcome: irreversible actions and
  anything touching pre-existing machine state. Confidence: 0.55
- Prefers findings be surfaced plainly, including what was *not* verified and
  why (e.g. declining to test a commit step because it would have committed
  unrelated work), rather than a uniformly positive report. Confidence: 0.55
- **Treats cross-platform collateral damage as a required deliverable.** After
  platform-specific work, expects explicit confirmation that the *other*
  supported platforms are unbroken ("make sure all code its not broke the
  mac/linux code"). Developing on Windows against a product that also targets
  macOS/Linux is the standing shape of this work, so "did I break the other
  OSes?" is part of finishing the task, not an optional extra. Confidence: 0.75
- **Expects documentation to be complete for every supported platform**, not
  just the one being added. Specifically wants a section stating what did *not*
  change for the other platforms, per-file rationale, which tests guard the
  guarantee, and the commands to re-verify. Thin or platform-partial docs count
  as unfinished work. Confidence: 0.7
- Dislikes large incidental churn in a diff. Skip whole-repo reformatting (e.g.
  `gofmt -w` across the tree) when it would bury the real changes in whitespace
  noise; scope formatting fixes to the files actually touched. Confidence: 0.6