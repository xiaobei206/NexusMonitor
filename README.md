# NexusMonitor 2.1.8 — Electron Edition

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
- USB 5-inch Windows extended-display page: display selection, independent fullscreen output window, hardware monitoring, static/GIF wallpaper, weather clock and local video modes; true USB-panel backlight control is intentionally deferred pending firmware command confirmation
- Wujiang/Suzhou weather and US AQI from Open-Meteo, with six upcoming hourly records and six future daily records for the Turing weather-clock screen
- Local shortcut list and manifest-based plugin inventory
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
- The NSIS packaging script is Windows-only. Earlier baseline work was built on a Windows PC with Node.js 26.13.0, npm 11.20.0 and .NET SDK 10.0.403. The 2.0.3 source changes passed 77 Node regression tests in the handoff environment. The 2.0.4 Node regression suite passed 96/96. Main and renderer TypeScript checks also passed with temporary local host-type declarations; this is not a substitute for a dependency-backed Vite/Electron production build. `npm ci` timed out against the package registry in this environment, and the .NET SDK is unavailable here, so the full npm build, .NET build/tests, Windows GUI/fullscreen behaviour and real COM3 output remain unverified. The NSIS installer has not been built.

## License notes

NexusMonitor source in this package is provided for the user's development/testing. Third-party components keep their own licenses: Electron (MIT), React (MIT), Lucide (ISC), LibreHardwareMonitorLib (MPL-2.0). Review the included package licenses before redistribution.


## Current source handoff

For the current version, read `NexusMonitor-2.1.8-HANDOFF-CN.md` first, then the single cross-version history `NexusMonitor-DEVELOPMENT-LOG-CN.md`. All historical release reports and duplicate handoff/prompt documents have been consolidated into those two files. The Turing protocol remains documented in `PROTOCOL_REFERENCE.md`; focused engineering references remain under `docs/`.

This source package does not imply that the latest Windows Electron/Renderer/.NET build, NSIS installer, or COM3 hardware behavior has been fully verified. Consult the versioned handoff for exact status and commands.


## Intel Alder Lake Iris Xe GT temperature experiment

For an Intel Alder Lake system where IGCL exposes GPU clocks/power but not temperature, see `docs/ALDERLAKE_GT_TEMPERATURE_CN.md`. The probe uses the official PawnIO `IntelMCHBAR` read module and only reads `THERM_STATUS_GT` at MCHBAR offset `0x59C0`; it never writes PCI configuration or hardware control registers. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-mchbar-module.ps1` once before building the hardware service. The project now fails the .NET build if the resource is missing, instead of silently omitting it. If the module or register validation is unavailable, the GPU temperature remains `—`.
