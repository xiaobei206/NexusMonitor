const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Alder Lake MCHBAR probe is restricted to Intel CPUID models 0x97 and 0x9A', () => {
  const parser = read('HardwareService/Monitoring/AlderLakeGtTemperatureParser.cs');
  const probe = read('HardwareService/Monitoring/AlderLakeGtTemperatureProbe.cs');
  assert.match(parser, /family == 6 && model is \(0x97 or 0x9A\)/);
  assert.match(probe, /GenuineIntel/);
  assert.match(probe, /IsSupportedModel\(family, model\)/);
});

test('GT temperature path reads only the documented MCHBAR register and TjMax MSR', () => {
  const probe = read('HardwareService/Monitoring/AlderLakeGtTemperatureProbe.cs');
  assert.match(probe, /TemperatureStatusRegister = 0x59C0/);
  assert.match(probe, /TemperatureTargetMsr = 0x1A2/);
  assert.match(probe, /ioctl_read_dword/);
  assert.match(probe, /THERM_STATUS_GT/);
  assert.doesNotMatch(probe, /ioctl_write|WriteDword|WriteMsr|SetPowerLimit|SetFan/i);
});

test('temperature parser requires VALID, sane TjMax and plausible decoded temperature', () => {
  const parser = read('HardwareService/Monitoring/AlderLakeGtTemperatureParser.cs');
  assert.match(parser, /0x80000000u/);
  assert.match(parser, /tjMaxCelsius is < 70 or > 125/);
  assert.match(parser, /degreesBelowTjMax/);
  assert.match(parser, /decoded is < 0 or > 125/);
});

test('MCHBAR binary is mandatory and embedded under the stable resource name', () => {
  const project = read('HardwareService/HardwareService.csproj');
  assert.match(project, /EmbeddedResource Include="Resources\\PawnIO\\IntelMCHBAR\.bin"/);
  assert.match(project, /ValidateIntelMchbarModule/);
  assert.match(project, /Error Condition="!Exists\('Resources\\PawnIO\\IntelMCHBAR\.bin'\)"/);
  assert.doesNotMatch(project, /Condition="Exists\('Resources\\PawnIO\\IntelMCHBAR\.bin'\)"/);
  assert.match(project, /NexusMonitor\.HardwareService\.Resources\.PawnIO\.IntelMCHBAR\.bin/);
});

test('fetch script pins the official module archive and verifies SHA-256 before extraction', () => {
  const script = read('scripts/fetch-mchbar-module.ps1');
  assert.match(script, /namazso\/PawnIO\.Modules\/releases\/download\/0\.2\.11/);
  assert.match(script, /43608cb89bc84247fef1368a139013f7d043e17db6d6c8dfc9b46bf0905a81f4/);
  assert.ok(script.indexOf('Get-FileHash') < script.indexOf('Expand-Archive'));
  assert.match(script, /IntelMCHBAR\.bin/);
});

test('failed MCHBAR probe remains null and reports a status instead of faking temperature', () => {
  const monitor = read('HardwareService/Monitoring/HardwareMonitor.cs');
  const models = read('HardwareService/Models.cs');
  assert.match(monitor, /alderLakeGtTemperature/);
  assert.match(monitor, /gpu-intel\/mchbar-gt\/temperature/);
  assert.match(monitor, /gtProbeStatus/);
  assert.match(models, /GpuTemperatureProbeStatus/);
  assert.match(models, /TemperatureSource/);
});
