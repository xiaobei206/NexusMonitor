const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateWidgetDetailLayout } = require('../.test-build/main/widget-detail-window.js');

const boundsInside = (b, a) => b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;

test('vertical HUD detail is a separate panel immediately left of a right-side compact bar', () => {
  const area = { x: 1920, y: 0, width: 1440, height: 900 };
  const compact = { x: 2940, y: 36, width: 340, height: 864 };
  const layout = calculateWidgetDetailLayout(compact, area, 'vertical');
  assert.equal(layout.placement, 'left');
  assert.equal(layout.bounds.x + layout.bounds.width, compact.x, 'detail card adjoins compact bar without overlap');
  assert.equal(layout.bounds.y, compact.y);
  assert.notEqual(layout.bounds.x, compact.x, 'only the detail window is positioned left');
  assert.ok(boundsInside(layout.bounds, area));
});

test('vertical HUD detail chooses the available side rather than overlapping a compact bar near the left edge', () => {
  const area = { x: -1600, y: 0, width: 1600, height: 900 };
  const compact = { x: -1580, y: 60, width: 340, height: 780 };
  const layout = calculateWidgetDetailLayout(compact, area, 'vertical');
  assert.equal(layout.placement, 'right');
  assert.equal(layout.bounds.x, compact.x + compact.width);
  assert.ok(boundsInside(layout.bounds, area));
});

test('horizontal HUD detail opens below the bar and fits the work area', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  const compact = { x: 920, y: 18, width: 980, height: 112 };
  const layout = calculateWidgetDetailLayout(compact, area, 'horizontal');
  assert.equal(layout.placement, 'below');
  assert.equal(layout.bounds.x, compact.x);
  assert.equal(layout.bounds.y, compact.y + compact.height);
  assert.ok(boundsInside(layout.bounds, area));
});

test('detail placement stays within negative-origin displays and short work areas', () => {
  const area = { x: -1920, y: 0, width: 1280, height: 720 };
  const compact = { x: -900, y: 4, width: 340, height: 680 };
  const vertical = calculateWidgetDetailLayout(compact, area, 'vertical');
  assert.ok(boundsInside(vertical.bounds, area));
  const horizontal = calculateWidgetDetailLayout({ x: -1800, y: 18, width: 980, height: 112 }, area, 'horizontal');
  assert.ok(boundsInside(horizontal.bounds, area));
});

test('detached detail IPC listeners are declared in the preload-facing TypeScript contract', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8');
  const types = fs.readFileSync(path.join(root, 'src/renderer/vite-env.d.ts'), 'utf8');
  for (const name of ['onWidgetDetailState', 'onWidgetDetailFadeOut', 'onWidgetDetailFadeCancel', 'notifyWidgetDetailRendererReady']) {
    assert.match(preload, new RegExp(`${name}:`), `${name} must exist in preload API`);
    assert.match(types, new RegExp(`${name}\\(`), `${name} must be declared for Renderer TypeScript`);
  }
});


test('first detail-window display waits for Electron first paint, not document load', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
  const start = main.indexOf('function createWidgetDetailWindow()');
  const end = main.indexOf('\nfunction repositionWidgetDetailWindow()', start);
  assert.ok(start >= 0 && end > start, 'detail-window factory must remain identifiable');
  const factory = main.slice(start, end);
  const ready = factory.indexOf("detail.once('ready-to-show'");
  const navigation = Math.min(
    ...['detail.loadURL(', 'detail.loadFile('].map(token => {
      const index = factory.indexOf(token);
      return index < 0 ? Number.POSITIVE_INFINITY : index;
    }),
  );
  assert.ok(ready >= 0, 'detail window must wait for ready-to-show');
  assert.ok(ready < navigation, 'first-paint listener must be registered before navigation');
  assert.match(factory, /ready-to-show[\s\S]*?widgetDetailNativeReady = true[\s\S]*?updateWidgetDetailReadiness\(detail\)/);
  assert.match(factory, /did-finish-load[\s\S]*?Widget detail document load finished/);
  assert.match(main, /function updateWidgetDetailReadiness\(detail: BrowserWindow\)[\s\S]*?widgetDetailNativeReady[\s\S]*?widgetDetailRendererReady[\s\S]*?widgetDetailReady = true[\s\S]*?showReadyWidgetDetail\(\)/);
  assert.match(main, /ipcMain\.on\('widget:detail-renderer-ready'[\s\S]*?event\.sender !== detail\.webContents[\s\S]*?updateWidgetDetailReadiness\(detail\)/);
  assert.doesNotMatch(factory, /did-finish-load[\s\S]{0,180}widgetDetailReady = true/);
  const optionsMatch = factory.match(/const detail = new BrowserWindow\(\{([\s\S]*?)\n\s*\}\);/);
  assert.ok(optionsMatch, 'detail BrowserWindow options must remain identifiable');
  const options = optionsMatch[1];
  const paintOption = options.indexOf('paintWhenInitiallyHidden: true');
  const webPreferences = options.indexOf('webPreferences: {');
  assert.ok(paintOption >= 0 && paintOption < webPreferences,
    'paintWhenInitiallyHidden belongs to BrowserWindowConstructorOptions, not WebPreferences');
  assert.doesNotMatch(options.slice(webPreferences), /paintWhenInitiallyHidden:/,
    'WebPreferences must not receive BrowserWindow-only options');
});


test('detached detail renderer confirms React commit and two paint frames before the native window is shown', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'src/renderer/App.tsx'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8');
  assert.match(app, /if \(!detailOnly\) return;[\s\S]*?window\.requestAnimationFrame[\s\S]*?window\.requestAnimationFrame[\s\S]*?notifyWidgetDetailRendererReady\(\)/);
  assert.match(preload, /notifyWidgetDetailRendererReady: \(\) => ipcRenderer\.send\('widget:detail-renderer-ready'\)/);
});
