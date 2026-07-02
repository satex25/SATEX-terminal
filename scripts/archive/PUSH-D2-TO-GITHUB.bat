@echo off
title SATEX — Push rebased D-2 branch to GitHub
cd /d "C:\Users\User\mc4"

echo Clearing lock files...
for /r ".git" %%f in (*.lock) do del /f /q "%%f" 2>nul

echo Switching to master...
git checkout -f master
if %errorlevel% neq 0 (echo CHECKOUT FAILED && pause && exit /b 1)

echo Pulling latest master from GitHub...
git pull origin master
if %errorlevel% neq 0 (echo PULL FAILED && pause && exit /b 1)

echo Importing rebased D-2 branch from bundle...
git fetch d2-rebased.bundle +feat/topstep-d2-rebased:feat/topstep-d2-payout-rules
if %errorlevel% neq 0 (echo BUNDLE FETCH FAILED && pause && exit /b 1)

echo Branch tip:
git log --oneline feat/topstep-d2-payout-rules -4

echo Force-pushing to GitHub...
git push -f origin feat/topstep-d2-payout-rules
if %errorlevel% neq 0 (echo PUSH FAILED && pause && exit /b 1)

echo Opening PR #16 to update base + merge...
start "" "https://github.com/satex25/satex-trading/pull/16"

echo DONE. On PR #16: change base branch to master, then merge.
pause
