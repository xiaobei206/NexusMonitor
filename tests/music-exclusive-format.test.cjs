const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyExclusiveSource, chooseExclusiveFormat } = require('../dist-electron/main/music-exclusive-format.js');

test('classifies common local formats conservatively for bit-perfect claims', () => {
  const flac = classifyExclusiveSource({ path: 'C:/Music/album.flac', format: 'FLAC', sampleRateHz: 96000, bitDepth: 24, channels: 2 });
  const wav = classifyExclusiveSource({ path: 'C:/Music/pcm.wav', format: 'WAV', sampleRateHz: 44100, bitDepth: 16, channels: 2 });
  const mp3 = classifyExclusiveSource({ path: 'C:/Music/song.mp3', format: 'MP3', sampleRateHz: 44100, bitDepth: null, channels: null });
  const m4a = classifyExclusiveSource({ path: 'C:/Music/song.m4a', format: 'M4A', sampleRateHz: 44100, bitDepth: 16, channels: 2 });
  assert.equal(flac.lossless, true);
  assert.equal(wav.lossless, true);
  assert.equal(mp3.lossless, false);
  assert.equal(m4a.lossless, false);
  assert.equal(mp3.channels, null);
});

test('selects an exact device-native format and only claims bit-perfect for known lossless stereo sources', () => {
  const source = classifyExclusiveSource({ path: 'album.flac', format: 'FLAC', sampleRateHz: 96000, bitDepth: 24, channels: 2 });
  const negotiated = chooseExclusiveFormat(source, [
    { format: 's16', channels: 2, sampleRate: 48000 },
    { format: 's24', channels: 2, sampleRate: 96000 },
    { format: 'f32', channels: 2, sampleRate: 96000 },
  ]);
  assert.deepEqual(negotiated, {
    format: 's24', sampleRate: 96000, channels: 2,
    sourceSampleRate: 96000, sourceBitDepth: 24, sourceChannels: 2,
    bitPerfect: true, resampled: false, depthPreserved: true,
    upmixed: false, channelsUnknown: false, dsd: false, lossless: true,
  });
});

test('prefers an exact sample rate, otherwise a supported higher rate before a lower rate', () => {
  const source = { sampleRateHz: 44100, bitDepth: 16, channels: 2, lossless: true };
  const high = chooseExclusiveFormat(source, [
    { format: 's16', channels: 2, sampleRate: 48000 },
    { format: 's16', channels: 2, sampleRate: 96000 },
  ]);
  assert.equal(high.sampleRate, 48000);
  assert.equal(high.resampled, true);
  assert.equal(high.bitPerfect, false);
  const low = chooseExclusiveFormat(source, [
    { format: 's16', channels: 2, sampleRate: 32000 },
    { format: 's16', channels: 2, sampleRate: 48000 },
  ]);
  assert.equal(low.sampleRate, 48000);
});

test('rejects invalid device formats and refuses bit-perfect when source channel count is unknown or non-stereo', () => {
  assert.equal(chooseExclusiveFormat(
    { sampleRateHz: 44100, bitDepth: 16, channels: 2, lossless: true },
    [{ format: 's16', channels: 6, sampleRate: 44100 }],
  ), null);
  const unknown = chooseExclusiveFormat(
    { sampleRateHz: 44100, bitDepth: 16, channels: null, lossless: true },
    [{ format: 's16', channels: 2, sampleRate: 44100 }],
  );
  assert.equal(unknown.channelsUnknown, true);
  assert.equal(unknown.bitPerfect, false);
  const mono = chooseExclusiveFormat(
    { sampleRateHz: 44100, bitDepth: 16, channels: 1, lossless: true },
    [{ format: 's16', channels: 2, sampleRate: 44100 }],
  );
  assert.equal(mono.upmixed, true);
  assert.equal(mono.bitPerfect, false);
});

test('unknown rate and DSD are never labelled bit-perfect; unsupported source depth is disclosed', () => {
  const unknownRate = chooseExclusiveFormat(
    { sampleRateHz: null, bitDepth: 16, channels: 2, lossless: true },
    [{ format: 'f32', channels: 2, sampleRate: 48000 }, { format: 'f32', channels: 2, sampleRate: 96000 }],
  );
  assert.equal(unknownRate.sampleRate, 96000);
  assert.equal(unknownRate.resampled, true);
  assert.equal(unknownRate.bitPerfect, false);
  const dsd = chooseExclusiveFormat(
    { sampleRateHz: 2822400, bitDepth: 1, channels: 2, lossless: true, dsd: true },
    [{ format: 'f32', channels: 2, sampleRate: 88200 }],
  );
  assert.equal(dsd.sampleRate, 88200);
  assert.equal(dsd.resampled, true);
  assert.equal(dsd.bitPerfect, false);
  const noDepth = chooseExclusiveFormat(
    { sampleRateHz: 48000, bitDepth: 32, channels: 2, lossless: true },
    [{ format: 's24', channels: 2, sampleRate: 48000 }, { format: 's32', channels: 2, sampleRate: 48000 }],
  );
  assert.equal(noDepth.format, 's32');
  assert.equal(noDepth.depthPreserved, true);
});

test('honors the renderer transport sample rate so exclusive PCM is not mis-clocked', () => {
  const source = { sampleRateHz: 44100, bitDepth: 16, channels: 2, lossless: true };
  const match = chooseExclusiveFormat(source, [
    { format: 's16', channels: 2, sampleRate: 44100 },
    { format: 'f32', channels: 2, sampleRate: 48000 },
  ], 48000);
  assert.equal(match.sampleRate, 48000);
  assert.equal(match.resampled, true);
  assert.equal(match.bitPerfect, false);
  const unsupported = chooseExclusiveFormat(source, [
    { format: 's16', channels: 2, sampleRate: 44100 },
  ], 96000);
  assert.equal(unsupported, null);
});
