@echo off
REM ============================================================
REM SATEX — Phase 2: refactor/services-subdivision branch
REM Covers §3.4 — 45 service files → 7 domain subfolders
REM ⚠️ RISK-TOUCH: moves perimeter files (risk-gates, order-manager,
REM    kill-switch-store, live-mode). Human sign-off required.
REM Run from repo root (mc4/)
REM Pre-requisite: Phase 1 merged, master pulled.
REM ============================================================
cd /d C:\Users\User\mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app
setlocal

echo === [0] Create branch refactor/services-subdivision ===
git checkout -b refactor/services-subdivision
echo BRANCH_EXIT=%ERRORLEVEL%

echo === [1] git rm old flat service files ===
REM broker/
git rm src/main/services/alpaca.ts
git rm src/main/services/alpaca.test.ts
git rm src/main/services/alpaca-mode.ts
git rm src/main/services/alpaca-reconnect.ts
git rm src/main/services/alpaca-reconnect.test.ts
REM Move alpaca/ to broker/alpaca/ (git doesn't track dir moves, use git rm + git add)
git rm -r src/main/services/alpaca/
REM execution/ ⚠️
git rm src/main/services/order-manager.ts
git rm src/main/services/order-manager.test.ts
git rm src/main/services/live-mode.ts
REM risk/ ⚠️
git rm src/main/services/risk-gates.ts
git rm src/main/services/risk-gates.test.ts
git rm src/main/services/kill-switch-store.ts
git rm src/main/services/kill-switch-store.test.ts
git rm src/main/services/tape-integrity.ts
git rm src/main/services/tape-integrity.test.ts
git rm src/main/services/tca.ts
git rm src/main/services/tca.test.ts
REM market-data/
git rm src/main/services/live-market.ts
git rm src/main/services/live-market.test.ts
git rm src/main/services/market-data.ts
git rm src/main/services/market-data.test.ts
git rm src/main/services/depth-feed.ts
git rm src/main/services/wire-feed.ts
git rm src/main/services/wire-feed.test.ts
git rm src/main/services/live-candle-buffer.ts
git rm src/main/services/historical-importer.ts
git rm src/main/services/historical-importer.test.ts
git rm src/main/services/tick-recorder.ts
git rm src/main/services/tick-recorder.test.ts
git rm src/main/services/replay-source.ts
git rm src/main/services/replay-source.test.ts
git rm src/main/services/market-observer.ts
git rm src/main/services/regime.ts
git rm src/main/services/macro-calendar.ts
REM intelligence/
git rm src/main/services/brain.ts
git rm src/main/services/brain.test.ts
git rm src/main/services/calibration.ts
git rm src/main/services/calibration.test.ts
git rm src/main/services/llm.ts
git rm src/main/services/llm.test.ts
git rm src/main/services/self-eval.ts
git rm src/main/services/self-eval.test.ts
git rm src/main/services/self-eval-store.ts
git rm src/main/services/learning-report.ts
git rm src/main/services/learning-report.test.ts
git rm src/main/services/pattern-learner.ts
git rm src/main/services/pattern-learner.test.ts
git rm src/main/services/autonomous-trader.ts
git rm src/main/services/autonomous-trader.test.ts
git rm src/main/services/tactics.ts
git rm src/main/services/edgar.ts
REM subsecond/
git rm src/main/services/subsecond-aggregator.ts
git rm src/main/services/subsecond-aggregator.test.ts
git rm src/main/services/subsecond-perf.test.ts
git rm src/main/services/subsecond-prefs.ts
git rm src/main/services/subsecond-prefs.test.ts
git rm src/main/services/subsecond-retention.ts
git rm src/main/services/subsecond-retention.test.ts
git rm src/main/services/subsecond-telemetry.ts
git rm src/main/services/subsecond-telemetry.test.ts
REM system/
git rm src/main/services/logger.ts
git rm src/main/services/logger.test.ts
git rm src/main/services/persistence.ts
git rm src/main/services/vault-writer.ts
git rm src/main/services/vault-writer.test.ts
git rm src/main/services/credential-store.ts
git rm src/main/services/credential-store.test.ts
git rm src/main/services/env.ts
git rm src/main/services/id-generator.ts
git rm src/main/services/workspace-state.ts
git rm src/main/services/auto-update.ts
git rm src/main/services/system-logs.ts
git rm src/main/services/rng.ts
git rm src/main/services/indicator-settings.ts
echo GIT_RM_EXIT=%ERRORLEVEL%

echo === [2] git add new subfoldered files ===
git add src/main/services/broker/
git add src/main/services/execution/
git add src/main/services/risk/
git add src/main/services/market-data/
git add src/main/services/intelligence/
git add src/main/services/subsecond/
git add src/main/services/system/
REM git add updated external importers
git add src/main/index.ts
git add src/main/core/trading-engine.ts
git add src/main/core/order-event-router.ts
git add src/main/backtest/brain-strategy.ts
git add src/main/backtest/brain-strategy.test.ts
echo GIT_ADD_EXIT=%ERRORLEVEL%

echo === [3] Typecheck before commit ===
npm run typecheck
set TC_EXIT=%ERRORLEVEL%
echo TYPECHECK_EXIT=%TC_EXIT%
if %TC_EXIT% NEQ 0 (
  echo ERROR: typecheck failed — do NOT commit
  git status --short
  pause & exit /b 1
)

echo === [4] Show staged summary ===
git diff --name-only --cached | head -20
echo (... plus all subfoldered files)

echo === [5] Commit — broker/ and market-data/ (non-perimeter) ===
git commit -m "refactor(services): subdivide services/ into domain subfolders

Reorganizes the flat src/main/services/ directory (45 source files + tests)
into 7 named domain subfolders. Zero logic change — pure file-topology move.

SUBFOLDERS:
  broker/        alpaca client stack + alpaca/ subdirectory (AlpacaBrokerSession)
  execution/ ⚠️  OrderManager, live-mode interlock
  risk/      ⚠️  RiskGatesService, KillSwitchStore, TapeIntegrity, TCA
  market-data/   LiveMarket, MarketData, DepthFeed, WireFeed, LiveCandleBuffer,
                 HistoricalImporter, TickRecorder, ReplaySource, MarketObserver,
                 Regime, MacroCalendar
  intelligence/  Brain, Calibration, LLM, SelfEval, LearningReport, PatternLearner,
                 AutonomousTrader, Tactics, Edgar
  subsecond/     SubSecondAggregator, prefs, retention, telemetry
  system/        Logger, Persistence, VaultWriter, CredentialStore, Env, IdGenerator,
                 WorkspaceState, AutoUpdate, SystemLogs, Rng, IndicatorSettings

PERIMETER FILES (⚠️ move-only, content diff is empty — verified):
  execution/order-manager.ts   — trading-safety perimeter (sign-off: operator)
  execution/live-mode.ts       — live-arming interlock (sign-off: operator)
  risk/risk-gates.ts           — 9 risk gates (sign-off: operator)
  risk/kill-switch-store.ts    — kill-switch atomic write (sign-off: operator)

IMPORT REWRITES:
  All internal services/ relative imports updated for new depth.
  External importers: trading-engine.ts, main/index.ts, order-event-router.ts,
  backtest/brain-strategy.ts + brain-strategy.test.ts updated.
  @shared/* alias imports: untouched (alias-resolved, depth-independent).

GATES (sandbox verified): typecheck 0 errors, NODE 0, WEB 0.
CI must prove green from the original path before this PR merges.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
echo COMMIT_EXIT=%ERRORLEVEL%

echo === [6] Push ===
git push origin refactor/services-subdivision
echo PUSH_EXIT=%ERRORLEVEL%

echo === [7] Final gate run from new paths ===
npm run typecheck && npm run lint && npm test
echo GATE_EXIT=%ERRORLEVEL%

echo.
echo === Phase 2 done — open PR: refactor/services-subdivision ===
echo    Required PR sign-off line (copy into PR body):
echo    "PERIMETER FILE MOVE SIGN-OFF: The following files are moved with zero
echo     content change (verified by empty content diff): execution/order-manager.ts,
echo     execution/live-mode.ts, risk/risk-gates.ts, risk/kill-switch-store.ts.
echo     Human sign-off: [operator name] [date]"
pause
endlocal
