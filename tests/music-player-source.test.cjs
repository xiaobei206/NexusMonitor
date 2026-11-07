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

test('all non-video USB output modes get shared controls while the existing wallpaper audio is not double-played', () => {
  const app = read('src/renderer/App.tsx');
  const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));
  assert.match(usb, /mode!=='video'&&<div className="usb-output-music">/);
  assert.match(usb, /audioSource&&!music\.state\?\.currentTrackId/);
  assert.match(usb, /<MusicMiniPlayer state=\{music\.state\} onCommand=\{music\.command\}\/>/);
});

test('the main renderer owns the only audio engine and the library is separate from video mode', () => {
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  assert.equal((app.match(/<MusicPlaybackRuntime state=\{music\.state\}\/>/g) ?? []).length, 1);
  assert.match(player, /<audio ref=\{audioRef\} preload="metadata"/);
  assert.match(player, /chooseMusicFiles/);
  assert.match(player, /chooseMusicFolder/);
  assert.match(player, /move-track/);
  assert.match(player, /repeat/);
  assert.match(app, /page === 'usb-display' && settings\.usbDisplayMode === 'video'/);
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
