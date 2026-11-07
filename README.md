# NexusMonitor 2.2.1 — Electron Edition (development branch; 2.2.0 remains the stable main baseline)

> **新对话 / 新开发者接手：先读 [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md) 和根目录 [AGENTS.md](AGENTS.md)。** 入口文档列出阅读顺序、源码目录地图、验证命令与硬件验收边界。

A Windows desktop hardware HUD rebuilt with Electron + React + TypeScript. The front-end is separate from a local .NET 10 hardware host.

## Technology

- Electron 45.2.1 (Chromium 156 / embedded Node 24.22.1)
- React 19.3.1 + TypeScript 7.0.2 + Vite 8.3.5
- Lucide React 1.61.0
- .NET 10 minimal API hardware service
- LibreHardwareMonitorLib 0.9.6, System.Management 10.0.2, System.IO.Ports 10.0.3

The Electron 45 stable channel was current at the project date, and its release bundle embeds Node 24.22.1. Vite 8 requires Node 22.12+; this project declares the same minimum. [Electron releases](https://releases.electronjs.org/) · [Vite](https://www.npmjs.com/package/vite)

## Included in this project

- Frameless React dashboard with sidebar, system overview and live telemetry cards
- Separate transparent HUD with independent topmost control, native right-click menu, position pinning, four-edge snapping, optional 10px edge auto-hide, per-display position memory and best-effort fullscreen yielding on the HUD display
- Readable global desktop typography; horizontal HUD defaults to 860×112 and vertical HUD to 176×640, both fitted to the display work area
- Dynamic CPU/GPU/RAM meters and 60-second sparklines
- Physical-disk overview capacity bars aggregate mounted volumes only when Windows reports an explicit disk/volume mapping; physical capacity and volume capacity are labelled separately.
- Floating HUD C: storage usage bar alongside existing physical-disk I/O/activity, plus parallel download/upload scales (600 Mbps down / 40 Mbps up) with uncapped numeric readings.
- Shared six-band US AQI colors across the overview, compact/expanded HUD and Turing dashboard.
- Turing still-wallpaper mode for a local image or local folder slideshow (30/60/90/120 seconds), with contain/cover/stretch fitting and landscape/portrait support; JPG/JPEG/PNG/WEBP/BMP are read locally
- Dedicated Turing weather-clock mode with independent landscape/portrait layouts, current weather/AQI, six upcoming hours and six future days; 27 bundled full-screen WebP backgrounds (18 sunny scenes across dawn to night, plus cloud/fog/rain/storm/snow/night scenes).
- Theme studio: Obsidian, Paper / Engineering, Titanium, personal photo background; accent color, opacity, density, module visibility and drag reordering
- Device selection: multiple network adapters and physical disks; the Turing screen can automatically follow the C: physical disk and busiest active non-tunnel NIC, or pin either manually
- Turing 3.5-inch USB display page: single-page 480×320 hardware-left / Wujiang-weather-right layout, COM discovery, Revision A handshake, manual brightness, scheduled day/night backlight control and 16×8 differential frame patches
- USB 5-inch Windows extended-display page: display selection, independent output window, hardware monitoring, static/GIF wallpaper, weather clock, local video and desktop-wallpaper + background-music modes; true USB-panel backlight control is intentionally deferred pending firmware command confirmation
- Wujiang/Suzhou weather and US AQI from Open-Meteo, with six upcoming hourly records and six future daily records for the Turing weather-clock screen
- Local shortcut list and manifest-based plugin inventory
- Unified local Music Service: one persistent main-Renderer playback host; Nora-style songs / albums / artists / genres / folders / playlists; tags / artwork / ReplayGain; M3U/M3U8; ten-band EQ with nine presets; local synchronized LRC; sleep timer; six USB output modes; Chromium endpoint routing plus a native WASAPI Exclusive PCM path with AudioWorklet transfer, live underrun stats and normal-output fallback. Current WASAPI route is Renderer Float32 PCM and explicitly not bit-perfect.
- Vertical HUD mini-player inserted above the existing weather block without reordering the weather, clock or hardware metrics
- Main window closes to the system tray; the hidden main renderer stays alive for playback and Turing display refresh
- Saved USB 5-inch display target reopens on startup before HardwareService startup; delayed display enumeration is retried without guessing a different monitor
- Local-only API bound to 127.0.0.1

## Build and run

On Windows 10/11 x64, install Node.js 22.12+ and .NET SDK 10.0, then run:

```bat
install-and-run.bat
```

Build only:

```bat
build-only.bat
```

Create a Windows installer (NSIS):

```bat
package-windows.bat
```

See [Chinese setup guide](docs/SETUP_CN.md), [USB display notes](docs/USB_DISPLAY_CN.md) and [plugin contract](docs/PLUGIN_API.md).

## Important implementation notes

- No fabricated hardware values: unavailable sensors are `null` and render as `—`.
- LibreHardwareMonitor may expose different sensors depending on BIOS, motherboard EC, Intel graphics driver and privileges.
- Disk read/write throughput and active time use Windows PhysicalDisk performance data; temperature still depends on whether the hardware/controller exposes an LHM sensor. The 16GB Intel Optane device may be hidden behind Intel RST caching; independent drive telemetry depends on how Windows enumerates it.
- The Turing Revision A protocol is based on the public 1A86:5722 reference: 6 × `0x45` handshake, 115200 baud with RTS/CTS, orientation command 121, bitmap command 197, RGB565 little-endian. Handshake, brightness, screen power, all four orientations and full/16×8 image output were tested on the target COM3 screen. Long-run stability and USB unplug/replug remain for Phase 4F. Do not leave the original `UsbMonitor.exe` connected at the same time.
- Plugin manifests can be imported and enabled/disabled; this release does not execute arbitrary third-party code. Sensor-provider, dashboard-widget, theme-pack and output-adapter runtime contracts are documented, but a third-party plugin execution sandbox is not included yet.
- **2.1.8 Windows build is verified by GitHub Actions** on the hosted Windows 2025 runner: Node 24.22.2 / npm 11.19.1, version consistency 14/14, `npm.cmd run test:main`, Renderer/Vite production build, verified official PawnIO MCHBAR resource, .NET 10 Release build (0 warnings / 0 errors), `npm.cmd run test:storage`, NSIS packaging, SHA-256 generation and GitHub Release publication all succeeded in [workflow run 42239092025](https://github.com/xiaobei206/NexusMonitor/actions/runs/42239092025). The resulting installer is `NexusMonitor-2.1.8-Setup.exe` (159,898,662 bytes; SHA-256 `ee173577851a025b95450422a9ec31c7aebcc9ec556dce9e09d31ad7299426e3`). This hosted build does not replace physical validation of the 3.5-inch COM3 screen, 5-inch USB display, multi-monitor placement or first-launch GUI behaviour. The installer is **not code-signed** because no signing certificate was configured.

## License notes

NexusMonitor source in this package is provided for the user's development/testing. Third-party components keep their own licenses: Electron (MIT), React (MIT), Lucide (ISC), LibreHardwareMonitorLib (MPL-2.0). Review the included package licenses before redistribution.


## Current source handoff

The stable main baseline remains version 2.2.0. The 2.2.1 music platform refactor is in `feature/2.2.1-music-platform`, PR #2 (open, not merged). Start with `START-HERE-NEXT-GPT.md`, then read `NexusMonitor-2.2.1-HANDOFF-CN.md`, `docs/MUSIC-PLATFORM-2.2.1-CN.md`, and `NexusMonitor-DEVELOPMENT-LOG-CN.md`. Always re-check the branch HEAD and Actions.

Windows CI Run #162 succeeded on the native WASAPI integration base: 14/14 version gates, 224/224 Node tests, Renderer TypeScript / Vite production build, native N-API WASAPI addon build, PawnIO verification, .NET Release, and Storage Tests. Its log confirms node-gyp 13.1.0 built `nexus_wasapi.node` with Visual Studio 2026 18.11. [Run #162](https://github.com/xiaobei206/NexusMonitor/actions/runs/42353103480). Subsequent commits add one-time enrichment of legacy 2.2.0 music-library entries; check their newer CI before relying on them. PR CI intentionally does not publish the 2.2.1 installer. Physical endpoint / five-inch speaker / codec playback / USB display acceptance remains pending on the target Windows PC.

## Intel Alder Lake Iris Xe GT temperature experiment

For an Intel Alder Lake system where IGCL exposes GPU clocks/power but not temperature, see `docs/ALDERLAKE_GT_TEMPERATURE_CN.md`. The probe uses the official PawnIO `IntelMCHBAR` read module and only reads `THERM_STATUS_GT` at MCHBAR offset `0x59C0`; it never writes PCI configuration or hardware control registers. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-mchbar-module.ps1` once before building the hardware service. The project now fails the .NET build if the resource is missing, instead of silently omitting it. If the module or register validation is unavailable, the GPU temperature remains `—`.


## Repository history and operating records

- The canonical cross-version development record is `NexusMonitor-DEVELOPMENT-LOG-CN.md`.
- Current-version handoff and verified build status are in `NexusMonitor-2.1.8-HANDOFF-CN.md` and `NexusMonitor-2.1.8-BUILD-REPORT.md`.
- Each GitHub Actions run retains its complete build/test log; see the linked 2.1.8 run above. Per-user application runtime logs and settings remain local under `%APPDATA%\\NexusMonitor` and are intentionally not committed.
- Versioned engineering references and the historical patch archive are under `docs/`.
