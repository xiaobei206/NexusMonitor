const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const read = (path) => readFileSync(join(__dirname, '..', path), 'utf8');
const app = read('src/renderer/App.tsx');
const main = read('src/main/index.ts');
const preload = read('src/preload/index.ts');
const types = read('src/renderer/vite-env.d.ts');

test('USB display settings page is nested under the Turing display output navigation group', () => {
  assert.match(app, /\{ id: 'turing', label: '图灵副屏', icon: Monitor, group: '设备输出' \}/);
  assert.match(app, /\{ id: 'usb-display', label: 'USB 5 寸副屏', icon: MonitorPlay, group: '设备输出' \}/);
  assert.match(app, /page==='usb-display'&&<UsbDisplayPage/);
});

test('USB display exposes the six defined modes and uses a separate output renderer route', () => {
  for (const mode of ['monitor', 'static', 'gif', 'weather-clock', 'video', 'music-only']) {
    assert.ok(app.includes(`'${mode}'`), `missing USB display mode ${mode}`);
  }
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\('usb-display'\)/);
  assert.match(main, /loadFile\(join\(app\.getAppPath\(\), 'dist', 'index\.html'\), \{ query: \{ 'usb-display': '1' \} \}\)/);
  assert.doesNotMatch(main, /setFullScreen\(true\)/);
  assert.match(main, /fullscreenable: false/);
  assert.match(main, /output\.setBounds\(bounds, false\)/);
});

test('USB display window targets the saved extended display and closes when removed', () => {
  assert.match(main, /screen\.getAllDisplays\(\)\.find\(display => String\(display\.id\) === String\(displayId\)\)/);
  assert.match(main, /display-removed/);
  assert.match(main, /applyUsbDisplayWindowBounds\(usbDisplayWindow, target\)/);
  assert.match(main, /closeUsbDisplayWindow\(\)/);
});

test('USB output accepts only known image/video extensions; music formats belong to the shared library', () => {
  assert.match(main, /USB_DISPLAY_IMAGE_EXTENSIONS = new Set\(\['\.jpg', '\.jpeg', '\.png', '\.webp', '\.bmp', '\.gif'\]\)/);
  assert.match(main, /USB_DISPLAY_VIDEO_EXTENSIONS = new Set\(\['\.mp4', '\.m4v', '\.webm', '\.mov'\]\)/);
  assert.match(main, /MUSIC_AUDIO_EXTENSIONS = new Set\(\['\.mp3', '\.wav', '\.flac', '\.ogg', '\.oga', '\.opus', '\.m4a', '\.m4b', '\.aac'\]\)/);
  assert.doesNotMatch(main, /USB_DISPLAY_AUDIO_EXTENSIONS|getUsbDisplayAudioUrl/);
  assert.match(main, /USB_DISPLAY_IMAGE_MAX_BYTES = 80 \* 1024 \* 1024/);
});

test('preload exposes image/video output APIs without a second wallpaper audio API', () => {
  for (const name of ['getDesktopDisplays', 'getUsbDisplayStatus', 'openUsbDisplay', 'closeUsbDisplay', 'chooseUsbDisplayMedia', 'readUsbDisplayImage', 'getUsbDisplayVideoUrl', 'onDesktopDisplaysChanged', 'onUsbDisplayStatusChanged']) {
    assert.ok(preload.includes(`${name}:`), `missing preload API ${name}`);
    assert.ok(types.includes(`${name}(`), `missing Window.nexus type ${name}`);
  }
  assert.doesNotMatch(preload, /getUsbDisplayAudioUrl/);
  assert.doesNotMatch(types, /getUsbDisplayAudioUrl/);
});

test('5-inch hardware brightness remains explicitly deferred and wallpapers rely on shared Music Service', () => {
  assert.match(app, /5 寸屏硬件亮度/);
  assert.match(app, /USB 亮度指令/);
  assert.match(app, /usb-shared-music-note|背景音乐由统一音乐服务接管/);
  assert.match(app, /US AQI/);
});

test('music-only display action button uses the short 应用模式 label', () => {
  assert.match(app, /mode==='music-only'\?'应用模式':'启动副屏'/);
  assert.doesNotMatch(app, /应用桌面壁纸音乐模式/);
});

test('USB output renderer never owns a second wallpaper audio element', () => {
  const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));
  assert.doesNotMatch(usb, /audioRef|audioSource|<audio|usbDisplayAudioPath/);
  assert.match(usb, /mode!=='video'&&<div className="usb-output-music">/);
  assert.match(usb, /<MusicMiniPlayer state=\{music\.state\} onCommand=\{music\.command\}\/>/);
  assert.equal(app.split('<MusicPlaybackRuntime state={music.state}').length - 1, 1);
});
