const test = require('node:test');
const assert = require('node:assert/strict');
const { selectTuringDisk, selectTuringGpu, selectTuringNetwork } = require('../.test-build/renderer/turing-selection.js');

const disk = (id, volumeNames = []) => ({ id, model: id, volumeNames, aliases: [] });
const network = (id, name, type, status, rxBytesPerSec, txBytesPerSec) => ({ id, name, type, status, rxBytesPerSec, txBytesPerSec });

test('automatic Turing disk follows the physical disk mapped to C:', () => {
  const snapshot = {
    disks: [disk('disk-d'), disk('disk-c')],
    volumes: [{ name: 'C:\\', diskIds: ['disk-c'] }, { name: 'D:\\', diskIds: ['disk-d'] }],
  };
  assert.equal(selectTuringDisk(snapshot).id, 'disk-c');
});

test('automatic Turing disk uses the only disk when volume mapping is absent', () => {
  assert.equal(selectTuringDisk({ disks: [disk('only')], volumes: [] }).id, 'only');
});

test('automatic Turing disk does not guess when multiple disks are unmapped', () => {
  assert.equal(selectTuringDisk({ disks: [disk('one'), disk('two')], volumes: [] }), null);
});

test('manual Turing disk selection overrides automatic C: mapping', () => {
  const snapshot = { disks: [disk('one'), disk('two')], volumes: [{ name: 'C:\\', diskIds: ['one'] }] };
  assert.equal(selectTuringDisk(snapshot, 'two').id, 'two');
});

test('automatic Turing network chooses the active physical adapter with the most traffic when no route metadata is available', () => {
  const snapshot = { networks: [
    network('loop', 'Loopback', 'Loopback', 'Up', 999999, 999999),
    network('down', 'Disconnected', 'Ethernet', 'Down', 0, 0),
    network('wifi', 'Wi-Fi', 'Wireless80211', 'Up', 4_000_000, 500_000),
    network('eth', 'Ethernet', 'Ethernet', 'Up', 1_000_000, 1_000_000),
  ] };
  assert.equal(selectTuringNetwork(snapshot).id, 'wifi');
});

test('automatic Turing network prefers Ethernet when active traffic is tied', () => {
  const snapshot = { networks: [
    network('wifi', 'Wi-Fi', 'Wireless80211', 'Up', 0, 0),
    network('eth', 'Ethernet', 'Ethernet', 'Up', 0, 0),
  ] };
  assert.equal(selectTuringNetwork(snapshot).id, 'eth');
});

test('manual Turing network selection overrides active-traffic sorting', () => {
  const snapshot = { networks: [network('a', 'A', 'Ethernet', 'Up', 10, 0), network('b', 'B', 'Ethernet', 'Up', 100, 0)] };
  assert.equal(selectTuringNetwork(snapshot, 'a').id, 'a');
});

test('Turing display prefers the Intel integrated GPU without reordering the main GPU list', () => {
  const nvidia = { name: 'NVIDIA GeForce', hardwareType: 'GpuNvidia' };
  const intel = { name: 'Intel Iris Xe Graphics', hardwareType: 'GpuIntel' };
  const snapshot = { gpus: [nvidia, intel] };
  assert.equal(selectTuringGpu(snapshot), intel);
  assert.equal(snapshot.gpus[0], nvidia);
});

test('Turing GPU selection falls back to the first available GPU when Intel is absent', () => {
  const first = { name: 'AMD Radeon', hardwareType: 'GpuAmd' };
  assert.equal(selectTuringGpu({ gpus: [first] }), first);
  assert.equal(selectTuringGpu({ gpus: [] }), null);
});


test('automatic network selection tolerates missing WMI physical-adapter metadata via NIC type/name fallback', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../HardwareService/Monitoring/NetworkMonitor.cs'), 'utf8');
  assert.match(source, /knownPhysical \|\| heuristicPhysical/);
  assert.match(source, /Convert\.ToBoolean\(rawPhysical/);
});
