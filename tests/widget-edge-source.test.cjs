const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('HUD has native context menu controls for pin, topmost, auto-hide and fullscreen yielding', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /webContents\.on\('context-menu'/);
  for (const label of ['固定位置', '始终置顶', '靠边自动隐藏', '全屏时自动让位', '打开主界面', '退出 NexusMonitor']) assert.ok(main.includes(label), label);
  assert.match(main, /widget:set-always-on-top/);
  assert.match(main, /widgetPinned/);
  assert.match(main, /widgetAutoHide/);
  assert.match(main, /widgetSmartFullscreen/);
});

test('HUD docking supports all four edges, preserves 10px reveal strips and restores bounds', () => {
  const docking = read('src/main/widget-docking.ts');
  const main = read('src/main/index.ts');
  for (const edge of ['left', 'right', 'top', 'bottom']) assert.ok(docking.includes(`'${edge}'`), edge);
  assert.match(docking, /visiblePixels = 10/);
  assert.match(main, /widget:snap-edge/);
  assert.match(main, /widget:hide-edge/);
  assert.match(main, /widget:reveal-edge/);
  assert.match(main, /widgetRestoreMinSize/);
  assert.match(main, /widgetLastDisplayId/);
  assert.match(main, /widgetDisplayPositions/);
  assert.match(main, /display\.id/);
});

test('HUD fullscreen monitor compares foreground monitor against HUD monitor, not process names', () => {
  const main = read('src/main/index.ts');
  const helper = read('src/main/fullscreen-detection.ts');
  const script = read('build/widget-window-monitor.ps1');
  assert.match(main, /startWidgetFullscreenMonitor/);
  assert.match(main, /isFullscreenOnWidgetDisplay/);
  assert.match(helper, /sameMonitor/);
  assert.match(script, /GetForegroundWindow/);
  assert.match(script, /MonitorFromWindow/);
  assert.match(script, /Start-Sleep -Milliseconds 800/);
});


test('HUD minimum-size restoration converts Electron number array into the required tuple', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /const \[minimumWidth, minimumHeight\] = widgetWindow\.getMinimumSize\(\)/);
  assert.match(main, /widgetRestoreMinSize = \[minimumWidth, minimumHeight\]/);
});

test('persisted HUD display positions are validated before use', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /rawDisplayPositions && typeof rawDisplayPositions === 'object' && !Array\.isArray\(rawDisplayPositions\)/);
  assert.match(main, /Number\.isFinite\(savedPositionRecord\.x\)/);
  assert.match(main, /Number\.isFinite\(savedPositionRecord\.y\)/);
  assert.match(main, /'left', 'right', 'top', 'bottom'/);
});
