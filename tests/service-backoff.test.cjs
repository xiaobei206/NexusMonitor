const test = require('node:test');
const assert = require('node:assert/strict');
const { restartDelayMs, SERVICE_RESTART_DELAYS_MS } = require('../dist-electron/main/service-backoff.js');

test('returns the bounded restart delays in order', () => {
  assert.deepEqual([...SERVICE_RESTART_DELAYS_MS], [1000, 2000, 5000, 10000, 30000]);
  assert.equal(restartDelayMs(0), 1000);
  assert.equal(restartDelayMs(4), 30000);
  assert.equal(restartDelayMs(5), null);
});

test('rejects invalid attempt indexes', () => {
  assert.equal(restartDelayMs(-1), null);
  assert.equal(restartDelayMs(1.5), null);
});
