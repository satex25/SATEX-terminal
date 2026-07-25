# SATEX-RS — THE RUST ENGINE REWRITE
## ULTRAPLAN — 7-LAYER STRUCTURED COGNITIVE DECOMPOSITION

```
[PLAN ID]        RS-UP-1
[VERSION]        1.0.1 — ADOPTED 2026-07-24 (operator ratification on record, ledger P-135)
[EFFECTIVE]      2026-07-22 (all measurements taken this date unless cited otherwise)
[GOVERNED BY]    CONSTITUTION.md v3.1 — every clause of it binds every task below
[LEDGER CLAIM]   P-135 (re-verified at adoption 2026-07-24: ledger head was P-134, not the
                 authored P-129 → the projected P-130 claim number was stale; honesty axiom)
[ADOPTION HOME]  docs/plans/2026-07-22-satex-rs-rewrite-ultraplan.md (this file — adopted
                 2026-07-24; authored outside the repo per standing no-touch instruction)
[BASELINE REF]   master @ e145dd5 (authored, 2026-07-22); re-measured at adoption 2026-07-24:
                 master @ d5d0922 — 5 intervening commits (P-131 docblock · P-094 VERIFIED
                 flip · P-132 gitignore · P-133 test wave ×2), none touch the ported engine
                 surface
[CLASSIFICATION] PRODUCTION FINANCIAL SOFTWARE — LIVE-CAPITAL PATH PRESENT
[AUDIENCE]       AI agents (any vendor, any generation) + the operator
[REVIEW]         Every milestone exit (M0–M5) or 90 days, whichever first
```

**One-sentence mission:** Re-implement the SATEX Electron main-process engine as a Rust
core under Tauri 2, keep the existing web renderer, prove equivalence subsystem-by-
subsystem against golden recordings and locked baselines, and flip shells exactly once —
with zero loss of scar tissue, zero autonomous perimeter contact, and the TypeScript
terminal shippable every single day until the flip.

**The honesty axiom applies to this plan.** Every factual claim below was measured on
2026-07-22 against `master @ e145dd5` or cites its source. Where this plan and the code
disagree, the code is the truth and this plan has a bug — ledger it, fix the plan, never
the story. This plan already corrects constitution v3.1 drift it found during its own
verification pass (Layer 2.1). Expect the same to happen to this document; that is the
system working.

---

# LAYER 0 — THE AGENT CONTRACT

*This layer binds every intelligence that executes any task in this plan. It is not
advisory. An agent that has not internalized Layer 0 must not claim a task.*

## 0.A Read order (mandatory, before first task claim)

1. `CONSTITUTION.md` (v3.1) — supreme; this plan operates entirely inside it
2. Root `AGENTS.md` — gates, branch flow, PSD loop
3. **This plan** — end to end, not just your task
4. `ARCHITECTURE.md` + `apps/satex-terminal/CLAUDE.md` — the system being ported
5. `Vault/00-Audit/PROBLEM-LEDGER.md` — live state; your task may already be claimed

## 0.B The Ten Rewrite Laws (RS-L1 … RS-L10)

Each extends a Prime Directive into rewrite-specific form. Same enforcement, same rank.

| # | LAW | EXTENDS |
|---|---|---|
| RS-L1 | **Port behavior, not intentions.** The TS code as it exists — bugs-in-amber included, unless separately ledgered and operator-approved — is the specification. "The TS version probably meant to…" is fabrication. | 0.1 |
| RS-L2 | **The rewrite never trades.** No task in this plan places, cancels, or modifies any order anywhere, paper or live, ever. Broker integration is tested against recorded fixtures; the single paper-account smoke test is operator-run (RS-7.8). | 0.2 |
| RS-L3 | **Perimeter ports are human-gated, one PR each.** Every Phase-8 task and both ⚠️-adjacent Phase-9 tasks require an explicit operator in the loop before merge — reviews, not notifications. | 0.3 |
| RS-L4 | **Parity is measured, never asserted.** "Matches the TS engine" is a claim only the parity harness may make, via a drift report with zero divergences over the named corpus. "Compiles and looks right" is not parity. | 0.4 |
| RS-L5 | **The TS repo outranks every document about it** — including this plan, the constitution's snapshot tables, and any pasted brief. Verify at `file:line` before porting. | 0.5 |
| RS-L6 | **Two gate bars now exist; both are floors.** TS four-gate bar unchanged for anything touching `apps/satex-terminal`; Rust six-gate bar (Appendix F) for anything touching `apps/satex-engine-rs`. A gate you cannot run in your environment is a gate you name, with CI as arbiter — never a gate you fake (P-097 law extends to every cargo wrapper). | 0.6 |
| RS-L7 | **Additive trunk development.** Short-lived branches off `master`, PR, CI green, rebase/squash merge, verify SHA. The Rust workspace merges to `master` early and often as an unshipped sibling package. No long-lived rewrite branch. No direct pushes. Bundle handoff when the environment cannot push (§2.2/§2.9 precedent). | 0.7 |
| RS-L8 | **Capability ≠ permission, rewrite edition.** Finding a cleaner design than the TS code is not permission to ship it in the port commit. Improvement proposals go to the ledger as separate PSD entries and ship as separate, separately-reviewed changes *after* parity is banked. | 0.8 |
| RS-L9 | **Credentials and update feed are supply chain.** Keyring/DPAPI only, no plaintext ever; updater pinned to `satex25/SATEX-terminal` with consent flags test-pinned (P-091/P-103 law carries over verbatim). | 0.9 |
| RS-L10 | **Every divergence is a ledger entry.** A parity drift, a TS nondeterminism, a spec ambiguity, a WebView2 rendering delta — the moment it is seen, it is written down. An unrecorded divergence is a lost divergence. | 0.10 |

## 0.C Claim protocol (the P-090 lesson, enforced)

1. Read the ledger head. If your intended task ID (RS-x.y) appears in any OPEN /
   IN-PROGRESS entry, it is claimed — pick another or continue that entry's work.
2. Claim by ledger entry: next free P-number, referencing this plan + task ID
   (`P-1xx: RS-UP-1 / RS-3.2 ReplaySource port — claimed, in progress`).
3. One task ID per claim. Batch tasks (e.g. RS-2.9) may be claimed whole.
4. Close claims with evidence: gate output, parity report reference, commit SHA, PR #.

## 0.D Forbidden actions (absolute, in addition to constitution §2.4)

- Modifying, deleting, or "reorganizing" **any** existing TS engine source. TS-side
  changes permitted by this plan are exactly three, all additive: the golden-capture
  driver (RS-1.3), the generated-types consumption point (RS-9.3), and CI workflow
  additions (RS-0.4). Anything else TS-side = separate ledger entry + operator ruling.
- Editing recorded golden files or locked baselines to make a parity run pass.
  Goldens change only via regeneration (RS-1.3 procedure) with operator review.
- Changing the GitHub `main-protection` ruleset or required checks (operator-only).
- Adding a crate dependency without a Decision-register justification (D-012 budget).
- `unsafe` code anywhere in the workspace (`#![forbid(unsafe_code)]`, no exceptions
  without an operator-signed ledger entry).
- Declaring any milestone exit (Layer 7) — milestone exits are operator ceremonies.
- Running the arming ceremony, the paper-account smoke, or any order-capable binary
  against real credentials. Agents test against fixtures; operators test against paper.

## 0.E Session liturgy for this plan

Boot: constitution §2.10 boot + read this plan's Layer 3 for your task's dependency
state + verify `git log --oneline -3` against the ledger's last recorded SHA.
Close: constitution §2.10 close + update the Scar-Tissue Port Ledger (Appendix B.4) if
your task ported any pinned regression + leave the parity report path in your ledger
close. A session ending with unmeasured parity claims is a failed session.

## 0.F Environment realities

Constitution §2.9 applies unchanged (bash-mount writes for tracked files, byte-verify,
~45 s call ceiling, stale-lock hazards, bundle handoff). Rust additions: sandbox
toolchain availability is **UNKNOWN — VERIFY** per environment (`cargo --version`
before claiming a build task; if absent, rustup install or name CI as arbiter). Segment
`cargo test` per-crate under the call ceiling exactly as vitest is segmented. `cargo
build` cold times may exceed the ceiling — use `cargo check` locally, CI for full
builds. Windows is the truth platform: Ubuntu CI jobs are speed, the `windows-latest`
job is the arbiter (D-016).

---

# LAYER 1 — OBJECTIVE CRYSTALLIZATION

## 1.1 Prime objective

Replace the Electron/Node main process — the TradingEngine orchestrator, its services,
the intelligence stack, persistence, broker plane, IPC surface, and safety perimeter —
with a Rust core running under Tauri 2, while the existing web renderer (React 19,
Zustand 5, lightweight-charts v5, custom WebGL, Black Box design system) carries over
behind the already-existing `window.satex` seam (measured: `src/preload/index.ts:288`,
`contextBridge.exposeInMainWorld('satex', satexApi)`).

## 1.2 Success definition — measurable, binary, operator-verifiable

The rewrite is DONE when every one of these is true and evidenced:

1. **Full-engine replay parity:** zero divergences at Oracle Levels 1 and 2 (Appendix
   A.3) across the complete golden corpus (≥ 20 recorded sessions + adversarial set).
2. **Backtest parity:** Rust backtest output matches TS goldens for every locked
   baseline in `Vault/Backtests/baselines/` under the Appendix B tolerance policy
   (decisions exact; floats bit-exact or root-caused-and-ledgered).
3. **Scar-tissue completeness:** the Scar-Tissue Port Ledger (B.4) shows every in-scope
   P-0xx/P-1xx regression pin mapped to a passing Rust test or an operator-approved
   N/A ruling. No unmapped rows.
4. **Perimeter parity + sign-off:** all Phase-8 ports merged via the Appendix D
   protocol, each with its operator signature on record; adversarial review (RS-8.8)
   closed with zero unresolved findings.
5. **Shadow soak:** ≥ 10 consecutive trading days of dual-terminal paper operation
   (RS-10.2) with zero decision divergences and zero Rust-side incidents of severity
   ≥ "degraded feed unsurfaced."
6. **Shell completeness:** WebView2 checklist (RS-9.7) fully green including the four
   WebGL layers and the p50 ≤ 16 ms perf canary; kill chord reachable in every UI
   state including boot intro (P-044/P-098 laws re-proven in Tauri).
7. **Both gate bars green in CI on `master`**, Windows job included, on the cutover
   candidate SHA.
8. **Cutover ceremony:** operator executes the Layer 7.4 GO/NO-GO checklist and flips.
   The flip is one release, reversible per the rollback policy (7.5).

## 1.3 Non-goals (out of scope — attempting these inside this plan is a violation)

- No UI redesign, no renderer rewrite, no React Compiler enablement (D-015 separate
  track), no new features, no strategy/tactic changes, no risk-limit changes.
- No behavior "fixes" during porting (RS-L8 — ledger them, ship separately).
- No macOS target. Ever (constitution §2.4).
- No second broker (L1.G stays on its own ladder rung; the trait design merely leaves
  the door open).
- No autonomy expansion of any kind. The autonomy boundary table (§3.7) is untouched.

## 1.4 Constraints inherited (non-negotiable)

Constitution v3.1 in full; the program ladder (§1.4) continues on the TS terminal
uninterrupted — this plan must never block L1.D work; `master` protected by the
`main-protection` ruleset; PSD loop for every problem; dependency minimalism carried
into the crate budget (D-012); the Authenticode cert blocker applies to the Tauri
installer exactly as it does to the Electron one (same CSR, same HANDOFF.md workflow).

## 1.5 Strategy decision D-001 — how two engines coexist (PSD form)

**PROBLEM:** A live-capital terminal cannot big-bang swap engines, but Tauri and
Electron are different shells — a file-by-file runtime strangler would require
embedding Rust in Electron via FFI.

**SOLUTION A — Runtime hybrid (napi-rs in Electron):** port subsystems into the
shipping Electron app behind feature flags. *Trade-offs:* real production traffic per
subsystem (+); adds an FFI boundary that is itself a defect class, doubles build
complexity, contaminates the TS engine with rewrite risk during the rewrite (−−).

**SOLUTION B — Separate repo/fork:** maximum isolation. *Trade-offs:* simple mental
model (+); severs shared history, duplicates vault + baselines, drifts, parity harness
straddles two repos (−−). Rejected in conversation 2026-07-22.

**SOLUTION C — Validation strangler (chosen):** both engines live in one repo; the
Rust engine grows additively as `apps/satex-engine-rs`, validated headlessly per
subsystem by a golden-file oracle; the shipping app remains pure Electron/TS until one
audited flip. Dual-run happens at the *terminal* level (shadow soak, RS-10.2), not via
FFI. *Trade-offs:* zero rewrite risk leaks into the shipping engine, one history, one
oracle, one flip to audit (+++); no per-subsystem production exposure before the flip —
mitigated by replay campaigns + shadow soak (−, accepted).

**DECISION:** Solution C. Worktree layout: `mc4/` stays on `master`; second worktree
(default `../mc4-rust`) hosts in-flight branches. Ratify paths at D-014.

---

# LAYER 2 — DOMAIN MAP

## 2.1 Measured ground truth — 2026-07-22, `master @ e145dd5`

*This table supersedes constitution v3.1 §1.1 numbers where they differ. Per the
honesty axiom, the drift rows below should be filed to the ledger at adoption
(candidate P-131) so the constitution can be re-synced at its next review.*

| Fact | Measured value (2026-07-22) | Method / note |
|---|---|---|
| Branch / SHA | `master` @ `e145dd5`, 8 uncommitted files | `git log`, `git status` (unstaged work-layer audit per ledger P-128/P-129) |
| Ledger head | P-129 | grep on `PROBLEM-LEDGER.md` |
| Engine orchestrator | `src/main/core/trading-engine.ts`, **2,734 lines** | `wc -l` |
| Pure cores (core/) | data-source-guard, ensemble-fuser, order-event-router, order-fill-learning-router, simulator-bracket — each with colocated `.test.ts` | `ls src/main/core/` |
| Services | 108 entries in `src/main/services/` (modules + colocated tests + `alpaca/` facet dir) ≈ constitution's ~53 modules | `ls | wc -l` |
| Alpaca facets | account-syncer, broker-session, order-router, symbol-resolver (+tests) | `ls services/alpaca/` |
| IPC channels | ~122–124 (`ipc-channels.ts`; 122 per P-103 count method, 124 by literal-regex — **re-count exactly during RS-1.6**) | grep heuristic |
| Runtime deps | **exactly 10**: @electron-toolkit/utils, better-sqlite3, dotenv, electron-updater, lightweight-charts, react, react-dom, ws, zod, zustand | `package.json` |
| **DRIFT vs constitution** | React **^19.2.7** (v3.1 says 18.3) · TypeScript **^6.0.3** (says 5.6) · Electron **^43.1.1** (says 32) · electron-vite **^5** · Tailwind **^4.3.3** · zod **^4.4.3** · zustand **^5.0.1** · lwc **^5.0.0** | `package.json` — the renderer is *already* React 19 + Tailwind 4; the "frontend modernization track" discussed pre-plan is largely already shipped in-tree |
| Test files | **146** colocated `*.test.ts(x)` under `src/` + `tests/e2e/` dir | `find` — test *count* requires a vitest run; last full measure 1,668 tests @ P-100, plus P-128 additions; refresh via `scripts/update-baseline.sh` |
| Calibration constants | `calibration.ts:39 MIN_SAMPLES = 30`, `:42 MULT_FLOOR = 0.5` | grep — confirms §3.3 |
| SQLite schema | `services/persistence.ts` contains **15 `CREATE TABLE` statements** (v3.1 says 13 tables — re-measure table-vs-migration split at RS-4.1) | grep -c |
| Replay/record | `services/replay-source.ts`, `services/tick-recorder.ts` exist with tests | `ls` — the parity oracle's raw inputs are real |
| Locked baselines | `Vault/Backtests/baselines/brain-{aapl,amd,iwm,meta,msft,…}.json` | `ls` |
| The seam | `preload` exposes typed `window.satex` at `index.ts:288` | grep |
| `live-mode.ts` | present, **no colocated test file** | `ls` — P-094 confirmed still true |
| Node engines | `>=20.19.0` | `package.json` |
| Tauri ecosystem | Tauri 2 stable since 2024-10; current core ~2.11.x (2026-07) — pin exact at RS-0.2 | web-verified 2026-07-22 |

## 2.2 What must be ported — the engine inventory (spec source: the TS files themselves)

**Core:** trading-engine orchestrator (2,734 ln) · 5 extracted pure cores (each already
unit-tested — free oracle fixtures). **Data plane:** simulator, live-market (Alpaca
WS), replay-source, tick-recorder, live-candle-buffer, sub-second aggregator
(crypto-only 250 ms, 1000 ms non-crypto contract, prefs in
`Vault/Settings/subsecond-prefs.md`), depth-feed, historical-importer,
edgar/macro-calendar/regime aux feeds. **Broker plane:** `@shared/broker/` facet
interfaces + session state machine (`DISCONNECTED→CONNECTING→CONNECTED→RECONNECTING→
FAILED`, dedup'd WS snapshots, crypto WS informational-only), Alpaca concretes
(REST v2, WS, order-router with `failUnacked`, account-syncer, symbol-resolver,
reconnect/backoff, alpaca-mode). **Intelligence:** brain (online SGD, 7 features),
calibration (downgrade-only multiplier), pattern-learner (**port what exists** — the
§3.6-classification gap is Conviction-Track-B's open question; verify, never assume,
RS-5.3), tactics engine, autonomous-trader (paper-only), self-eval + PSR/DSR
(print-only, feeds nothing), llm advisory wall, learning-report, intel-fusion/layout.
**Persistence:** sqlite schema + WAL, VaultWriter (byte-compatible markdown),
learnings pruning (≤ 4 KB, cap 30), settings sanitize, logger. **Perimeter ⚠️:**
risk-gates (15 display gates), order-manager (9-gate battery + funded overlay gates
9–13, profile-gated e.g. `TOPSTEP_50K_XFA`), kill-switch-store (atomic write
contract), live-mode arming interlock (typed-phrase native dialog), MAY-TACTICS
graduation interlock, funded-account store/profiles, eod-flatten, blackout-window.
**Ops:** health/self-diagnostic core (`src/shared/health/`), credential-store,
auto-update (consent flags test-pinned), env handling (`SATEX_VAULT_ROOT`,
`SATEX_HW_ACCEL`, `SATEX_SIMULATOR_24_7`), id-generator, equity-hwm,
daily-pnl-ledger, small utilities. **Backtest:** runner · strategies · sizing ·
slippage (validates against locked baselines — the first grand parity gate).

## 2.3 Target architecture — the Cargo workspace

```
apps/satex-engine-rs/                  # Cargo workspace root (path per D-014)
  rust-toolchain.toml                  # pinned stable toolchain (exact at RS-0.2)
  Cargo.toml [workspace]  deny.toml  .cargo/config.toml
  crates/
    satex-core        # UtcMillis(i64), Provenance, Symbol, ids, shared error taxonomy
    satex-data        # Simulator | LiveMarket | Replay sources, candle buffer,
                      # sub-second aggregator, tick recorder, depth feed, aux feeds
    satex-broker      # facet TRAITS: OrderRouter, MarketDataSource, AccountSyncer,
                      # SymbolResolver + session state machine (broker-agnostic)
    satex-broker-alpaca # concretes: REST(reqwest+rustls), WS(tokio-tungstenite),
                      # order-router (failUnacked), account-syncer, symbol-resolver
    satex-risk    ⚠️  # risk-gates(15), funded profiles, kill-switch store (atomic),
                      # live-mode arming, MAY-TACTICS — THE PERIMETER CRATE
    satex-exec    ⚠️  # order-manager (9+funded gates), order lifecycle, event router
    satex-intel       # brain SGD, calibration, pattern-learner, tactics,
                      # autonomous-trader (paper-only wall), self-eval PSR/DSR, llm wall
    satex-backtest    # runner, strategies, sizing, slippage
    satex-persist     # rusqlite (WAL) behind a dedicated-thread actor, VaultWriter,
                      # settings, learnings pruning, tracing→vault log bridge
    satex-engine      # TradingEngine orchestrator + ported pure cores
    satex-health      # self-diagnostic core port (signals + diagnose)
    satex-ipc         # command/event DTOs (serde deny_unknown_fields) + TS typegen
    satex-shell   ⚠️* # Tauri 2 app: windows, native arming dialog, kill chord,
                      # updater (pinned), keyring credentials  (*perimeter-adjacent)
    satex-parity      # THE ORACLE: corpus reader, golden loader, diff engine,
                      # drift reports, baseline comparators
```

Renderer: **unchanged**, still `apps/satex-terminal/src/renderer` — built by Vite,
loaded by Tauri as the frontend dist; its only new artifact is a `window.satex`
adapter implementing the existing preload API surface over `invoke`/events (RS-9.3).

## 2.4 Technology mapping (TS → Rust) with decision-register links

| Today (measured) | Rust replacement | Decision |
|---|---|---|
| Node event loop | tokio, multi-thread runtime; **bounded** channels only, backpressure explicit | D-002 |
| EventEmitter wiring | typed `tokio::sync::{mpsc, broadcast, watch}` buses | D-002 |
| zod v4 `.strict()` on 122ch | serde `#[serde(deny_unknown_fields)]` DTOs + explicit validators + generated TS types | D-004 |
| better-sqlite3 (sync, WAL) | rusqlite (bundled), single dedicated DB thread/actor — preserves sync write-order semantics; sqlx rejected (async reordering risk on a path where write order is a safety property) | D-003 |
| Electron safeStorage | `keyring` crate → Windows Credential Manager (DPAPI) | D-006 |
| electron-updater | tauri-plugin-updater; manual-check-only; endpoint pinned `satex25/SATEX-terminal`; consent semantics test-pinned | D-007 |
| `writeJsonAtomic` | `tempfile::NamedTempFile` → write → fsync → atomic `persist` rename, same-volume guaranteed | spec'd RS-8.3 |
| ws (Alpaca) | tokio-tungstenite + rustls; heartbeat, backoff, seq-gap discard ported verbatim | D-005 |
| REST (Alpaca v2) | reqwest (rustls), manual retry/backoff ported from TS constants | D-005 |
| Math (SGD, PSR/DSR, indicators) | **direct formula ports** — no stats-library substitution; a library's "better" erf is a parity bug | Appendix B |
| Date.now()/Math.random | injected `Clock` + seeded `Rng` traits from day 0 (RS-0.7) | Appendix A.2 |
| Vitest (146 files) | cargo test + proptest (NaN/degenerate scar classes) + insta (vault/markdown snapshots) + mockall (traits); criterion benches non-gating | Appendix F |
| ESLint/knip | clippy `-D warnings` (+ unwrap/expect denied in non-test code, `f32` denied in engine crates) + cargo-machete + cargo-deny | D-010, F |
| electron-vite/Electron 43 shell | Tauri 2 (pin current 2.x at scaffold) on WebView2 | verified 2.1 |

## 2.5 What does NOT change

The entire renderer: React 19.2.7, 24 Zustand stores (46 files incl. tests), 21
panels, 7 modals, 3 themes, `--bb-*` tokens, 9-step type scale, lightweight-charts v5,
the four custom WebGL layers, workspaces ⌘1–6, boot ceremony, DISCIPLINE panel. The
Vault structure and every file format in it. The ledger and PSD loop. The program
ladder. The autonomy boundary. The operator's habits — by design, the terminal should
*feel* identical on flip day, only lighter and faster underneath.

## 2.6 Perimeter map, new world

`satex-risk` and `satex-exec` are ⚠️ crates: every PR touching them is human-gated
(Appendix D), CI-labeled, and excluded from scheduled-agent lanes (D-013).
`satex-shell`'s updater + credential + arming-dialog modules are ⚠️-adjacent: same
review bar. The parity harness may *read* perimeter behavior freely; nothing
autonomous may *alter* it. `ARCHITECTURE.md` §2's ⚠️ marks gain their Rust twins at
RS-11.3.

---

# LAYER 3 — TASK TREE

Owner classes: **[A]** agent-safe (claimable by any agent incl. scheduled lanes per
D-013) · **[H]** human-gated (agent builds, operator must review/approve merge) ·
**[O]** operator-only (no agent executes). Size: S < 1 day · M 1–3 days · L 3–7 days
of focused work (judgment, not measurement).

## Phase 0 — Foundation (→ M0)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-0.1 | Worktree + branch bootstrap: `git worktree add ../mc4-rust`, branch discipline doc'd | [O] | S |
| RS-0.2 | Cargo workspace scaffold at `apps/satex-engine-rs` (all crates stubbed, compiles empty); pin toolchain + Tauri 2.x exact versions | [A] | S |
| RS-0.3 | Policy files: rust-toolchain.toml, deny.toml (licenses/advisories/bans), clippy config (unwrap/expect/f32 denials), `#![forbid(unsafe_code)]` workspace lint table | [A] | S |
| RS-0.4 | CI: additive `rust` jobs (ubuntu fast + windows arbiter) running the six-gate bar; TS `Gates` job untouched; required-check wiring = operator | [A]+[O] | M |
| RS-0.5 | Adoption pack: this plan → `docs/plans/`, ledger P-130 entry, ARCHITECTURE.md §1 note (new package, zero perimeter contact), CHANGELOG entry | [A]+[O] | S |
| RS-0.6 | **Determinism audit of the TS replay path** (read-only): sweep engine + services for `Date.now`, `Math.random`, iteration-order and async-race nondeterminism reachable under replay; classify each as (a) deterministic under replay, (b) needs injection, (c) genuinely nondeterministic → ledger findings | [A] | M |
| RS-0.7 | Clock/Rng injection design doc: `Clock` + `SeededRng` traits in satex-core; mapping of every RS-0.6(b) site to its injection point | [A] | S |

## Phase 1 — The Oracle before the engine (→ M1)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-1.1 | satex-core: UtcMillis, Provenance, Symbol, ids, error taxonomy, Clock/Rng traits | [A] | M |
| RS-1.2 | Corpus assembly: inventory existing TickRecorder recordings; record/collect ≥ 20 sessions spanning trend/chop/gap/halt/WS-drop regimes + synthetic adversarial set (P-039 negative-price, P-040/041/074/093 degenerate/NaN classes); corpus manifest with SHAs | [A]+[O] | M |
| RS-1.3 | **Golden-capture driver** (additive TS-side script): run TS engine headless over a corpus session → golden JSONL (decision stream + state checkpoints per Appendix A.3); deterministic re-run proof (same input ⇒ byte-identical golden, twice) | [A] | L |
| RS-1.4 | satex-parity: corpus reader, golden loader, structural diff engine, drift-report format (first divergence: tick index, subsystem, field, ts vs rs values, context window) | [A] | L |
| RS-1.5 | Baseline comparators: load `Vault/Backtests/baselines/brain-*.json`, define comparison contract for RS-6.4 | [A] | S |
| RS-1.6 | IPC contract inventory: exact channel enumeration from `ipc-channels.ts` (resolve the 122-vs-124 count), payload schema extraction per channel → generated inventory doc; DTO checklist that RS-9.2 must satisfy 1:1 | [A] | M |
| RS-1.7 | **Mutation-test the oracle**: deliberately perturb a copied golden (one field, one tick) and prove the harness catches it; harness that cannot fail is P-097 false-green — this task blocks all Phase ≥ 2 parity claims | [A] | S |

## Phase 2 — Pure cores (→ M2)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-2.1 | Indicator math (from indicator-settings + chart-side pure calc inventory) + proptest strategies for the degenerate-input scar classes | [A] | L |
| RS-2.2 | ensemble-fuser port + colocated TS test-fixture port | [A] | M |
| RS-2.3 | data-source-guard port (pure interlock logic; blocked-while-armed/replay law) | [A] | S |
| RS-2.4 | order-event-router port | [A] | M |
| RS-2.5 | order-fill-learning-router port | [A] | M |
| RS-2.6 | simulator-bracket port | [A] | M |
| RS-2.7 | sub-second aggregator (crypto-only 250 ms; 1000 ms non-crypto contract; prefs read/sanitize) | [A] | M |
| RS-2.8 | live-candle-buffer port | [A] | M |
| RS-2.9 | Small-services batch: id-generator, env, blackout-window, equity-hwm, daily-pnl-ledger | [A] | M |

## Phase 3 — Data plane (→ M2)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-3.1 | MarketDataSource trait + Simulator port (seeded Rng; SIM provenance labeling) | [A] | L |
| RS-3.2 | ReplaySource port (byte-compatible reader with RS-1.2 corpus) | [A] | M |
| RS-3.3 | TickRecorder port (format byte-identical — recordings must round-trip both engines) | [A] | M |
| RS-3.4 | Ingestion law: timestamp validation, dedup/merge, backfill-yes/forward-fill-never, stale-feed HALT-and-surface | [A] | M |
| RS-3.5 | DepthFeed port | [A] | M |
| RS-3.6 | Aux feeds: historical-importer, edgar, macro-calendar, regime | [A] | L |

## Phase 4 — Persistence (→ M2/M3)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-4.1 | Schema port from `persistence.ts` (15 CREATE TABLE statements measured — reconcile with "13 tables" claim, ledger the answer), WAL, identical column affinities/indices | [A] | M |
| RS-4.2 | DB actor: rusqlite on a dedicated thread, ordered write queue, sync-semantics contract tests | [A] | M |
| RS-4.3 | VaultWriter port — byte-compatible markdown via insta snapshots against TS-produced fixtures; includes the JS float-formatting helper (Appendix B.3) | [A] | L |
| RS-4.4 | Settings sanitize + learnings pruning (≤ 4 KB, cap 30) | [A] | S |
| RS-4.5 | Logger: tracing + JSON layer writing vault-compatible structured logs | [A] | M |

## Phase 5 — Intelligence (→ M3)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-5.1 | Brain port: online SGD, 7 features, exact update math, weight serialization compatible with brain-*.json baselines | [A] | L |
| RS-5.2 | Calibration port: MIN_SAMPLES=30, MULT_FLOOR=0.5, downgrade-only enforced by construction (multiplier type has no >1.0 constructor) | [A] | M |
| RS-5.3 | PatternLearner port — **port what exists** (verify §3.6-classification reality first at file level; gap ≠ fix; ledger) | [A] | L |
| RS-5.4 | TacticsEngine port | [A] | L |
| RS-5.5 | SelfEval + PSR/DSR: formula-verbatim port, honest n/a on degenerate curves, print-only wiring | [A] | M |
| RS-5.6 | learning-report, intel-fusion, intel-layout | [A] | M |
| RS-5.7 | LLM advisory wall: narration interface whose crate exports no order-capable types (wall by construction) | [A] | M |
| RS-5.8 | AutonomousTrader: paper-only enforced at type level (no live-order type importable), full gate battery invocation | [A] | L |

## Phase 6 — Backtest (→ M3 GRAND GATE)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-6.1 | Runner port | [A] | L |
| RS-6.2 | Strategies port (verbatim; strategy "improvements" are out of scope) | [A] | L |
| RS-6.3 | Sizing + slippage port | [A] | M |
| RS-6.4 | **MILESTONE GATE: backtest parity vs every locked baseline** — drift report zero-divergence under Appendix B policy; operator reviews the report itself | [A]+[O] | M |

## Phase 7 — Broker plane (→ M4)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-7.1 | Facet traits port (`@shared/broker/` → satex-broker) + session state machine w/ dedup snapshots, crypto-WS-informational rule | [A] | L |
| RS-7.2 | Alpaca REST client (reqwest+rustls; TS backoff constants verbatim) | [A] | M |
| RS-7.3 | Alpaca WS client (tokio-tungstenite; heartbeat, seq-gap discard, reconnect ladder) | [A] | L |
| RS-7.4 | order-router concrete + `failUnacked` teardown sweep | [A] | M |
| RS-7.5 | account-syncer + symbol-resolver + alpaca-mode | [A] | M |
| RS-7.6 | live-market + reconnect orchestration; engine-owned crypto WS | [A] | M |
| RS-7.7 | Fixture suite: recorded REST/WS transcripts as integration fixtures (no live network in agent tests) | [A] | M |
| RS-7.8 | Paper-account smoke: **operator-run**, checklist scripted by agent; agents never execute it (RS-L2) | [O] | S |

## Phase 8 — THE PERIMETER ⚠️ (→ M5; every task [H], one PR each, Appendix D protocol)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-8.1 | risk-gates port (15 display gates; limits read-only to intel crates enforced by visibility: no `&mut` API exported to satex-intel) | [H] | L |
| RS-8.2 | order-manager port: 9-gate battery + funded overlay gates 9–13, profile-gated skip; single choke point re-proven (no order path bypasses) | [H] | L |
| RS-8.3 | kill-switch store: atomic write contract (tempfile+fsync+rename), human-reset-only, state file format identical | [H] | M |
| RS-8.4 | live-mode arming interlock: typed-phrase native dialog (Tauri), no programmatic completion path — **ships WITH tests** (retires the P-094 gap in the Rust world; TS side stays untouched) | [H] | L |
| RS-8.5 | MAY-TACTICS graduation interlock | [H] | M |
| RS-8.6 | funded-account store + profiles (TOPSTEP_50K_XFA values byte-identical to TS source) | [H] | M |
| RS-8.7 | eod-flatten + blackout enforcement wiring into the battery | [H] | M |
| RS-8.8 | Perimeter adversarial review: operator + fresh-context agent red-team the ported perimeter against the TS original; every finding ledgered and closed before M5 exit | [H]+[O] | L |

## Phase 9 — Shell & IPC (→ M5)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-9.1 | satex-shell scaffold: Tauri 2 app, window management, dev/prod loading of the existing renderer build | [A] | M |
| RS-9.2 | satex-ipc: full DTO surface per RS-1.6 inventory (serde deny_unknown_fields), command+event registration, TS typegen pipeline emitting the renderer-consumed `.d.ts` | [A] | L |
| RS-9.3 | `window.satex` Tauri adapter: implements the preload API surface over invoke/events; renderer source untouched beyond the injection point | [A] | L |
| RS-9.4 | Credentials: keyring/DPAPI store; migration path from safeStorage documented (operator re-entry acceptable fallback); zero plaintext proven by test | [H] | M |
| RS-9.5 | Updater: tauri-plugin-updater pinned to `satex25/SATEX-terminal`, manual-check-only, consent semantics test-pinned (P-091/P-103 laws re-expressed) | [H] | M |
| RS-9.6 | Kill chord: global reachability in Tauri incl. error states + boot intro fall-through (P-044/P-098 re-proven with tests) | [H] | M |
| RS-9.7 | WebView2 verification checklist: lwc v5 render, all four WebGL layers, 3 themes, type scale, IPC round-trip latency sample, perf canary p50 ≤ 16 ms under symbol-rotation + tick load | [A]+[O] | L |
| RS-9.8 | satex-health port + HealthPanel wiring over new IPC | [A] | M |
| RS-9.9 | Env parity: SATEX_VAULT_ROOT / HW_ACCEL / SIMULATOR_24_7 equivalents; packaged-install vault discovery | [A] | S |

## Phase 10 — Dual-run & cutover (→ M5 exit)

| ID | Task | Own | Size |
|---|---|---|---|
| RS-10.1 | Full-engine replay campaigns: entire corpus through both engines, zero divergence at Oracle L1/L2; drift reports archived to Vault | [A] | L |
| RS-10.2 | **Shadow soak**: ≥ 10 trading days, Electron terminal (operator's daily driver) + Tauri terminal running paper side-by-side on live data; nightly decision-diff; any divergence = ledger + root cause before the clock restarts | [O]+[A] | L |
| RS-10.3 | Cutover GO/NO-GO ceremony (Layer 7.4 checklist) | [O] | S |
| RS-10.4 | Electron retirement: freeze TS engine (tag + branch), keep in-tree ≥ 90 days, archive policy per D-011 | [O]+[A] | S |

## Phase 11 — Hardening & release

| ID | Task | Own | Size |
|---|---|---|---|
| RS-11.1 | Installer: tauri bundler (NSIS, x64, **no macOS target configured**); signing under the same Authenticode CSR workflow (certs/HANDOFF.md) — same blocker, same zero-code-change resolution | [A]+[O] | M |
| RS-11.2 | Measured wins report: RAM, binary/installer size, cold-boot, IPC round-trip, replay throughput — Electron vs Tauri, real numbers only | [A] | M |
| RS-11.3 | Docs: ARCHITECTURE re-map, satex-engine-rs CLAUDE.md, ⚠️ marks, constitution v4 draft trigger (operator-owned; gate-bar commands, §3.1 diagram, §2.9 realities all change) | [A]+[O] | M |
| RS-11.4 | Security pass: cargo-deny/audit clean, IPC DTO fuzz (cargo-fuzz, parse-only targets), credential + updater review rerun | [H] | L |

---

# LAYER 4 — DEPENDENCY DAG

```
RS-0.1 → RS-0.2 → RS-0.3 → RS-0.4 ─────────────────────────────┐
                    └→ RS-0.5                                   │ (CI green = M0)
RS-0.6 → RS-0.7 ────────────────┐                               │
                                ▼                               ▼
        RS-1.1 ──────────→ RS-1.3 → RS-1.4 → RS-1.7 ═══ M1: ORACLE ONLINE
        RS-1.2 ──────────↗    │        └→ RS-1.5              (blocks all parity claims)
        RS-1.6 (independent)  │
                              ▼
   ┌──────────────┬───────────┴─────────────┬────────────────┐
   ▼              ▼                         ▼                ▼
 Phase 2        Phase 3                  Phase 4        RS-9.1/9.2/9.3
 (pure cores) → (data plane)             (persist)      (shell lane —
   │   RS-3.1..3.4 need RS-2.x cores       │             needs RS-1.6)
   └───────┬──────┴───────────┬────────────┘
           ▼                  ▼
        Phase 5 ─────────→ Phase 6 (backtest) ═══ M3 GATE: RS-6.4 baseline parity
        (intel needs        (needs 2,3,4,5)
         2,3,4)                   │
        Phase 7 (broker) ─────────┤   (7 needs 1.1, 2.x types; parallel with 5/6)
           │                      ▼
           └────────→ Phase 8 ⚠️ PERIMETER (needs 2–7 green + operator availability)
                          │
        Phase 9 remainder (9.4–9.9; 9.6 needs 8.3/8.4) 
                          │
                          ▼
        RS-10.1 (needs 8 complete + 9.2/9.3) → RS-10.2 soak → RS-10.3 GO/NO-GO
                          │                                        │
        Phase 11 (11.1/11.2 parallel with soak; 11.4 before flip)  ▼
                                                             RS-10.4 retirement
```

**Critical path:** 0.2 → 0.6/0.7 → 1.3 → 1.4 → 1.7 → (2.x∥3.x∥4.x) → 5.x → 6.4 →
7.x → 8.x → 10.1 → 10.2 → 10.3. The oracle (Phase 1) is deliberately load-bearing:
nothing downstream may claim parity before RS-1.7 proves the harness can fail.

**Parallel lanes** (safe for concurrent agents, ledger-claimed per 0.C): Lane α pure
cores (RS-2.x, embarrassingly parallel per-module) · Lane β data plane (after 2.3/2.7/
2.8) · Lane γ persistence (RS-4.x) · Lane δ shell scaffold + IPC inventory (RS-1.6,
9.1–9.3) · Lane ε docs/CI (RS-0.5, 11.3 drafts). Phases 8 and 10 are **single-lane,
operator-paced** — never parallelized, never scheduled-agent work (D-013).

---

# LAYER 5 — EXECUTION SPECS

## 5.0 The spec template and its defaults

Every task inherits these defaults; each spec block below states only its specifics.
Per constitution §2.7, a task is not done without all six: confirmation methodology,
measurable validation, expected runtime behavior, failure interpretation, recovery,
GO/NO-GO.

- **Confirmation (default):** Rust six-gate bar green (Appendix F) + task-specific
  tests listed in the block + real numbers (test counts, exit codes) in the PR body.
- **Validation (default):** ported TS unit fixtures pass identically in Rust; any
  P-0xx pin owned by the module appears in the Scar-Tissue Port Ledger (B.4) as ported.
- **Runtime behavior (default):** module is inert until wired by satex-engine/shell —
  merging it changes nothing user-visible; the shipping terminal is unaffected.
- **Failure interpretation (default):** a red parity/unit test after a port means the
  PORT is wrong until proven otherwise; the TS behavior is the spec (RS-L1). If
  investigation proves the TS behavior itself defective: ledger it, port the defect
  faithfully OR get an operator ruling to fix on both sides — never silently "improve."
- **Recovery (default):** revert the PR (linear history makes this clean); git objects
  are the restore source (`git show HEAD:<path>`); goldens/baselines are never edited
  as a recovery step.
- **GO/NO-GO (default):** GO = gates green + block-specific criteria met + ledger
  claim closed with evidence. NO-GO on any unmet criterion — partial ports do not
  merge; they park on their branch with a ledger note.

## 5.1 Phase 0 specs

**RS-0.1 Worktree bootstrap [O]** — Method: `git worktree add ../mc4-rust` from a
clean `master`; record layout in AGENTS.md addendum (RS-0.5). Validation: `git
worktree list` shows both; TS gates still green in `mc4/`. Failure: worktree on a
network/OneDrive-synced path → relocate (sync services corrupt git metadata — adjacent
to the P-099 class). GO/NO-GO: both worktrees build their respective stacks.

**RS-0.2 Workspace scaffold [A]** — Method: `cargo new` each crate per §2.3 map;
workspace Cargo.toml with shared lints/profile; empty-but-compiling stubs; pin
rust-toolchain.toml to current stable and Tauri to current 2.x (verify exact versions
at execution — do not trust this plan's snapshot; RS-L5). Validation: `cargo build
--workspace` + six-gate bar green on a machine that has never built it (CI is that
machine). Runtime: nothing runs. GO: CI green incl. windows job.

**RS-0.4 CI additive [A]+[O]** — Method: new workflow jobs; path-filtered so
Rust-only PRs don't run TS gates and vice versa where safe — but never removing or
weakening the existing `Gates` job. Validation: a deliberately-broken clippy PR on a
scratch branch goes red (prove the gate can fail — P-097 law); a green PR passes.
Operator wires branch-protection required checks. Failure: flaky windows runner →
ledger, quarantine-with-name, never `continue-on-error` on the arbiter job.

**RS-0.6 Determinism audit [A]** — Method: read-only sweep (`grep -rn "Date.now\|
Math.random"` + async-race review of the replay drive path in trading-engine.ts and
every service it touches under replay). Output: a classification table (deterministic /
needs-injection / nondeterministic) with `file:line` for every hit, ledgered.
Validation: table covers 100% of hits; each needs-injection row has a proposed seam.
**This task exists because the entire oracle strategy dies if TS replay is not
reproducible — finding that out in week 1 costs a document; finding it at RS-10.1
costs a quarter.** GO: operator has read the findings.

**RS-0.7 Clock/Rng injection design [A]** — Method: design doc in
`docs/plans/`; `Clock` (now_utc_ms) + `SeededRng` traits, threading strategy through
engine constructors; golden-capture driver (RS-1.3) will inject fixed clock/seed on
the TS side via the same seams (additive wrapper, not engine edits, if RS-0.6 found
category-(b) sites — if it found none, this task closes as N/A-with-evidence).

## 5.2 Phase 1 specs — the oracle

**RS-1.2 Corpus assembly [A]+[O]** — Method: inventory existing recordings
(`Vault/` + tick-recorder outputs); operator records missing regimes during live
sessions; adversarial set generated synthetically (scar-class generators). Manifest:
`corpus.json` with per-session SHA-256, regime tags, symbol set, duration.
Validation: ≥ 20 sessions, all five regime tags covered, manifest SHAs verify.
Corpus files are **read-only artifacts** thereafter — a changed SHA is an incident.

**RS-1.3 Golden-capture driver [A] — the one substantive TS-side addition** —
Method: standalone script (`scripts/` or `tests/harness/`) that boots the TS engine
headless in replay mode over one corpus session with injected clock/seed, subscribing
to the decision stream and emitting golden JSONL per Appendix A.3 checkpoints. Zero
engine-source edits; wiring via existing public surfaces (engine constructor, event
emitters). Ships via normal TS PR with four-gate bar. Validation: **double-run
determinism** — two runs over the same session produce byte-identical goldens (hash
compare, in CI). Failure: nondeterministic goldens → back to RS-0.6/0.7, do not
proceed; this is the plan's designed early-warning tripwire. GO: goldens for the full
corpus captured, hashed, archived under `Vault/Backtests/goldens/` (or path per
operator ruling), regeneration procedure documented.

**RS-1.4 Parity harness [A]** — Method: satex-parity reads corpus + goldens; runs the
Rust engine (as crates mature, harness grows subsystem adapters — early: pure-core
fixture mode; later: full-engine replay mode); diffs per Appendix A.3 levels; emits
drift report (human-readable + JSONL). Validation: harness runs end-to-end in fixture
mode against a hand-built known-good/known-bad pair. Runtime: harness is a dev/CI
tool, never shipped in the terminal.

**RS-1.7 Oracle mutation test [A]** — Method: scripted perturbation of a golden copy
(one field), harness must exit non-zero naming the exact divergence; also perturb the
harness input corpus (one tick) and confirm detection. This is the P-097 law applied
to our own measuring instrument. **Blocks every downstream parity claim.**

## 5.3 Phase 2–4 specs (porting discipline for all [A] lanes)

**Universal porting method (applies to every RS-2.x/3.x/4.x/5.x/6.x/7.x task):**
1. Read the TS module + its colocated tests end-to-end; list every observable
   behavior including quirks (rounding, ordering, error strings that reach the vault).
2. Port module verbatim-in-semantics (Appendix B numeric law: f64 only, expression
   order preserved, no algebraic simplification, no library substitution for math).
3. Port the colocated tests first-class; add proptest coverage where the module owns
   a scar class; add insta snapshots where output is vault/markdown/JSON.
4. Wire into satex-parity fixture mode where the module is decision-path relevant.
5. PR with: gate outputs, test-count delta, scar-ledger rows updated, no TS changes.

**RS-2.1 Indicators [A]** — Extra validation: proptest strategies must include empty
series, single-element, all-equal, NaN-poisoned input (must be guarded per invariant
§2.5.8 — iterate, never spread-over-unbounded), `period <= 0`, negative prices
(P-039). Fixture parity: TS test vectors reproduced bit-exact.

**RS-2.3 data-source-guard [A]** — Pure logic; the blocked-while-armed/replay rule is
load-bearing (constitution invariant §2.5.6). Port table-driven: enumerate the full
input space of (mode, armed, replaying, target) transitions and pin every cell against
TS behavior — this module is small enough for exhaustive truth-table tests; do it.

**RS-2.7 Sub-second aggregator [A]** — Pin: crypto-only activation; 250 ms default;
1000 ms returned for non-crypto (1-second consumers keep their contract — invariant
§2.5.4); fed only from the tick source seam (never a second path); prefs file
sanitize round-trip.

**RS-3.3 TickRecorder [A]** — Extra validation: a session recorded by TS replays
byte-identically through Rust reader and vice versa (cross-engine round-trip test in
CI with a small fixture recording).

**RS-4.1/4.2 Schema + DB actor [A]** — Extra validation: schema dump diff (`.schema`
normalized) TS-created vs Rust-created DB = zero diff; write-order contract test
(interleaved writes land in submission order under concurrency); WAL mode proven on.
Failure interpretation: any divergence in column affinity/defaults is a port bug even
if "harmless" — sqlite affinity quirks are exactly where silent corruption hides.

**RS-4.3 VaultWriter [A]** — Extra validation: corpus of TS-produced vault files as
insta references; Rust output byte-identical including float formatting (Appendix
B.3) and line endings (explicit LF/CRLF decision recorded — measure what TS emits,
match it; the P-021/P-099 CRLF scar makes this a named check, `0 CR-CR, 0 NUL`).

## 5.4 Phase 5–7 specs

**RS-5.1 Brain [A]** — Extra validation: weight-trajectory parity — identical
feature stream in ⇒ identical weight vector out at every checkpoint (bit-exact f64);
serialization round-trips against existing `brain-*.json` baselines. Failure: a
drifting trajectory almost always means expression-order or accumulation-order
divergence — diff at the first divergent update, not the last.

**RS-5.2 Calibration [A]** — Extra validation: property test — for all outcome
sequences, multiplier ∈ [0.5, 1.0] and only moves after ≥ 30 samples; downgrade-only
proven by the type (constructor clamps; no public mutator can raise past 1.0).
The TS fixtures (calibration.test.ts) port 1:1.

**RS-5.3 PatternLearner [A]** — First action: read `pattern-learner.ts` and write
down what it *actually* implements vs the §3.6 doctrine (this is Conviction Track B's
open question — the answer is a deliverable of this task, ledgered). Port the reality.
If reality < doctrine, the Rust port matches reality and the gap stays a ledgered TS+RS
twin entry for Track B to close later on both — or on RS only, post-cutover, by ruling.

**RS-5.7/5.8 Advisory wall + AutonomousTrader [A]** — Extra validation: compile-time
wall tests — a test crate attempts to reach an order-capable type from the llm module
and from any intel crate export; the build must fail (trybuild compile-fail tests).
Paper-only: the order-intent type reachable from AutonomousTrader carries a
type-level `Paper` marker; constructing a live intent from intel code is unrepresentable.

**RS-6.4 Backtest parity gate [A]+[O]** — Method: run Rust backtest per locked
baseline config; compare vs TS goldens (equity curve, trade list, Sharpe + PSR/DSR
verdicts) under Appendix B policy. Validation: zero divergence; report archived;
operator signs the report. **This is the first moment the project has proven the
whole numeric spine. Celebrate in the ledger, then keep going.** NO-GO handling: any
divergence root-caused to first divergent trade/tick; no tolerance-widening to pass.

**RS-7.x Broker plane [A]** — All integration tests run against RS-7.7 recorded
fixtures (REST transcripts, WS frame logs — recorded once by operator-run capture,
scrubbed of credentials). Extra validation: session state machine truth-table
(disconnect at each state × event); `failUnacked` sweeps exactly the in-flight index;
reconnect ladder timings match TS constants. **No test may open a live socket to
Alpaca** — CI proves it by running network-sandboxed (the fixture layer is the only
transport). RS-7.8 (paper smoke) is operator-run with an agent-scripted checklist:
connect, subscribe, sync account, submit one paper order through the full battery,
verify lifecycle, disconnect clean, `failUnacked` on forced teardown.

## 5.5 Phase 8 specs — perimeter (all [H]; Appendix D governs the ceremony)

**Common to every RS-8.x:** one PR per task; PR body includes a side-by-side behavior
table (TS `file:line` ⇄ Rust `file:line` for every rule/gate/constant); constants are
byte-compared against TS source in a test (not by eye); operator review is a review —
the PR does not merge on CI green alone. Parity: perimeter decisions are Oracle L1
objects; the full corpus replays with perimeter engaged before Phase-8 exit.

**RS-8.2 order-manager [H]** — The single choke point. Extra validation: a
workspace-wide test proves no crate but satex-exec can construct a broker order
submission (visibility + trybuild); gates 1–9 and funded 9–13 each get an
isolated truth-table test plus combined battery-order tests (gate short-circuit
order matters and must match TS — measure it, don't assume it).

**RS-8.3 kill-switch [H]** — Extra validation: crash-injection test — kill the
process between tempfile-write and rename 1,000× (loop harness); the state file is
always either the old or the new complete JSON, never torn; chord → close/freeze
state write → human-reset-only proven by absence of any programmatic reset API.

**RS-8.4 arming interlock [H]** — Extra validation: the typed-phrase dialog is a
native Tauri dialog invoked only from a user-gesture command path; no IPC command,
no test hook, no env var can complete arming; proven by exhaustive command-surface
review + a test asserting the arming state transition requires the dialog's nonce.
This port *adds* the tests the TS side never had (P-094) — the Rust perimeter ships
tested or it does not ship.

**RS-8.8 Adversarial review [H]+[O]** — Method: a fresh-context agent (no memory of
building it) is given the TS perimeter and the Rust perimeter and instructed to find
behavioral divergence and bypass paths; operator triages findings. Exit: zero open
findings. This is Directive 4.2 made procedural: the reviewing intelligence proves
the walls, and any bypass it finds is a ledger contribution, never a capability.

## 5.6 Phase 9–11 specs

**RS-9.2 IPC surface [A]** — Validation: generated TS types compile against the
renderer's existing call sites with zero renderer edits (the adapter satisfies the
existing `window.satex` interface); every RS-1.6 inventory row maps to a command/event
or a documented retirement (none expected); unknown-field rejection tested per DTO
(fuzz-lite: every DTO rejects a payload with one extra key — the `.strict()` law).

**RS-9.3 Adapter [A]** — Validation: renderer boots against a stub Rust engine in
dev; every store's IPC path exercised by the existing renderer test suite (which
stays green, unchanged — measure: same pass count before/after).

**RS-9.5 Updater [H]** — Validation: endpoint string pinned by test to
`satex25/SATEX-terminal` exact-capitals (the redirect must never be load-bearing —
P-103); no auto-download, no auto-install, no downgrade — each pinned by a test that
fails if a config default flips in a plugin upgrade (the P-091 scar, re-expressed).

**RS-9.7 WebView2 checklist [A]+[O]** — Method: scripted visual/functional pass +
operator eyeball session. Items: four WebGL layers render (footprint, vol-heatmap,
volume-profile, LOD behavior under zoom), lwc v5 interactions, 3 themes, type scale,
kill chord, boot intro fall-through, ⌘1–6 workspaces, DISCIPLINE panel, perf canary
p50 ≤ 16 ms (existing Playwright spec adapted to launch Tauri — measured, not
asserted). Any delta vs Electron = ledger entry; "close enough" is not a verdict —
operator rules on each.

**RS-10.2 Shadow soak [O]+[A]** — Method: operator trades/observes the Electron
terminal as daily driver; Tauri terminal runs paper on the same live feed on the same
machine (or twin). Nightly: agent diffs both decision logs (same format by
construction) and posts a soak-day report to the ledger. Clock: 10 consecutive clean
trading days; any decision divergence or Rust incident resets the counter after
root-cause. Validation: 10/10 clean days on record.

**RS-11.2 Wins report [A]** — Measured only: working-set RAM (both, same session
script), installer + binary size, cold boot to first tick, IPC round-trip p50/p99,
full-corpus replay wall-time. No projections, no marketing numbers. This report is
the plan's honesty receipt — if a number got worse, it prints.

---

# LAYER 6 — RISK AUDIT

## 6.1 Ranked risk register

| # | Risk | L×I | Mitigation (already designed in) | Tripwire |
|---|---|---|---|---|
| R1 | **Perimeter behavioral regression** reaches a live-capable build | low × catastrophic | Phase 8 human-gated 1-PR-each + constants byte-compared by test + adversarial review RS-8.8 + full-corpus perimeter replay + soak + Appendix D ceremony | Any Oracle L1 divergence involving a gate verdict = full stop, operator paged via ledger |
| R2 | **Silent numeric drift** (f64 expression order, accumulation, formatting) | med × high | Appendix B law: bit-exact policy, verbatim expression ports, no library substitution, first-divergence diffing, float-format helper with its own fixture suite | RS-6.4 or any weight-trajectory checkpoint mismatch |
| R3 | **TS replay is nondeterministic**, oracle strategy collapses | med × high | RS-0.6 audit is the *second task in the plan*; injection seams RS-0.7; double-run hash proof in RS-1.3 CI | Golden hashes differ across runs → halt Phase ≥ 2 parity work, resolve first |
| R4 | **Scar-tissue loss** — a P-0xx pin doesn't survive translation | med × high | Scar-Tissue Port Ledger (B.4) is a tracked completeness table; M-exit criteria include "no unmapped rows"; universal porting method step 3 | Any module PR merging with an unfilled B.4 row for its scar classes |
| R5 | **WebView2 ≠ pinned Chromium** rendering/perf deltas (WebGL layers, charts) | med × med | RS-9.7 explicit checklist + perf canary re-run in Tauri; renderer untouched otherwise; deltas ledgered per-item for operator ruling | Canary p50 > 16 ms or any layer misrender |
| R6 | **Improve-while-porting scope creep** (the classic rewrite killer) | high × med | RS-L1/RS-L8 two-commit law; PR review rejects mixed port+improve diffs; non-goals list 1.3 | Any PR whose behavior table shows an intentional delta without an operator-ruled ledger entry |
| R7 | **Crate supply chain** (typosquats, license traps, abandoned deps) | low × high | D-012 budget ≤ 25 direct runtime deps each justified in E; cargo-deny (advisories/licenses/bans) in the gate bar; lockfile committed; no git dependencies; no `build.rs` network access | deny job red or an unjustified dep in a PR diff |
| R8 | **Dual-maintenance drag** — TS engine keeps evolving (L1.D!) while goldens age | high × med | Freeze discipline: TS engine changes ship normally, but any merged TS engine change lists affected golden sessions; goldens regenerate via RS-1.3 procedure with review; parity claims always cite the golden-set SHA they ran against | A parity report citing a stale golden manifest |
| R9 | **Agent failure modes** — fabricated parity, false-green wrappers, phantom counts | med × high | RS-L4/RS-L6; RS-1.7 mutation-tested oracle; CI as arbiter; evidence-cited ledger closes; the P-097 wrapper class is banned by name | Any "parity: pass" claim without an archived drift report path |
| R10 | **Stall / abandonment** — the rewrite loses to the daily grind | med × high | Additive trunk merges keep every week's work banked on `master`; milestone slicing gives operator-visible wins (M1 oracle, M3 backtest parity, RS-11.2 receipts); ladder work (L1.D) explicitly not blocked | > 30 days without a merged RS PR → ledger review of plan viability |
| R11 | **FP formatting / CRLF / byte-parity rabbit holes** consume weeks | med × med | Contained: byte-parity is *required* only where TS bytes are contracts (vault files, tick format, kill-switch JSON, baselines); IPC/DTO layer allows normalized structural equality (A.3) | A task burning > 3 days on formatting parity → ledger, escalate for a scope ruling |
| R12 | **Sandbox/toolchain friction** (45 s ceiling, cargo cold builds, missing rustup) | high × low | 0.F named limits; per-crate test segmentation; CI arbiter; `cargo check` locally | — |

## 6.2 The anti-pattern law (DON'Ts, binding)

Never big-bang; never merge a partial port that changes shipping behavior; never edit
goldens/baselines to pass; never widen a tolerance to pass; never substitute a math
library for a ported formula; never `--no-verify`, never `continue-on-error` on an
arbiter job; never let a "quick TS fix" ride inside an RS PR (or vice versa); never
parallelize Phase 8; never let a scheduled agent touch ⚠️ crates (D-013); never trust
this plan's snapshot over the working tree (RS-L5); never report a gate you didn't
run (name it, cite CI); never leave a divergence unledgered overnight (RS-L10).

---

# LAYER 7 — THE ASSEMBLED PLAN

## 7.1 Milestones — entry/exit criteria (exits are operator ceremonies, 0.D)

| M | Name | Exit criteria (all required, all evidenced) |
|---|---|---|
| M0 | Foundation green | Workspace compiles on CI (ubuntu + windows); six-gate bar live and *proven able to fail*; plan adopted (docs/plans/ + P-130); RS-0.6 audit read by operator |
| M1 | **Oracle online** | Corpus ≥ 20 sessions manifest-hashed; goldens captured with double-run determinism proof; harness catches planted mutations (RS-1.7); IPC inventory exact count published |
| M2 | Pure cores + data + persistence parity | All RS-2/3/4 merged; fixture-mode parity green; schema diff zero; VaultWriter byte-parity green; B.4 rows for phases 2–4 complete |
| M3 | **Numeric spine proven** | RS-6.4 backtest parity vs every locked baseline, zero divergence, operator-signed report; brain weight-trajectory parity green |
| M4 | Broker plane + full-engine replay | Phase 7 merged on fixtures; RS-7.8 paper smoke passed (operator); full-corpus engine replay (pre-perimeter wiring) zero-divergence |
| M5 | **Perimeter + shell + soak → CUTOVER** | Phase 8 complete under Appendix D with signatures; RS-8.8 zero open findings; Phase 9 checklist green incl. perf canary; RS-10.1 zero divergence; RS-10.2 ten clean days; RS-11.4 security pass; GO/NO-GO ceremony passed |

## 7.2 Timeline — JUDGMENT, not measurement (solo operator + disciplined agent lanes)

M0: 1–3 days · M1: 1–2.5 weeks (RS-1.3 is the sleeper — budget for it) · M2: 3–5
weeks · M3: 3–5 weeks · M4: 4–7 weeks · M5: 6–10 weeks including soak. **Total: ≈
4.5–8.5 calendar months.** Confidence: moderate; the two honest wildcards are R3
(TS determinism) and R11 (byte-parity rabbit holes). Re-estimate at every M-exit
against actuals; a plan that never updates its estimate is lying by omission.

## 7.3 Cadence integration

Scheduled dawn planner + finisher may claim **[A] lane tasks only, after M1**, under
the 0.C claim protocol (D-013). The ledger remains the only coordination bus (P-090
law). Constitution review triggers: adopting this plan does not amend v3.1; the
**cutover (M5) is a mandatory constitution v4 event** — gate-bar commands, §3.1
diagram, §2.9 environment realities, and Appendix B authority chain all change at
flip. RS-11.3 drafts it; the operator ratifies it; v3.1 discipline governs until then.

## 7.4 Cutover GO/NO-GO ceremony (operator-executed, checklist form)

1. M0–M4 exits on record; every M5 exit criterion individually verified this week.
2. Fresh full-corpus replay on the cutover-candidate SHA: zero divergence, report archived.
3. Soak log: 10/10 clean days, nightly diffs archived.
4. Scar-Tissue Port Ledger: zero unmapped rows (final sweep).
5. Both gate bars green on candidate SHA; windows CI green.
6. Rollback rehearsed: previous Electron installer restored on a scratch profile,
   vault + credentials survive round-trip (measured, this week, not remembered).
7. Kill chord + arming ceremony + data-source-switch interlock hand-tested by operator
   in the Tauri build, that day.
8. Sign the ledger entry; tag `vNEXT-rs`; ship per §5.3 release protocol (perf canary
   included); TS engine freeze per RS-10.4 begins.
NO-GO on any line → named blocker to the ledger; ceremony reruns from line 1 after fix.

## 7.5 Rollback + retirement policy

Rollback (first 90 days post-flip): previous Electron release remains installed-able
and the vault format unchanged by this plan (2.5) — reverting is reinstall + relaunch;
credentials re-enter via safeStorage path if keyring migration proves one-way
(documented at RS-9.4). The TS engine stays frozen-in-tree ≥ 90 days (D-011), then
archives to a tagged branch. Its tests keep running in CI throughout the freeze —
a broken frozen engine is still a broken rollback path.

## 7.6 What "legacy-lasting" means, operationally

This plan succeeds if, years from now, a model that has never seen SATEX can read
CONSTITUTION → AGENTS → this plan → ledger and know exactly what was promised, what
was measured, what was signed, and why every wall is where it is. Every drift report,
soak log, and signed perimeter PR is part of that record. Discipline is the product;
the Rust engine is the byproduct that proves it.

---

# APPENDIX A — PARITY HARNESS SPECIFICATION

## A.1 Design: golden-file oracle, not live dual-process

The TS engine is run **once** per corpus session (RS-1.3), emitting goldens. Rust runs
compare against goldens forever after. Rationale: capture-once/diff-forever makes CI
cheap and deterministic, removes the need to co-host Node in Rust CI, and makes every
parity claim reproducible from artifacts (golden SHA + corpus SHA + engine SHA fully
determine a run). Goldens regenerate only via the RS-1.3 driver, only when a TS engine
change requires it (R8), only with review.

## A.2 Determinism contract

Both engines run replay with: injected fixed `Clock` (session's recorded timeline),
injected `SeededRng` (seed in corpus manifest), single-threaded decision sequencing
(concurrency may exist below the decision boundary but event *application order* is
the recorded tick order). Any RS-0.6 category-(c) genuine nondeterminism must be
either seamed out under replay or excluded from Oracle L1/L2 scope by explicit,
ledgered ruling — never silently tolerated.

## A.3 Oracle levels

| Level | Objects | Equality |
|---|---|---|
| **L1 — Decisions** | every gate verdict (gates 1–13 + 15 display), order intents (symbol, side, qty, stop, target, type), fills/rejects/cancels (simulated), kill/halt events, SIM/SUB badge state, data-source-switch verdicts | **exact** — any mismatch is a defect, no tolerance exists |
| **L2 — State checkpoints** | brain weight vector, calibration (samples, winRate, avgConfidence, multiplier), equity/HWM, daily PnL, open-position table, session state machine state — checkpointed every N ticks + at every L1 event | **bit-exact f64** target; any deviation root-caused; a deviation may be *accepted* only by operator ruling recorded in the ledger with its exact magnitude and cause |
| **L3 — Artifacts** | vault markdown, sqlite rows, logs | byte-exact where the format is a contract (vault files, tick recordings, kill-switch JSON); normalized structural diff elsewhere (documented normalizer per artifact type) |

## A.4 Drift report format

JSONL + human summary: `{corpus_sha, golden_sha, rs_sha, session, tick_index,
level, subsystem, field, expected, actual, context}` — first divergence per subsystem
minimum; full stream in verbose mode. Reports archive under
`Vault/00-Audit/parity/` (path ratified at RS-0.5). A parity claim without an
archived report is not a claim (RS-L4).

# APPENDIX B — NUMERIC PARITY LAW

**B.1 Types.** All market/engine math is `f64` (JS numbers are IEEE-754 binary64).
`f32` is denied by lint in engine crates. Counters/indices may be integer types where
TS semantics are integral in practice — each such narrowing is a reviewed decision in
the PR's behavior table (JS bitwise ops coerce to i32 — port those sites literally).

**B.2 Expressions.** Port arithmetic expression-by-expression preserving evaluation
order and accumulation order (summation order changes f64 results). No refactoring
`a*b + a*c` ↔ `a*(b+c)`. No `mul_add`/FMA (changes rounding vs JS). No library
substitution for ported formulas (SGD, PSR/DSR, indicators, sizing, slippage) — the
TS source is the formula. Rust does not apply fast-math; do not enable any flag that
would.

**B.3 Formatting.** Where TS bytes are contracts (A.3-L3), float→string must match
JS semantics: shortest-round-trip (Ryū — Rust's `{}` for f64 matches JS
`String(x)` for finite values in the common case, **but verify against a generated
cross-language fixture corpus, ~10⁶ random + adversarial values, in CI**) and a
ported `toFixed` helper with JS rounding quirks, fixture-tested. NaN/Infinity must
never reach serialization (guards ported; serde_json refuses them — a refusal in
production is a caught engine bug, which is the point).

**B.4 Scar-Tissue Port Ledger.** A tracked table (`docs/plans/rs-scar-ledger.md`,
created at RS-0.5) with one row per constitution-named scar class and per P-0xx
regression pin found in TS tests: `{P-id, class, TS test file:line, RS test path,
status: ported/N-A-ruled/pending}`. Named classes seeding the table: leak class (PR#6,
P-041, P-043, P-046, P-091 — becomes RAII/Drop discipline + drop-order tests),
NaN/degenerate (P-039, P-040, P-041, P-074, P-093 — proptest strategies), aliased
shared defaults (P-061, P-074 — becomes ownership; pin fresh-construction anyway),
atomic-write (kill switch), consent-flags (P-091/P-103), false-green (P-097 — oracle
mutation tests), blackscreen/kill-chord (P-044, P-098 — Tauri re-proofs). Milestone
exits require zero `pending` rows for their phases.

# APPENDIX C — IPC CONTRACT INVENTORY PROCEDURE (RS-1.6)

1. Parse `src/shared/ipc-channels.ts` mechanically (AST, not regex) → exact channel
   list; resolve the 122-vs-124 discrepancy and record the count + method.
2. For each channel: locate handler (main) + call sites (renderer/preload), extract
   the zod schema, classify direction (invoke/event), payload, reply, error shape.
3. Emit `docs/plans/rs-ipc-inventory.md`: one row per channel — this is RS-9.2's
   completeness checklist; RS-9.2 CI includes a coverage test (every inventory row
   has a registered Rust command/event; every Rust command/event has a row).
4. Renderer compatibility rule: the adapter (RS-9.3) presents the **existing**
   `window.satex` surface — names, shapes, promise/event semantics — so renderer
   source stays untouched; the generated TS types must structurally satisfy the
   current preload types (compile-time proof in CI).

# APPENDIX D — PERIMETER PORT PROTOCOL (every RS-8.x and ⚠️-adjacent task)

1. **Announce:** ledger entry claiming the task, naming the operator gate.
2. **Spec extraction:** agent produces the side-by-side behavior table (every rule,
   constant, threshold, short-circuit order, error path at TS `file:line`).
3. **Operator pre-brief:** operator acknowledges the table *before* code is written.
4. **Build:** port + tests (constants byte-compared by test; truth tables; crash
   injection where the contract is atomicity).
5. **PR:** one task, one PR; behavior table in the body; gates + parity evidence.
6. **Human review:** operator reads the diff (not the summary), may demand a
   fresh-context agent verification pass (RS-8.8 style) at will.
7. **Merge + record:** operator's approval on the PR is the signature; ledger close
   cites PR#, SHA, drift-report path.
8. **No exceptions:** not for one-line changes, not for "just tests" (the P-094
   ruling), not under schedule pressure. The wall is the wall.

# APPENDIX E — OPEN DECISIONS REGISTER

| ID | Decision | Recommendation | Status |
|---|---|---|---|
| D-001 | Coexistence strategy | Validation strangler (Layer 1.5) | **Decided in conversation 2026-07-22; ratify at adoption** |
| D-002 | Async runtime | tokio multi-thread; bounded channels; decision-order single-sequenced | Proposed |
| D-003 | SQLite crate | rusqlite (bundled) + dedicated-thread actor; NOT sqlx | Proposed |
| D-004 | TS typegen | tauri-specta if healthy at scaffold-time, else ts-rs — verify current state at RS-0.2, pin then | Proposed (deliberately deferred) |
| D-005 | HTTP/WS/TLS | reqwest + tokio-tungstenite + rustls | Proposed |
| D-006 | Credentials | `keyring` crate → Windows Credential Manager; verify DPAPI backend at RS-9.4 | Proposed |
| D-007 | Updater | tauri-plugin-updater, manual-check-only, pinned repo | Proposed |
| D-008 | Time representation | `UtcMillis(i64)` newtype everywhere in-engine; chrono only at display/parse edges | Proposed |
| D-009 | Logging | tracing + JSON layer → vault-compatible logs | Proposed |
| D-010 | Dead-code/dep gates | cargo-machete + cargo-deny in gate bar; knip remains TS-side authority | Proposed |
| D-011 | TS engine post-cutover | Frozen in-tree ≥ 90 days w/ CI, then archive branch + tag | Proposed |
| D-012 | Crate budget | ≤ 25 direct runtime deps workspace-wide, each with a justification row here at adoption | Proposed |
| D-013 | Scheduled agents | [A] lanes only, post-M1, claim protocol 0.C; ⚠️ crates and Phases 8/10 excluded permanently | Proposed |
| D-014 | Paths | `apps/satex-engine-rs` + worktree `../mc4-rust` | Accepted in conversation; ratify |
| D-015 | React Compiler / renderer track | Out of scope here; renderer measured already React 19.2.7 + Tailwind 4.3.3 — Compiler enablement is its own small ledgered task later | Proposed |
| D-016 | CI truth platform | windows-latest job is merge-blocking arbiter; ubuntu jobs advisory-fast | Proposed |
| D-017 | Golden/corpus storage | `Vault/Backtests/goldens/` + `Vault/00-Audit/parity/` vs Git LFS vs release artifacts — size-dependent; measure corpus size at RS-1.2, decide then | OPEN |

**Adoption ruling (2026-07-24, ledger P-135):** D-001–D-016 ratified by the operator as
recommended, in an interactive session with the three-gate consent recorded in P-135
(adoption + ratification · toolchain install · RS-0.1 [O]-delegation). D-017 remains OPEN
by design until corpus size is measured at RS-1.2. Any ratified decision may be re-opened
only via a new ledger entry with evidence. Toolchain fact pinned at adoption: rustc/cargo
**1.97.1** `stable-x86_64-pc-windows-msvc` installed 2026-07-24 (exact pin lands in
`rust-toolchain.toml` at RS-0.2 per RS-L5 — verify current stable then, not this snapshot).

# APPENDIX F — THE RUST GATE BAR (six gates, from `apps/satex-engine-rs/`)

| Gate | Command | Proves |
|---|---|---|
| Format | `cargo fmt --check` | canonical formatting |
| Lints | `cargo clippy --workspace --all-targets -- -D warnings` | zero warnings; unwrap/expect/f32 denials live here |
| Tests | `cargo test --workspace` | full suite green (segment per-crate under sandbox ceilings; CI arbiter) |
| Docs | `cargo doc --no-deps` (warnings denied) | public surfaces documented |
| Dead deps | `cargo machete` | no unused dependencies |
| Supply chain | `cargo deny check` | advisories, licenses, bans clean |

Law of the bar: identical to constitution §2.1 — all green before commit/merge; a gate
you can't run is named with CI as arbiter; wrappers that can exit 0 without analyzing
are banned as a class (P-097); real numbers in every PR body. The TS four-gate bar is
untouched and remains mandatory for TS-side changes. **Green gates are the floor, not
the goal** — after the gates, the question is still: does this make a live session
calmer, faster, more legible?

# APPENDIX G — GLOSSARY DELTA (extends constitution Appendix A)

| Term | Meaning |
|---|---|
| **Golden** | Byte-stable JSONL of TS engine decisions/state over a corpus session; the oracle's reference output (A.1) |
| **Corpus** | Manifest-hashed set of recorded tick sessions + adversarial synthetics (RS-1.2) |
| **Oracle L1/L2/L3** | Decision / state / artifact parity strata (A.3) |
| **Drift report** | The only artifact that may assert parity or its absence (A.4) |
| **Validation strangler** | D-001: headless per-subsystem proof, single audited shell flip |
| **Shadow soak** | Dual-terminal paper operation, nightly decision-diff, 10 clean days (RS-10.2) |
| **Scar-Tissue Port Ledger** | Completeness table mapping every TS regression pin to its Rust twin (B.4) |
| **Two-commit law** | Port verbatim first; improve separately, later, reviewed (RS-L8) |
| **⚠️ crates** | satex-risk, satex-exec (+ shell's updater/credential/arming modules): human-gated always |

---

```
[PLAN ID: RS-UP-1]  [VERSION 1.0.0 — DRAFT FOR OPERATOR ADOPTION]
[AUTHORED: 2026-07-22 by Claude Fable 5 against master @ e145dd5 — measured, not recalled]
[GOVERNED BY: CONSTITUTION v3.1 | LEDGER: P-130 on adoption | NEXT REVIEW: first M-exit]
[The code is the truth. The oracle is the judge. The operator is the only hand on the switch.]
```

— END ULTRAPLAN —





