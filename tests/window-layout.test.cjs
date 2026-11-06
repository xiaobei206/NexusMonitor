const test = require('node:test');
const assert = require('node:assert/strict');
const { fitWindowToWorkArea } = require('../.test-build/main/window-layout.js');

test('keeps the main window centered at its preferred size on a normal desktop', () => {
  const layout = fitWindowToWorkArea(
    { x: 0, y: 0, width: 1920, height: 1040 },
    { width: 1480, height: 940, minWidth: 1120, minHeight: 720, margin: 24 },
  );
  assert.deepEqual(layout, { x: 220, y: 50, width: 1480, height: 940, minWidth: 1120, minHeight: 720 });
});

test('clamps the main window and its minimum size to a short work area', () => {
  const layout = fitWindowToWorkArea(
    { x: 0, y: 0, width: 1366, height: 728 },
    { width: 1480, height: 940, minWidth: 1120, minHeight: 720, margin: 24 },
  );
  assert.equal(layout.width, 1318);
  assert.equal(layout.height, 680);
  assert.ok(layout.minWidth <= layout.width);
  assert.ok(layout.minHeight <= layout.height);
  assert.ok(layout.x >= 0 && layout.y >= 0);
});

test('places the vertical widget at the top-right and clamps it to small displays', () => {
  const layout = fitWindowToWorkArea(
    { x: 100, y: 40, width: 1280, height: 700 },
    { width: 340, height: 900, minWidth: 340, minHeight: 700, margin: 18, horizontalAnchor: 'right', verticalAnchor: 'top' },
  );
  assert.deepEqual(layout, { x: 1022, y: 58, width: 340, height: 664, minWidth: 340, minHeight: 664 });
});

test('centers the horizontal floating HUD near the top of the work area', () => {
  const layout = fitWindowToWorkArea(
    { x: 0, y: 0, width: 1920, height: 1040 },
    { width: 860, height: 112, minWidth: 680, minHeight: 96, margin: 24, horizontalAnchor: 'center', verticalAnchor: 'top' },
  );
  assert.deepEqual(layout, { x: 530, y: 24, width: 860, height: 112, minWidth: 680, minHeight: 96 });
});
