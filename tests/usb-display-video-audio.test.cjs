const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const read = path => readFileSync(join(__dirname, '..', path), 'utf8');
const app = read('src/renderer/App.tsx');
const types = read('src/shared/types.ts');
const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));

test('video audio has safe independent defaults and backwards-compatible settings', () => {
  assert.match(app, /usbDisplayVideoVolume: 0\.8/);
  assert.match(app, /usbDisplayVideoMuted: false/);
  assert.match(app, /usbDisplayVideoOutputDeviceId: 'default'/);
  assert.match(types, /usbDisplayVideoVolume\?: number/);
  assert.match(types, /usbDisplayVideoMuted\?: boolean/);
  assert.match(types, /usbDisplayVideoOutputDeviceId\?: string/);
  assert.match(app, /Math\.max\(0, Math\.min\(1, value\)\)/);
});
test('video is not hard-muted and applies independent volume, mute and output route', () => {
  assert.match(usb, /videoRef/);
  assert.match(usb, /video\.volume=volume/);
  assert.match(usb, /video\.muted=muted/);
  assert.match(usb, /video\.setSinkId\(requestedDeviceId\)/);
  assert.match(usb, /await video\.play\(\)/);
  assert.doesNotMatch(usb, /<video[^>]*\bmuted(?:\s|=|\/|>)/s);
  assert.match(app, /usbDisplayVideoOutputDeviceId/);
  assert.match(app, /选择 Windows 设备/);
});
test('failed non-default routing mutes video instead of silently falling back', () => {
  assert.match(usb, /requestedDeviceId!=='default'/);
  assert.match(usb, /videoRouteFailureRef\.current=true/);
  assert.match(usb, /为避免声音误送到其他设备，视频暂时静音/);
  assert.match(usb, /setVideoOutputWarning/);
});
test('video and Music Service can play concurrently with explicit non-blocking actions', () => {
  assert.match(usb, /usb-video-overlap-notice/);
  assert.match(usb, /继续同时播放/);
  assert.match(usb, /保留两路声音/);
  assert.match(usb, /setTimeout\(\(\)=>setOverlapNotice\(null\),9000\)/);
  assert.match(usb, /music\.command\(\{type:'pause'\}\);setOverlapNotice\(null\)/);
  assert.match(usb, /saveSettings\(\{usbDisplayVideoMuted:true\}\)/);
});
test('native video volume/mute changes persist video-specific settings only', () => {
  assert.match(usb, /onVolumeChange=\{event=>syncVideoAudioFromElement\(event\.currentTarget\)\}/);
  assert.match(usb, /saveSettings\(\{usbDisplayVideoVolume:video\.volume,usbDisplayVideoMuted:video\.muted\}\)/);
  assert.doesNotMatch(usb, /saveSettings\(\{musicOutputDeviceId:/);
});
