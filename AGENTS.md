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


## Current 2.2.2 development rules

- The current development baseline is `main` / 2.2.2. This is a personal repository: work directly on `main`; do not create feature branches or pull requests unless the user explicitly asks.
- Nora is the main library/UI reference; NewAmp is the audio capability reference; NexusMonitor owns the single Music Service. Do not embed or launch either as an external player.
- Keep one audio playback host in the persistent main Renderer. HUD, Dock, and USB output are controls only. USB output visibility/mode must never start or stop the Music Service.
- The sixth USB display mode, `music-only`, hides the USB output window so Windows wallpaper remains visible while the shared player continues. Its action button should stay concise: `应用模式`. Static/GIF modes must not retain a second wallpaper audio element; video remains independent and has no music mini-player UI.
- WASAPI exclusive format probing must test mono and stereo PCM using both `WAVEFORMATEX` and `WAVEFORMATEXTENSIBLE`. Prefer stereo when available; use mono only when no compatible stereo candidate is reported. The native output channel count, block alignment, bytes-per-frame, speaker mask and PCM conversion must all use the negotiated channel count.
- Incoming Renderer transport remains stereo Float32. A mono-only endpoint receives a mono average of left and right before native PCM packing. Channel conversion is not bit-perfect; never describe it as such.
- If no format is accepted, report probe counts, classic/extensible matches, Windows shared mix-format information and HRESULT. Do not say the hardware is categorically unsupported based on a narrow probe.
- Do not claim a codec is supported merely because its extension is accepted. Test actual decode, seek, metadata/duration behavior, and failure handling; record unsupported advanced formats explicitly.
- The 2.2.2 WASAPI path is Chromium/WebAudio decode -> Float32 PCM -> native WASAPI Exclusive. It is explicitly not bit-perfect. Gapless/crossfade dual-deck playback and native decoder-to-device bit-perfect output are not delivered.
- Hosted CI proves the hosted Windows build/tests only. Physical speaker output, endpoint isolation/hot-plug, actual codec fixtures, all six display modes, mixed DPI, sleep/wake and long-run stability remain target-PC acceptance items.
