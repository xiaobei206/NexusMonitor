const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { findTuringAutoConnectPort } = require('../.test-build/renderer/turing-autoconnect.js');

const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');

test('startup auto-connect prefers the saved port when it is positively identified as Turing', () => {
  const devices = [
    { port: 'COM3', isTuring: true },
    { port: 'COM7', isTuring: true },
    { port: 'COM5', isTuring: false },
  ];
  assert.equal(findTuringAutoConnectPort(devices, 'com7'), 'COM7');
});

test('startup auto-connect falls back to a detected Turing port if the saved COM number changed', () => {
  const devices = [
    { port: 'COM3', isTuring: false },
    { port: 'COM8', isTuring: true },
  ];
  assert.equal(findTuringAutoConnectPort(devices, 'COM3'), 'COM8');
});

test('startup auto-connect never opens an unidentified or ordinary serial port', () => {
  assert.equal(findTuringAutoConnectPort([{ port: 'COM3', isTuring: false }], 'COM3'), null);
  assert.equal(findTuringAutoConnectPort([{ port: 'COM3' }], 'COM3'), null);
  assert.equal(findTuringAutoConnectPort([], 'COM3'), null);
});

test('startup auto-connect waits until settings and hardware service are ready', () => {
  assert.match(app, /settingsLoaded=\{settingsLoaded\} serviceReady=\{serviceStatus\.phase === 'online' \|\| serviceStatus\.phase === 'degraded'\}/);
  assert.match(app, /if\(!settingsLoaded \|\| !serviceReady\)return;/);
  assert.match(app, /findTuringAutoConnectPort\(devices,settings\.turingPort\?\?'COM3'\)/);
  assert.match(app, /window\.nexus\.connectTuring\(\{port,orientation:settings\.turingOrientation\}\)/);
});
