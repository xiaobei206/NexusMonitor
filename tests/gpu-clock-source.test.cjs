const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Alder Lake CPUID reads named tuple fields from X86Base.CpuId', () => {
  const probe = read('HardwareService/Monitoring/AlderLakeGtTemperatureProbe.cs');
  assert.match(probe, /vendorRegisters\.Ebx/);
  assert.match(probe, /vendorRegisters\.Edx/);
  assert.match(probe, /vendorRegisters\.Ecx/);
  assert.match(probe, /CpuId\(1, 0\)\.Eax/);
  assert.doesNotMatch(probe, /GetElement\(/);
});

test('GPU clock selects a live core/graphics clock and exposes its source sensor', () => {
  const selector = read('HardwareService/Monitoring/GpuSensorSelector.cs');
  const monitor = read('HardwareService/Monitoring/HardwareMonitor.cs');
  const models = read('HardwareService/Models.cs');
  const shared = read('src/shared/types.ts');
  assert.match(selector, /SelectClock/);
  assert.match(selector, /OrderByDescending/);
  assert.match(selector, /Contains\("memory"/);
  assert.match(selector, /Contains\("effective"/);
  assert.match(monitor, /gpuClock\.Value/);
  assert.match(monitor, /gpuClock\.SensorName/);
  assert.match(models, /ClockSensorName/);
  assert.match(shared, /clockSensorName/);
});
