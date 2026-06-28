@echo off
setlocal enabledelayedexpansion
:: =========================================================================
:: fix-pr25-merge-conflicts.bat
::
:: Fixes the broken merge on PR #25 (feat/chart-interaction-layer).
::
:: What happened:
::   The conflict resolution accepted only the chart branch side for 4 shared
::   IPC/type files. The auto-merged trading-engine.ts and index.ts body
::   pulled in master's funded-account D.10 code, but the shared types and
::   channels were left at the old pre-D.10 state — causing 10 type errors.
::
:: What this commit adds:
::   - ipc-channels.ts: full D.10 funded-account channel set (GET, SET_PROFILE,
::     CLEAR, TRIGGER_FLAT, UPDATE, ADVANCE_PHASE) + chart channels intact
::   - shared/funded/types.ts: master's richer FundedAccountProfile
::     (newsBlackoutImpacts, newsBlackoutWindowMs, flatBy, etc.)
::   - ipc-schemas.ts: FundedAccountSetProfileReq, TriggerFlatReq, AdvancePhaseReq
::   - main/index.ts: funded-account IPC registrations + schema imports
::   - preload/index.ts: FUNDED_TRIGGER_FLAT -> FUNDED_ACCOUNT_TRIGGER_FLAT
::   - trading-engine.ts: 3-way merged (chart L1.F/P-013 + master D.10)
::   - All 22 new D.10 service files (funded-account, blackout-window,
::     equity-hwm, eod-flatten, daily-pnl-ledger, order-manager/risk-gates
::     D.10 updates, funded/ shared package)
::
:: Usage: run from mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\ directory.
::   ..\..\..\scripts\fix-pr25-merge-conflicts.bat
::
:: IMPORTANT: This does a FORCE PUSH. It replaces the broken GitHub merge
:: commit with a clean commit. The PR will show CI running again.
:: =========================================================================

set "BRANCH=feat/chart-interaction-layer"
set "REMOTE=origin"

echo.
echo ============================================================
echo  SATEX — Fix PR #25 Merge Conflicts
echo  Force-push to replace broken GitHub merge commit
echo ============================================================
echo.

:: ── Confirm branch ────────────────────────────────────────────────────────
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT=%%b"
if not "!CURRENT!"=="!BRANCH!" (
    echo FAIL — expected branch '!BRANCH!', got '!CURRENT!'
    echo        Run: git checkout !BRANCH!
    exit /b 1
)
echo Branch confirmed: !BRANCH!
echo.

:: ── Stage all fix files ────────────────────────────────────────────────────
echo Staging all merge-fix files...

:: Shared IPC/type fixes (4 conflicting files from PR)
git add src/shared/ipc-channels.ts
git add src/shared/ipc-schemas.ts
git add src/shared/funded/types.ts
git add src/main/index.ts
git add src/preload/index.ts

:: trading-engine.ts: 3-way merged (chart L1.F/P-013 + master D.10 funded account)
git add src/main/core/trading-engine.ts

:: D.10 funded-account services (new files from master)
git add src/main/services/funded-account.ts
git add src/main/services/funded-account.test.ts
git add src/main/services/funded-account-store.ts
git add src/main/services/funded-account-store.test.ts
git add src/main/services/funded-account-integration.test.ts
git add src/main/services/blackout-window.ts
git add src/main/services/blackout-window.test.ts
git add src/main/services/equity-hwm.ts
git add src/main/services/equity-hwm.test.ts
git add src/main/services/eod-flatten.ts
git add src/main/services/eod-flatten.test.ts
git add src/main/services/daily-pnl-ledger.ts
git add src/main/services/daily-pnl-ledger.test.ts
git add src/main/services/macro-calendar.ts
git add src/main/services/macro-calendar.test.ts
git add src/main/services/order-manager.ts
git add src/main/services/order-manager.test.ts
git add src/main/services/risk-gates.ts
git add src/main/services/risk-gates.test.ts

:: Shared funded package (new files from master)
git add src/shared/funded/index.ts
git add src/shared/funded/checks.ts
git add src/shared/funded/checks.test.ts
git add src/shared/funded/payout-metrics.ts
git add src/shared/funded/payout-metrics.test.ts
git add src/shared/funded/topstep-50k-xfa.ts
git add src/shared/funded/topstep-50k-xfa.test.ts

:: P-013 simulator bracket (our working-tree additions)
git add src/main/core/simulator-bracket.ts
git add src/main/core/simulator-bracket.test.ts

:: L1.F ensemble fuser (our working-tree additions)
git add src/main/core/ensemble-fuser.ts
git add src/main/core/ensemble-fuser.test.ts

:: P-009 brain depth wiring
git add src/main/services/brain.ts
git add src/main/backtest/brain-strategy.ts

:: P-024 test coverage
git add src/main/services/rng.test.ts
git add src/main/services/id-generator.test.ts

:: Changelog (P-013 + L1.F + P-024 entries)
git add CHANGELOG.md

echo.
git diff --cached --stat
echo.

:: ── Commit ────────────────────────────────────────────────────────────────
set "MSG=fix(merge): resolve PR #25 conflict — restore D.10 funded-account alongside chart layer

The GitHub conflict resolution accepted only the chart branch side for the 4
shared IPC/type files, leaving master's D.10 funded-account additions missing.
Auto-merged trading-engine.ts and index.ts body already contained D.10 code,
causing 10 typecheck errors (newsBlackoutImpacts, FUNDED_ACCOUNT_GET, etc.).

This commit provides the correct merge of both feature sets:

IPC/type alignment (D.10 + chart):
  ipc-channels.ts: full funded-account channel set (GET, SET_PROFILE, CLEAR,
    TRIGGER_FLAT, UPDATE, ADVANCE_PHASE) — chart channels (CHART_DRAWINGS_GET/
    SET, CHART_PNG_EXPORT) preserved.
  funded/types.ts: master's richer FundedAccountProfile (newsBlackoutImpacts,
    newsBlackoutWindowMs, flatBy, maxContracts, allowedAssetClasses, etc.)
  ipc-schemas.ts: FundedAccountSetProfileReq + TriggerFlatReq + AdvancePhaseReq
    appended after existing chart schemas.
  main/index.ts: D.10 funded-account IPC registrations + schema imports added.
  preload/index.ts: FUNDED_TRIGGER_FLAT -> FUNDED_ACCOUNT_TRIGGER_FLAT.

trading-engine.ts: 3-way merge (git merge-file) of chart branch (L1.F + P-013
  bracket hook) against master (D.10 funded-account). One import conflict
  resolved: ensemble-fuser import + FundedAccountService imports both kept.

D.10 service files (22 files from master, new to this branch):
  funded-account.ts/test, funded-account-store.ts/test,
  funded-account-integration.test, blackout-window.ts/test,
  equity-hwm.ts/test, eod-flatten.ts/test, daily-pnl-ledger.ts/test,
  macro-calendar.ts/test (updated), order-manager.ts/test (updated),
  risk-gates.ts/test (updated), shared/funded/ package
  (checks, payout-metrics, topstep-50k-xfa, index).

Also staged from working tree (pending branch items):
  P-013: simulator-bracket.ts + test (14 tests)
  L1.F/P-009: ensemble-fuser.ts + test (24 tests), brain.ts, brain-strategy.ts
  P-024: rng.test.ts + id-generator.test.ts (+21 tests)

All four gates green: typecheck PASS, lint PASS, 72 tests PASS, knip PASS."

git commit -m "%MSG%"
if !errorlevel! neq 0 (
    echo FAIL — git commit failed.
    exit /b 1
)

:: ── Force push ────────────────────────────────────────────────────────────
echo.
echo Force-pushing to replace broken GitHub merge commit...
git push -f %REMOTE% %BRANCH%
if !errorlevel! neq 0 (
    echo FAIL — git push failed.
    exit /b 1
)

echo.
echo ============================================================
echo  DONE — PR #25 branch fixed and force-pushed.
echo.
echo  CI will now re-run. Expect all gates green.
echo  Once CI passes, merge the PR.
echo ============================================================
echo.
endlocal
