---
type: agent-handoff
date: 2026-07-17
run-timestamp: 2026-07-17 20:43 CDT boot → ~22:15 CDT close (unattended scheduled fire, HEAVILY off the 05:00 nominal — evening run; consistent with this task's documented jitter history)
from: dawn planner (Claude Fable 5), unattended
to: work-layer (max effort) / next dawn planner / operator
branch: master
head: 4788d9c
blueprint: apps/satex-terminal/docs/superpowers/specs/2026-07-17-persistence-coverage-brain-null-upsert-ultraplan.md
status: P-094 final safe pick (persistence.ts, 42 tests) SHIPPED + NEW P-113 (brain NULL-PK upsert fix + dedup migration) SHIPPED. All blueprint tasks DONE. Everything UNSTAGED.
---

# Agent Handoff — 2026-07-17 · FORMAT v4 (this file is your mission brief)

## §0 MISSION
Close out P-094's last safe autonomous pick — characterization coverage for `persistence.ts`, the 13-table SQLite layer that is the terminal's entire durable memory — and ship the live defect the domain probe surfaced: `upsertBrainParam` could never replace a global (symbol:null) Brain param (SQLite composite-PK NULLs are pairwise distinct), so every `Brain.learn()` appended 8 fresh rows forever. Highest-leverage because it simultaneously finishes the P-094 coverage program (all four safe picks now shipped: 8+15+18+42 tests) and kills a real unbounded-growth defect on the learning loop's persistence path (P4 ladder relevance; P2 model-fidelity: the Brain restore path no longer depends on unspecified index-scan order).

## §1 WORLD STATE
- `master` @ `4788d9c`, tree was CLEAN at boot (operator adopted all 2026-07-16 work via PRs #46–49; P-111 merged and armed). No stale locks at boot; a phantom `.git/index.lock` EPERM warning appeared mid-session on one git read (P-099 signature, sandbox-mount-only per prior forensics — no git writes were attempted; operator side unaffected, `scripts/git-unlock.ps1` if local git ever wedges).
- UNSTAGED (this session, review inventory): `apps/satex-terminal/src/main/services/persistence.ts` (P-113 fix: delete-then-insert global upsert + migrate() dedup + 13-table header truth-fix; +54/−8) · `apps/satex-terminal/src/main/services/persistence.test.ts` (NEW, 42 tests, 25,278 B) · `apps/satex-terminal/CHANGELOG.md` (P-113 + P-094-persistence entries under first `### Fixed` in Unreleased; absolute tail byte-verified unchanged) · `Vault/00-Audit/PROBLEM-LEDGER.md` (NEW P-113 entry + P-094 update + `updated: 2026-07-17`; tail verified) · the blueprint (NEW, 8,125 B) · this file. Backups: `/tmp/satex-agent-CHANGELOG.md.bak`, `/tmp/satex-agent-PROBLEM-LEDGER.md.bak`.
- Pre-existing, inherited: `p112-ledger.bundle` at repo root — **NOT yet adopted**; the P-112 file-bridge-corruption ledger entry exists only in that bundle (branch `chore/p112-file-bridge-corruption-ledger` @ `b213dbc`), not in the working ledger. See §5 A1.
- Gates: BASELINE (pre-edit, in-mount): typecheck node exit 0 · web exit 0; full-suite floor = CI-green master @ 4788d9c (1753/134 per P-111 operator-hardware record). FINAL: scoped typecheck (changed-file graph) exit 0 · scoped eslint exit 0 (0 warnings; repo-version stack 10.4.0/8.59.3) · vitest `persistence.test.ts` 42/42 ×2 · knip + full tsc/eslint/vitest = CI arbiter.
- **ENVIRONMENT SCARS ACTIVE (worse than 2026-07-16 — read before running anything):**
  - The 45 s per-call ceiling is now BINDING on everything: full `tsc -p tsconfig.node.json` times out in-mount AND from a /tmp src copy (tried 3×, exit 124); in-mount vitest could not finish booting ONE test file (2× exit 124); in-mount scoped eslint timed out. The 2026-07-16 sessions ran these in-mount fine — treat per-call budget as ~40 s of real work, and build /tmp harnesses with LOCAL node_modules for anything heavier (this session's recipe: `/tmp/satex-agent-p113` = vitest@2.1.9 + better-sqlite3@11.10.0 local install + md5-verified source copies; `/tmp/satex-agent-lint` = repo-version eslint stack; both still on disk tonight, but NEVER trust /tmp from a prior session — rebuild).
  - Background processes DIE with the bash call (setsid+nohup tested and confirmed dead) — no long-run escape hatch.
  - `rm` on the mount is blocked (`Operation not permitted`) — file deletion requires the Cowork allow-file-delete grant; plan scratch files accordingly (prefix `satex-agent-`, put them in /tmp not the tree).
  - better-sqlite3 on the mount is a Windows build (`invalid ELF header` under Linux Node 22.22.3) — the persistence suite CANNOT run in-mount; it runs via the local-install harness (works: Linux prebuild downloads fine from npm) or on CI/operator hardware. The committed suite documents `SATEX_TEST_BETTER_SQLITE3` for this.
- Node (sandbox) 22.22.3; `package-lock.json` md5 `c6c32fa16eb9ac3701f8f14b706580c0` (unchanged, verified).

## §2 TASK LEDGER (blueprint Layer 3)
| ID | Action | Status | Evidence |
|---|---|---|---|
| T1 | Blueprint written to specs/ | DONE | 8,125 B, 0 NUL, 0 CRCR, tail intact |
| T2 | /tmp harness (local vitest + Linux better-sqlite3 + md5-verified sources) | DONE | persistence.ts + logger.ts md5 MATCH vs mount; sqlite 11.10.0 probe OK |
| T3 | 42-test characterization suite; defect proven red pre-fix | DONE | pre-fix: 4 fail (2 = P-113 pins red as designed; 2 = pins corrected to measured subject behavior: trim keeps keep+1, WAL sidecar removed on close) |
| T4 | P-113 fix in /tmp subject; suite green | DONE | 42/42, run twice (3.96 s / 3.5 s) |
| T5 | Apply to mount: persistence.ts (anchored python edits) + test file (new) | DONE | byte-verify: 43,912 B / 25,278 B, 0 NUL, 0 CRCR, tails intact, md5 == /tmp artifacts; `git diff --stat` = 1 file +54/−8 |
| T6 | Gates | DONE | see §1 FINAL line; CI named arbiter for full runs |
| T7 | CHANGELOG (2 entries, first `### Fixed` under Unreleased) | DONE | 126,413 B, 0 NUL, placement verified above depth-feed entry, absolute tail == backup |
| T8 | Ledger: NEW P-113 (full PSD) + P-094 update + frontmatter date | DONE | 310,370 B, 0 NUL, P-113 ×1, tail == backup |
| T9 | This handoff + session report | DONE | this file |
| T10 | Scratch cleanup (2 probe files from the require/rm experiments) | DONE | tree grep empty; git status shows only the intended inventory |

## §3 REMAINING
None from this blueprint — all tasks DONE. Next work should be picked fresh per dawn §2 against the CURRENT ledger (see §7 for saturation targets).

## §4 BLOCKED
None repo-internal. (In-sandbox full-gate runs are environment-blocked per §1 — CI is the arbiter, not a repo blocker.)

## §5 APPROVAL NODES (operator only — never attempted)
- **A1 — adopt `p112-ledger.bundle`** (repo root, branch `chore/p112-file-bridge-corruption-ledger` @ `b213dbc`): the P-112 corruption-event ledger entry lives ONLY there. Note it predates 4 master merges — expect a trivial ledger-prepend rebase. Until adopted, the working ledger has a numbering hole at P-112 (P-113 was claimed this session per next-free-number law; the ledger head notes nothing for P-112 — do not reuse the number).
- **A2 — review the P-113 dedup migration before merging this session's diff**: `migrate()` now deletes legacy duplicate `(key, NULL)` brain rows (keeps newest per key, idempotent, logs rowsDeleted). It is behavior-preserving by construction and regression-pinned, but it is a data-touching migration on your live DB — eyeball it (persistence.ts, the block above `log.info('sqlite schema migrated')`).
- **A3 — commit this session's unstaged inventory** (§1) via branch → PR per §2.2. Suggested branch: `fix/p113-brain-null-upsert-persistence-coverage`. CI will arbitrate the full gate bar (knip natively green on your Node 24 per P-111 precedent).
- **A4 (carried)** — P-101 live-render check + P-102 fade QA on operator hardware, still pending from 2026-07-13.

## §6 DIVERGENCES
- Blueprint L5 planned "atomic replace" for the mount write; mount denies unlink/rename, so T5 used full-content in-place write from the /tmp-verified artifact + immediate byte-verify (md5 + NUL + tail). Recorded here as the working pattern; blueprint's validation contract was met.
- The suite's first cut mischaracterized two subject behaviors (trim off-by-one; WAL sidecar deletion on close) — corrected to PIN measured reality with loud comments rather than "fixing" the subject (taste calls on whether trim's keep+1 deserves a code change are operator territory; it is one extra 250/500 ms bucket, harmless).
- 2026-07-16 handoff's NEXT expected `persistence.ts` to "warrant its own session" — confirmed accurate; this session consumed its full budget on it plus the P-113 find.

## §7 STRETCH (saturation work for a fast finisher)
- **Ledger status sweep:** P-111's own entry still reads "PR pending merge / awaiting operator arm" while P-110's closure note + git log (`9167f53` merged #47) show it LANDED — a dated reconciliation update flipping P-111 to VERIFIED (with the merge SHA as evidence) is clean, mechanical, and overdue. Same pass: P-101/P-100 "awaiting sign-off" lines vs their merged/live reality.
- **P-107 follow-up (2)** — ledger event-1 deep-restore splice (ordering judgment was deferred to "operator or next session"; recipe with exact `git show` commands is in the P-107 entry). Follow-up (1) CHANGELOG graft remains DEFERRED-operator per the upgraded recipe.
- **Audit target:** `Brain.initialize()` (brain.ts:63-74) — post-P-113 the duplicate-rows hazard dies, but the loader still applies `sampleSize >= SAMPLE_FLOOR` per-row with last-write-wins; a characterization suite for brain.ts (176 LOC-ish, off-perimeter, no existing test) is a natural next coverage pick — survey first, confirm off-perimeter, own blueprint.
- **Defect-class hunt:** other composite-PK-with-NULLable-column upserts — `pattern_weights` PK (feature, regime) both NOT NULL ✅ checked clean this session; sweep any future `INSERT OR REPLACE` sites for the NULL-PK class (grep `INSERT OR REPLACE` + cross-check PK nullability).
- **Env fact to re-verify next session:** whether the 45 s wall regression persists (if yes, consider proposing a ledger entry to make the /tmp-local-harness recipe the DOCUMENTED default for sandbox gate work, superseding the in-mount recipe).

## §8 CLOSE CONTRACT (work-layer, on YOUR close)
Ledger: any new finds as full PSD entries (next free number: P-114 — P-112 is reserved by the unadopted bundle, A1); flip P-113/P-094 evidence forward only with new measurement. CHANGELOG: only for shipped APP code. Report → `Vault/Daily/2026-07-17-work-layer.md` (or your real date), real timestamp, session-report format. Everything UNSTAGED. Never mutate this handoff.
