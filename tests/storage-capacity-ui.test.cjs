const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const app = readFileSync(join(__dirname, '..', 'src', 'renderer', 'App.tsx'), 'utf8');
const storage = readFileSync(join(__dirname, '..', 'src', 'renderer', 'storage-view.ts'), 'utf8');
const { getDiskVolumeUsage, getSystemVolume } = require('../.test-build/renderer/storage-view.js');

test('overview aggregates mounted volumes mapped to each physical disk', () => {
  assert.match(storage, /\(v\.diskIds \?\? \[\]\)\.includes\(disk\.id\)/);
  assert.match(storage, /disk\.volumeNames/);
  assert.match(storage, /const totalBytes = selected\.reduce/);
  assert.match(storage, /const usedBytes = selected\.reduce/);
  assert.match(app, /getDiskVolumeUsage\(snapshot,d\)/);
  assert.match(app, /卷空间占用/);
});

test('HUD shows C volume capacity separately from physical disk I/O', () => {
  assert.match(app, /const disk = selectTuringDisk\(snapshot\)/);
  assert.match(app, /getSystemVolume\(snapshot\)/);
  assert.match(app, /容量占用 · C:/);
  assert.match(app, /rate\(disk\?\.readBytesPerSec\)/);
  assert.match(app, /rate\(disk\?\.writeBytesPerSec\)/);
});


test('volume usage helper sums only explicitly mapped mounted volumes', () => {
  const disk = { id: 'disk-0', volumeNames: ['C:\\', 'D:\\'], sizeBytes: 1_000_000 };
  const snapshot = { volumes: [
    { name: 'C:', totalBytes: 600, usedBytes: 300, diskIds: ['disk-0'] },
    { name: 'D:', totalBytes: 400, usedBytes: 100, diskIds: ['disk-0'] },
    { name: 'E:', totalBytes: 800, usedBytes: 700, diskIds: ['disk-1'] },
  ] };
  const usage = getDiskVolumeUsage(snapshot, disk);
  assert.equal(usage.totalBytes, 1000);
  assert.equal(usage.usedBytes, 400);
  assert.equal(usage.availableBytes, 600);
  assert.equal(usage.percent, 40);
  assert.deepEqual(usage.names, ['C:', 'D:']);
});

test('volume usage helper falls back only to explicit volumeNames and never guesses', () => {
  const snapshot = { volumes: [
    { name: 'C:\\', totalBytes: 1000, usedBytes: 250, diskIds: [] },
    { name: 'D:\\', totalBytes: 1000, usedBytes: 500, diskIds: [] },
  ] };
  assert.equal(getDiskVolumeUsage(snapshot, { id: 'disk-c', volumeNames: ['C:'] }).percent, 25);
  assert.equal(getDiskVolumeUsage(snapshot, { id: 'disk-x', volumeNames: [] }), null);
});

test('system volume helper normalizes a Windows C drive root', () => {
  const volume = { name: 'C:\\', totalBytes: 100, usedBytes: 40, availableBytes: 60, percent: 40 };
  assert.equal(getSystemVolume({ volumes: [volume] }), volume);
});
