# Communication

- Writes short, informal, mixed-language messages (e.g. "cek why my github change to imamdevops can you change to user adityahimaone") — treats "cek" as "check". Interpret the intent and act; do not ask for clarification when the request is recoverable from context. Confidence: 0.8
- Phrases requests as "can you change X to Y" — expects the change to be made, not a menu of options. Lead with doing the work; ask only when a decision is genuinely the user's to make (irreversible, credential-, or scope-affecting). Confidence: 0.75
- When given the option to run a command themselves via the `!` prefix, the agent should be willing to hand over the exact command lines rather than force interactive logins through its own non-interactive shell. Confidence: 0.7
- Prefers summaries that state plainly: what was actually wrong (not the assumed cause), the fix applied, verification performed, and any remaining state. The corrective framing "your identity was never X — this is authentication, not identity" landed well. Confidence: 0.8
- Appreciates being told about side effects the user did not ask for (machine-wide credential impact, tool-owned files changing) in the final summary, with an offer to act on them. Confidence: 0.75
