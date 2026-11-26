# Repository agent instructions

Before editing, read [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md), then the current handoff and the unique cross-version development log.

- Treat current `main`, `VERSION`, source, tests, latest Actions and published Releases as authoritative; re-query them before each task.
- This is a personal repository. Work directly on `main`; do not create feature branches or pull requests unless the user explicitly asks.
- Increment the application version for every behavior change, synchronize every field checked by `scripts/validate-release-version.cjs`, and never use FIX-style version names or overwrite a published release.
- Keep changes narrow, source-backed and regression-tested. Report only tests actually run. Hosted CI is not proof of physical hardware acceptance.
- Follow `.github/workflows/windows-ci.yml`. On Windows PowerShell use `npm.cmd` / `npx.cmd`.
- Keep the canonical development log, current handoff/build report, SHA-256 manifest and ZIP contents accurate.
- Never commit personal settings, music-library data, absolute user paths or runtime logs from `%APPDATA%\NexusMonitor`.


## Release descriptions are mandatory — do not publish boilerplate

- A GitHub Release body containing only `**Full Changelog**` or a generic one-line summary is incomplete. Never leave GitHub's `--generate-notes` output as the final description.
- Before a version is released, add/update its English entry in `.github/release-notes.json`: a concise overview, at least three concrete user-visible highlights, the exact CI/test evidence for that version, and explicit limitations or target-PC acceptance notes.
- Keep evidence precise. Name the actual Actions run and test count only after reading that run's completed result. Do not recycle a previous version's CI result or imply hosted CI proves physical USB display, audio endpoint, weather-account, DPI or long-running hardware behaviour.
- `scripts/sync-release-notes.cjs` renders each entry into a full release body and updates every published release through the GitHub API. `.github/workflows/windows-ci.yml` runs it after validation and release publication. Missing/invalid release-note entries intentionally fail the workflow; add the new tag's entry before pushing the release version.
- After the workflow runs, fetch the published Release records and verify their live `body` values. Do not say descriptions were updated until that read-back confirms them.
- Update the versioned BUILD-REPORT with the actual CI run, test results, installer byte size and SHA-256; update the HANDOFF and cumulative development log. Follow [RELEASE-NOTES-GUIDELINES.md](RELEASE-NOTES-GUIDELINES.md).

## Music / display invariants

- Music playback is a single main-Renderer audio engine; HUD and secondary-display windows are control surfaces only.
- Preserve the independent video player. Video mode has no music mini-player. USB video audio is independent from Music Service: own persisted volume, mute and output-device target (`usbDisplayVideo*`); simultaneous playback is allowed. Never hard-mute video by default or automatically pause either source. Show only a non-blocking, dismissible overlap reminder; ignoring it leaves both sources playing.
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


## 2.2.6 weather providers / vertical HUD
- The weather snapshot contract is shared by Open-Meteo, QWeather V1, WeatherCN standard API, Caiyun V2.6, WeatherAPI and OpenWeather. Keep provider credentials out of HardwareService settings and logs; the desktop main process supplies them per request.
- QWeather uses a locally generated Ed25519 private key encrypted by Electron safeStorage. Only the public key is copied to the QWeather console. JWT claims: iss=Developer ID, sub=Project ID, kid=Credential ID; signed as EdDSA. API Host must be the assigned *.qweatherapi.com host. Do not reintroduce old V7 ?key= requests.
- WeatherCN uses the standard API X-Gw-API-Key header, caches each Location Key for 24 hours, and must remain within the standard-key quota (500 calls/day, 5 QPS). Do not switch its key into query strings.
- Caiyun V2.6 uses the App Key in the path and signs each request with App Secret / HMAC-SHA256. Use the China AQI value (chn) when present; never mislabel it as US EPA.
- AQI labels must follow WeatherSnapshot.aqiStandard: China-MEP and US-EPA are not interchangeable.
- Vertical HUD uses a fixed 340×1200 logical-pixel design size where the display work area permits and is not manually resizable. Clamp its startup/orientation-change bounds to the work area; do not restore remembered vertical widths/heights. Preserve moving, docking and auto-hide. On work areas below the design height, hide the complete optional three-day forecast first and prevent cards from flex-shrinking.
- Below 1180px vertical HUD height, hide the complete optional three-day forecast; below 920px, tighten spacing while preserving natural card height. HUD scrolling stays inside the rail when the work area is too short.

## 2.2.5 audio acceptance carried forward
- P4 Mono UAC Direct v62 currently has no audible output when WASAPI Exclusive is enabled on the target PC; turning Exclusive off immediately restores ordinary playback. The user accepts ordinary mode for now. Do not perform risky native backend changes without a new request or concrete diagnostics.
