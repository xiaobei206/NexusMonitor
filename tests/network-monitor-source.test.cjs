const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const monitor = readFileSync(join(__dirname, '..', 'HardwareService', 'Monitoring', 'NetworkMonitor.cs'), 'utf8');
const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');

 test('network inventory distinguishes physical adapters and the Windows best route', () => {
  assert.match(monitor, /Win32_NetworkAdapter WHERE GUID IS NOT NULL/);
  assert.match(monitor, /PhysicalAdapter/);
  assert.match(monitor, /GetBestInterface/);
  assert.match(monitor, /isPhysical, hasGateway, isDefaultRoute/);
});

test('network sampling uses a single interface counter pair rather than adding IP families', () => {
  assert.match(monitor, /var stats = nic\.GetIPStatistics\(\)/);
  assert.doesNotMatch(monitor, /GetIPv4Statistics\(\).*GetIPv6Statistics\(\)/s);
});

test('normal device inventory hides virtual interfaces and marks the default physical route', () => {
  assert.match(app, /allNetworks\.filter\(n => n\.isPhysical === true && n\.status === 'Up'\)/);
  assert.match(app, /n\.isDefaultRoute\?'主路由':'已连接'/);
  assert.match(app, /selectNetworkInterfaces\(snapshot, settings\.selectedNetworks\)/);
});
