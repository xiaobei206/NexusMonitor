const test = require('node:test');
const assert = require('node:assert/strict');
const { TURING_LANDSCAPE_LAYOUT: layout, TURING_SPEED_SCALE: speedScale, WEATHER_CLOCK_FONT } = require('../.test-build/renderer/turing-dashboard.js');

test('landscape dashboard remains the physical 480x320 single page', () => {
  assert.equal(layout.width, 480);
  assert.equal(layout.height, 320);
});

test('hardware occupies the left and one continuous weather panel occupies the right', () => {
  assert.ok(layout.left.x < layout.weather.x);
  assert.equal(layout.left.x + layout.left.width, 294);
  assert.equal(layout.weather.x + layout.weather.width, 470);
  assert.ok(layout.weather.x - (layout.left.x + layout.left.width) >= 6);
});

test('horizontal tracks are long and stay inside each left-side hardware card', () => {
  assert.ok(layout.tracks.width >= 120);
  assert.ok(layout.tracks.x > layout.left.x + 120);
  assert.ok(layout.tracks.x + layout.tracks.width <= layout.left.x + layout.left.width);
});

test('disk and network direction tracks are stacked as two parallel rows', () => {
  assert.ok(layout.tracks.diskWriteY < layout.tracks.diskReadY);
  assert.ok(layout.tracks.networkUploadY < layout.tracks.networkDownloadY);
  assert.equal(layout.tracks.diskWriteY + 15, layout.tracks.diskReadY);
  assert.equal(layout.tracks.networkUploadY + 16, layout.tracks.networkDownloadY);
});

test('six-hour weather forecast uses two rows of three readable cells', () => {
  assert.equal(layout.forecast.columns, 3);
  assert.equal(layout.forecast.rows, 2);
  assert.ok(layout.forecast.slotWidth >= 48);
  assert.ok(layout.forecast.hourFontPx >= 9);
  assert.ok(layout.forecast.precipitationFontPx >= 8);
});


test('disk speed tracks use a fixed 100 MiB/s full scale', () => {
  assert.equal(speedScale.diskBytesPerSecond, 100 * 1024 * 1024);
});

test('network speed tracks use independent 500 Mbps download and 40 Mbps upload scales', () => {
  assert.equal(speedScale.networkDownloadBytesPerSecond, 62_500_000);
  assert.equal(speedScale.networkUploadBytesPerSecond, 5_000_000);
  assert.ok(speedScale.networkDownloadBytesPerSecond > speedScale.networkUploadBytesPerSecond);
});


test('weather-clock typography is sized for a 3.5-inch 480x320 panel', () => {
  assert.ok(WEATHER_CLOCK_FONT.landscape.temperature >= 54);
  assert.ok(WEATHER_CLOCK_FONT.landscape.time >= 46);
  for (const key of ['description', 'detail', 'sectionTitle', 'hour', 'hourTemperature', 'precipitation', 'day']) {
    assert.ok(WEATHER_CLOCK_FONT.landscape[key] >= 12, `${key} must be at least 12 physical pixels`);
  }
  assert.ok(WEATHER_CLOCK_FONT.portrait.temperature >= 54);
  assert.ok(WEATHER_CLOCK_FONT.portrait.time >= 36);
  for (const key of ['description', 'detail', 'sectionTitle', 'hour', 'day']) {
    assert.ok(WEATHER_CLOCK_FONT.portrait[key] >= 12, `${key} must be at least 12 physical pixels`);
  }
});
