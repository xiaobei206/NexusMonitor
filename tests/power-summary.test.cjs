const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePowerSummary } = require('../.test-build/renderer/power-summary.js');

const base = { cpu: { powerW: null }, gpus: [], sensors: [] };
const sensor = (hardware, name, kind, value, unit = '') => ({ hardware, name, kind, value, unit });

test('battery discharge power takes priority and remains negative', () => {
  const result = resolvePowerSummary({
    ...base, cpu: { powerW: 28 },
    sensors: [sensor('Battery', 'Discharge Rate', 'Power', -9.5, 'W'), sensor('Battery', 'Charge Level', 'Level', 73, '%'), sensor('Battery', 'Voltage', 'Voltage', 15.2, 'V')],
  });
  assert.equal(result.mode, 'battery-discharge');
  assert.equal(result.valueW, -9.5);
  assert.equal(result.batteryLevelPercent, 73);
  assert.equal(result.batteryVoltageV, 15.2);
});

test('charging power is shown as a secondary battery metric while smart power uses CPU/GPU', () => {
  const result = resolvePowerSummary({
    ...base, cpu: { powerW: 22 }, gpus: [{ powerW: 6 }],
    sensors: [
      sensor('Battery', 'Charge Rate', 'Power', 12.25, 'W'),
      sensor('Battery', 'Remaining Capacity', 'Energy', 42800, 'mWh'),
      sensor('Battery', 'Remaining Time', 'TimeSpan', 5400, 's'),
      sensor('Battery', 'Discharge Current', 'Current', -1.2, 'A'),
    ],
  });
  assert.equal(result.mode, 'cpu-gpu');
  assert.equal(result.valueW, 28);
  assert.equal(result.batteryChargeW, 12.25);
  assert.equal(result.batteryCapacityMWh, 42800);
  assert.equal(result.batteryRemainingSeconds, 5400);
  assert.equal(result.batteryCurrentA, -1.2);
});

test('AC-style summary adds only positive CPU and GPU readings', () => {
  const result = resolvePowerSummary({
    cpu: { powerW: 35 },
    gpus: [{ powerW: 8 }, { powerW: 0 }, { powerW: null }],
    sensors: [],
  });
  assert.equal(result.mode, 'cpu-gpu');
  assert.equal(result.valueW, 43);
  assert.equal(result.componentCount, 2);
});

test('platform monitor power is exposed separately, not mislabeled as CPU/GPU total', () => {
  const result = resolvePowerSummary({
    ...base,
    sensors: [sensor('Power Monitor', 'Platform Power', 'Power', 66.5, 'W')],
  });
  assert.equal(result.mode, 'unavailable');
  assert.equal(result.valueW, null);
  assert.equal(result.platformPowerW, 66.5);
});

test('unavailable and zero watt readings are not shown as a fabricated total', () => {
  const result = resolvePowerSummary({ cpu: { powerW: 0 }, gpus: [{ powerW: 0 }], sensors: [] });
  assert.equal(result.mode, 'unavailable');
  assert.equal(result.valueW, null);
});


test('does not double-count Intel integrated GPU power already inside CPU Package', () => {
  const result = resolvePowerSummary({
    cpu: { powerW: 42 },
    gpus: [{ name: 'Intel(R) Iris(R) Xe Graphics', hardwareType: 'GpuIntel', powerW: 8.6 }],
    sensors: [],
  });
  assert.equal(result.mode, 'cpu-gpu');
  assert.equal(result.valueW, 42);
  assert.equal(result.cpuPowerW, 42);
  assert.equal(result.gpuPowerW, 8.6);
  assert.equal(result.componentCount, 1);
  assert.match(result.label, /已包含核显功耗域/);
});

test('retains Intel integrated GPU power when CPU Package reading is unavailable', () => {
  const result = resolvePowerSummary({
    cpu: { powerW: null },
    gpus: [{ name: 'Intel Iris Xe Graphics', hardwareType: 'GpuIntel', powerW: 1.2 }],
    sensors: [],
  });
  assert.equal(result.valueW, 1.2);
  assert.equal(result.componentCount, 1);
});
