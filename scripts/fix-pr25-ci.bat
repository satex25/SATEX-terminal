@echo off
setlocal enabledelayedexpansion
:: =========================================================================
:: fix-pr25-ci.bat
::
:: Fixes the CI failure on PR #25 (feat/chart-interaction-layer).
::
:: The bad GitHub conflict resolution accepted only the chart branch side
:: for the 4 shared IPC/type files, leaving master's D.10 funded-account
:: definitions missing. This commit adds them.
::
:: Adds ONLY the 4 shared files needed to make PR #25 typecheck-clean:
::   - ipc-channels.ts: D.10 funded-account channels + chart channels
::   - funded/types.ts: master's richer FundedAccountProfile
::   - ipc-schemas.ts: D.10 funded-account schemas + chart schemas
::   - preload/index.ts: fix FUNDED_TRIGGER_FLAT -> FUNDED_ACCOUNT_TRIGGER_FLAT
::
:: Does NOT add D.10 service files (those are in PR #26).
::
:: Usage: run from mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\ directory.
::   ..\..\..\scripts\fix-pr25-ci.bat
:: =========================================================================

set "BRANCH=feat/chart-interaction-layer"
set "SOURCE_COMMIT=e158e48"
set "REMOTE=origin"

echo.
echo ============================================================
echo  SATEX — Fix PR #25 CI (typecheck failure)
echo ============================================================
echo.

:: ── Clear stale index lock if present ─────────────────────────────────────
if exist ".git\index.lock" (
    echo Removing stale .git\index.lock...
    del /f ".git\index.lock"
)

:: ── Switch to chart branch ─────────────────────────────────────────────────
echo Switching to %BRANCH%...
git checkout %BRANCH%
if !errorlevel! neq 0 (
    echo FAIL — could not checkout %BRANCH%
    exit /b 1
)
echo.

:: ── Extract the 4 corrected files from the D.10 commit ───────────────────
echo Pulling 4 corrected shared files from commit %SOURCE_COMMIT%...
git checkout %SOURCE_COMMIT% -- src/shared/ipc-channels.ts
git checkout %SOURCE_COMMIT% -- src/shared/funded/types.ts
git checkout %SOURCE_COMMIT% -- src/shared/ipc-schemas.ts
git checkout %SOURCE_COMMIT% -- src/preload/index.ts
echo.

:: ── Typecheck before committing ───────────────────────────────────────────
echo Running typecheck...
call npm run typecheck
if !errorlevel! neq 0 (
    echo FAIL — typecheck errors. Investigate before pushing.
    exit /b 1
)
echo PASS
echo.

:: ── Commit ────────────────────────────────────────────────────────────────
set "MSG=fix(ipc): update shared types + channels to be D.10-compatible

The earlier GitHub conflict resolution accepted only the chart branch side
for the 4 shared IPC/type files. This left master's D.10 funded-account
additions absent, causing 10 typecheck errors when trading-engine.ts
auto-merged with master's code.

This commit supplies the correct definitions for all 4 files, keeping the
chart additions while also including master's funded-account additions:

  ipc-channels.ts: FUNDED_ACCOUNT_GET / SET_PROFILE / CLEAR /
    TRIGGER_FLAT / UPDATE / ADVANCE_PHASE (D.10) + chart channels intact.
  funded/types.ts: master's full FundedAccountProfile (newsBlackoutImpacts,
    newsBlackoutWindowMs, flatBy, maxContracts, allowedAssetClasses, etc.)
    and updated FundedAccountSnapshot with payoutMetrics + computedAt.
  ipc-schemas.ts: FundedAccountSetProfileReq + TriggerFlatReq +
    AdvancePhaseReq appended after chart schemas.
  preload/index.ts: FUNDED_TRIGGER_FLAT corrected to
    FUNDED_ACCOUNT_TRIGGER_FLAT; getFundedAccount uses FUNDED_ACCOUNT_GET.

D.10 service files are not included here — they land in PR #26."

git commit -m "%MSG%"
if !errorlevel! neq 0 (
    echo FAIL — git commit failed.
    exit /b 1
)

:: ── Force-push (replaces bad merge commit on GitHub) ─────────────────────
echo.
echo Force-pushing to replace bad merge commit on GitHub...
git push -f %REMOTE% %BRANCH%
if !errorlevel! neq 0 (
    echo FAIL — git push failed.
    exit /b 1
)

echo.
echo ============================================================
echo  DONE — PR #25 fix pushed. CI will re-run.
echo.
echo  Once CI goes green on PR #25:
echo    1. Merge PR #25
echo    2. On GitHub PR #26: change base from
echo       feat/chart-interaction-layer -> master
echo    3. CI re-runs on PR #26
echo    4. Review trading-engine.ts (sign-off required)
echo    5. Merge PR #26
echo ============================================================
echo.
endlocal
