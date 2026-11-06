const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');

test('HUD modules are individually configurable and persisted in AppSettings', () => {
  for (const id of ['cpu','gpu','memory','storage','network','power','weather','sensors']) {
    assert.ok(app.includes(`'${id}'`), `missing HUD item ${id}`);
  }
  assert.match(app, /widgetVisibleMetrics/);
  assert.match(app, /toggleWidgetMetric/);
});

test('HUD receives weather data and presents compact weather, AQI and humidity', () => {
  assert.match(app, /<WidgetView snapshot=\{snapshot\} settings=\{settings\} history=\{history\} weather=\{weather\} detailOnly=\{isWidgetDetail\}\/>/);
  assert.match(app, /weatherGlyph\(weather\?\.weatherCode\)/);
  assert.match(app, /aqiPresentation\.textColor/);
  assert.match(app, /<b>AQI<\/b>/);
  assert.match(app, /湿度 \{fmt\(weather\?\.humidity/);
});

test('raw hardware sensors can be pinned to the HUD by stable sensor id', () => {
  assert.match(app, /sensorSelectionId/);
  assert.match(app, /widgetSensorIds/);
  assert.match(app, /自选硬件传感器/);
});

test('expanded HUD detail cards obey their individual visibility switches', () => {
  for (const id of ['cpu','gpu','memory','storage','network','power','weather','sensors']) {
    assert.ok(app.includes(`showWidgetMetric('${id}')`), `expanded HUD should honor ${id} visibility`);
  }
});

test('hardware sensor inventory is not truncated to an arbitrary first page', () => {
  assert.doesNotMatch(app, /filteredSensors[^\n]*slice\(0,100\)/);
  assert.match(app, /RAW SENSOR INVENTORY/);
});


test('pointer cancellation clears drag state without stale single-window hide logic', () => {
  assert.match(app, /onPointerCancel=\{\(\) => \{\s*\/\/ Pointer cancellation ends the drag; detached detail-window auto-hide is handled via IPC\.\s*drag\.current = null;\s*\}\}/);
  assert.doesNotMatch(app, /scheduleHide\(/);
});
