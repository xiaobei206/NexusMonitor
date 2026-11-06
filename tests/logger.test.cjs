const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { RotatingLogger } = require('../dist-electron/main/logger.js');

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-logger-'));
  try { return fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test('suppresses duplicate keyed messages and reports the suppressed count', () => withTempDir(dir => {
  let now = 0;
  const logger = new RotatingLogger(dir, 1024 * 1024, () => now);
  logger.log('snapshot timeout', 'api:snapshot:timeout', 5000);
  logger.log('snapshot timeout', 'api:snapshot:timeout', 5000);
  logger.log('snapshot timeout', 'api:snapshot:timeout', 5000);

  let lines = readFileSync(join(dir, 'main.log'), 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 1);

  now = 6000;
  logger.log('snapshot timeout', 'api:snapshot:timeout', 5000);
  lines = readFileSync(join(dir, 'main.log'), 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 2);
  assert.match(lines[1], /suppressed 2 duplicate/);
}));

test('rotates the log when it exceeds the configured size', () => withTempDir(dir => {
  const logger = new RotatingLogger(dir, 160, () => 0);
  for (let i = 0; i < 8; i += 1) logger.log(`line-${i}-${'x'.repeat(40)}`);
  assert.equal(existsSync(join(dir, 'main.log')), true);
  assert.equal(existsSync(join(dir, 'main.log.1')), true);
}));
