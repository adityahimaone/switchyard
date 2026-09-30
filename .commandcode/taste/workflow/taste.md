# Workflow

- Never ask the user to paste a PAT or token into the conversation. The accepted path is: remove the stale credential from GCM, then let the next `git push` trigger GCM's device/browser login, which authenticates the correct account with no secret ever entering the transcript. Confidence: 0.9
- Before touching shared or machine-wide state (e.g. logging an account out of Windows Credential Manager, which affects every repo on the box), state the blast radius explicitly and ask which approach to take. The user engaged with the options rather than dictating a method. Confidence: 0.8
- After a fix like an auth change, verify which identity actually authenticated (`git-credential-manager github list`, remote ref state) instead of treating a successful push as proof — a stale shared credential can make a push succeed as the wrong user. Confidence: 0.85
- When a fix has a scope the user didn't ask for (machine-wide effect, files changing that belong to agent internals), say so plainly in the summary even if the headline task succeeded. Confidence: 0.75
- For a large change, read every source doc, dispatch a thorough explore subagent for an inventory, then write one phased plan with a concrete "done when" gate per phase *before* touching code. Confidence: 0.85
- Establish the build + test baseline before the first edit and state the numbers, so a pre-existing failure is never mistaken for a regression later. Confidence: 0.9
- After plan approval: cut a feature branch, then execute phase by phase with a build+test gate and a separate commit per phase, so any break is attributable to one phase. Confidence: 0.85
- Never trust a subagent's "unused/dead code" verdict on its own — grep the import paths before deleting. In this session the explorer wrongly marked `components/agents/` and `TodoList` as dead when `ChatPage` imported both. Confidence: 0.9
- Use `git rm` for file and directory deletions so the removal is staged and visible in the diff. Confidence: 0.8
- When `edit_file` won't match inside a very large file (hundreds of lines), stop fighting the anchor: write a short Python splice script (locate start/end markers, replace the slice) into a repo-local `.scratch/` directory, run it, and gitignore `.scratch/` so the helper never lands in a commit. Confidence: 0.85
- After a botched edit, re-read the exact region before retrying. A near-miss `edit_file` that "succeeds" by matching a different line can delete an unrelated declaration silently. Confidence: 0.8
- During a long run, report short checkpoints — branch, commit count, what's done, what remains — so progress is visible without interrupting the work. Confidence: 0.8
