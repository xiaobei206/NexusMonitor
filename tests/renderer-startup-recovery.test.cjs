'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('main window waits for both native and React-painted readiness', () => {
  const main = read('src/main/index.ts');
  const renderer = read('src/renderer/main.tsx');
  assert.match(main, /mainWindowNativeReady/);
  assert.match(main, /mainWindowRendererReady/);
  assert.match(main, /window:main-renderer-ready/);
  assert.match(renderer, /requestAnimationFrame\(\(\) => \{/);
  assert.match(renderer, /notifyMainRendererReady\(\)/);
});

test('first expanded detail window waits one compositor turn after the renderer paint handshake', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /Widget detail renderer committed and painted its first UI frame[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?showReadyWidgetDetail\(\);[\s\S]*?\}, 80\)/);
});

test('renderer displays a diagnostic screen instead of a blank surface after a React render exception', () => {
  const renderer = read('src/renderer/main.tsx');
  assert.match(renderer, /class RendererErrorBoundary extends React\.Component/);
  assert.match(renderer, /界面渲染失败/);
  assert.match(renderer, /this\.state\.error\.stack/);
});

test('persisted settings arrays are normalized before first dashboard render', () => {
  const app = read('src/renderer/App.tsx');
  for (const key of ['selectedNetworks', 'selectedDisks', 'visibleMetrics', 'metricOrder', 'shortcuts']) {
    assert.match(app, new RegExp(`Array\\.isArray\\(raw\\.${key}\\)`), `${key} should be guarded against null or invalid legacy values`);
  }
});

test('floating HUD is explicitly shown during app startup', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /createTray\(\);\s*\/\/ The floating HUD[\s\S]*?toggleWidget\(true\);/);
});
