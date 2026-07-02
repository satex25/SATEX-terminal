@echo off
cd /d C:\Users\User\mc4\apps\satex-terminal
echo === git status ===
git status --short
echo === git add ===
git add -A
echo === git commit ===
git commit -m "feat(chart): wire chart modules into ChartPanel; fix LWC v5 API, knip v6, jsdom [CHART-01/02/05/07/12]"
echo COMMIT_EXIT=%ERRORLEVEL%
echo === git push ===
git push
echo PUSH_EXIT=%ERRORLEVEL%
echo Done.
pause
