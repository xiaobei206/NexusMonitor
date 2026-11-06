const test = require('node:test');
const assert = require('node:assert/strict');
const { coversMonitor, isFullscreenOnWidgetDisplay } = require('../.test-build/main/fullscreen-detection.js');
const monitor = { left: 0, top: 0, right: 1920, bottom: 1080 };

test('recognizes a full-monitor window and a near-full borderless window', () => {
  assert.equal(coversMonitor(monitor, monitor), true);
  assert.equal(coversMonitor({ left: 2, top: 1, right: 1918, bottom: 1078 }, monitor), true);
  assert.equal(coversMonitor({ left: 0, top: 0, right: 1920, bottom: 1040 }, monitor), false);
});

test('only yields HUD for fullscreen windows on the HUD display', () => {
  const sample = { handle: '33', rect: monitor, monitor, widgetMonitor: monitor };
  assert.equal(isFullscreenOnWidgetDisplay(sample), true);
  assert.equal(isFullscreenOnWidgetDisplay({ ...sample, widgetMonitor: { left: 1920, top: 0, right: 3840, bottom: 1080 } }), false);
  assert.equal(isFullscreenOnWidgetDisplay(sample, ['33']), false);
});
