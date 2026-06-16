@echo off
cd /d C:\Users\User\mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app
set LOG=C:\Users\User\mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app\gates-results.log
echo. > %LOG%

echo ======== TYPECHECK ======== >> %LOG%
call npm run typecheck >> %LOG% 2>&1
echo TYPECHECK_EXIT=%ERRORLEVEL% >> %LOG%

echo. >> %LOG%
echo ======== LINT ======== >> %LOG%
call npm run lint >> %LOG% 2>&1
echo LINT_EXIT=%ERRORLEVEL% >> %LOG%

echo. >> %LOG%
echo ======== TEST ======== >> %LOG%
call npm test >> %LOG% 2>&1
echo TEST_EXIT=%ERRORLEVEL% >> %LOG%

echo. >> %LOG%
echo ======== KNIP ======== >> %LOG%
call npm run knip >> %LOG% 2>&1
echo KNIP_EXIT=%ERRORLEVEL% >> %LOG%

echo. >> %LOG%
echo ALL GATES COMPLETE >> %LOG%
echo Done. See gates-results.log
pause
