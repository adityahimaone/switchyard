# Workflow

- Never ask the user to paste a PAT or token into the conversation. The accepted path is: remove the stale credential from GCM, then let the next `git push` trigger GCM's device/browser login, which authenticates the correct account with no secret ever entering the transcript. Confidence: 0.9
- Before touching shared or machine-wide state (e.g. logging an account out of Windows Credential Manager, which affects every repo on the box), state the blast radius explicitly and ask which approach to take. The user engaged with the options rather than dictating a method. Confidence: 0.8
- After a fix like an auth change, verify which identity actually authenticated (`git-credential-manager github list`, remote ref state) instead of treating a successful push as proof — a stale shared credential can make a push succeed as the wrong user. Confidence: 0.85
- When a fix has a scope the user didn't ask for (machine-wide effect, files changing that belong to agent internals), say so plainly in the summary even if the headline task succeeded. Confidence: 0.75
