$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Pinned official PawnIO.Modules release. The archive hash is verified before extraction.
$releaseUrl = 'https://github.com/namazso/PawnIO.Modules/releases/download/0.2.11/release_0_2_11.zip'
$expectedSha256 = '43608cb89bc84247fef1368a139013f7d043e17db6d6c8dfc9b46bf0905a81f4'
$root = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $root 'HardwareService\Resources\PawnIO'
$tempRoot = Join-Path $env:TEMP ("NexusMonitor-MCHBAR-" + [guid]::NewGuid().ToString('N'))
$archive = Join-Path $tempRoot 'pawnio-modules-0.2.11.zip'

try {
    [void](New-Item -ItemType Directory -Path $tempRoot -Force)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    Write-Host 'Downloading official PawnIO.Modules 0.2.11 archive...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri $releaseUrl -OutFile $archive -UseBasicParsing

    $actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) {
        throw "PawnIO.Modules archive SHA-256 mismatch. Expected $expectedSha256; received $actualSha256. The archive will not be extracted."
    }
    Write-Host 'Official archive SHA-256 verified.' -ForegroundColor Green

    $expanded = Join-Path $tempRoot 'expanded'
    Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
    $modules = @(Get-ChildItem -LiteralPath $expanded -Recurse -File -Filter 'IntelMCHBAR.bin')
    if ($modules.Count -ne 1) {
        throw "Expected exactly one IntelMCHBAR.bin in the verified release archive; found $($modules.Count)."
    }

    [void](New-Item -ItemType Directory -Path $destination -Force)
    $target = Join-Path $destination 'IntelMCHBAR.bin'
    Copy-Item -LiteralPath $modules[0].FullName -Destination $target -Force
    $moduleHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()

    Write-Host "Embedded resource prepared: $target" -ForegroundColor Green
    Write-Host "Extracted module size: $((Get-Item -LiteralPath $target).Length) bytes"
    Write-Host "Extracted module SHA-256: $moduleHash"
    @('Source: namazso/PawnIO.Modules release 0.2.11', "Archive: $releaseUrl", "Archive SHA-256: $actualSha256", "Module SHA-256: $moduleHash") | Set-Content -LiteralPath (Join-Path $destination 'IntelMCHBAR.provenance.txt') -Encoding UTF8
    Write-Host 'Next: run npm.cmd run test:storage, then npm.cmd run dev.' -ForegroundColor Cyan
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
