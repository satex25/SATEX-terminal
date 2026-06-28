---
name: psd
description: Write a Problem-Solution-Decision entry to Vault/00-Audit/PROBLEM-LEDGER.md. Required by AGENTS.md §PSD before any undecided problem ships. Pass a brief description as $ARGUMENTS or omit to be prompted.
disable-model-invocation: true
---

Log a Problem-Solution-Decision entry to `Vault/00-Audit/PROBLEM-LEDGER.md`.

`$ARGUMENTS` may contain a brief problem description. If omitted, ask the user to describe the problem before continuing.

## Required fields

Every entry must contain:
- **Problem:** evidenced — include `file:line` if code-level, or a repro sequence if behavioral
- **Solutions:** at least two candidates, each with a stated trade-off
- **Decision:** which solution and why (use "pending operator" only if it genuinely requires a human call)
- **Status:** one of `OPEN` | `DECIDED` | `IN-PROGRESS` | `SHIPPED` | `VERIFIED`

## Steps

1. Read `Vault/00-Audit/PROBLEM-LEDGER.md` to find the highest existing `P-NNN` number.
2. Assign the next number.
3. Insert the new entry under `## Open` using this format:

```
### P-NNN · [Brief title]
- **Problem:** [Evidenced description, file:line or repro]
- **Solutions:** (a) [solution — trade-off]; (b) [solution — trade-off]
- **Decision:** **(a/b/…)** — [rationale]
- **Status:** OPEN | DECIDED | IN-PROGRESS | SHIPPED | VERIFIED
```

4. Update the `updated:` date in the frontmatter to today's date.
5. Confirm the entry was written by reading back the relevant section.
