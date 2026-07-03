@echo off
title SATEX — Fetch D-2 branch + master for sandbox rebase
cd /d "C:\Users\User\mc4"

echo Fetching current master from GitHub...
git fetch origin master
if %errorlevel% neq 0 (echo FETCH MASTER FAILED && pause && exit /b 1)

echo Fetching D-2 branch from GitHub...
git fetch origin feat/topstep-d2-payout-rules
if %errorlevel% neq 0 (echo FETCH D2 FAILED && pause && exit /b 1)

echo.
echo master tip:
git log --oneline origin/master -3
echo.
echo D-2 branch tip:
git log --oneline origin/feat/topstep-d2-payout-rules -5

echo.
echo Creating bundle for sandbox rebase work...
git bundle create d2-rebase-input.bundle origin/master origin/feat/topstep-d2-payout-rules
if %errorlevel% neq 0 (echo BUNDLE FAILED && pause && exit /b 1)

echo.
echo DONE. Bundle saved to C:\Users\User\mc4\d2-rebase-input.bundle
pause
