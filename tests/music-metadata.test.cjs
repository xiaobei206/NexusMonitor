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
function id3UserTextFrame(description, value) {
  const body = Buffer.concat([Buffer.from([3]), Buffer.from(description, 'utf8'), Buffer.from([0]), Buffer.from(value, 'utf8')]);
  const head = Buffer.alloc(10);
  head.write('TXXX', 0, 4, 'ascii');
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
function vorbisCommentPacket(marker, comments) {
  const vendor = Buffer.from('NexusMonitor');
  return Buffer.concat([
    Buffer.from(marker, 'ascii'),
    u32le(vendor.length), vendor,
    u32le(comments.length),
    ...comments.map(([key, value]) => flacComment(key, value)),
  ]);
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
    id3UserTextFrame('REPLAYGAIN_TRACK_GAIN', '-6.25 dB'),
    id3UserTextFrame('REPLAYGAIN_TRACK_PEAK', '0.923456'),
  ]);
  const header = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), syncSafe(frames.length)]);
  const file = writeFixture('tagged.mp3', Buffer.concat([header, frames, Buffer.from('audio-data')]));
  const metadata = readMusicMetadata(file);
  assert.equal(metadata.title, 'Metadata Song');
  assert.equal(metadata.artist, 'Nexus Artist');
  assert.equal(metadata.album, 'Test Album');
  assert.equal(metadata.year, 2024);
  assert.equal(metadata.trackNumber, 7);
  assert.equal(metadata.replayGainTrackDb, -6.25);
  assert.equal(metadata.replayGainTrackPeak, 0.923456);
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
    'REPLAYGAIN_TRACK_GAIN=-4.50 dB',
    'REPLAYGAIN_ALBUM_GAIN=-7.00 dB',
    'REPLAYGAIN_TRACK_PEAK=0.9876',
    'REPLAYGAIN_ALBUM_PEAK=0.9567',
  ].map(value => flacComment(...value.split(/=(.*)/s).slice(0, 2)));
  const payload = Buffer.concat([u32le(vendor.length), vendor, u32le(comments.length), ...comments]);
  const streamInfo = Buffer.alloc(34);
  const packed = (BigInt(96000) << 44n) | (1n << 41n) | (23n << 36n) | BigInt(96000 * 180);
  streamInfo.writeBigUInt64BE(packed, 10);
  const streamInfoHead = Buffer.from([0x00, 0x00, 0x00, streamInfo.length]);
  const commentHead = Buffer.from([0x84, (payload.length >> 16) & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff]);
  const file = writeFixture('tagged.flac', Buffer.concat([Buffer.from('fLaC'), streamInfoHead, streamInfo, commentHead, payload, Buffer.from('frames')]));
  const metadata = readMusicMetadata(file);
  assert.equal(metadata.title, 'Lossless Song');
  assert.equal(metadata.artist, 'FLAC Artist');
  assert.equal(metadata.album, 'FLAC Album');
  assert.equal(metadata.genre, 'Ambient');
  assert.equal(metadata.year, 2022);
  assert.equal(metadata.trackNumber, 3);
  assert.equal(metadata.sampleRateHz, 96000);
  assert.equal(metadata.bitDepth, 24);
  assert.equal(metadata.channels, 2);
  assert.equal(metadata.replayGainTrackDb, -4.5);
  assert.equal(metadata.replayGainAlbumDb, -7);
  assert.equal(metadata.replayGainTrackPeak, 0.9876);
  assert.equal(metadata.replayGainAlbumPeak, 0.9567);
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
  assert.equal(metadata.channels, 2);
});
  
test.after(() => {
  fs.rmSync(temp, { recursive: true, force: true });
});

test('reads Ogg Vorbis and Opus channel count, sample rate and ReplayGain comments', () => {
  const identification = Buffer.alloc(30);
  identification[0] = 1;
  identification.write('vorbis', 1, 'ascii');
  identification.writeUInt32LE(0, 7);
  identification[11] = 2;
  identification.writeUInt32LE(44100, 12);
  const vorbis = writeFixture('tagged.ogg', Buffer.concat([
    identification,
    vorbisCommentPacket(String.fromCharCode(3) + 'vorbis', [
      ['TITLE', 'Ogg Song'],
      ['REPLAYGAIN_TRACK_GAIN', '-5.25 dB'],
    ]),
  ]));
  const vorbisMetadata = readMusicMetadata(vorbis);
  assert.equal(vorbisMetadata.channels, 2);
  assert.equal(vorbisMetadata.sampleRateHz, 44100);
  assert.equal(vorbisMetadata.title, 'Ogg Song');
  assert.equal(vorbisMetadata.replayGainTrackDb, -5.25);

  const opusHead = Buffer.alloc(19);
  opusHead.write('OpusHead', 0, 'ascii');
  opusHead[8] = 1;
  opusHead[9] = 2;
  opusHead.writeUInt16LE(312, 10);
  opusHead.writeUInt32LE(48000, 12);
  const opus = writeFixture('tagged.opus', Buffer.concat([
    opusHead,
    vorbisCommentPacket('OpusTags', [
      ['TITLE', 'Opus Song'],
      ['REPLAYGAIN_ALBUM_GAIN', '-7.00 dB'],
    ]),
  ]));
  const opusMetadata = readMusicMetadata(opus);
  assert.equal(opusMetadata.channels, 2);
  assert.equal(opusMetadata.title, 'Opus Song');
  assert.equal(opusMetadata.replayGainAlbumDb, -7);
});

test('reads MP4 audio sample-entry channel count and sample rate', () => {
  const sampleEntry = Buffer.alloc(36);
  sampleEntry.writeUInt32BE(sampleEntry.length, 0);
  sampleEntry.write('mp4a', 4, 'ascii');
  sampleEntry.writeUInt16BE(2, 24);
  sampleEntry.writeUInt16BE(16, 26);
  sampleEntry.writeUInt32BE(48000 * 65536, 32);
  const file = writeFixture('tagged.m4a', sampleEntry);
  const metadata = readMusicMetadata(file);
  assert.equal(metadata.channels, 2);
  assert.equal(metadata.sampleRateHz, 48000);
});
