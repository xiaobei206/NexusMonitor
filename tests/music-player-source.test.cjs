const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('vertical floating HUD inserts only the compact player immediately before weather and keeps the clock last', () => {
  const app = read('src/renderer/App.tsx');
  const widgetStart = app.indexOf('function WidgetView(');
  const widgetEnd = app.indexOf('\nfunction ', widgetStart + 10);
  const widget = app.slice(widgetStart, widgetEnd);
  const player = widget.indexOf('{!detailOnly && <MusicMiniPlayer');
  const weather = widget.indexOf("{showWidgetMetric('weather') && <div className=\"widget-vertical-weather\">");
  const clock = widget.indexOf('<div className="widget-vertical-clock">');
  assert.ok(widget.includes("settings.orientation === 'vertical' ? <>"), 'player stays within the existing vertical layout branch');
  assert.ok(player >= 0 && player < weather, 'mini player is inserted before the existing weather block');
  assert.ok(weather < clock, 'weather remains above the bottom clock');
  assert.equal((widget.match(/<MusicMiniPlayer /g) ?? []).length, 1, 'no duplicate HUD player insertion');
});

test('non-video USB output uses the shared Music Service and has no legacy wallpaper audio engine', () => {
  const app = read('src/renderer/App.tsx');
  const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));
  assert.match(usb, /mode!=='video'&&<div className="usb-output-music">/);
  assert.match(usb, /<MusicMiniPlayer state=\{music\.state\} onCommand=\{music\.command\}\/>/);
  assert.doesNotMatch(usb, /audioSource|audioRef|usbDisplayAudioPath|<audio/);
  assert.match(app, /\['music-only','桌面壁纸 \+ 音乐'/);
  const main = read('src/main/index.ts');
  assert.match(main, /USB display output hidden; shared Music Service remains active/);
  assert.match(main, /USB display output remains hidden in desktop wallpaper \+ music mode/);
});

test('the main renderer owns the only audio engine and the library is separate from video mode', () => {
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  assert.equal((app.match(/<MusicPlaybackRuntime\b/g) ?? []).length, 1);
  assert.match(player, /<audio ref=\{audioRef\} preload="metadata"/);
  assert.match(player, /chooseMusicFiles/);
  assert.match(player, /chooseMusicFolder/);
  assert.match(player, /move-track/);
  assert.match(player, /repeat/);
  const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));
  assert.match(usb, /mode!=='video'&&<div className="usb-output-music">/);
});

test('closing the main window hides it from taskbar and the tray explicitly restores or exits', () => {
  const main = read('src/main/index.ts');
  const close = main.slice(main.indexOf("mainWindow.on('close'"), main.indexOf("mainWindow.on('closed'"));
  assert.match(close, /event\.preventDefault\(\)/);
  assert.match(close, /setSkipTaskbar\(true\)/);
  assert.match(close, /mainWindow\?\.hide\(\)/);
  const tray = main.slice(main.indexOf('function createTray()'), main.indexOf('function showMainWindowAfterFirstPaint'));
  assert.match(tray, /label: '打开主面板'/);
  assert.match(tray, /tray\.on\('double-click'/);
  assert.match(tray, /label: '退出 NexusMonitor'/);
});

test('saved 5-inch display restores before hardware service startup and retries on topology changes', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /function restoreConfiguredUsbDisplay\(\)/);
  assert.match(main, /usbDisplayRestorePending = Boolean\(String\(currentSettings\.usbDisplayDisplayId/);
  assert.match(main, /if \(usbDisplayRestorePending\) restoreConfiguredUsbDisplay\(\)/);
  assert.ok(main.indexOf('restoreConfiguredUsbDisplay();') < main.indexOf('await startService();'));
  assert.match(main, /Never guess which external monitor is the 5-inch panel/);
});

test('music state restores selection and position but never resumes playback automatically', () => {
  const main = read('src/main/index.ts');
  const loader = main.slice(main.indexOf('function loadMusicLibrary()'), main.indexOf('function publicMusicState()'));
  assert.match(loader, /currentTime:/);
  assert.match(loader, /isPlaying: false/);
  assert.doesNotMatch(loader, /isPlaying:\s*raw\./);
});

test('USB display selection never replaces a missing saved target with an arbitrary external display', () => {
  const app = read('src/renderer/App.tsx');
  const start = app.indexOf('function UsbDisplayPage(');
  const end = app.indexOf('\nfunction ', start + 10);
  const page = app.slice(start, end);
  assert.match(page, /const persistedDisplay=displays\.find/);
  assert.match(page, /const selectedDisplay=persistedDisplay;/);
  assert.doesNotMatch(page, /fallbackDisplay/);
  assert.doesNotMatch(page, /if\(!saved&&external\)updateSettings/);
  assert.match(page, /请选择五寸屏对应的显示器/);
  assert.match(page, /程序不会自动切换到其他屏幕/);
});

test('main window exposes the shared music dock on every main-app page; only the separate USB video output omits it', () => {
  const app = read('src/renderer/App.tsx');
  assert.match(app, /<MusicPlayerDock state=\{music\.state\} onCommand=\{music\.command\} onOpen=\{\(\) => setPage\('music'\)\}\/>/);
  assert.doesNotMatch(app, /page === 'usb-display' && settings\.usbDisplayMode === 'video'.{0,100}<MusicPlayerDock/);
  const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));
  assert.match(usb, /mode!=='video'&&<div className="usb-output-music">/);
});

test('music import recognises common codecs and records parsed tags and cover paths', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /new Set\(\['\.mp3', '\.wav', '\.flac', '\.ogg', '\.oga', '\.opus', '\.m4a', '\.m4b', '\.aac'\]\)/);
  assert.match(main, /filters: \[\{ name: '常见音频文件', extensions: MUSIC_AUDIO_FILTER_EXTENSIONS \}\]/);
  assert.match(main, /const metadata = readMusicMetadata\(target\)/);
  assert.match(main, /artworkPath = join\(directory/);
  assert.match(main, /'music:artwork-url'/);
  const player = read('src/renderer/music-player.tsx');
  assert.match(player, /track\.format \?\? 'AUDIO'/);
  assert.match(main, /未知艺术家/);
  assert.doesNotMatch(player, /添加 MP3|本地 MP3|首 MP3/);
});

test('the six USB modes separate hidden desktop playback from visible output', () => {
  const types = read('src/shared/types.ts');
  assert.match(types, /'video' \| 'music-only'/);
  const main = read('src/main/index.ts');
  assert.match(main, /currentSettings\.usbDisplayMode === 'music-only'/);
  assert.match(main, /previous\.usbDisplayMode !== currentSettings\.usbDisplayMode/);
});

test('music output device routing is independent and reports unsupported or unavailable endpoints honestly', () => {
  const player = read('src/renderer/music-player.tsx');
  const types = read('src/shared/types.ts');
  const app = read('src/renderer/App.tsx');
  assert.match(types, /musicOutputDeviceId\?: string/);
  assert.match(types, /musicOutputDeviceLabel\?: string/);
  assert.match(player, /audio\.setSinkId\(requestedDeviceId\)/);
  assert.match(player, /state: 'unsupported'/);
  assert.match(player, /state: 'unavailable'/);
  assert.match(player, /selectAudioOutput/);
  assert.match(player, /AudioContext\.setSinkId/);
  assert.match(player, /oscillator\.frequency\.value = 440/);
  assert.match(player, /musicOutputDeviceId: device\.deviceId/);
  assert.match(app, /outputDeviceId=\{settings\.musicOutputDeviceId \?\? 'default'\}/);
  assert.doesNotMatch(player, /catch\(error\).*setSinkId[\s\S]{0,180}setSinkId\('default'\)/);
});

test('music library exposes separate album artist genre and folder group views', () => {
  const player = read('src/renderer/music-player.tsx');
  for (const view of ['albums', 'artists', 'genres', 'folders']) {
    assert.match(player, new RegExp(`view === '${view}'`));
  }
  assert.match(player, /function getMusicLibraryGroup/);
  assert.match(player, /TrackArtwork trackId=\{group\.firstTrackId\}/);
  assert.match(player, /nm-library-groups/);
  assert.match(player, /getMusicLibraryGroup\(track, view\)\.id !== selectedGroupId/);
});

test('codec and playback failures reach the shared MusicState and remain visible in controls', () => {
  const types = read('src/shared/types.ts');
  const main = read('src/main/index.ts');
  const preload = read('src/preload/index.ts');
  const player = read('src/renderer/music-player.tsx');
  assert.match(types, /errorMessage\?: string \| null/);
  assert.match(main, /errorMessage: payload\.errorMessage\?\.trim\(\)/);
  assert.match(main, /errorMessage: null/);
  assert.match(preload, /errorMessage\?: string/);
  assert.match(player, /音频解码失败/);
  assert.match(player, /当前 Electron Chromium 不支持此音频编码/);
  assert.match(player, /nm-player-error/);
  assert.match(player, /nm-playback-error/);
});

test('ten-band EQ persists ten clamped bands and wires one Web Audio filter chain into the main player', () => {
  const types = read('src/shared/types.ts');
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  assert.match(types, /musicEqBands\?: number\[\]/);
  assert.match(app, /musicEqBands: \[0,0,0,0,0,0,0,0,0,0\]/);
  assert.match(app, /eqBands=\{settings\.musicEqBands/);
  assert.match(player, /MUSIC_EQ_FREQUENCIES = \[31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000\]/);
  assert.match(player, /createMediaElementSource\(audio\)/);
  assert.match(player, /createBiquadFilter\(\)/);
  assert.match(player, /filter\.type = 'peaking'/);
  assert.match(player, /filter\.gain\.setTargetAtTime/);
  assert.match(player, /context\.setSinkId\(requestedDeviceId\)/);
  assert.match(player, /function MusicEqualizer/);
  assert.match(player, /min="-12" max="12"/);
  assert.match(player, /重置为平直/);
  assert.match(player, /不是 WASAPI 独占或 bit-perfect 输出/);
});
