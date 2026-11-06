const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { getScheduledTuringBrightness } = require('../.test-build/renderer/turing-auto-brightness.js');

const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');

const localTime = (hour, minute = 0) => new Date(2026, 10, 5, hour, minute, 0, 0);

test('Turing auto brightness uses the day level inside the configured daytime window', () => {
  assert.equal(getScheduledTuringBrightness(localTime(8), '08:00', '20:00', 72, 18), 72);
  assert.equal(getScheduledTuringBrightness(localTime(19, 59), '08:00', '20:00', 72, 18), 72);
});

test('Turing auto brightness uses the night level outside the daytime window', () => {
  assert.equal(getScheduledTuringBrightness(localTime(20), '08:00', '20:00', 72, 18), 18);
  assert.equal(getScheduledTuringBrightness(localTime(7, 59), '08:00', '20:00', 72, 18), 18);
});

test('Turing auto brightness supports daytime windows crossing midnight', () => {
  assert.equal(getScheduledTuringBrightness(localTime(22), '20:00', '07:00', 80, 12), 80);
  assert.equal(getScheduledTuringBrightness(localTime(6, 59), '20:00', '07:00', 80, 12), 80);
  assert.equal(getScheduledTuringBrightness(localTime(12), '20:00', '07:00', 80, 12), 12);
});

test('Turing auto brightness clamps percentages and uses safe defaults for invalid time strings', () => {
  assert.equal(getScheduledTuringBrightness(localTime(12), 'bad', '20:00', 180, -5), 100);
  assert.equal(getScheduledTuringBrightness(localTime(22), 'bad', 'bad', 180, -5), 0);
});

test('Turing page exposes the scheduler and disables the manual slider while automatic mode is enabled', () => {
  assert.match(app, /getScheduledTuringBrightness\(/);
  assert.match(app, /setInterval\(\(\) => void apply\(\), 30_000\)/);
  assert.match(app, /disabled=\{settings\.turingAutoBrightnessEnabled===true\}/);
  assert.match(app, /window\.nexus\.setTuringBrightness\(target\)/);
});

test('USB display page exposes device selection, five output modes and explicit deferred hardware brightness', () => {
  assert.match(app, /getDesktopDisplays\(\)/);
  for (const mode of ['monitor', 'static', 'gif', 'weather-clock', 'video']) {
    assert.ok(app.includes(`'${mode}'`), `missing USB display mode ${mode}`);
  }
  assert.match(app, /usbDisplay:status|onUsbDisplayStatusChanged/);
  assert.match(app, /USB 亮度指令/);
});
