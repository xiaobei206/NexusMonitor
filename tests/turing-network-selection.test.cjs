const test = require('node:test');
const assert = require('node:assert/strict');
const { selectTuringNetwork, selectNetworkInterfaces } = require('../.test-build/renderer/turing-selection.js');

const nic = (id, extra = {}) => ({
  id, name: id, description: id, type: 'Ethernet', status: 'Up', ipv4: '192.0.2.2', mac: '',
  rxBytes: 0, txBytes: 0, rxBytesPerSec: 0, txBytesPerSec: 0, speedMbps: 1000,
  isPhysical: true, hasGateway: false, isDefaultRoute: false, ...extra,
});
const snapshot = networks => ({ networks, volumes: [], disks: [], gpus: [] });

test('automatic selection chooses the Windows default-route physical adapter, not the busiest tunnel', () => {
  const physical = nic('Intel Ethernet', { isDefaultRoute: true, hasGateway: true, rxBytesPerSec: 50_000 });
  const tunnel = nic('Tailscale', { type: 'Tunnel', isPhysical: false, rxBytesPerSec: 999_000_000 });
  const virtual = nic('vEthernet', { isPhysical: false, rxBytesPerSec: 888_000_000 });
  assert.equal(selectTuringNetwork(snapshot([tunnel, virtual, physical])).id, 'Intel Ethernet');
});

test('automatic network totals contain one NIC; explicit selection aggregates only selected physical NICs', () => {
  const a = nic('Ethernet 1', { isDefaultRoute: true });
  const b = nic('Wi-Fi', { type: 'Wireless80211' });
  const v = nic('VPN', { type: 'Tunnel', isPhysical: false });
  assert.deepEqual(selectNetworkInterfaces(snapshot([a, b, v])).map(n => n.id), ['Ethernet 1']);
  assert.deepEqual(selectNetworkInterfaces(snapshot([a, b, v]), ['Ethernet 1', 'Wi-Fi', 'VPN']).map(n => n.id), ['Ethernet 1', 'Wi-Fi']);
  assert.deepEqual(selectNetworkInterfaces(snapshot([a, b, v]), ['__none__']), []);
});
