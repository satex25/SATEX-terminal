@echo off
setlocal enabledelayedexpansion
:: =========================================================================
:: push-chart-interaction-layer.bat
::
:: Pushes feat/chart-interaction-layer to origin.
::
:: What this branch contains (2 commits ahead of origin):
::   1. fix(chart): drawing-renderer split + PNG export crash fix (1621109)
::      - DrawingLayer.tsx refactored: renderDrawing extracted to drawing-renderer.ts
::      - ChartPanel PNG export crash fixed (dynamic import)
::      - BottomBar.tsx: bb-log-live + bb-bot-sep UI polish
::      - PanelHead.tsx: optional live?: boolean pulsing dot prop
::      - globals.css: bb-session-icon glow + panel-live-pulse animations
::      - main/index.ts: flat service imports (branch self-contained)
::   2. chore(knip): drop 13 stale services/ ignore entries (1cf9b0e)
::
:: Also on this branch (already on origin):
::   - feat(chart): L1.D chart interaction layer — CHART-03/20 complete
::   - Volume footprint (CHART-11), volume profile (CHART-13)
::   - MultiTF overlay (CHART-06), PNG export (CHART-08)
::   - Drawing tools IPC wiring (CHART_DRAWINGS_GET/SET)
::
:: Usage: run from mc4\ root directory.
::   scripts\push-chart-interaction-layer.bat
:: =========================================================================

set "BRANCH=feat/chart-interaction-layer"
set "REMOTE=origin"

echo.
echo ============================================================
echo  SATEX Chart Interaction Layer — Push Script
echo ============================================================
echo.

:: Confirm we are on the right branch
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT=%%b"
if not "!CURRENT!"=="%BRANCH%" (
    echo ERROR: Current branch is '!CURRENT!', expected '%BRANCH%'.
    echo        Run: git checkout %BRANCH%
    exit /b 1
)
echo Branch confirmed: %BRANCH%
echo.

:: Show commits that will be pushed
echo Commits ahead of origin:
git log --oneline origin/%BRANCH%..HEAD
echo.

:: Push
echo Pushing %BRANCH% to %REMOTE%...
git push -u %REMOTE% %BRANCH%
if !errorlevel! neq 0 (
    echo FAIL — git push failed. Check remote connectivity.
    exit /b 1
)

echo.
echo ============================================================
echo  DONE — %BRANCH% pushed.
echo.
echo  Open a PR on GitHub:
echo    Base:  master
echo    Head:  %BRANCH%
echo    Title: feat(chart): chart interaction layer polish + PNG crash fix
echo.
echo  PR description:
echo  ---
echo  Completes the chart interaction layer feature (L1.D).
echo.
echo  Changes in these 2 commits:
echo  - drawing-renderer.ts: renderDrawing extracted from DrawingLayer.tsx
echo    so DrawingLayer only exports the React component. Clears the
echo    react-refresh/only-export-components lint warning (lint: 0 warnings).
echo  - ChartPanel PNG export crash fixed: dynamic import() scoped to the
echo    button handler prevents the electron ipcRenderer shim from throwing
echo    at module-eval time and blanking the chart panel.
echo  - UI polish: bb-session-icon 4s breathing glow, bb-bot-sep separator,
echo    bb-panel-live-dot pulsing indicator, PanelHead live prop.
echo  - main/index.ts flat import repoint (branch self-contained for CI).
echo  - knip.json: 13 stale services/ ignore entries removed.
echo.
echo  Gates: typecheck NODE=0 WEB=0, lint 0 warnings, knip clean.
echo  ---
echo ============================================================
echo.
endlocal
