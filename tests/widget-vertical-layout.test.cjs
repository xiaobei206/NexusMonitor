const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');

test('vertical HUD uses a dedicated icon-led information layout with weekday and richer weather', () => {
  assert.match(app, /settings\.orientation === 'vertical' \? <>/);
  for (const token of ['widget-vertical-row cpu-row', 'widget-vertical-row gpu-row', 'MemoryStick', 'HardDrive', 'Network', 'widget-vertical-weather', 'widget-vertical-clock']) {
    assert.ok(app.includes(token), `missing vertical HUD element: ${token}`);
  }
  assert.match(app, /体感 .*湿度/);
  assert.match(app, /AQI .*PM2\.5 .*PM10 .*风速/);
  assert.match(app, /todayMaxTemperature/);
  assert.match(app, /todayMinTemperature/);
  assert.match(app, /<span>\{dateText\}<\/span><small>\{weekdayText\}<\/small>/);
});

test('horizontal HUD remains a separate original rendering branch and vertical defaults to 340x960', () => {
  assert.match(app, /: <>\s*<div className="widget-brand">/);
  assert.match(app, /widget-stat cpu-stat/);
  assert.match(main, /width: 340, height: 960/);
  assert.match(main, /scheduleWidgetDimensionPersistence/);
});

test('vertical HUD restores disk capacity and separate download/upload bars', () => {
  assert.match(app, /widget-vertical-storage/);
  assert.match(app, /widget-vertical-network-bars/);
  assert.match(app, /className="widget-network-bar"/);
  assert.match(app, /download-fill/);
  assert.match(app, /upload-fill/);
});

test('vertical HUD uses the shared AQI color presentation and fills weather area with forecasts', () => {
  assert.match(app, /widget-vertical-airline[\s\S]*?style=\{\{color:aqiPresentation\.textColor/);
  assert.match(app, /widget-vertical-hourly/);
  assert.match(app, /widget-vertical-daily/);
  assert.match(app, /未来 3 小时/);
  assert.match(app, /未来 3 天/);
  assert.match(app, /settings\.orientation === 'vertical' \? <>[\s\S]*?slice\(0,6\)[\s\S]*?slice\(0,6\)/);
});

test('expanded six-hour and up-to-six-day weather details are restricted to vertical HUD', () => {
  assert.match(app, /settings\.orientation === 'vertical' \? <>/);
  assert.match(app, /未来逐日预报（最多 6 天）/);
  assert.match(app, /: <>[\s\S]*?widget-weather-forecast/);
});


test('vertical HUD exposes a dedicated calendar launcher without changing the horizontal branch', () => {
  assert.match(app, /widget-vertical-calendar-trigger/);
  assert.match(app, /openWidgetCalendar\(\)/);
  assert.match(main, /widget:open-calendar/);
  assert.match(main, /currentSettings\.orientation !== 'vertical'/);
  assert.match(app, /: <>\s*<div className="widget-brand">/);
});
