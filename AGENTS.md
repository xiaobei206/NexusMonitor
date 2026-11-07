# Repository agent instructions

Before editing, read [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md), then the current handoff and the unique cross-version development log.

- Current `main`, `VERSION`, source, tests, latest Actions and Release are authoritative. Re-query them for every new task.
- This is a personal repository. Work directly on `main`; do not create feature branches or pull requests unless the user explicitly asks.
- Current source line is NexusMonitor 2.2.5, developed directly from the 2.2.4 release baseline. After 2.2.5 is published, the next application behavior change starts at 2.2.6; synchronize every field checked by `scripts/validate-release-version.cjs`. Never use FIX-style version names or overwrite a published release.
- Keep changes narrow, source-backed and regression-tested. Report only tests actually run. Hosted CI is not proof of physical hardware acceptance.
- Follow `.github/workflows/windows-ci.yml`. On Windows PowerShell use `npm.cmd` / `npx.cmd`.
- Keep the canonical development log, current handoff/build report, SHA-256 manifest and ZIP contents accurate.
- Never commit personal settings, music-library data, absolute user paths or runtime logs from `%APPDATA%\NexusMonitor`.

## Music / display invariants

- Music playback is a single main-Renderer audio engine; HUD and secondary-display windows are control surfaces only.
- Preserve the independent video player. Video mode has no music mini-player.
- On the vertical HUD, the music mini-player is immediately above the existing weather block. Keep other metrics, weather layout, bottom clock/calendar and horizontal HUD unchanged unless separately requested.
- Closing the main window hides it to the tray and must not destroy the persistent Renderer or stop music. USB display restoration must use the saved display ID and never guess a different target.
- The sixth USB mode `music-only` hides the USB output window so the Windows desktop wallpaper remains visible while Music Service continues. Its action button is the short label `应用模式`; other output modes retain `启动副屏`.
- Static/GIF wallpaper modes must not create a second audio engine.

## WASAPI Exclusive invariants (2.2.4)

- Probe both mono and stereo PCM, and query both classic `WAVEFORMATEX` and `WAVEFORMATEXTENSIBLE` forms.
- Prefer a compatible stereo candidate. Select mono only when no compatible stereo combination is reported.
- The negotiated channel count must flow consistently through endpoint format, speaker mask, block alignment, bytes-per-frame, native ring-buffer sizing, PCM packing and UI status.
- Renderer input remains stereo Float32. A mono endpoint receives the average of L/R at the native edge. Channel downmix is not bit-perfect.
- Probe failure must preserve useful diagnostics: candidate counts, classic/extensible matches, Windows shared mix format and HRESULT. Do not declare a device categorically unsupported from a narrow probe.
- Current path remains Chromium/WebAudio decode -> Float32 PCM -> native WASAPI Exclusive; never claim bit-perfect. The selected AudioContext sink must be bound and verified before `createMediaElementSource(audio)` attaches the shared audio element. If a non-default sink cannot be bound, do not connect the source graph or silently use Windows default output. Gapless/Crossfade dual-deck and native decoder-to-device output are not included in 2.2.4.
- Do not claim a codec is supported merely because its extension is accepted. Actual decode/seek/metadata/error handling requires real-file testing.
- Hosted CI proves the hosted Windows build/tests only. Physical P4 speaker output and route persistence after WASAPI on/off, endpoint isolation/hot-plug, actual codec fixtures, all six display modes, mixed DPI, sleep/wake and long-run stability remain target-PC acceptance items.


## 2.2.5 readability / vertical HUD
- Shared UI typography tokens were increased; keep full-page music library and output-device settings readable with the overrides in `src/renderer/music-player.css`.
- Vertical HUD prefers 340×1200 and is clamped to the display work area. On short HUD viewports (≤920px), secondary daily-forecast detail may be hidden to preserve live metrics and current weather.
- P4 Mono UAC Direct v62 currently has no audible output when WASAPI Exclusive is enabled on the target PC; turning Exclusive off immediately restores ordinary playback. The user accepts ordinary mode for now. Do not perform risky native backend changes without a new request or concrete diagnostics.
