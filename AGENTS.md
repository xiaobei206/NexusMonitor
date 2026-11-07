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
