const test = require('node:test');
const assert = require('node:assert/strict');
const { parseM3u, serializeM3u } = require('../dist-electron/main/music-playlist.js');

test('parses UTF-8 M3U8, ignores comments and keeps local relative and Windows paths', () => {
  const entries = parseM3u('\uFEFF#EXTM3U\r\n#PLAYLIST:My songs\r\n#EXTINF:210,Title\r\nMusic/one.flac\r\nC:\\Music\\two.mp3\r\n');
  assert.deepEqual(entries, [
    { location: 'Music/one.flac' },
    { location: 'C:\\Music\\two.mp3' },
  ]);
});

test('rejects network and file URI entries and limits path lengths', () => {
  const entries = parseM3u('https://example.com/stream.mp3\nfile:///C:/Music/a.mp3\n' + 'x'.repeat(4097) + '\nD:\\Audio\\local.ogg');
  assert.deepEqual(entries, [{ location: 'D:\\Audio\\local.ogg' }]);
});

test('round-trips local paths with EXTINF metadata and normalizes line breaks', () => {
  const content = serializeM3u([
    { path: 'C:\\Music\\one.flac', title: 'First song', artist: 'Artist', durationSeconds: 190.8 },
    { path: 'D:\\Music\\two.mp3', title: 'Second\nSong', durationSeconds: null },
  ]);
  assert.match(content, /^#EXTM3U\r\n/);
  assert.match(content, /#EXTINF:190,First song - Artist/);
  assert.match(content, /C:\\Music\\one\.flac/);
  assert.match(content, /#EXTINF:-1,Second Song/);
  assert.equal(parseM3u(content).length, 2);
});

test('caps playlist entry count at ten thousand', () => {
  const content = Array.from({ length: 11000 }, (_, index) => `track-${index}.mp3`).join('\n');
  assert.equal(parseM3u(content).length, 10000);
});
