# Repository agent instructions

Before editing, read [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md), then the current handoff and the unique cross-version development log.

- Current `main`, `VERSION`, source, tests, and latest Actions are authoritative. Re-query them for every new task.
- Make narrow, source-backed changes and preserve unrelated existing behavior.
- Application behavior changes require a formal version increment and synchronization of every field checked by `scripts/validate-release-version.cjs`; never use FIX-style version names.
- Add/update regression tests; report only tests actually run. Hosted CI is not proof of physical hardware acceptance.
- Follow `.github/workflows/windows-ci.yml`. On Windows PowerShell use `npm.cmd` / `npx.cmd`.
- Keep the canonical development log, current handoff/build report, SHA-256 manifest, and ZIP contents accurate.
- Never commit personal settings or runtime logs from `%APPDATA%\NexusMonitor`.

- Music playback is a single main-Renderer audio engine; HUD and secondary-display windows are control surfaces only. Preserve the video player as a separate mode and do not create a second audio element in a child window.
- On the vertical HUD, the music mini-player is inserted immediately above the existing weather block. Keep every existing metric, weather layout, bottom clock/calendar and horizontal HUD unchanged unless the user separately authorizes a change.
- Closing the main window hides it to the tray and must not destroy the persistent renderer or stop music. USB display restoration must use the saved display ID and never guess a different target.


## Current released music platform rules (2.2.1)

- The current stable baseline is `main` / 2.2.1. Release `v2.2.1` is published; PR #2 is merged. The old `feature/2.2.1-music-platform` ref is historical only and its tree matched the merged main tree at release. For this personal repository, work directly on `main`; do not create feature branches or PRs unless the user explicitly asks.
- Nora is the main library/UI reference; NewAmp is the audio capability reference; NexusMonitor owns the single Music Service. Do not embed or launch either as an external player.
- Keep one audio playback host in the persistent main Renderer. HUD, Dock, and USB output are controls only. USB output visibility/mode must never start or stop the Music Service.
- The sixth USB display mode, `music-only`, hides the USB output window so Windows wallpaper remains visible while the shared player continues. Static/GIF modes must not retain a second wallpaper audio element; video remains independent and has no music mini-player UI.
- Audio endpoint selection is independent of the USB display mode. Persist the selected Windows endpoint and show unavailable / failed routing honestly; never claim WASAPI exclusive or bit-perfect without a tested backend and verified format negotiation.
- Do not claim a codec is supported merely because its extension is accepted. Test actual decode, seek, metadata/duration behavior, and failure handling; record unsupported advanced formats explicitly.
- The 2.2.1 WASAPI path is Chromium/WebAudio decode -> Float32 PCM -> native WASAPI Exclusive. It is explicitly not bit-perfect. Gapless/crossfade dual-deck playback and native decoder-to-device bit-perfect output are not delivered in 2.2.1.
- Hosted CI proves the hosted Windows build/tests only. Physical 5-inch-speaker output, endpoint isolation/hot-plug, all codec fixtures, all six display modes, mixed DPI, sleep/wake and long-run stability remain target-PC acceptance items.
