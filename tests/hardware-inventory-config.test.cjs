const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const monitor = readFileSync(join(__dirname, '..', 'HardwareService', 'Monitoring', 'HardwareMonitor.cs'), 'utf8');

test('LHM opens the additional TrafficMonitor/PowerMon hardware groups', () => {
  for (const group of ['IsBatteryEnabled = true', 'IsPowerMonitorEnabled = true', 'IsPsuEnabled = true', 'IsNetworkEnabled = true']) {
    assert.ok(monitor.includes(group), `missing LHM group ${group}`);
  }
});

test('raw inventory carries stable sensor identity and nullable readings', () => {
  assert.match(monitor, /DisplayValue\(sensor\).*Unit\(sensor\.SensorType\).*SensorId\(sensor\)/);
  assert.match(monitor, /full hardware identifier\s*\/\/ ancestry \+ sensor type \+ name/);
});

test('PowerMon-style battery discharge sign convention is applied only to battery sensors', () => {
  assert.match(monitor, /HardwareType\.Battery/);
  assert.match(monitor, /Discharge Rate/);
  assert.match(monitor, /Discharge Current/);
});
