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

test('USB display output supports the five requested content modes and uses a separate renderer route', () => {
  for (const mode of ['monitor', 'static', 'gif', 'weather-clock', 'video']) assert.ok(app.includes(`'${mode}'`));
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\('usb-display'\)/);
  assert.match(main, /loadFile\(join\(app\.getAppPath\(\), 'dist', 'index\.html'\), \{ query: \{ 'usb-display': '1' \} \}\)/);
  assert.doesNotMatch(main, /setFullScreen\(true\)/);
  assert.match(main, /fullscreenable: false/);
  assert.match(main, /output\.setBounds\(bounds, false\)/);
});

test('USB display window targets an actual extended display and closes when that display is removed', () => {
  assert.match(main, /screen\.getAllDisplays\(\)\.find\(display => String\(display\.id\) === String\(displayId\)\)/);
  assert.match(main, /display-removed/);
  assert.match(main, /applyUsbDisplayWindowBounds\(usbDisplayWindow, target\)/);
  assert.match(main, /closeUsbDisplayWindow\(\)/);
});

test('USB media access is limited to known image, video and audio extensions', () => {
  assert.match(main, /USB_DISPLAY_IMAGE_EXTENSIONS = new Set\(\['\.jpg', '\.jpeg', '\.png', '\.webp', '\.bmp', '\.gif'\]\)/);
  assert.match(main, /USB_DISPLAY_VIDEO_EXTENSIONS = new Set\(\['\.mp4', '\.m4v', '\.webm', '\.mov'\]\)/);
  assert.match(main, /USB_DISPLAY_AUDIO_EXTENSIONS = new Set\(\['\.mp3', '\.wav', '\.m4a', '\.aac', '\.ogg', '\.flac'\]\)/);
  assert.match(main, /USB_DISPLAY_IMAGE_MAX_BYTES = 80 \* 1024 \* 1024/);
});

test('renderer APIs are exposed through preload with matching TypeScript declarations', () => {
  for (const name of ['getDesktopDisplays', 'getUsbDisplayStatus', 'openUsbDisplay', 'closeUsbDisplay', 'chooseUsbDisplayMedia', 'readUsbDisplayImage', 'getUsbDisplayVideoUrl', 'getUsbDisplayAudioUrl', 'onDesktopDisplaysChanged', 'onUsbDisplayStatusChanged']) {
    assert.ok(preload.includes(`${name}:`), `missing preload API ${name}`);
    assert.ok(types.includes(`${name}(`), `missing Window.nexus type ${name}`);
  }
});

test('5-inch hardware brightness is explicitly deferred rather than represented as a working control', () => {
  assert.match(app, /5 寸屏硬件亮度/);
  assert.match(app, /USB 亮度指令/);
  assert.match(app, /MP3 \/ WAV \/ M4A/);
  assert.match(app, /US AQI/);
});


test('USB background audio volume is assigned through HTMLAudioElement ref, not an unsupported JSX prop', () => {
  assert.match(app, /const audioRef=useRef<HTMLAudioElement\|null>\(null\)/);
  assert.match(app, /audioRef\.current\.volume=audioVolume/);
  assert.match(app, /<audio ref=\{audioRef\}[^>]*autoPlay/);
  assert.doesNotMatch(app, /<audio[^>]*\bvolume=/);
});
