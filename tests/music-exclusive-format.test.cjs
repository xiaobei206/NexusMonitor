const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyExclusiveSource,chooseExclusiveFormat}=require('../dist-electron/main/music-exclusive-format.js');
test('classifies common formats conservatively for bit-perfect',()=>{
 const flac=classifyExclusiveSource({path:'a.flac',format:'FLAC',sampleRateHz:96000,bitDepth:24,channels:2});
 const wav=classifyExclusiveSource({path:'a.wav',format:'WAV',sampleRateHz:44100,bitDepth:16,channels:2});
 const mp3=classifyExclusiveSource({path:'a.mp3',format:'MP3',sampleRateHz:44100,bitDepth:null,channels:null});
 assert.equal(flac.lossless,true);assert.equal(wav.lossless,true);assert.equal(mp3.lossless,false);assert.equal(mp3.channels,null);
});
test('selects stereo when supported and keeps the native PCM tuple',()=>{
 const source=classifyExclusiveSource({path:'a.flac',format:'FLAC',sampleRateHz:96000,bitDepth:24,channels:2});
 const result=chooseExclusiveFormat(source,[{format:'s16',channels:2,sampleRate:48000},{format:'s24',channels:2,sampleRate:96000},{format:'f32',channels:2,sampleRate:96000}]);
 assert.equal(result.format,'s24');assert.equal(result.sampleRate,96000);assert.equal(result.channels,2);assert.equal(result.bitPerfect,true);
});
test('supports mono-only endpoint and discloses stereo downmix',()=>{
 const source={path:'a.flac',format:'FLAC',sampleRateHz:48000,bitDepth:24,channels:2,lossless:true};
 const result=chooseExclusiveFormat(source,[{format:'s16',channels:1,sampleRate:48000},{format:'s24',channels:1,sampleRate:48000},{format:'f32',channels:1,sampleRate:48000}],48000);
 assert.equal(result.channels,1);assert.equal(result.format,'s24');assert.equal(result.downmixed,true);assert.equal(result.bitPerfect,false);
});
test('prefers stereo when mono and stereo are both available',()=>{
 const result=chooseExclusiveFormat({sampleRateHz:48000,bitDepth:16,channels:2,lossless:true},[{format:'s16',channels:1,sampleRate:48000},{format:'s16',channels:2,sampleRate:48000}],48000);
 assert.equal(result.channels,2);
});
test('keeps a native mono source mono without artificial upmix',()=>{
 const result=chooseExclusiveFormat({sampleRateHz:44100,bitDepth:16,channels:1,lossless:true},[{format:'s16',channels:1,sampleRate:44100}]);
 assert.equal(result.channels,1);assert.equal(result.upmixed,false);assert.equal(result.downmixed,false);assert.equal(result.bitPerfect,true);
});
test('rejects unsupported layouts and preserves wildcard compatibility',()=>{
 assert.equal(chooseExclusiveFormat({sampleRateHz:44100,bitDepth:16,channels:2,lossless:true},[{format:'s16',channels:6,sampleRate:44100}]),null);
 assert.equal(chooseExclusiveFormat({sampleRateHz:44100,bitDepth:16,channels:2,lossless:true},[{format:'s16',channels:0,sampleRate:44100}]).channels,2);
});
test('does not claim bit-perfect for unknown channels or required upmix',()=>{
 const unknown=chooseExclusiveFormat({sampleRateHz:44100,bitDepth:16,channels:null,lossless:true},[{format:'s16',channels:2,sampleRate:44100}]);
 assert.equal(unknown.channelsUnknown,true);assert.equal(unknown.bitPerfect,false);
 const upmix=chooseExclusiveFormat({sampleRateHz:44100,bitDepth:16,channels:1,lossless:true},[{format:'s16',channels:2,sampleRate:44100}]);
 assert.equal(upmix.upmixed,true);assert.equal(upmix.bitPerfect,false);
});
test('discloses unknown rate, DSD and depth conversion',()=>{
 const unknown=chooseExclusiveFormat({sampleRateHz:null,bitDepth:16,channels:2,lossless:true},[{format:'f32',channels:2,sampleRate:48000},{format:'f32',channels:2,sampleRate:96000}]);
 assert.equal(unknown.sampleRate,96000);assert.equal(unknown.resampled,true);assert.equal(unknown.bitPerfect,false);
 const dsd=chooseExclusiveFormat({sampleRateHz:2822400,bitDepth:1,channels:2,lossless:true,dsd:true},[{format:'f32',channels:2,sampleRate:88200}]);
 assert.equal(dsd.sampleRate,88200);assert.equal(dsd.bitPerfect,false);
 const depth=chooseExclusiveFormat({sampleRateHz:48000,bitDepth:32,channels:2,lossless:true},[{format:'s24',channels:2,sampleRate:48000},{format:'s32',channels:2,sampleRate:48000}]);
 assert.equal(depth.format,'s32');assert.equal(depth.depthPreserved,true);
});
test('honors renderer transport sample rate',()=>{
 const source={sampleRateHz:44100,bitDepth:16,channels:2,lossless:true};
 const match=chooseExclusiveFormat(source,[{format:'s16',channels:2,sampleRate:44100},{format:'f32',channels:2,sampleRate:48000}],48000);
 assert.equal(match.sampleRate,48000);assert.equal(match.resampled,true);assert.equal(match.bitPerfect,false);
 assert.equal(chooseExclusiveFormat(source,[{format:'s16',channels:2,sampleRate:44100}],96000),null);
});
