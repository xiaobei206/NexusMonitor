$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'HardwareService\HardwareService.csproj'
$output = Join-Path $root 'HardwareService\publish-win'
if (Test-Path $output) { Remove-Item $output -Recurse -Force }
dotnet publish $project -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $output
if ($LASTEXITCODE -ne 0) { throw "Hardware service publish failed: $LASTEXITCODE" }
if (-not (Test-Path (Join-Path $output 'HardwareService.exe'))) { throw 'HardwareService.exe was not produced.' }
Write-Host "Hardware service published: $output"
