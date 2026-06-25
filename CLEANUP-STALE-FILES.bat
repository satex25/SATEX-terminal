@echo off
title SATEX — Delete stale working files
cd /d "C:\Users\User\mc4"

echo Deleting stale bundle and bat files from previous L1.D + D-2 rebase work...

del /f "l1d-rebased.bundle" 2>nul && echo Deleted: l1d-rebased.bundle || echo Not found: l1d-rebased.bundle
del /f "d2-rebase-input.bundle" 2>nul && echo Deleted: d2-rebase-input.bundle || echo Not found: d2-rebase-input.bundle
del /f "PUSH-L1D-TO-GITHUB.bat" 2>nul && echo Deleted: PUSH-L1D-TO-GITHUB.bat || echo Not found: PUSH-L1D-TO-GITHUB.bat
del /f "FETCH-D2-FOR-REBASE.bat" 2>nul && echo Deleted: FETCH-D2-FOR-REBASE.bat || echo Not found: FETCH-D2-FOR-REBASE.bat
del /f ".pr-body-audit-psd.md" 2>nul && echo Deleted: .pr-body-audit-psd.md || echo Not found: .pr-body-audit-psd.md
del /f ".pr-body-l1d-funded-compliance.md" 2>nul && echo Deleted: .pr-body-l1d-funded-compliance.md || echo Not found: .pr-body-l1d-funded-compliance.md

echo.
echo NOTE: d2-rebased.bundle and PUSH-D2-TO-GITHUB.bat are kept until D-2 PR merges.
echo.
echo DONE. Run this file again to verify — already-deleted files show "Not found".
pause
