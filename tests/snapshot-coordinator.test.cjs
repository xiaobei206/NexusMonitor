const test = require('node:test');
const assert = require('node:assert/strict');
const { SnapshotCoordinator } = require('../dist-electron/main/snapshot-coordinator.js');

test('coalesces concurrent snapshot requests into one fetch', async () => {
  const coordinator = new SnapshotCoordinator(() => 0, 500);
  let calls = 0;
  let release;
  const fetcher = () => {
    calls += 1;
    return new Promise(resolve => {
      release = () => resolve({ ok: true, data: { value: 42 } });
    });
  };

  const first = coordinator.get(fetcher);
  const second = coordinator.get(fetcher);
  const third = coordinator.get(fetcher);
  assert.equal(calls, 1);

  release();
  const results = await Promise.all([first, second, third]);
  assert.deepEqual(results.map(r => r.data), [{ value: 42 }, { value: 42 }, { value: 42 }]);
  assert.equal(calls, 1);
});

test('serves a fresh cached snapshot without another fetch', async () => {
  let now = 1_000;
  const coordinator = new SnapshotCoordinator(() => now, 500);
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { ok: true, data: { value: calls } };
  };

  const first = await coordinator.get(fetcher);
  now += 300;
  const second = await coordinator.get(fetcher);

  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual(second.data, { value: 1 });
});

test('refetches after cache expiry and keeps the last good value on failure', async () => {
  let now = 1_000;
  const coordinator = new SnapshotCoordinator(() => now, 500);
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls === 1) return { ok: true, data: { value: 7 } };
    return { ok: false, error: { kind: 'timeout', message: 'slow' } };
  };

  await coordinator.get(fetcher);
  now += 600;
  const failed = await coordinator.get(fetcher);

  assert.equal(calls, 2);
  assert.deepEqual(failed.data, { value: 7 });
  assert.equal(failed.error.kind, 'timeout');
  assert.equal(failed.stale, true);
});

test('force bypasses cache and invalidate clears the last value', async () => {
  let now = 0;
  const coordinator = new SnapshotCoordinator(() => now, 500);
  let calls = 0;
  const fetcher = async () => ({ ok: true, data: { value: ++calls } });

  await coordinator.get(fetcher);
  now += 100;
  const forced = await coordinator.get(fetcher, { force: true });
  assert.equal(calls, 2);
  assert.equal(forced.cached, false);

  coordinator.invalidate();
  now += 100;
  const after = await coordinator.get(fetcher);
  assert.equal(calls, 3);
  assert.deepEqual(after.data, { value: 3 });
});
