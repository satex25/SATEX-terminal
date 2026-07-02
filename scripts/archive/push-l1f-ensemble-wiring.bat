@echo off
setlocal enabledelayedexpansion
:: =========================================================================
:: push-l1f-ensemble-wiring.bat
::
:: Stages and pushes the L1.F / P-009 feature branch.
::
:: P-009: L2 order-book depth features wired into brain decisions
::   - services/brain.ts: decisionFromLocal + decide now accept depth?
::   - backtest/brain-strategy.ts: passes snap.depth
::
:: L1.F: regime-aware ensemble confidence fusion
::   - src/main/core/ensemble-fuser.ts (NEW — pure module)
::   - src/main/core/ensemble-fuser.test.ts (NEW — 24 tests)
::   - trading-engine.ts: getAiDecision wires depth + fuseWithRegime
::
:: Multiplier table:
::   trend_up/down aligned   x1.20  |  opposed         x0.65
::   range mean-reversion    x1.10  |  trend-follow    x0.75
::   chop / unknown          pass-through
::
:: REQUIRES HUMAN SIGN-OFF before merge (live decision path).
:: See AGENTS.md gate-bar rules.
::
:: Usage: run from mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\ directory.
::   ..\..\..\scripts\push-l1f-ensemble-wiring.bat
:: =========================================================================

set "BRANCH=feat/l1f-ensemble-wiring"
set "REMOTE=origin"

echo.
echo ============================================================
echo  SATEX L1.F / P-009 — Ensemble Wiring Push Script
echo ============================================================
echo.

:: ── Gate 1: Typecheck ─────────────────────────────────────────────────────
echo [1/4] Running typecheck...
call npm run typecheck
if !errorlevel! neq 0 (
    echo FAIL — typecheck errors. Aborting.
    exit /b 1
)
echo PASS
echo.

:: ── Gate 2: Lint ──────────────────────────────────────────────────────────
echo [2/4] Running lint...
call npm run lint
if !errorlevel! neq 0 (
    echo FAIL — lint errors. Aborting.
    exit /b 1
)
echo PASS
echo.

:: ── Gate 3: Tests ─────────────────────────────────────────────────────────
echo [3/4] Running tests...
call npm test
if !errorlevel! neq 0 (
    echo FAIL — tests failed. Aborting.
    exit /b 1
)
echo PASS
echo.

:: ── Gate 4: Knip ──────────────────────────────────────────────────────────
echo [4/4] Running knip...
call npm run knip
if !errorlevel! neq 0 (
    echo FAIL — knip found dead code. Aborting.
    exit /b 1
)
echo PASS
echo.

:: ── Branch ────────────────────────────────────────────────────────────────
echo Creating branch: %BRANCH%
git checkout -b %BRANCH% 2>nul || git checkout %BRANCH%
if !errorlevel! neq 0 (
    echo FAIL — could not checkout branch.
    exit /b 1
)
echo.

:: ── Stage ─────────────────────────────────────────────────────────────────
echo Staging L1.F files...

:: Ensemble fuser (new pure module + tests)
git add src/main/core/ensemble-fuser.ts
git add src/main/core/ensemble-fuser.test.ts

:: Engine wiring
git add src/main/core/trading-engine.ts

:: Brain depth wiring (P-009)
git add src/main/services/brain.ts

:: Backtest path
git add src/main/backtest/brain-strategy.ts

echo.
git diff --cached --stat
echo.

:: ── Commit ────────────────────────────────────────────────────────────────
set "MSG=feat(brain): L1.F regime-aware ensemble fuser + P-009 depth wiring

P-009: wire this.depth.get(symbol) into brain.decide() / decisionFromLocal().
depth_imbalance and microprice_dev are now non-zero when L2 data is available.
Backtest path (brain-strategy.ts) passes snap.depth in lockstep.

L1.F: new pure module ensemble-fuser.ts applies a regime x EMA-alignment
multiplier to brain confidence before calibration.calibrate():
  trend_up/down aligned  x1.20 | opposed        x0.65
  range mean-reversion   x1.10 | trend-follow   x0.75
  chop / unknown         pass-through
isAlignedWithRegime() uses regime-relative logic: trending regimes check bias
direction; range regime checks EMA stack opposition (counter-trend = mean-rev).
Output clamped [0,1]. Wired in getAiDecision() between brain.decide + calibrate.

Tests: ensemble-fuser.test.ts 24/24 (isEmaAligned x6, isAlignedWithRegime x7,
fuseWithRegime x11). All four gates green.

REQUIRES HUMAN SIGN-OFF before merge — live capital decision path."

git commit -m "%MSG%"
if !errorlevel! neq 0 (
    echo FAIL — git commit failed.
    exit /b 1
)

:: ── Push ──────────────────────────────────────────────────────────────────
echo.
echo Pushing %BRANCH% to %REMOTE%...
git push -u %REMOTE% %BRANCH%
if !errorlevel! neq 0 (
    echo FAIL — git push failed.
    exit /b 1
)

echo.
echo ============================================================
echo  DONE — %BRANCH% pushed.
echo.
echo  Next steps:
echo    1. Open PR on GitHub:
echo       Base:  master
echo       Head:  %BRANCH%
echo       Title: feat(brain): L1.F regime-aware ensemble fuser + P-009 depth wiring
echo.
echo    2. REQUIRES HUMAN SIGN-OFF before merge.
echo       This branch touches the live trading decision path.
echo       Review getAiDecision() in trading-engine.ts.
echo ============================================================
echo.
endlocal
