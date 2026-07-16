# ULTRAPLAN — Dawn Workflow v4.0: the Two-File Contract (prompt rework + installed-task re-sync)

```
[DATE]      2026-07-16 (real run: 02:0x CDT, operator-initiated interactive session — NOT the 05:00 nominal slot)
[LEDGER]    P-106
[AUTHOR]    dawn session (Claude Fable 5), operator-directed
[STATUS]    EXECUTED SAME-SESSION (planner == executor for this doc-layer change)
```

## LAYER 1 — OBJECTIVE

Rework the daily scheduled-agent workflow so the dawn session's deliverable is an explicit
**two-file contract**: (1) the ULTRAPLAN blueprint (~90% of session effort) and (2) the HANDOFF
(~10%), where the handoff **is the work-layer's mission brief** — the work-layer's installed
prompt becomes a thin constitutional bootloader that ingests today's handoff as its instructions.
Both prompts re-grounded in post-P-096..P-105 reality (v3.1 constitution, P-099 write law,
P-097 knip law, 45s segmentation, bundle-handoff precedent) and re-synced three ways:
installed task text == versioned mirror == this blueprint's spec.

Success criteria (all measurable):
- `docs/policy/scheduled-psd-daily.md` rewritten to v4.0; byte-verified 0 NUL / 0 CRCR.
- `docs/policy/scheduled-work-layer.md` rewritten to v4.0 (bootloader form); byte-verified.
- Installed Cowork tasks `satex-psd-daily` + `work-layer` updated to the same v4.0 text
  (drift = zero by construction at ship time).
- `Vault/Daily/2026-07-16-agent-handoff.md` written IN the new v4 format (the format's first
  living specimen doubles as its own conformance test).
- Ledger: P-106 entry added; P-103/P-104/P-105 statuses reconciled to master @ 729b1ce.
- Gates: docs-only diff — typecheck node+web exit 0 (measured pre-work: both 0); lint/vitest
  scope untouched (no `src`/`tests` contact); knip CI-arbitrated (P-097).

Constraints in force: CONSTITUTION v3.1 §0.1–0.10, §2.9 write law (bash-mount writes for
tracked files, byte-verify everything), §2.3 PSD, §2.8 doc ownership (mirrors own the prompt
text; the installed task is what runs — P-085). No perimeter contact exists in this change
(markdown + scheduler config only). Assumption flagged: scheduled tasks are currently
DISABLED (`enabled: false` both) — updating their prompt text does not fire them; re-enabling
is the operator's call (APPROVAL NODE A1).

## LAYER 2 — DOMAIN MAP

Blast radius (all off-perimeter):
- `docs/policy/scheduled-psd-daily.md` — dawn prompt mirror (rewrite)
- `docs/policy/scheduled-work-layer.md` — work-layer prompt mirror (rewrite)
- Installed task prompts: `satex-psd-daily`, `work-layer` (Cowork scheduler config write)
- `Vault/Daily/2026-07-16-agent-handoff.md` — new file, v4 specimen
- `Vault/00-Audit/PROBLEM-LEDGER.md` — P-106 entry + status reconciliation (anchored python edits)
- `apps/satex-terminal/docs/superpowers/specs/2026-07-16-dawn-workflow-v4-two-file-contract-ultraplan.md` — this file
- OPTIONAL (deferred, see Layer 6): `~/.claude/skills/ultraplan/SKILL.md` — skill-evolution rule only documents the path this session; no skill edit shipped today.

RISK-TOUCH: none. No `src/`, no `tests/`, no engine, no IPC, no broker, no interlock.

## LAYER 3 — TASK TREE

- T1 Write this blueprint (specs/) — NEW file
- T2 Rewrite dawn mirror v4.0 (two-file contract, updated scars, handoff format spec)
- T3 Rewrite work-layer mirror v4.0 (bootloader form: handoff = mission brief; constitution outranks handoff)
- T4 Push both prompts into the installed scheduled tasks (update_scheduled_task × 2)
- T5 Write today's handoff in the v4 format (specimen + tomorrow's mission)
- T6 Ledger: P-106 full PSD entry; reconcile P-103/104/105 → VERIFIED (master @ 729b1ce);
     annotate P-101/P-102 as merged (live-render checks still pending → NOT VERIFIED)
- T7 Byte-verify every touched file (python NUL/CRCR scan + tail check); final session report

## LAYER 4 — DEPENDENCY DAG

T1 → T2 → T3 → (T4 ∥ T5) → T6 → T7. T4 depends on T2/T3 content being final.
APPROVAL NODE A1 (operator): re-enable the two scheduled tasks when ready — this session
updates their text but does NOT flip `enabled` (an unattended-agent design change should be
consciously armed by the operator, not silently activated at 2 AM).

## LAYER 5 — EXECUTION SPECS

- T2/T3 method: compose full replacement text in /tmp, `cp` over the mount file, byte-verify
  (`wc -c`, python NUL/CRCR scan, `tail -1`). Full-file replace (not anchored edit) is correct
  here: the rewrite is total and the files are small (<14 KB).
  Validation: verify script prints CLEAN for both; `git diff --stat` shows only the two files.
- T4 method: `update_scheduled_task(taskId, prompt=<mirror body>, description=<v4 line>)`.
  Validation: `list_scheduled_tasks` shows updated description; prompt round-trip checked by
  reading the task SKILL.md path if readable, else trust the API ack + note in handoff.
- T5 method: new-file write of the handoff per the v4 format spec in the dawn mirror §7.
  Validation: file exists, all 9 sections present, byte-clean.
- T6 method: python anchored edits — assert each `### P-1xx` status-line anchor is UNIQUE
  (count==1) before edit; new P-106 entry inserted directly under the `# Problem Ledger`
  intro block (flat, newest-first per P-092 reality). Frontmatter `updated:` → 2026-07-16.
  Validation: grep P-106 present; anchors count==1 each; byte-scan clean.
- T7 method: single python sweep over all touched paths; report real byte counts.

## LAYER 6 — RISK AUDIT (self-adversarial)

- Wrong-authority hazard: a handoff-as-prompt design could let a bad handoff instruct a
  perimeter breach. Mitigation (designed in): work-layer v4 states the handoff can NEVER
  widen authority — CONSTITUTION > AGENTS.md > installed prompt > handoff. A handoff
  instructing perimeter work is a defect to ledger, not an order to follow.
- Drift hazard (P-085 class): three copies now exist (2 mirrors + 2 installed tasks). Mitigated
  by T4 shipping both in the same session and both prompts carrying a three-way drift check at boot.
- Ledger-edit corruption (P-099 class): mitigated by python anchored edits + unique-anchor
  assertion + byte-verify + a pre-edit /tmp backup. DIVERGENCE CORRECTED MID-EXECUTION:
  this layer first claimed the ledger is untracked; `git status` + constitution §5.1 show
  it IS tracked (`git show HEAD:` restores committed state) — the /tmp backup still stands,
  protecting the uncommitted delta. The same false claim was purged from both v4 prompts
  and both installed tasks before close.
- Over-flip hazard: P-101/P-102 must NOT be flipped VERIFIED — merged ≠ live-render-checked.
  Only P-103/104/105 (docs/comment-only, CI-gated merge) qualify.
- Skill edit deferred: editing ~/.claude/skills/ultraplan this session would change Claude Code
  behavior immediately with no review; documenting the path + rule is enough today.
- Idempotency: re-run of this session re-reads the mirrors; full-file replace is idempotent.

## LAYER 7 — ASSEMBLED PLAN

Execute T1→T7 this session (planner == executor; the work-layer inherits only verification
+ any divergences via the handoff). Everything UNSTAGED for operator review. No commits, no
branch: docs/config-only change, operator adopts via normal review.
