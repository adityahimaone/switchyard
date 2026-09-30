# Workflow

- **Read the project documentation before acting.** Explicitly instructed
  ("you must read the readme.md first") when requesting a setup. Start with
  README/docs, and treat the documented deployment path as the source of truth
  to be adapted rather than replaced. Confidence: 0.8
- Accepts a written plan (plan mode) for multi-step or environment-altering work
  before any edits are made; a plan with explicit decisions, risks and a
  verification section was approved without revision. Confidence: 0.6
- Values empirical verification over assertion: establish a clean baseline
  (`git stash -u`, reproduce failures, `git stash pop`) before claiming failures
  are pre-existing; re-run `go vet ./...` and `go test ./...` after each fix;
  finish with an end-to-end canary (create a task, confirm the artifact on
  disk, confirm the review/diff endpoint) rather than a build succeeding.
  Confidence: 0.6
- Cross-platform code needs genuine per-OS handling, not a guard: split
  platform-specific behaviour into `*_unix.go` / `*_windows.go` with build tags,
  and add a regression test that runs the real shell on the host rather than
  asserting on a string constant. Confidence: 0.6
- **Cross-compiling does not prove a platform still works — run its tests.**
  To prove the non-native platforms are intact, build + vet a `GOOS=linux` /
  `GOOS=darwin` matrix, then install the toolchain inside WSL and actually
  execute that platform's suite. Cross-compiling only proves it compiles; only a
  real run proves behaviour. Confidence: 0.7
- Verifies build-tag scoping rather than assuming it: check
  `go list -f '{{.TestGoFiles}}' ./pkg` under each `GOOS`, and grep for new
  identifiers that could collide. Helpers in an untagged `_test.go` file leak
  into every platform's test build. Confidence: 0.65
- Adds platform-neutral regression tests that run *everywhere* to lock in the
  shared behaviour — e.g. dialect selection keyed on the target workspace's OS
  (not the control plane's), and that the unchanged POSIX script keeps its exact
  fragments — rather than relying on the platform-specific test alone.
  Confidence: 0.65
- **Self-corrects earlier overstated claims explicitly.** When a prior report
  said N failures were pre-existing but only a few were spot-checked, the agent
  verified all of them and stated the correction plainly in the summary. Keep
  doing this: when better evidence arrives, revise the number and say so.
  Confidence: 0.6