@echo off
cd /d C:\Users\User\mc4\apps\satex-terminal
echo Installing jsdom...
call npm install jsdom @types/jsdom --save-dev
echo INSTALL_EXIT=%ERRORLEVEL%
echo Done.
pause
