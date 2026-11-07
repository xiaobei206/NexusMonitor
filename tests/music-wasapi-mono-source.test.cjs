const test=require('node:test');const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {join}=require('node:path');
const source=readFileSync(join(__dirname,'..','native/wasapi-output/binding.cpp'),'utf8');
test('probe checks mono/stereo with classic and extensible formats',()=>{
 assert.match(source,/MakeClassicWaveFormat\(uint32_t sampleRate, SampleFormat format, uint16_t channels\)/);
 assert.match(source,/WAVEFORMATEX classic = MakeClassicWaveFormat/);
 assert.match(source,/const uint16_t channelCandidates\[\] = \{2, 1\}/);
 assert.match(source,/GetMixFormat\(&mixFormat\)/);assert.match(source,/SPEAKER_FRONT_CENTER/);
});
test('Initialize retries classic WAVEFORMATEX after extensible fails',()=>{
 assert.match(source,/HRESULT InitializeExclusiveStream\([\s\S]*?WAVEFORMATEXTENSIBLE extensible[\s\S]*?WAVEFORMATEX classic/);
 assert.match(source,/usedClassicFormat \? "IAudioClient::Initialize exclusive WAVEFORMATEX"/);
});
test('PCM tap keeps shared output audible until native PCM has rendered',()=>{
 const worklet=readFileSync(join(__dirname,'..','src/renderer/music-pcm-tap.worklet.js'),'utf8');
 const player=readFileSync(join(__dirname,'..','src/renderer/music-player.tsx'),'utf8');
 assert.match(worklet,/this\.muteOutput = this\.exclusive && event\.data\.mute === true/);
 assert.match(worklet,/if \(this\.muteOutput\)/);
 assert.match(player,/mute: false/);assert.match(player,/mute: true/);
});
test('native endpoint uses negotiated channels for audio frame sizing',()=>{
 assert.match(source,/requestedChannels != 1 && requestedChannels != 2/);
 assert.match(source,/g_engine\.channels = static_cast<uint16_t>\(requestedChannels\)/);
 assert.match(source,/g_engine\.bytesPerFrame = g_engine\.bytesPerSample \* g_engine\.channels/);
});
test('native PCM output downmixes stereo into mono when needed',()=>{
 assert.match(source,/const float value = g_engine\.channels == 1 \? \(left \+ right\) \* 0\.5f/);
 assert.match(source,/frame \* g_engine\.channels \+ channel/);
});
test('probe includes format counts and Windows shared mix diagnostics',()=>{
 for(const name of ['testedCandidates','supportedCandidates','mixFormatChannels','mixFormatSampleRate','lastProbeHresult'])assert.ok(source.includes('"'+name+'"'));
});
