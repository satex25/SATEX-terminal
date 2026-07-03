# SATEX — System Architecture

> The one-page map of everything in this workspace. *How to work the repo* →
> [`AGENTS.md`](AGENTS.md). *App invariants* → [`satex-app/CLAUDE.md`](apps/satex-terminal/CLAUDE.md).
> *What changed when* → [`satex-app/CHANGELOG.md`](apps/satex-terminal/CHANGELOG.md).
> Last structural update: **2026-06-16**.

---

## 1. Workspace map

```
mc4/                                ← canonical repo (master @ github.com/satex25/satex-trading)
├─ ARCHITECTURE.md                  ← this file
├─ AGENTS.md                        ← how to work: gates, branch flow, safety guardrails
├─ README.md                        ← quick start
├─ scripts/                         ← operator one-shot scripts (cleanup, migration aids)
├─ apps/
│  └─ satex-terminal/                 ← THE app (Electron + React 18 + TS, Windows-only)
├─ Vault/                           ← Obsidian vault — runtime data, untracked by design
│  ├─ 00-Audit/                     ← forensic audits (latest: 2026-06-10-FULL-SYSTEM-AUDIT)
│  ├─ Backtests/  + baselines/      ← nightly self-eval verdicts + locked baselines
│  ├─ Learnings/                    ← ≤4 KB end-of-session learning notes (auto-pruned to 30)
│  ├─ Observer/   + archive/YYYY-MM ← live checkpoints (newest 48) + monthly archive
│  ├─ Sessions/ · Trades/ · Tactics/· Brain/ · Manual/ · Symbols/ · Daily/
│  ├─ HOME.md                       ← Obsidian cockpit (was root HOME.md)
│  └─ 00-INDEX.md                   ← vault entry point
├─ docs/                            ← workspace-level docs (policy/, plans/, vendor/)
│  ├─ policy/                       ← agent constitution (rule-VS.md), UI design brief
│  ├─ plans/                        ← workspace-level ultraplans (was superpowers/)
│  └─ vendor/                       ← third-party library API extracts
├─ 90-REFERENCE/                    ← gitignored external reference dumps
└─ .github/workflows/ci.yml         ← CI: all four gates on every push/PR
```

`C:\SATEX` is a **stale duplicate clone** (May 10) — mc4 is canonical; archive or delete it.

## 2. Runtime architecture (satex-app)

Services layer (`src/main/services/`) is subdivided into 7 domain folders:
`broker/` · `execution/` ⚠️ · `risk/` ⚠️ · `market-data/` · `intelligence/` · `subsecond/` · `system/`
The ⚠️ folders contain trading-safety-perimeter files (AGENTS guardrails apply).

```
┌────────────────────────── ELECTRON MAIN ───────────────────────────────┐
│ TradingEngine (orchestrator, core/trading-engine.ts)                   │
│                                                                        │
│  DATA                   EXECUTION ⚠️          INTELLIGENCE / LEARNING  │
│  ─────                  ──────────             ─────────────────────── │
│  services/market-data/  services/execution/    services/intelligence/  │
│  MarketDataSource        OrderManager ⚠️         Brain (SGD, 7 feats)  │
│   ├ Simulator            (9 risk gates)           ├ llm.ts → AI adv.  │
│   ├ LiveMarket           services/risk/ ⚠️         │  (advisory only)  │
│   │  (Alpaca WS)         RiskGatesService           ├ CalibrationSvc   │
│   └ ReplaySource         KillSwitch ⚠️              ├ PatternLearner   │
│  LiveCandleBuffer        LiveMode interlock ⚠️      ├ TacticsEngine    │
│  SubSecondAggr                                      ├ AutonomousTrader │
│   (services/subsecond/)  services/broker/            │  (paper-only)   │
│  TickRecorder            AlpacaBrokerSession         └ SelfEvalService │
│  DepthFeed               AlpacaClient                                  │
│  Regime/Macro                                                           │
│                          services/system/                               │
│                          Persistence (SQLite, 12 tables, WAL)          │
│                          VaultWriter · Logger · CredentialStore        │
└────────────── Zod-validated IPC (103 channels, .strict()) ─────────────┘
                                   ▼
┌──────────────── PRELOAD (contextBridge, typed window.satex) ───────────┐
└────────────────────────────────────────────────────────────────────────┘
                                   ▼
┌────────────────────────── RENDERER (sandboxed) ────────────────────────┐
│ Black Box shell: TopBar · TickerTape · 3-rail dock · secondary · Bottom│
│ Workspaces ⌘1-5: Trade / Focus / Markets / Replay / Quad               │
│ 16 panels · 7 modals · Zustand stores · lightweight-charts v5          │
│ Design system: --bb-* tokens · 4 themes · 9-step --text-* type scale   │
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
Baseline 2026-06-27: **1268 tests / 98 files**, all four gates green on `feat/d10-funded-account` @ e158e48 + edits (working tree; jsdom — see P-019). <!-- refresh: scripts/update-baseline.sh -->

Program ladder (spec: `satex-app/docs/plans/specs/2026-06-02-topstep-eval-capable-program-design.md`):
**L1.A ✅ → L1.B ✅ → L1.C ✅ → L1.D (funded compliance) → L1.E (payouts) →
L1.F (ensemble → autonomous wiring + brain depth features) → L1.G (Tradovate)**.
Release blocker: Authenticode cert (CSR ready at `satex-app/certs/`).

## 5. Maintenance contract for this file

Update §1 when folders move, §2 when a service is added/removed, §3 when the
learning loop gains a stage, §4 when the ladder advances. Per-release detail
belongs in the CHANGELOG — this file stays a stable map.
