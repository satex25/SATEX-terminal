@echo off
cd /d C:\Users\User\mc4\00-PROJECT-ROOT\01-SATEX-CORE\satex-app
echo Installing jsdom...
call npm install jsdom @types/jsdom --save-dev
echo INSTALL_EXIT=%ERRORLEVEL%
echo Done.
pause
