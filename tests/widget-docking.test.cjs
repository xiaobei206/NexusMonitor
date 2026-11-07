const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDockEdge, dockWidgetBounds, hideWidgetBounds, expandDockedWidget, resizeWidgetForOrientation } = require('../.test-build/main/widget-docking.js');
const area = { x: 100, y: 50, width: 1280, height: 720 };
const bounds = { x: 1080, y: 70, width: 180, height: 112 };

test('detects nearest edge and ignores windows away from monitor edges', () => {
  assert.equal(resolveDockEdge({ ...bounds, x: 104, y: 80 }, area), 'left');
  assert.equal(resolveDockEdge({ ...bounds, x: 1190, y: 80 }, area), 'right');
  assert.equal(resolveDockEdge({ ...bounds, x: 500, y: 52 }, area), 'top');
  assert.equal(resolveDockEdge({ ...bounds, x: 500, y: 650 }, area), 'bottom');
  assert.equal(resolveDockEdge({ ...bounds, x: 500, y: 300 }, area), null);
});

test('docks and leaves a 10px reveal strip on all four sides', () => {
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const docked = dockWidgetBounds(bounds, area, edge);
    const hidden = hideWidgetBounds(bounds, area, edge);
    const visible = edge === 'left' ? hidden.x + hidden.width - area.x : edge === 'right' ? area.x + area.width - hidden.x : edge === 'top' ? hidden.y + hidden.height - area.y : area.y + area.height - hidden.y;
    assert.equal(visible, 10);
    assert.equal(edge === 'left' ? docked.x : edge === 'right' ? docked.x + docked.width : edge === 'top' ? docked.y : docked.y + docked.height, edge === 'left' ? area.x : edge === 'right' ? area.x + area.width : edge === 'top' ? area.y : area.y + area.height);
  }
});

test('expanded panel remains attached to its docked edge', () => {
  const right = expandDockedWidget({ x: 1200, y: 80, width: 180, height: 112 }, area, 'right', 900, 500);
  assert.equal(right.x + right.width, 1380);
  const bottom = expandDockedWidget({ x: 300, y: 670, width: 900, height: 100 }, area, 'bottom', 900, 500);
  assert.equal(bottom.y + bottom.height, 770);
});


test('orientation resize restores canonical horizontal dimensions after vertical mode', () => {
  const monitor = { x: 1920, y: 0, width: 1440, height: 900 };
  const vertical = { x: 3002, y: 18, width: 340, height: 864 };
  const horizontal = resizeWidgetForOrientation(vertical, monitor, 'horizontal', null);
  assert.deepEqual(horizontal.bounds, { x: 2362, y: 18, width: 980, height: 112 });
  assert.equal(horizontal.minWidth, 760);
  assert.equal(horizontal.minHeight, 96);
});

test('orientation resize restores canonical vertical dimensions after horizontal mode', () => {
  const monitor = { x: 1920, y: 0, width: 1440, height: 900 };
  const horizontal = { x: 2362, y: 18, width: 980, height: 112 };
  const vertical = resizeWidgetForOrientation(horizontal, monitor, 'vertical', null);
  assert.deepEqual(vertical.bounds, { x: 3002, y: 18, width: 340, height: 864 });
  assert.equal(vertical.minWidth, 340);
  assert.equal(vertical.minHeight, 700);
});


test('vertical HUD opens at a balanced 960px height that leaves desktop space visible', () => {
  const monitor = { x: 0, y: 0, width: 2560, height: 1440 };
  const vertical = resizeWidgetForOrientation(
    { x: 2200, y: 18, width: 340, height: 900 },
    monitor,
    'vertical',
    'right',
  );
  assert.deepEqual(vertical.bounds, { x: 2202, y: 0, width: 340, height: 960 });
  assert.equal(vertical.minHeight, 700);
});

test('vertical HUD restores a custom height within supported bounds', () => {
  const monitor = { x: 0, y: 0, width: 1920, height: 1440 };
  const current = { x: 1540, y: 80, width: 340, height: 960 };
  const restored = resizeWidgetForOrientation(current, monitor, 'vertical', null, 18, 820);
  assert.equal(restored.bounds.height, 820);
  const clamped = resizeWidgetForOrientation(current, monitor, 'vertical', null, 18, 1500);
  assert.equal(clamped.bounds.height, 1200);
});

test('orientation resize preserves a genuinely floating HUD center and clamps it to the work area', () => {
  const monitor = { x: -1600, y: 0, width: 1600, height: 860 };
  const current = { x: -1100, y: 250, width: 340, height: 700 };
  const horizontal = resizeWidgetForOrientation(current, monitor, 'horizontal', null);
  assert.equal(horizontal.bounds.width, 980);
  assert.equal(horizontal.bounds.height, 112);
  assert.ok(horizontal.bounds.x >= monitor.x);
  assert.ok(horizontal.bounds.x + horizontal.bounds.width <= monitor.x + monitor.width);
  assert.ok(horizontal.bounds.y >= monitor.y);
  assert.ok(horizontal.bounds.y + horizontal.bounds.height <= monitor.y + monitor.height);
  assert.equal(horizontal.bounds.x + horizontal.bounds.width / 2, current.x + current.width / 2);
});

test('orientation changes reflow the existing HUD and broadcast settings instead of destroying the window', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.match(source, /resizeWidgetForOrientation\(/);
  assert.match(source, /win\.webContents\.send\('app:settings-updated', publicSettings\)/);
  assert.doesNotMatch(source, /oldWindow\.destroy\(\)/);
});

test('HUD auto-hide reacts to pointer leaving as well as mouse leaving', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
  assert.match(source, /onPointerLeave=\{onShellLeave\}/);
  assert.match(source, /edgeHideTimer\.current = setTimeout[\s\S]*hideWidgetToEdge/);
});


test('HUD detail opens in an independent native window; expand/collapse never resize or reposition the compact HUD', () => {
  const main = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/main/index.ts'), 'utf8');
  const app = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
  const block = main.match(/function setWidgetExpanded\(expanded: boolean\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(block, /createWidgetDetailWindow\(\)/);
  assert.match(block, /widgetDetailWindow\.setBounds\(bounds, false\)/);
  assert.doesNotMatch(block, /widgetWindow\.setBounds|widgetWindow\.setPosition/);
  assert.match(main, /widget-detail=1/);
  assert.match(app, /!detailOnly && <div\s+className="widget-bar"/);
  assert.match(app, /detailOnly && expanded && <section className="widget-panel"/);
  assert.match(app, /detailOnly && expanded \? 'expanded detail-only' : ''/);
  assert.match(app, /window\.nexus\.onWidgetDetailState/);
});

test('detail-window auto-hide uses explicit renderer hover IPC and checks the desktop cursor', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');
  const preload = fs.readFileSync(path.resolve(__dirname, '../src/preload/index.ts'), 'utf8');
  const app = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
  assert.match(main, /screen\.getCursorScreenPoint\(\)/);
  assert.match(main, /cursorInsideWindow\(widgetWindow, point\) \|\| cursorInsideWindow\(widgetDetailWindow, point\)/);
  assert.match(main, /ipcMain\.handle\('widget:detail-pointer'/);
  assert.doesNotMatch(main, /(?:widgetWindow|detail)\.on\('(enter|leave)'/);
  assert.match(preload, /notifyWidgetDetailPointer: \(inside: boolean\) => ipcRenderer\.invoke\('widget:detail-pointer', inside\)/);
  assert.match(app, /notifyDetailHover\(true\)/);
  assert.match(app, /notifyDetailHover\(false\)/);
  assert.match(main, /widgetDetailWindow\?\.webContents\.send\('widget:detail-fade-out'\)/);
});

test('widget pin state stays synchronized and the main process remains the drag authority', () => {
  const app = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
  const preload = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/preload/index.ts'), 'utf8');
  const main = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.match(preload, /onSettingsUpdated/);
  assert.match(app, /window\.nexus\.onSettingsUpdated/);
  assert.doesNotMatch(app, /canMove: settings\.widgetPinned/);
  assert.match(app, /moveWidgetTo\(\{ x: Math\.round\(active\.startWindowX \+ dx\)/);
  assert.match(main, /currentSettings\.widgetPinned === true/);
});

test('orientation changes hide the detached card and resize only the compact HUD', () => {
  const main = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/main/index.ts'), 'utf8');
  const app = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
  assert.match(main, /hideWidgetDetail\(\);[\s\S]*const currentBounds = widgetWindow\.getBounds\(\)/);
  assert.match(main, /widgetWindow\.setBounds\(layout\.bounds, false\)/);
  assert.doesNotMatch(main, /widgetCollapsedBounds|widgetCollapsedMinSize/);
  assert.match(app, /lastOrientation\.current === settings\.orientation/);
  assert.match(app, /setExpanded\(false\)/);
});
