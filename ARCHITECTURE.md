# SATEX — System Architecture

> The one-page map of everything in this workspace. *How to work the repo* →
> [`AGENTS.md`](AGENTS.md). *App invariants* → [`apps/satex-terminal/CLAUDE.md`](apps/satex-terminal/CLAUDE.md).
> *What changed when* → [`CHANGELOG.md`](apps/satex-terminal/CHANGELOG.md).
> Last structural update: **2026-07-15**.

---

## 1. Workspace map

```
mc4/                                ← canonical repo (master @ github.com/satex25/SATEX-terminal)
├─ ARCHITECTURE.md                  ← this file
├─ AGENTS.md                        ← how to work: gates, branch flow, safety guardrails
├─ CONSTITUTION.md                  ← behavior constitution for every intelligence on the repo
├─ README.md                        ← quick start
├─ scripts/                         ← operator scripts (one-shot archive in scripts/archive/)
├─ apps/
│  └─ satex-terminal/               ← THE app (Electron + React 18 + TS, Windows-only)
├─ Vault/                           ← Obsidian vault — operational memory (runtime data
│  │                                   untracked; the ledger, audits, and READMEs are tracked)
│  ├─ 00-Audit/                     ← PROBLEM-LEDGER.md (living PSD queue) + forensic audits
│  ├─ Backtests/  + baselines/      ← nightly self-eval verdicts + locked baselines
│  ├─ Learnings/                    ← ≤4 KB end-of-session learning notes (auto-pruned to 30)
│  ├─ Observer/   + archive/YYYY-MM ← live checkpoints (newest 48) + monthly archive
│  ├─ Sessions/ · Trades/ · Tactics/· Brain/ · Manual/ · Symbols/ · Daily/
│  ├─ HOME.md                       ← Obsidian cockpit
│  └─ 00-INDEX.md                   ← vault entry point
├─ docs/                            ← GETTING-STARTED · FAQ · CONTRIBUTING · SECURITY
│  ├─ policy/                       ← agent constitution (rule-VS.md), UI design brief
│  ├─ plans/ · guides/ · audits/    ← workspace-level plans, guides, evidence audits
│  └─ vendor/                       ← third-party library API extracts
├─ reference/                       ← historical artifacts (git-bundles/) + gitignored vendor dumps
└─ .github/workflows/ci.yml         ← CI: all four gates on every push/PR
```

`C:\SATEX` is a **stale duplicate clone** (May 10) — mc4 is canonical; archive or delete it.

## 2. Runtime architecture (apps/satex-terminal)

`src/main/` is three layers — `core/` (the `trading-engine.ts` orchestrator, ~2,700
lines, plus extracted pure logic: `data-source-guard` · `order-event-router` ·
`order-fill-learning-router` · `ensemble-fuser` · `simulator-bracket`), a **flat**
`services/` directory (53 modules; the Alpaca broker facets live in
`services/alpaca/`), and `backtest/` (runner · strategies · sizing · slippage).
Trading-safety-perimeter files ⚠️ (AGENTS guardrails apply): `order-manager.ts`,
`risk-gates.ts`, `kill-switch-store.ts`, `live-mode.ts`, and Alpaca order submission.

```
┌────────────────────────── ELECTRON MAIN ───────────────────────────────┐
│ TradingEngine (orchestrator, core/trading-engine.ts)                   │
│                                                                        │
│  DATA                    EXECUTION ⚠️           INTELLIGENCE / LEARNING│
│  ─────                   ──────────             ────────────────────── │
│  MarketDataSource        OrderManager ⚠️        Brain (SGD, 7 feats)   │
│   ├ Simulator             (9 risk gates +        ├ llm.ts → AI adv.    │
│   ├ LiveMarket             funded gates 9–13)    │  (advisory only)    │
│   │  (Alpaca WS)         RiskGatesService        ├ CalibrationSvc      │
│   └ ReplaySource          (15 display gates)     ├ PatternLearner      │
│  LiveCandleBuffer        KillSwitch ⚠️           ├ TacticsEngine       │
│  SubSecondAggr           LiveMode interlock ⚠️   ├ AutonomousTrader    │
│  TickRecorder                                    │  (paper-only)       │
│  DepthFeed               services/alpaca/        └ SelfEvalService     │
│  Regime/Macro/Edgar       broker-session ·                             │
│                           order-router ·        Persistence (SQLite,   │
│                           account-syncer ·       13 tables, WAL)       │
│                           symbol-resolver       VaultWriter · Logger   │
│                                                 CredentialStore        │
└────────────── Zod-validated IPC (122 channels, .strict()) ─────────────┘
                                   ▼
┌──────────────── PRELOAD (contextBridge, typed window.satex) ───────────┐
└────────────────────────────────────────────────────────────────────────┘
                                   ▼
┌────────────────────────── RENDERER (sandboxed) ────────────────────────┐
│ Black Box shell: TopBar · TickerTape · collapsible rail dock (9 rails) │
│ Workspaces ⌘1–6: Trade / Focus / Markets / Replay / Quad / Intel       │
│ 21 panels · 7 modals · 22 Zustand stores · lightweight-charts v5       │
│  + custom WebGL layer (footprint · vol-heatmap · volume-profile · LOD) │
│ Design system: --bb-* tokens · 3 themes · 9-step --text-* type scale   │
└────────────────────────────────────────────────────────────────────────┘
```

## 3. The learning loop (closed 2026-06-10)

```
 decide ──► trade (paper) ──► close ──► learn ──► verify ──► report
   │            │               │         │          │          │
 Brain +     OrderManager   recordTrade  Brain.learn SelfEval  Learnings
 calibrated  9 gates +      Close (one   (SGD) +     nightly   note on
 confidence  3 walls        choke point) Calibration backtest  shutdown
   ▲                                     .record()   vs locked (≤4 KB,
   └────────── downgrade-only multiplier ◄───────────baselines  capped)
               (winRate / avgConfidence, ≥30 samples)
```

Safety invariants of the loop: the LLM narrates but never trades; calibration
can only *reduce* autonomous activity; self-eval and learnings are strictly
observational; risk limits are read-only to every learning component.

## 4. Quality gates & program

All four must be green before any commit/merge (CI enforces on every push/PR):
`npm run typecheck` · `npm run lint` · `npm test` · `npm run knip`.
Baseline 2026-07-13: **1668 tests / 126 files**, all four gates green at the P-100 gate record (content on `master` @ 32ceccd; operator hardware, Node 24.15; jsdom — see P-019). <!-- refresh: scripts/update-baseline.sh -->

Program ladder (spec: `apps/satex-terminal/docs/superpowers/specs/2026-06-02-topstep-eval-capable-program-design.md`):
**L1.A ✅ → L1.B ✅ → L1.C ✅ → L1.D (funded compliance) → L1.E (payouts) →
L1.F (ensemble → autonomous wiring + brain depth features) → L1.G (Tradovate)**.
Release blocker: Authenticode cert (CSR ready at `apps/satex-terminal/certs/`).

## 5. Maintenance contract for this file

Update §1 when folders move, §2 when a service is added/removed, §3 when the
learning loop gains a stage, §4 when the ladder advances. Per-release detail
belongs in the CHANGELOG — this file stays a stable map.
