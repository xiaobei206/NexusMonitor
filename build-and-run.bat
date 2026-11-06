@echo off
setlocal
cd /d "%~dp0"
call "%~dp0install-and-run.bat"
set "RUN_EXIT=%ERRORLEVEL%"
endlocal & exit /b %RUN_EXIT%
