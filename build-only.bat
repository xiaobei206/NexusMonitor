@echo off
setlocal
cd /d "%~dp0"
title NexusMonitor 2.0 - Build Only

echo ===============================================
echo NexusMonitor 2.0 - Build Only
echo ===============================================

where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22||(a===22&&b<12)){console.error('Node.js 22.12+ is required.');process.exit(1)}"
if errorlevel 1 goto failed
where dotnet >nul 2>nul
if errorlevel 1 goto missing_dotnet
for /f "tokens=1" %%v in ('dotnet --version') do set DOTNET_VERSION=%%v
echo %DOTNET_VERSION% | findstr /b "10." >nul
if errorlevel 1 goto missing_dotnet

if not exist node_modules\electron\package.json goto install_deps
if not exist node_modules\typescript\package.json goto install_deps
if not exist node_modules\vite\package.json goto install_deps
if not exist node_modules\react\package.json goto install_deps
if not exist node_modules\react-dom\package.json goto install_deps
if not exist node_modules\lucide-react\package.json goto install_deps
goto deps_ready

:install_deps
echo npm dependencies are incomplete. Installing them now...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

:deps_ready
echo.
echo ===== Restore .NET hardware service =====
call dotnet restore HardwareService\HardwareService.csproj
if errorlevel 1 goto failed

echo.
echo ===== Build Electron main/preload and React renderer =====
call npm run build
if errorlevel 1 goto failed

echo.
echo ===== Build .NET hardware service =====
call dotnet build HardwareService\HardwareService.csproj -c Release --no-restore
if errorlevel 1 goto failed

echo.
echo BUILD SUCCEEDED. Output: dist and dist-electron plus HardwareService\bin\Release.
pause
exit /b 0

:missing_node
echo ERROR: Install Node.js 22.12 or newer first.
goto failed
:missing_dotnet
echo ERROR: Install .NET SDK 10.x first.
goto failed
:failed
echo.
echo BUILD FAILED. Copy the complete output above.
pause
exit /b 1
