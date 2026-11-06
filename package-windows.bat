@echo off
setlocal
cd /d "%~dp0"
title NexusMonitor 2.0 - Windows Installer

echo ===============================================
echo NexusMonitor 2.0 - Build Windows Installer
echo ===============================================
where node >nul 2>nul
if errorlevel 1 goto failed
node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22||(a===22&&b<12)){console.error('Node.js 22.12+ is required.');process.exit(1)}"
if errorlevel 1 goto failed
where dotnet >nul 2>nul
if errorlevel 1 goto failed
for /f "tokens=1" %%v in ('dotnet --version') do set DOTNET_VERSION=%%v
echo %DOTNET_VERSION% | findstr /b "10." >nul
if errorlevel 1 goto failed

echo ===== Install npm dependencies =====
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
echo ===== Build installer and bundled .NET service =====
call npm run package:win
if errorlevel 1 goto failed
echo.
echo Installer is in the release folder.
pause
exit /b 0
:failed
echo.
echo PACKAGING FAILED. Check Node.js 22.12+, .NET SDK 10 and network access.
pause
exit /b 1
