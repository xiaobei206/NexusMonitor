const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');

test('HUD converts bytes per second into decimal Mbps', () => {
  assert.match(app, /Math\.max\(0, bytesPerSecond\) \* 8 \/ 1_000_000/);
});

test('download and upload use independent 600 Mbps and 40 Mbps reference scales', () => {
  assert.match(app, /toMbps\(rx\) \?\? 0\)\/600\*100/);
  assert.match(app, /toMbps\(tx\) \?\? 0\)\/40\*100/);
  assert.match(app, /下载 · 600 Mbps 参考/);
  assert.match(app, /上传 · 40 Mbps 参考/);
  assert.match(css, /\.network-scale-fill\.download-fill/);
  assert.match(css, /\.network-scale-fill\.upload-fill/);
});
