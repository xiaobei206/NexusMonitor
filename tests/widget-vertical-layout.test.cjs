const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');
const docking = fs.readFileSync(path.join(root, 'src/main/widget-docking.ts'), 'utf8');

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

test('vertical HUD restores the saved per-display size and uses a smaller first-run fallback', () => {
  assert.match(app, /: <>\s*<div className="widget-brand">/);
  assert.match(app, /widget-stat cpu-stat/);
  assert.match(main, /resolveSavedVerticalWidgetSize\(sizeMap\[String\(display\.id\)\], savedPositionRecord\)/);
  assert.match(main, /height: verticalSize\.height, minWidth: 280, minHeight: 420/);
  assert.match(docking, /return read\(saved\) \?\? read\(legacy\) \?\? \{ width: 340, height: 900 \}/);
  assert.match(main, /resizable: !vertical \|\| currentSettings\.widgetResizeEnabled !== false/);
  assert.match(main, /widgetVerticalDisplaySizes/);
});

test('vertical HUD right-click menu controls persistent resizing and size locking', () => {
  assert.match(main, /label: '允许调整窗口大小'/);
  assert.match(main, /checked: currentSettings\.widgetResizeEnabled !== false/);
  assert.match(main, /saveSettings\(\{ widgetResizeEnabled: item\.checked \}\)/);
  assert.match(main, /widgetWindow\.setResizable\(item\.checked\)/);
  assert.match(main, /persistWidgetDimensionsNow\(thisWidget\)/);
  assert.match(css, /\.widget-shell\.vertical \.widget-bar\{width:100%;min-width:0;flex:1 1 auto\}/);

test('vertical HUD sections keep natural height and hide the complete optional daily forecast on shorter screens', () => {
  assert.match(css, /\.widget-shell\.vertical \.widget-bar > \.widget-vertical-row,[\s\S]*?flex: 0 0 auto;/);
  assert.match(css, /@media\(max-height:1180px\)\s*\{\s*\.widget-shell\.vertical \.widget-vertical-daily-block\{display:none\}/);
  assert.match(css, /\.widget-shell\.vertical \.widget-bar > \.nm-widget-player/);
  assert.match(app, /widget-vertical-forecast-block widget-vertical-daily-block/);
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
});

test('vertical HUD native minimum height tracks natural visible content and horizontal HUD is unaffected', () => {
  const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8');
  const types = fs.readFileSync(path.join(root, 'src/renderer/vite-env.d.ts'), 'utf8');
  assert.match(app, /const widgetBarRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(app, /new ResizeObserver\(scheduleMeasure\)/);
  assert.match(app, /new MutationObserver\(\(\) => \{/);
  assert.match(app, /childrenHeight \+ Math\.max\(0, visibleChildren\.length - 1\) \* gap \+ barPadding \+ shellFrame/);
  assert.match(app, /window\.nexus\.setWidgetContentMinimumHeight\(minimumHeight\)/);
  assert.match(app, /settings\.orientation !== 'vertical'/);
  assert.match(preload, /setWidgetContentMinimumHeight: \(height: number\) => ipcRenderer\.invoke\('widget:set-content-min-height', height\)/);
  assert.match(types, /setWidgetContentMinimumHeight\(height: number\): Promise<number \| false>/);
  assert.match(main, /event\.sender !== widgetWindow\.webContents/);
  assert.match(main, /win\.setMinimumSize\(minimumWidth, minimumHeight\)/);
  assert.match(main, /bounds\.height < minimumHeight/);
  assert.match(main, /resolveVerticalWidgetMinimumHeight\(measuredHeight, display\.workArea\.height, 420\)/);
});
