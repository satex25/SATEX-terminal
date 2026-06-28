@echo off
setlocal enabledelayedexpansion
:: =========================================================================
:: push-p013-p024-fixes.bat
::
:: Commits and pushes the P-013 + P-024 fixes from the working tree.
::
:: P-013: Simulator bracket execution engine
::   - src/main/core/simulator-bracket.ts (NEW)
::   - src/main/core/simulator-bracket.test.ts (NEW — 14 tests)
::   - src/main/core/trading-engine.ts (MODIFIED — bracket hook)
::
:: P-024: PRNG + ID-generator test coverage
::   - src/main/services/rng.test.ts (NEW — 13 tests)
::   - src/main/services/id-generator.test.ts (NEW — 8 tests)
::
:: CHANGELOG.md updated for both.
::
:: This script:
::   1. Runs all four gates (typecheck, lint, test, knip)
::   2. Creates fix/p013-p024-fixes branch from current HEAD
::   3. Stages + commits the working tree delta
::   4. Pushes to origin
::
:: Usage: run from mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\ directory.
::   ..\..\..\scripts\push-p013-p024-fixes.bat
:: =========================================================================

set "BRANCH=fix/p013-p024-fixes"
set "REMOTE=origin"

echo.
echo ============================================================
echo  SATEX P-013 + P-024 Fix Push Script
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
echo Staging files...

:: P-013
git add src/main/core/simulator-bracket.ts
git add src/main/core/simulator-bracket.test.ts
git add src/main/core/trading-engine.ts

:: P-024
git add src/main/services/rng.test.ts
git add src/main/services/id-generator.test.ts

:: Changelog
git add CHANGELOG.md

echo.
git diff --cached --stat
echo.

:: ── Commit ────────────────────────────────────────────────────────────────
set "MSG=fix(engine): P-013 simulator bracket engine + P-024 PRNG/ID test coverage

P-013: autonomous paper positions now close on stop-loss/take-profit.
checkBracketHit() is a pure function (simulator-bracket.ts) — handles
long + short, stop-loss priority on simultaneous cross. Hooked in
onQuotesBatch when this.alpaca === null. Fill via om.createOrder +
om.fillOrder so VaultWriter/recordTradeClose fire on every close.
14 unit tests in simulator-bracket.test.ts.

P-024: rng.ts (mulberry32 PRNG) and id-generator.ts had zero test coverage.
rng.test.ts: 13 tests — bounds, determinism, nextInt, Box-Muller, edge cases.
id-generator.test.ts: 8 tests — prefix format, uniqueness, orderId/sessionId.
+21 tests total.

All four gates green."

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
echo  Next: open PR on GitHub
echo    Base:  master
echo    Head:  %BRANCH%
echo    Title: fix(engine): P-013 simulator bracket + P-024 PRNG/ID test coverage
echo ============================================================
echo.
endlocal
