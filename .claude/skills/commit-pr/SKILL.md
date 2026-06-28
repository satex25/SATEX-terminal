---
name: commit-pr
description: Full branch → commit → push → gh pr create workflow for SATEX. Enforces Conventional Commit format, Co-Authored-By trailer, all four gates before commit, and the exact merge/sync sequence from AGENTS.md. Pass a commit message as $ARGUMENTS or omit to be prompted.
disable-model-invocation: true
---

Execute the SATEX branch → PR flow from AGENTS.md. Do not skip steps.

`$ARGUMENTS` may contain a Conventional Commit message (e.g. `feat(chart): add volume spike indicator [P-007]`). If omitted, ask the user for it before proceeding.

## Pre-flight checks

1. **Confirm not on master.** Run `git branch --show-current`. If the result is `master`, STOP and tell the user to branch first — never commit directly to `master`.

2. **Run all four gates** from `00-PROJECT-ROOT/01-SATEX-CORE/satex-app/`:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run knip`

   Report real exit codes and counts for each. If any gate fails, STOP and report the actual error — do not proceed with the commit.

## Commit

3. Show `git status` and `git diff --stat` so the user can confirm what's staged. Ask the user to confirm or adjust staging before continuing.

4. Build the commit message:
   - First line: the Conventional Commit from `$ARGUMENTS` (format: `type(scope): description [P-NNN]`)
   - Blank line
   - `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` ← replace with the acting model if different

   Valid types: `feat`, `fix`, `chore`, `release`, `docs`, `refactor`, `test`

5. Run `git commit -m "$(cat <<'EOF'\n<message>\nEOF\n)"` with the full message. Report the commit hash.

## Push and PR

6. Run `git push -u origin <branch>` (this goes through the "ask" permission gate — wait for approval).

7. Run `gh pr create --title "<first-line-of-commit>" --body "$(cat <<'EOF'\n## Summary\n<bullet points from diff>\n\n## Test plan\n- [ ] All four gates pass (typecheck, lint, test, knip)\n- [ ] No trading-safety blast radius (OrderManager / risk-gates / kill-switch untouched — or flagged)\n\n🤖 Generated with Claude Code\nEOF\n)"`.

   Record the PR number from the output.

## Merge (only after CI is green)

8. Ask the user to confirm CI is green (`gh run list` shows all checks passing) before merging. Do not merge speculatively.

9. Once confirmed: `gh pr merge <PR-number> --merge`

10. Verify the merge: `git log --oneline origin/master | head -3` — confirm the commit hash from step 5 appears.

11. Sync local: `git checkout master && git pull --ff-only`

Report the final master HEAD SHA and confirm the branch's commit is an ancestor.
