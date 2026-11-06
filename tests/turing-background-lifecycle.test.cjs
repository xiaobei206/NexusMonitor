const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('closing the visible main dashboard preserves its renderer while the HUD remains visible', () => {
  const main = read('src/main/index.ts');
  const createMain = main.match(/function createMainWindow\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(createMain, 'main BrowserWindow initializer must exist');
  assert.match(createMain, /backgroundThrottling:\s*false/);
  assert.match(createMain, /const keepTuringRuntime = Boolean\(widgetWindow && !widgetWindow\.isDestroyed\(\) && widgetWindow\.isVisible\(\)\)/);
  assert.match(createMain, /currentSettings\.minimizeToTray === true \|\| keepTuringRuntime/);
  assert.match(createMain, /event\.preventDefault\(\);\s*mainWindow\?\.hide\(\)/);
  assert.doesNotMatch(createMain, /mainWindow\?\.destroy\(\)/);
});

test('Turing sender remains mounted in the hidden main renderer and does not require the Turing settings page to be active', () => {
  const app = read('src/renderer/App.tsx');
  const effect = app.match(/useEffect\(\(\)=>\{\s*if\(!status\.connected\)[\s\S]*?\},\[status\.connected,snapshot,weather,[^\]]+\]\);/);
  assert.ok(effect, 'periodic Turing frame sender must remain a dependency-driven mounted effect');
  assert.doesNotMatch(effect[0], /if\(!active\)/);
  assert.match(app, /const isWidgetDetail = widgetQuery\.get\('widget-detail'\) === '1'/);
});
