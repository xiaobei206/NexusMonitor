const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveUsbDisplayWindowBounds } = require('../.test-build/main/usb-display-window.js');

test('preserves negative desktop coordinates for a display positioned above and left of primary', () => {
  const source = { x: -960, y: -540, width: 960, height: 540 };
  assert.deepEqual(resolveUsbDisplayWindowBounds(source), source);
});

test('preserves positive and mixed-origin display geometry without applying scaleFactor twice', () => {
  const source = { x: -1280, y: 120, width: 1280, height: 720 };
  assert.deepEqual(resolveUsbDisplayWindowBounds(source), source);
});

test('rejects invalid display bounds instead of creating an incorrectly sized output window', () => {
  assert.throws(() => resolveUsbDisplayWindowBounds({ x: 0, y: 0, width: 0, height: 540 }), RangeError);
  assert.throws(() => resolveUsbDisplayWindowBounds({ x: Number.NaN, y: 0, width: 960, height: 540 }), RangeError);
});
