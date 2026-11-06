# NexusMonitor

Windows hardware monitor, desktop HUD, Turing USB display and USB extended-display companion.

- Current baseline: **2.1.8**
- Runtime: Electron 45 + React 19 + TypeScript 7 + .NET 10
- Target: Windows 10/11 x64
- Repository: https://github.com/xiaobei206/NexusMonitor

## Development

Requirements:

- Node.js 24.x (the project requires Node.js >=22.12)
- .NET SDK 10.x
- Windows 10/11 x64 for the hardware service and installer

After the source tree has been imported:

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
npm.cmd run test:main
npm.cmd run build:renderer
dotnet build .\HardwareService\HardwareService.csproj -c Release
npm.cmd run test:storage
```

For a complete Windows installer, use the versioned build script in the project root. It validates version consistency, prepares the pinned PawnIO MCHBAR module, builds the application and hardware service, runs tests, and packages the NSIS installer.

## CI and releases

GitHub Actions is configured to verify the main process, renderer, .NET hardware service and storage tests on Windows. Pushing a version tag such as `v2.1.9` after CI passes creates a GitHub Release containing the installer and SHA-256 checksum.

CI results are authoritative for the hosted Windows build, but physical Turing/ESP32 display behavior still requires verification on the actual hardware.

## Project policy

- Every formal development iteration increments the semantic version.
- Keep `VERSION`, package metadata, renderer display, HardwareService metadata and release scripts synchronized.
- Do not commit `node_modules`, build outputs, local logs, generated PawnIO resources, local settings or credentials.
- Preserve existing UI unless a change is specifically part of the requested work.
