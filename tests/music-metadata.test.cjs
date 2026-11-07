const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readMusicMetadata, musicFormatLabel } = require('../dist-electron/main/music-metadata.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-metadata-'));
function writeFixture(name, bytes) {
  const file = path.join(temp, name);
  fs.writeFileSync(file, bytes);
  return file;
}
function u32le(value) { const out = Buffer.alloc(4); out.writeUInt32LE(value); return out; }
function id3Frame(id, value) {
  const body = Buffer.concat([Buffer.from([3]), Buffer.from(value, 'utf8')]);
  const head = Buffer.alloc(10);
  head.write(id, 0, 4, 'ascii');
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}
function syncSafe(value) {
  return Buffer.from([(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f]);
}
function flacComment(key, value) {
  const bytes = Buffer.from(`${key}=${value}`, 'utf8');
  return Buffer.concat([u32le(bytes.length), bytes]);
}
function wavChunk(id, data) {
  const head = Buffer.alloc(8);
  head.write(id, 0, 4, 'ascii');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

test('reads ID3v2 MP3 title, artist, album, year and track number', () => {
  const frames = Buffer.concat([
    id3Frame('TIT2', 'Metadata Song'),
    id3Frame('TPE1', 'Nexus Artist'),
    id3Frame('TALB', 'Test Album'),
    id3Frame('TDRC', '2024-10-12'),
    id3Frame('TRCK', '7/12'),
  ]);
  const header = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), syncSafe(frames.length)]);
  const file = writeFixture('tagged.mp3', Buffer.concat([header, frames, Buffer.from('audio-data')]));
  const metadata = readMusicMetadata(file);
  assert.equal(metadata.title, 'Metadata Song');
  assert.equal(metadata.artist, 'Nexus Artist');
  assert.equal(metadata.album, 'Test Album');
  assert.equal(metadata.year, 2024);
  assert.equal(metadata.trackNumber, 7);
  assert.equal(musicFormatLabel(file), 'MP3');
});

test('reads native FLAC Vorbis-comment blocks without an Ogg packet marker', () => {
  const vendor = Buffer.from('NexusMonitor');
  const comments = [
    'TITLE=Lossless Song',
    'ARTIST=FLAC Artist',
    'ALBUM=FLAC Album',
    'GENRE=Ambient',
    'DATE=2022',
    'TRACKNUMBER=3/9',
  ].map(value => flacComment(...value.split(/=(.*)/s).slice(0, 2)));
  const payload = Buffer.concat([u32le(vendor.length), vendor, u32le(comments.length), ...comments]);
  const blockHead = Buffer.from([0x84, (payload.length >> 16) & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff]);
  const file = writeFixture('tagged.flac', Buffer.concat([Buffer.from('fLaC'), blockHead, payload, Buffer.from('frames')]));
  const metadata = readMusicMetadata(file);
  assert.equal(metadata.title, 'Lossless Song');
  assert.equal(metadata.artist, 'FLAC Artist');
  assert.equal(metadata.album, 'FLAC Album');
  assert.equal(metadata.genre, 'Ambient');
  assert.equal(metadata.year, 2022);
  assert.equal(metadata.trackNumber, 3);
});

test('reads WAV format information and INFO tags', () => {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(2, 2);
  fmt.writeUInt32LE(48000, 4);
  fmt.writeUInt32LE(192000, 8);
  fmt.writeUInt16LE(4, 12);
  fmt.writeUInt16LE(16, 14);
  const title = Buffer.from('WAV Song\0', 'latin1');
  const info = Buffer.concat([Buffer.from('INFO'), wavChunk('INAM', title), wavChunk('IART', Buffer.from('WAV Artist\0'))]);
  const body = Buffer.concat([Buffer.from('WAVE'), wavChunk('fmt ', fmt), wavChunk('LIST', info), wavChunk('data', Buffer.alloc(192000))]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 4, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  const file = writeFixture('tagged.wav', Buffer.concat([riff, body]));
  const metadata = readMusicMetadata(file);
  assert.equal(metadata.title, 'WAV Song');
  assert.equal(metadata.artist, 'WAV Artist');
  assert.equal(metadata.sampleRateHz, 48000);
  assert.equal(metadata.bitDepth, 16);
});
  
test.after(() => {
  fs.rmSync(temp, { recursive: true, force: true });
});
