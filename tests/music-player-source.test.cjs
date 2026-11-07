const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('vertical floating HUD inserts only the compact player immediately before weather and keeps the clock last', () => {
  const app = read('src/renderer/App.tsx');
  const widgetStart = app.indexOf('function WidgetView(');
  const widgetEnd = app.indexOf('\nfunction ', widgetStart + 10);
  const widget = app.slice(widgetStart, widgetEnd);
  const player = widget.indexOf('{!detailOnly && <MusicMiniPlayer');
  const weather = widget.indexOf("{showWidgetMetric('weather') && <div className=\"widget-vertical-weather\">");
  const clock = widget.indexOf('<div className="widget-vertical-clock">');
  assert.ok(widget.includes("settings.orientation === 'vertical' ? <>"), 'player stays within the existing vertical layout branch');
  assert.ok(player >= 0 && player < weather, 'mini player is inserted before the existing weather block');
  assert.ok(weather < clock, 'weather remains above the bottom clock');
  assert.equal((widget.match(/<MusicMiniPlayer /g) ?? []).length, 1, 'no duplicate HUD player insertion');
});

test('non-video USB output uses the shared Music Service and has no legacy wallpaper audio engine', () => {
  const app = read('src/renderer/App.tsx');
  const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));
  assert.match(usb, /mode!=='video'&&<div className="usb-output-music">/);
  assert.match(usb, /<MusicMiniPlayer state=\{music\.state\} onCommand=\{music\.command\}\/>/);
  assert.doesNotMatch(usb, /audioSource|audioRef|usbDisplayAudioPath|<audio/);
  assert.match(app, /\['music-only','桌面壁纸 \+ 音乐'/);
  const main = read('src/main/index.ts');
  assert.match(main, /USB display output hidden; shared Music Service remains active/);
  assert.match(main, /USB display output remains hidden in desktop wallpaper \+ music mode/);
});

test('the main renderer owns the only audio engine and the library is separate from video mode', () => {
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  assert.equal((app.match(/<MusicPlaybackRuntime\b/g) ?? []).length, 1);
  assert.match(player, /<audio ref=\{audioRef\} preload="metadata"/);
  assert.match(player, /chooseMusicFiles/);
  assert.match(player, /chooseMusicFolder/);
  assert.match(player, /move-track/);
  assert.match(player, /repeat/);
  const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));
  assert.match(usb, /mode!=='video'&&<div className="usb-output-music">/);
});

test('closing the main window hides it from taskbar and the tray explicitly restores or exits', () => {
  const main = read('src/main/index.ts');
  const close = main.slice(main.indexOf("mainWindow.on('close'"), main.indexOf("mainWindow.on('closed'"));
  assert.match(close, /event\.preventDefault\(\)/);
  assert.match(close, /setSkipTaskbar\(true\)/);
  assert.match(close, /mainWindow\?\.hide\(\)/);
  const tray = main.slice(main.indexOf('function createTray()'), main.indexOf('function showMainWindowAfterFirstPaint'));
  assert.match(tray, /label: '打开主面板'/);
  assert.match(tray, /tray\.on\('double-click'/);
  assert.match(tray, /label: '退出 NexusMonitor'/);
});

test('saved 5-inch display restores before hardware service startup and retries on topology changes', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /function restoreConfiguredUsbDisplay\(\)/);
  assert.match(main, /usbDisplayRestorePending = Boolean\(String\(currentSettings\.usbDisplayDisplayId/);
  assert.match(main, /if \(usbDisplayRestorePending\) restoreConfiguredUsbDisplay\(\)/);
  assert.ok(main.indexOf('restoreConfiguredUsbDisplay();') < main.indexOf('await startService();'));
  assert.match(main, /Never guess which external monitor is the 5-inch panel/);
});

test('music state restores selection and position but never resumes playback automatically', () => {
  const main = read('src/main/index.ts');
  const loader = main.slice(main.indexOf('function loadMusicLibrary()'), main.indexOf('function publicMusicState()'));
  assert.match(loader, /currentTime:/);
  assert.match(loader, /isPlaying: false/);
  assert.doesNotMatch(loader, /isPlaying:\s*raw\./);
});

test('USB display selection never replaces a missing saved target with an arbitrary external display', () => {
  const app = read('src/renderer/App.tsx');
  const start = app.indexOf('function UsbDisplayPage(');
  const end = app.indexOf('\nfunction ', start + 10);
  const page = app.slice(start, end);
  assert.match(page, /const persistedDisplay=displays\.find/);
  assert.match(page, /const selectedDisplay=persistedDisplay;/);
  assert.doesNotMatch(page, /fallbackDisplay/);
  assert.doesNotMatch(page, /if\(!saved&&external\)updateSettings/);
  assert.match(page, /请选择五寸屏对应的显示器/);
  assert.match(page, /程序不会自动切换到其他屏幕/);
});

test('main window exposes the shared music dock on every main-app page; only the separate USB video output omits it', () => {
  const app = read('src/renderer/App.tsx');
  assert.match(app, /<MusicPlayerDock state=\{music\.state\} onCommand=\{music\.command\} onOpen=\{\(\) => setPage\('music'\)\}\/>/);
  assert.doesNotMatch(app, /page === 'usb-display' && settings\.usbDisplayMode === 'video'.{0,100}<MusicPlayerDock/);
  const usb = app.slice(app.indexOf('function UsbDisplayOutput('), app.indexOf('\nexport default function App'));
  assert.match(usb, /mode!=='video'&&<div className="usb-output-music">/);
});

test('music import recognises common codecs and records parsed tags and cover paths', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /new Set\(\['\.mp3', '\.wav', '\.flac', '\.ogg', '\.oga', '\.opus', '\.m4a', '\.m4b', '\.aac'\]\)/);
  assert.match(main, /filters: \[\{ name: '常见音频文件', extensions: MUSIC_AUDIO_FILTER_EXTENSIONS \}\]/);
  assert.match(main, /const metadata = readMusicMetadata\(target\)/);
  assert.match(main, /artworkPath = join\(directory/);
  assert.match(main, /'music:artwork-url'/);
  const player = read('src/renderer/music-player.tsx');
  assert.match(player, /track\.format \?\? 'AUDIO'/);
  assert.match(main, /未知艺术家/);
  assert.doesNotMatch(player, /添加 MP3|本地 MP3|首 MP3/);
});

test('the six USB modes separate hidden desktop playback from visible output', () => {
  const types = read('src/shared/types.ts');
  assert.match(types, /'video' \| 'music-only'/);
  const main = read('src/main/index.ts');
  assert.match(main, /currentSettings\.usbDisplayMode === 'music-only'/);
  assert.match(main, /previous\.usbDisplayMode !== currentSettings\.usbDisplayMode/);
});

test('music output device routing is independent and reports unsupported or unavailable endpoints honestly', () => {
  const player = read('src/renderer/music-player.tsx');
  const types = read('src/shared/types.ts');
  const app = read('src/renderer/App.tsx');
  assert.match(types, /musicOutputDeviceId\?: string/);
  assert.match(types, /musicOutputDeviceLabel\?: string/);
  assert.match(player, /audio\.setSinkId\(requestedDeviceId\)/);
  assert.match(player, /'unsupported'/);
  assert.match(player, /state: 'unavailable'/);
  assert.match(player, /selectAudioOutput/);
  assert.match(player, /AudioContext\.setSinkId/);
  assert.match(player, /oscillator\.frequency\.value = 440/);
  assert.match(player, /musicOutputDeviceId: device\.deviceId/);
  assert.match(app, /outputDeviceId=\{settings\.musicOutputDeviceId \?\? 'default'\}/);
  assert.doesNotMatch(player, /catch\(error\).*setSinkId[\s\S]{0,180}setSinkId\('default'\)/);
});

test('music library exposes separate album artist genre and folder group views', () => {
  const player = read('src/renderer/music-player.tsx');
  for (const view of ['albums', 'artists', 'genres', 'folders']) {
    assert.match(player, new RegExp(`view === '${view}'`));
  }
  assert.match(player, /function getMusicLibraryGroup/);
  assert.match(player, /TrackArtwork trackId=\{group\.firstTrackId\}/);
  assert.match(player, /nm-library-groups/);
  assert.match(player, /getMusicLibraryGroup\(track, view\)\.id !== selectedGroupId/);
});

test('codec and playback failures reach the shared MusicState and remain visible in controls', () => {
  const types = read('src/shared/types.ts');
  const main = read('src/main/index.ts');
  const preload = read('src/preload/index.ts');
  const player = read('src/renderer/music-player.tsx');
  assert.match(types, /errorMessage\?: string \| null/);
  assert.match(main, /errorMessage: payload\.errorMessage\?\.trim\(\)/);
  assert.match(main, /errorMessage: null/);
  assert.match(preload, /errorMessage\?: string/);
  assert.match(player, /音频解码失败/);
  assert.match(player, /当前 Electron Chromium 不支持此音频编码/);
  assert.match(player, /nm-player-error/);
  assert.match(player, /nm-playback-error/);
});

test('ten-band EQ persists ten clamped bands and wires one Web Audio filter chain into the main player', () => {
  const types = read('src/shared/types.ts');
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  assert.match(types, /musicEqBands\?: number\[\]/);
  assert.match(app, /musicEqBands: \[0,0,0,0,0,0,0,0,0,0\]/);
  assert.match(app, /eqBands=\{settings\.musicEqBands/);
  assert.match(player, /MUSIC_EQ_FREQUENCIES = \[31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000\]/);
  assert.match(player, /createMediaElementSource\(audio\)/);
  assert.match(player, /createBiquadFilter\(\)/);
  assert.match(player, /filter\.type = 'peaking'/);
  assert.match(player, /filter\.gain\.setTargetAtTime/);
  assert.match(player, /context\.setSinkId\(requestedDeviceId\)/);
  assert.match(player, /function MusicEqualizer/);
  assert.match(player, /min="-12" max="12"/);
  assert.match(player, /重置为平直/);
  assert.match(player, /不是 WASAPI 独占或 bit-perfect 输出/);
});

test('EQ stays flat by default, clamps persisted bands, and initializes processing lazily on playback', () => {
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  assert.match(app, /musicEqBands: \[0,0,0,0,0,0,0,0,0,0\]/);
  assert.ok(app.includes('const rawMusicEqBands: unknown[] = Array.isArray(raw.musicEqBands) ? raw.musicEqBands : []'));
  assert.ok(app.includes('musicEqBands: Array.from({ length: 10 }'));
  assert.match(app, /Math\.max\(-12, Math\.min\(12, value\)\)/);
  assert.match(player, /const hasBoostOrCut = bands\.some\(value => value !== 0\)/);
  assert.match(player, /if \(!audioContextRef\.current && !\(state\?\.isPlaying && needsProcessing\) && !\(exclusiveEnabled && state\?\.currentTrackId\)\) return/);
  assert.match(player, /const needsProcessing = hasBoostOrCut \|\| hasReplayGain \|\| exclusiveEnabled/);
  assert.match(player, /exclusiveEnabled && state\?\.currentTrackId/);
  assert.match(player, /if \(\(bands\.some\(value => value !== 0\) \|\| hasReplayGain \|\| exclusiveEnabled\) && !audioContextRef\.current\) await ensureAudioGraph\(\)/);
  assert.match(player, /filter\.Q\.value = 1\.4/);
  assert.match(player, /gain\.setTargetAtTime/);
});

test('ReplayGain is opt-in, selects track or album tags, and applies peak-safe gain in the shared graph', () => {
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  const main = read('src/main/index.ts');
  const types = read('src/shared/types.ts');
  assert.match(types, /replayGainTrackDb\?: number \| null/);
  assert.match(types, /replayGainAlbumDb\?: number \| null/);
  assert.match(types, /replayGainTrackPeak\?: number \| null/);
  assert.match(types, /musicReplayGainEnabled\?: boolean/);
  assert.match(app, /musicReplayGainEnabled: false/);
  assert.match(app, /musicReplayGainMode: 'track'/);
  assert.match(app, /currentMusicTrack\?\.replayGainAlbumDb/);
  assert.match(app, /replayGainDb=\{replayGainDb\}/);
  assert.match(main, /replayGainTrackDb: metadata\.replayGainTrackDb/);
  assert.match(player, /function MusicReplayGainControls/);
  assert.match(player, /读取文件内的 Track \/ Album Gain 与 Peak 标签/);
  assert.match(player, /createGain\(\)/);
  assert.match(player, /replayGainNodeRef\.current\?\.gain\.setTargetAtTime/);
  assert.match(player, /const safeDb = Number\.isFinite\(peak\) && peak > 0/);
  assert.match(player, /: 0;/);
  assert.match(player, /replayGainAppliedDb = useMemo/);
});

test('local LRC lyrics are loaded only from a same-name sidecar and rendered against shared playback time', () => {
  const main = read('src/main/index.ts');
  const preload = read('src/preload/index.ts');
  const types = read('src/renderer/vite-env.d.ts');
  const player = read('src/renderer/music-player.tsx');
  const lyrics = read('src/main/music-lyrics.ts');
  assert.match(main, /function readMusicLyrics/);
  assert.match(main, /basename\(track\.path, extname\(track\.path\)\)\}\.lrc/);
  assert.match(main, /info\.size <= 1024 \* 1024/);
  assert.match(main, /parseLrc\(readFileSync\(sidecar, 'utf8'\)\)/);
  assert.match(preload, /getMusicLyrics:.*music:get-lyrics/);
  assert.match(types, /getMusicLyrics\(trackId:string\)/);
  assert.match(lyrics, /export function parseLrc/);
  assert.match(player, /export function MusicMiniPlayer/);
  assert.match(player, /function MusicLyricsPanel/);
  assert.match(player, /window\.nexus\.getMusicLyrics\(track\.id\)/);
  assert.match(player, /lines\[middle\]\.timeSeconds <= time \+ 0\.04/);
  assert.match(player, /本地 LRC/);
  assert.match(player, /在线同步歌词/);
  assert.match(player, /已尝试在线搜索/);
  assert.match(player, /不会上传音频文件/);
  assert.match(main, /fetchOnlineLyrics/);
  assert.match(lyrics, /lrclib.net/);
});

test('sleep timer is app-wide, keeps a stable callback, and pauses the single audio host at expiry', () => {
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  assert.match(app, /const \[musicSleepTimerEndsAt, setMusicSleepTimerEndsAt\]/);
  assert.match(app, /const clearMusicSleepTimer = useCallback\(\(\) => setMusicSleepTimerEndsAt\(null\), \[\]\)/);
  assert.match(app, /sleepTimerEndsAt=\{musicSleepTimerEndsAt\}/);
  assert.match(app, /onSleepTimerComplete=\{clearMusicSleepTimer\}/);
  assert.match(player, /function MusicSleepTimer/);
  assert.match(player, /\[15, 30, 45, 60, 90\]/);
  assert.match(player, /sleepTimerEndsAt - Date\.now\(\)/);
  assert.match(player, /audio\.pause\(\)/);
  assert.match(player, /playing: false/);
  assert.match(player, /取消/);
});

test('M3U playlists import local paths into a new ordered playlist and export standard M3U8', () => {
  const main = read('src/main/index.ts');
  const preload = read('src/preload/index.ts');
  const types = read('src/renderer/vite-env.d.ts');
  const player = read('src/renderer/music-player.tsx');
  const playlist = read('src/main/music-playlist.ts');
  assert.match(main, /function importMusicPlaylist/);
  assert.match(main, /importMusicPaths\(candidatePaths, false\)/);
  assert.match(main, /parseM3u\(readFileSync\(filePath, 'utf8'\)\)/);
  assert.match(main, /serializeM3u\(tracks\)/);
  assert.match(main, /music:import-playlist/);
  assert.match(main, /music:export-playlist/);
  assert.match(preload, /importMusicPlaylist/);
  assert.match(preload, /exportMusicPlaylist/);
  assert.match(types, /importMusicPlaylist\(\)/);
  assert.match(types, /exportMusicPlaylist\(playlistId:string\)/);
  assert.match(player, /导入 M3U/);
  assert.match(player, /导出 M3U8/);
  assert.match(playlist, /Playlists are intentionally local-only/);
});

test('ten-band EQ exposes named presets without changing the flat default', () => {
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  assert.match(app, /musicEqBands: \[0,0,0,0,0,0,0,0,0,0\]/);
  for (const preset of ['rock', 'pop', 'vocal', 'classical', 'jazz', 'electronic', 'bass', 'treble']) {
    assert.match(player, new RegExp(`^  ${preset}: \\{ label:`, 'm'));
  }
  assert.match(player, /selectedPreset = Object\.entries\(MUSIC_EQ_PRESETS\)/);
  assert.match(player, /Object\.entries\(MUSIC_EQ_PRESETS\)\.map/);
  assert.match(player, /自定义曲线/);
  assert.match(player, /低音增强/);
  assert.match(player, /高音增强/);
});

test('WASAPI negotiation accepts only probed device formats and strictly reports bit-perfect eligibility', () => {
  const module = read('src/main/music-exclusive-format.ts');
  const types = read('src/shared/types.ts');
  const main = read('src/main/music-metadata.ts');
  assert.match(module, /export function chooseExclusiveFormat/);
  assert.match(module, /LOSSLESS_EXTENSIONS = new Set\(\['\.flac', '\.wav'\]\)/);
  assert.match(module, /source\.channels === 2/);
  assert.match(module, /sourceDepth != null/);
  assert.match(main, /target\.channels \|\|= channels/);
  assert.match(types, /channels\?: number \| null/);
});

test('native WASAPI backend is built on Windows, packaged outside ASAR, and only opens probed exclusive formats', () => {
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/windows-ci.yml');
  const gyp = read('native/wasapi-output/binding.gyp');
  const cpp = read('native/wasapi-output/binding.cpp');
  const buildScript = read('scripts/build-wasapi-addon.cjs');
  assert.match(pkg.scripts['build:wasapi'], /build-wasapi-addon\.cjs/);
  assert.match(pkg.scripts['package:win'], /build:wasapi/);
  assert.ok(pkg.build.extraResources.some(item => item.from.endsWith('nexus_wasapi.node')));
  assert.match(workflow, /Build native WASAPI output module[\s\S]{0,180}npm\.cmd run build:wasapi/);
  assert.match(gyp, /NAPI_VERSION=8/);
  assert.match(gyp, /win_delay_load_hook/);
  assert.match(cpp, /AUDCLNT_SHAREMODE_EXCLUSIVE/);
  assert.match(cpp, /AUDCLNT_STREAMFLAGS_EVENTCALLBACK/);
  assert.match(cpp, /IsFormatSupported\(AUDCLNT_SHAREMODE_EXCLUSIVE/);
  assert.match(cpp, /IAudioRenderClient/);
  assert.match(cpp, /class ByteRing/);
  assert.match(cpp, /std::atomic<uint64_t> readPosition_/);
  assert.match(cpp, /GetCurrentPadding/);
  assert.match(cpp, /napi_get_buffer_info/);
  assert.match(buildScript, /node-gyp@13\.1\.0/);
});

test('native WASAPI exclusive output is wired from trusted IPC through AudioWorklet PCM to one shared audio host', () => {
  const main = read('src/main/index.ts');
  const preload = read('src/preload/index.ts');
  const types = read('src/renderer/vite-env.d.ts');
  const app = read('src/renderer/App.tsx');
  const player = read('src/renderer/music-player.tsx');
  const worklet = read('src/renderer/music-pcm-tap.worklet.js');
  const service = read('src/main/music-exclusive-output.ts');
  assert.match(main, /new MusicExclusiveOutput\(\)/);
  assert.match(main, /event\.sender !== mainWindow\.webContents/);
  assert.match(main, /music:wasapi-open/);
  assert.match(main, /music:wasapi-pcm/);
  assert.match(main, /writeFloat32Pcm\(data\)/);
  assert.match(preload, /openMusicWasapi/);
  assert.match(preload, /writeMusicWasapiPcm/);
  assert.match(types, /getMusicWasapiDevices\(\)/);
  assert.match(app, /exclusiveEnabled=\{settings\.musicWasapiEnabled === true\}/);
  assert.match(app, /onWasapiStatus=\{setMusicWasapiStatus\}/);
  assert.match(player, /new AudioWorkletNode\(context, 'nexus-music-pcm-tap'/);
  assert.match(player, /writeMusicWasapiPcm\(pcm\)/);
  assert.match(player, /openMusicWasapi\(exclusiveDeviceId, trackId, context\.sampleRate\)/);
  assert.match(player, /bitPerfect: false/);
  assert.match(player, /WASAPI 独占输出/);
  assert.match(worklet, /registerProcessor\('nexus-music-pcm-tap'/);
  assert.match(worklet, /this\.port\.postMessage\(\{ type: 'pcm'/);
  assert.match(service, /transport: 'renderer-float32-pcm'/);
  assert.match(service, /bitPerfect: false/);
});

test('exclusive mode cleanup restores the ordinary output path and serializes audio graph initialization', () => {
  const player = read('src/renderer/music-player.tsx');
  assert.match(player, /audioGraphPromiseRef = useRef<Promise<AudioContext> \| null>/);
  assert.match(player, /if \(audioGraphPromiseRef\.current\) return audioGraphPromiseRef\.current/);
  assert.match(player, /port\.postMessage\(\{ type: 'exclusive', enabled: false \}\)/);
  assert.match(player, /await window\.nexus\.closeMusicWasapi\(\)/);
  assert.match(player, /if \(exclusiveActiveRef\.current\)/);
  assert.match(player, /await applyOutputSink\(\)/);
});

test('native WASAPI pause stops the audio client before a later Start call', () => {
  const cpp = read('native/wasapi-output/binding.cpp');
  assert.match(cpp, /if \(!engine->startRequested\.load\(std::memory_order_acquire\)\) \{[\s\S]{0,300}if \(engine->running\.load\(std::memory_order_acquire\)\) \{[\s\S]{0,160}audioClient->Stop\(\)/);
  assert.match(cpp, /if \(!engine->running\.load\(std::memory_order_acquire\)\) \{[\s\S]{0,120}audioClient->Start\(\)/);
  assert.match(cpp, /runtimeError = HresultMessage\("IAudioClient::Stop", hr\)/);
  assert.match(cpp, /engine->ring\.Clear\(\);[\s\S]{0,100}WaitForSingleObject\(engine->controlEvent, 100\)/);
  const player = read('src/renderer/music-player.tsx');
  assert.match(player, /window\.nexus\.getMusicWasapiStatus\(\)/);
  assert.match(player, /WASAPI 输出中断/);
  assert.match(player, /已恢复普通音频输出/);
  assert.match(player, /bufferedBytes: native\.bufferedBytes/);
  assert.match(player, /underruns: native\.underruns/);
  assert.match(player, /droppedFrames: native\.droppedFrames/);
  assert.match(player, /丢弃 \$\{status\.droppedFrames\} 帧/);
  const native = read('native/wasapi-output/binding.cpp');
  assert.match(native, /droppedFrames\.fetch_add\(dropped \/ g_engine\.bytesPerFrame/);
  assert.match(native, /"droppedFrames"/);
});

test('2.2.0 music library records are enriched once and persisted without resetting playlist state', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /const needsMetadataRefresh =/);
  assert.match(main, /!Object\.prototype\.hasOwnProperty\.call\(item, 'channels'\)/);
  assert.match(main, /!Object\.prototype\.hasOwnProperty\.call\(item, 'replayGainTrackDb'\)/);
  assert.match(main, /const metadata = needsMetadataRefresh \? readMusicMetadata\(target\) : null/);
  assert.match(main, /const title = metadata\?\.title && \(!savedTitle \|\| savedTitle === fileTitle\)/);
  assert.match(main, /savedArtist === '本地音乐' \|\| savedArtist === '未知艺术家'/);
  assert.match(main, /metadata\?\.artwork/);
  assert.match(main, /persistMusicState\(\)/);
  assert.match(main, /Enriched \$\{upgradedLegacyTracks\} legacy music track\(s\)/);
  assert.match(main, /activePlaylistId: playlistId, currentTrackId/);
  assert.match(main, /currentTime: Number\.isFinite\(Number\(raw\.currentTime\)\)/);
});
