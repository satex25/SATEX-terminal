@echo off
setlocal enabledelayedexpansion
:: =========================================================================
:: push-outstanding-fixes.bat
::
:: Stages and pushes ALL outstanding satex-app working-tree changes as a
:: single well-documented commit on a new branch.
::
:: Included in this commit:
::
::   P-013: Simulator bracket execution engine
::     + src/main/core/simulator-bracket.ts (NEW — pure checkBracketHit)
::     + src/main/core/simulator-bracket.test.ts (NEW — 14 tests)
::     M src/main/core/trading-engine.ts (bracket hook + L1.F wiring)
::
::   P-024: PRNG + ID-generator test coverage
::     + src/main/services/rng.test.ts (NEW — 13 tests)
::     + src/main/services/id-generator.test.ts (NEW — 8 tests)
::
::   L1.F / P-009: Brain depth wiring + regime-aware ensemble confidence fusion
::     + src/main/core/ensemble-fuser.ts (NEW — pure fuseWithRegime)
::     + src/main/core/ensemble-fuser.test.ts (NEW — 24 tests)
::     M src/main/services/brain.ts (depth param wired)
::     M src/main/backtest/brain-strategy.ts (snap.depth passed)
::
::   M CHANGELOG.md
::
:: REQUIRES HUMAN SIGN-OFF before merge.
:: This branch touches the live trading decision path (brain + engine).
::
:: Usage: run from mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\ directory
:: AFTER the chart branch has been merged to master and you have pulled:
::
::   cd mc4
::   git checkout master
::   git pull
::   cd 00-PROJECT-ROOT\01-SATEX-CORE\satex-app
::   ..\..\..\scripts\push-outstanding-fixes.bat
:: =========================================================================

set "BRANCH=fix/p013-p024-l1f-outstanding"
set "REMOTE=origin"

echo.
echo ============================================================
echo  SATEX Outstanding Fixes — Combined Push Script
echo  P-013 + P-024 + L1.F/P-009
echo ============================================================
echo.

:: ── Confirm we're branching from master ──────────────────────────────────
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT=%%b"
if not "!CURRENT!"=="master" (
    echo WARNING: Current branch is '!CURRENT!', expected 'master'.
    echo          Run: git checkout master ^&^& git pull
    echo          Then re-run this script.
    exit /b 1
)
echo Branch origin confirmed: master
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
git checkout -b %BRANCH%
if !errorlevel! neq 0 (
    echo FAIL — could not create branch (may already exist: git checkout %BRANCH%)
    exit /b 1
)
echo.

:: ── Stage all satex-app changes ───────────────────────────────────────────
echo Staging all outstanding satex-app files...

:: P-013
git add src/main/core/simulator-bracket.ts
git add src/main/core/simulator-bracket.test.ts

:: P-024
git add src/main/services/rng.test.ts
git add src/main/services/id-generator.test.ts

:: L1.F / P-009
git add src/main/core/ensemble-fuser.ts
git add src/main/core/ensemble-fuser.test.ts
git add src/main/services/brain.ts
git add src/main/backtest/brain-strategy.ts

:: trading-engine.ts carries both P-013 bracket hook + L1.F depth wiring
git add src/main/core/trading-engine.ts

:: Changelog
git add CHANGELOG.md

echo.
git diff --cached --stat
echo.

:: ── Commit ────────────────────────────────────────────────────────────────
set "MSG=fix(engine+brain): P-013 bracket engine + P-024 test coverage + L1.F ensemble fuser

P-013: Simulator bracket execution engine
  checkBracketHit() pure fn (simulator-bracket.ts) — long/short, stop-loss
  priority on simultaneous cross. Hooked in onQuotesBatch when !this.alpaca.
  Fill via om.createOrder+om.fillOrder; VaultWriter fires on every close.
  14 unit tests in simulator-bracket.test.ts.

P-024: PRNG + ID-generator test coverage
  rng.test.ts: 13 tests (bounds, determinism, nextInt, Box-Muller, edges)
  id-generator.test.ts: 8 tests (prefix, uniqueness, orderId/sessionId)
  +21 tests total.

L1.F / P-009: Brain depth wiring + regime-aware ensemble confidence fusion
  P-009: brain.ts decisionFromLocal()+decide() now accept depth?:DepthSnapshot
  — depth_imbalance + microprice_dev are non-zero when L2 data is available.
  brain-strategy.ts passes snap.depth on backtest path.
  ensemble-fuser.ts (new pure module): fuseWithRegime() scales confidence by
  regime x EMA-alignment multiplier before calibration:
    trend aligned x1.20 | opposed x0.65
    range mean-rev x1.10 | trend-follow x0.75 | chop pass-through
  getAiDecision() wired: depth -> brain.decide() -> fuseWithRegime() -> calibrate()
  24 unit tests (isEmaAligned x6, isAlignedWithRegime x7, fuseWithRegime x11).

REQUIRES HUMAN SIGN-OFF — live capital decision path."

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
echo  Open PR on GitHub:
echo    Base:  master
echo    Head:  %BRANCH%
echo    Title: fix(engine+brain): P-013 + P-024 + L1.F ensemble fuser
echo.
echo  ** REQUIRES YOUR SIGN-OFF before merge **
echo     Review trading-engine.ts getAiDecision() before merging.
echo ============================================================
echo.
endlocal
