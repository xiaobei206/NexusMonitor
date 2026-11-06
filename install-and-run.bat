@echo off
setlocal
cd /d "%~dp0"
title NexusMonitor 2.0 - Setup and Run

echo ===============================================
echo NexusMonitor 2.0 - Install dependencies and run
echo ===============================================

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  goto failed
)
node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22||(a===22&&b<12)){console.error('Node.js 22.12+ is required. Current: '+process.version);process.exit(1)}"
if errorlevel 1 goto failed

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Reinstall Node.js with npm included.
  goto failed
)
where dotnet >nul 2>nul
if errorlevel 1 (
  echo ERROR: .NET SDK 10 is not installed or dotnet is not in PATH.
  goto failed
)
for /f "tokens=1" %%v in ('dotnet --version') do set DOTNET_VERSION=%%v
echo Detected .NET SDK: %DOTNET_VERSION%
echo %DOTNET_VERSION% | findstr /b "10." >nul
if errorlevel 1 (
  echo ERROR: .NET SDK 10.x is required.
  goto failed
)

if not exist node_modules\electron\package.json goto install_deps
if not exist node_modules\typescript\package.json goto install_deps
if not exist node_modules\vite\package.json goto install_deps
if not exist node_modules\react\package.json goto install_deps
if not exist node_modules\react-dom\package.json goto install_deps
if not exist node_modules\lucide-react\package.json goto install_deps
if not exist node_modules\concurrently\package.json goto install_deps
if not exist node_modules\wait-on\package.json goto install_deps
goto deps_ready

:install_deps
echo.
echo Installing npm dependencies from package.json...
echo This first step requires access to the npm registry.
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

:deps_ready
echo.
echo Restoring .NET hardware-service packages...
call dotnet restore HardwareService\HardwareService.csproj
if errorlevel 1 goto failed

echo.
echo Starting NexusMonitor. Keep this window open while developing.
call npm run dev
if errorlevel 1 goto failed
goto end

:failed
echo.
echo SETUP OR START FAILED. Copy the complete output above.
pause
exit /b 1
:end
endlocal
