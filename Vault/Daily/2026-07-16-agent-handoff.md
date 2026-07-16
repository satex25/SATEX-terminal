---
type: agent-handoff
date: 2026-07-16
run-timestamp: 2026-07-16 02:01 CDT (operator-initiated interactive session — NOT the 05:00 nominal; scheduled tasks are currently DISABLED)
from: dawn session (Claude Fable 5), operator-directed
to: work-layer (Opus 4.8 / Fable 5, max effort) / next dawn planner
branch: master
head: 729b1ce
blueprint: apps/satex-terminal/docs/superpowers/specs/2026-07-16-dawn-workflow-v4-two-file-contract-ultraplan.md
status: P-106 two-file contract SHIPPED (mirrors v4.0 + installed tasks re-synced + ledger reconciled). Core tasks DONE; verification + next-pick REMAINING. Everything UNSTAGED.
---

# Agent Handoff — 2026-07-16 · FORMAT v4 (this file is your mission brief)

## §0 MISSION
Today's work was the workflow itself: the dawn/work-layer scheduled prompts (v3.1, 2026-07-04) predated the P-096–P-105 scar tissue and never stated the operator's actual two-file contract — ultraplan (~90% of effort) + handoff-as-mission-brief (~10%) for a max-effort finisher. Both prompts were reworked to v4.0, pushed into the installed tasks (zero drift by construction), and this file is the format's first specimen. Ledger P-106. Highest-leverage because every future unattended session inherits this contract; a better handoff format compounds daily.

## §1 WORLD STATE
- `master` @ `729b1ce`; P-101→P-105 all adopted/merged (CI green implied by the `main-protection` ruleset, P-095). No stale `.git` locks at boot. Node (sandbox) 22.22.3.
- UNSTAGED (this session): `docs/policy/scheduled-psd-daily.md` (v4.0, 15,138 B) · `docs/policy/scheduled-work-layer.md` (v4.0, 8,622 B) · `apps/satex-terminal/docs/superpowers/specs/2026-07-16-dawn-workflow-v4-two-file-contract-ultraplan.md` (new, 7,000 B) · `Vault/00-Audit/PROBLEM-LEDGER.md` (P-106 + reconciliation; /tmp backup taken) · this file.
- Untracked, inherited (pre-session, leave for operator): `.agents/`, `.codex/`, `2026-07-15-ADOPTION-RUNBOOK.md`, `Vault/00-Audit/2026-07-15-CONSTITUTION-V3.1-VERIFICATION.md`, `scripts/git-unlock.ps1`.
- Gates (docs/config-only diff): typecheck node exit 0 + web exit 0 (pre-work, in-mount); eslint/vitest scope unaffected (zero `src`/`tests` contact); knip CI-arbitrated (P-097).
- Environment scars active: P-099 (bash-mount writes for tracked files; byte-verify everything); 45s call ceiling; sandbox knip crash.

## §2 TASK LEDGER (blueprint Layer 3)
| ID | Action | Status | Evidence |
|---|---|---|---|
| T1 | Blueprint written to specs/ | DONE | 7,000 B, 0 NUL, 0 CRCR |
| T2 | Dawn mirror v4.0 | DONE | 15,138 B, byte-clean |
| T3 | Work-layer mirror v4.0 (bootloader) | DONE | 8,622 B, byte-clean |
| T4 | Installed tasks `satex-psd-daily` + `work-layer` updated | DONE | scheduler API ack, both; left `enabled: false` |
| T5 | This handoff (v4 specimen) | DONE | this file |
| T6 | Ledger: P-106 + P-101..P-105 reconciliation | DONE | 272,670 B, 0 NUL, anchors unique, P-106 ×1 |
| T7 | Byte-verify sweep + session report | DONE | all files clean (see §1) |
| R1 | Independent verification pass | REMAINING | spec in §3 |
| R2 | Next code pick per dawn §2 rules | REMAINING | spec in §3 |

## §3 REMAINING — inline specs (cold-start complete)
- **R1 — Verify the v4 contract artifacts independently.** Method: (1) python byte-scan the five §1 unstaged files for NUL/`\r\r` + intact tails; (2) diff each mirror body (text after the `---` following the header block) against the corresponding installed task prompt — read the task SKILL.md at `C:\Users\User\Documents\Claude\Scheduled\<taskId>\SKILL.md` if readable from your environment, else record UNKNOWN — VERIFICATION REQUIRES OPERATOR and move on; (3) confirm the ledger head shows P-106 above P-105 and `updated: 2026-07-16`. Validation: all scans 0 NUL / 0 CRCR; drift = none or explicitly UNKNOWN. Failure mode: drift found → re-sync mirror→task (mirror is the reviewed text), note in report.
- **R2 — Pick and execute the next code target per dawn §2.** This session consumed the doc layer; the tree carries no REMAINING code work. Apply PICK (a)→(d) from `docs/policy/scheduled-psd-daily.md` v4.0 §2 against the CURRENT ledger. Known candidates as of this writing (re-derive, don't trust): P-094's five non-perimeter untested services (re-read the P-094 entry for the list and its mixed disposition — `live-mode.ts` is perimeter, HARD SKIP); P-011 (DECIDED — inline TSX fontSize numbers bypassing the type scale; renderer-only). Run the full 7-layer ultraplan to specs/ before any edit; per-task gates; bash-mount writes.

## §4 BLOCKED
None repo-internal. (P-101/P-102 live-render and task re-enable are operator items — §5.)

## §5 APPROVAL NODES (operator only — never attempted)
- **A1:** Re-enable `satex-psd-daily` and `work-layer` scheduled tasks when you want the v4 pair live (both updated but still `enabled: false`; consider a manual "Run now" first to pre-approve tool permissions).
- **A2:** P-101 live-render check (Settings → Run Self-Eval Now → EDGE rows fit panel) and P-102 fade QA — both merged to master, held from VERIFIED pending these.
- **A3:** Review + commit this session's unstaged v4 files (docs/policy ×2, specs ×1, Vault ×2) — branch → PR per §2.2, or fold into the next housekeeping PR.

## §6 DIVERGENCES
- v3.1 §6's knip recipe (Node-20 version shim via `NODE_OPTIONS`) was the P-097 false-green class — REMOVED in v4.0, replaced with "CI is the arbiter, say so." The prompt itself was scar tissue.
- Nominal-time labels: this run fired 02:01 CDT, not 05:00 — recorded per timestamp discipline.
- **Caught same-session:** the first-cut v4 prompts repeated v3.1's claim that the ledger is untracked; `git status` + constitution §5.1 disproved it (ledger/audits ARE tracked; only runtime Vault data is not). Both mirrors AND both installed tasks corrected before close — zero drift preserved.
- `/ultraplan` skill (`~/.claude/skills/ultraplan/`) NOT edited this session — the v4 dawn prompt now carries the skill-evolution rule; first concrete protocol improvement should patch SKILL.md there (Cowork's plugin cache refreshes operator-side).

## §7 STRETCH (saturation work — after R1/R2)
- Byte-scan sweep: NUL/`\r\r` audit over all files modified in the last 3 master merges (P-099 canary habit).
- Coverage-gap grep: `src/**/**.ts` without companion `.test.ts`, ranked by import-degree; cross-check against P-094's survey; ledger real gaps only.
- Leak-class audit target: any `setInterval`/`new ResizeObserver`/`addEventListener` added since `e0fade5` without same-scope cleanup (PR #6/P-041/P-043/P-046/P-091 class).
- Drift check: `AGENTS.md` + `apps/satex-terminal/CLAUDE.md` vs v3.1 constitution facts (both should already agree post-P-103/P-104 — verify, don't assume).

## §8 CLOSE CONTRACT (work-layer, on YOUR close)
Ledger: flip P-106 evidence forward if R1 verifies clean (stays SHIPPED until the operator re-enables + first live v4 run); full PSD entries for any R2/stretch finds. CHANGELOG: only if R2 ships APP code (docs-only stays out). Report → `Vault/Daily/2026-07-16-work-layer.md` (or your real date), real timestamp, session-report format from your installed prompt. Everything UNSTAGED. Never mutate this handoff.
