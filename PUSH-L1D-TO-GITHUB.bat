@echo off
title SATEX — Force-push rebased L1.D to GitHub
cd /d "C:\Users\User\mc4"

echo Clearing lock files...
for /r ".git" %%f in (*.lock) do del /f /q "%%f" 2>nul

echo Switching to master (branch must not be checked out to overwrite)...
git checkout -f master
if %errorlevel% neq 0 (echo CHECKOUT FAILED && pause && exit /b 1)

echo Importing rebased branch from bundle...
git fetch l1d-rebased.bundle +feat/l1d-funded-compliance:feat/l1d-funded-compliance
if %errorlevel% neq 0 (echo BUNDLE FETCH FAILED && pause && exit /b 1)

echo Verifying tip...
git log --oneline feat/l1d-funded-compliance -3

echo Force-pushing to GitHub...
git push -f origin feat/l1d-funded-compliance
if %errorlevel% neq 0 (echo PUSH FAILED && pause && exit /b 1)

echo Opening PR #23 to merge...
start "" "https://github.com/satex25/satex-trading/pull/23"

echo DONE. PR #23 should now show no conflicts. Merge it.
pause
