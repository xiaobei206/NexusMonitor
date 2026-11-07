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
  const lyrics = parseLrc('[offset:+500]\n[00:01.00][00:03.25]Repeated lyric\n[00:05.00]Last');
  assert.deepEqual(lyrics, [
    { timeSeconds: 1.5, text: 'Repeated lyric' },
    { timeSeconds: 3.75, text: 'Repeated lyric' },
    { timeSeconds: 5.5, text: 'Last' },
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


test('online provider prefers synchronized LRCLIB lyrics using metadata only', async () => {
  const { fetchOnlineLyrics } = require('../dist-electron/main/music-lyrics.js');
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url: String(url), init });
    return { status: 200, ok: true, json: async () => ({
      trackName: 'Example Song', artistName: 'Example Artist', duration: 120,
      syncedLyrics: '[00:00.00]First line\n[00:03.00]Second line', plainLyrics: 'First line\nSecond line',
    }) };
  };
  const result = await fetchOnlineLyrics({ title: 'Example Song', artist: 'Example Artist', album: 'Example Album', durationSeconds: 120 }, fetcher);
  assert.equal(result.source, 'online');
  assert.equal(result.synced, true);
  assert.deepEqual(result.lines, [{ timeSeconds: 0, text: 'First line' }, { timeSeconds: 3, text: 'Second line' }]);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /track_name=Example\+Song/);
  assert.match(requests[0].url, /artist_name=Example\+Artist/);
  assert.equal(requests[0].init.headers['User-Agent'].startsWith('NexusMonitor/'), true);
  assert.equal(requests[0].url.includes('C:\\'), false);
});

test('online provider renders plain lyrics when synchronized lyrics are unavailable', async () => {
  const { fetchOnlineLyrics } = require('../dist-electron/main/music-lyrics.js');
  const result = await fetchOnlineLyrics({ title: 'Example Song', artist: 'Unknown Artist' }, async () => ({
    status: 200, ok: true,
    json: async () => [{ trackName: 'Example Song', artistName: 'Example Artist', plainLyrics: 'One\nTwo', syncedLyrics: null, duration: 100 }],
  }));
  assert.equal(result.source, 'online');
  assert.equal(result.synced, false);
  assert.deepEqual(result.lines.map(line => line.text), ['One', 'Two']);
});

test('online provider treats missing lyrics and rate limiting as a non-fatal empty result', async () => {
  const { fetchOnlineLyrics } = require('../dist-electron/main/music-lyrics.js');
  const missing = await fetchOnlineLyrics({ title: 'Missing Song', artist: 'Example Artist' }, async () => ({ status: 404, ok: false, json: async () => null }));
  assert.deepEqual(missing, { lines: [], synced: false, source: 'none' });
  const limited = await fetchOnlineLyrics({ title: 'Limited Song', artist: 'Example Artist' }, async () => ({ status: 429, ok: false, json: async () => null }));
  assert.deepEqual(limited, { lines: [], synced: false, source: 'none' });
});
