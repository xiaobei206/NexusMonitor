const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLrc } = require('../dist-electron/main/music-lyrics.js');

test('parses UTF-8 BOM, minute timestamps and centisecond fractions in chronological order', () => {
  const lyrics = parseLrc('\uFEFF[00:12.34]Second line\n[00:02.10]First line\n[01:03.456]Third line');
  assert.deepEqual(lyrics, [
    { timeSeconds: 2.1, text: 'First line' },
    { timeSeconds: 12.34, text: 'Second line' },
    { timeSeconds: 63.456, text: 'Third line' },
  ]);
});

test('expands multiple timestamps on one LRC line and applies signed offset', () => {
  const lyrics = parseLrc('[offset:+500]\n[00:01.00][00:03.25]Repeated lyric\n[offset:-250]\n[00:05.00]Last');
  assert.deepEqual(lyrics, [
    { timeSeconds: 1.25, text: 'Repeated lyric' },
    { timeSeconds: 3.5, text: 'Repeated lyric' },
    { timeSeconds: 4.75, text: 'Last' },
  ]);
});

test('ignores malformed and untimed metadata lines, clamps negative offset and empty input', () => {
  assert.deepEqual(parseLrc('[ar:Artist]\n[ti:Title]\nnot timed\n[00:75.00]bad seconds\n[offset:-5000]\n[00:02.00]early'), [
    { timeSeconds: 0, text: 'early' },
  ]);
  assert.deepEqual(parseLrc(''), []);
  assert.deepEqual(parseLrc('\uFEFF[ar:Only metadata]'), []);
});

test('bounds lyric parsing to a maximum of ten thousand timestamp entries', () => {
  const input = Array.from({ length: 12000 }, (_, index) => `[${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}]line ${index}`).join('\n');
  assert.equal(parseLrc(input).length, 10000);
});
