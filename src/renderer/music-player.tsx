import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  Music2, Play, Pause, SkipBack, SkipForward, ListMusic, Folder, FolderOpen, Plus,
  Trash2, Shuffle, Repeat, Volume2, Search, X, ListPlus, Disc3, ArrowUp, ArrowDown,
} from 'lucide-react';
import type { AppSettings, MusicCommand, MusicLyricLine, MusicState, MusicTrack } from '../shared/types';

export type MusicOutputStatus = {
  state: 'default' | 'active' | 'unsupported' | 'unavailable';
  requestedDeviceId: string;
  actualDeviceId: string;
  message: string;
};
export type MusicWasapiStatus = {
  state: 'off' | 'opening' | 'active' | 'error';
  message: string;
  deviceName?: string;
  format?: string;
  sampleRate?: number;
  bitPerfect: false;
  bitPerfectCandidate?: boolean;
};
type MusicHook = { state: MusicState | null; command: (command: MusicCommand) => void };

export function useMusicState(): MusicHook {
  const [state, setState] = useState<MusicState | null>(null);
  useEffect(() => {
    let alive = true;
    const unsubscribe = window.nexus.onMusicState(next => { if (alive) setState(next); });
    void window.nexus.getMusicState().then(next => { if (alive) setState(next); }).catch(error => {
      console.warn('Music library could not be loaded', error);
    });
    return () => { alive = false; unsubscribe(); };
  }, []);
  const command = useCallback((next: MusicCommand) => {
    void window.nexus.musicCommand(next).catch(error => console.warn('Music command failed', error));
  }, []);
  return { state, command };
}

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const activeTrack = (state: MusicState | null) => state?.tracks.find(track => track.id === state.currentTrackId) ?? null;
function TrackArtwork({ trackId, className, fallback }: { trackId: string | null; className: string; fallback: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (trackId) void window.nexus.getMusicArtworkUrl(trackId).then(value => { if (alive) setUrl(value); }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [trackId]);
  return url ? <img className={`${className} has-image`} src={url} alt="" draggable={false}/> : <span className={className}>{fallback}</span>;
}
const repeatLabel = (repeat: MusicState['repeat']) => repeat === 'one' ? '单曲循环' : repeat === 'all' ? '列表循环' : '不循环';
const MUSIC_EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
const FLAT_MUSIC_EQ = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const MUSIC_EQ_PRESETS: Record<string, { label: string; bands: number[] }> = {
  flat: { label: '平直', bands: FLAT_MUSIC_EQ },
  rock: { label: '摇滚', bands: [5, 3, 1, -2, -1, 2, 4, 5, 5, 5] },
  pop: { label: '流行', bands: [-1, 1, 3, 4, 2, -1, -1, 0, 2, 3] },
  vocal: { label: '人声', bands: [-2, -1, -1, 2, 4, 4, 2, 0, -1, -2] },
  classical: { label: '古典', bands: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  jazz: { label: '爵士', bands: [3, 2, 0, 1, -1, -1, 0, 1, 2, 3] },
  electronic: { label: '电子', bands: [5, 3, 1, 0, -1, 1, 0, 2, 4, 5] },
  bass: { label: '低音增强', bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  treble: { label: '高音增强', bands: [0, 0, 0, 0, 0, 2, 3, 4, 5, 4] },
};
const stopWidgetDrag = (event: ReactPointerEvent) => event.stopPropagation();

export function MusicPlaybackRuntime({ state, outputDeviceId = 'default', eqBands = FLAT_MUSIC_EQ, replayGainDb = null, replayGainPeak = null, sleepTimerEndsAt = null, exclusiveEnabled = false, exclusiveDeviceId = '', onSleepTimerComplete, onOutputStatus, onWasapiStatus }: {
  state: MusicState | null;
  outputDeviceId?: string;
  eqBands?: number[];
  replayGainDb?: number | null;
  replayGainPeak?: number | null;
  sleepTimerEndsAt?: number | null;
  exclusiveEnabled?: boolean;
  exclusiveDeviceId?: string;
  onSleepTimerComplete?: () => void;
  onOutputStatus?: (status: MusicOutputStatus) => void;
  onWasapiStatus?: (status: MusicWasapiStatus) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const replayGainNodeRef = useRef<GainNode | null>(null);
  const pcmTapRef = useRef<AudioWorkletNode | null>(null);
  const exclusiveActiveRef = useRef(false);
  const lastReportAt = useRef(0);
  const bands = useMemo(
    () => MUSIC_EQ_FREQUENCIES.map((_, index) => {
      const value = Number(eqBands[index] ?? 0);
      return Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0;
    }),
    [eqBands],
  );
  const bandKey = bands.join(',');
  const replayGainAppliedDb = useMemo(() => {
    if (replayGainDb == null || !Number.isFinite(replayGainDb)) return 0;
    const requestedDb = Math.max(-60, Math.min(18, replayGainDb));
    const peak = Number(replayGainPeak);
    // Without a valid peak tag, ReplayGain may attenuate but will not boost.
    const safeDb = Number.isFinite(peak) && peak > 0
      ? 20 * Math.log10(0.999 / peak)
      : 0;
    return Math.min(requestedDb, safeDb);
  }, [replayGainDb, replayGainPeak]);
  const hasReplayGain = replayGainDb != null && Number.isFinite(replayGainDb);
  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) throw new Error('播放宿主尚未就绪');
    let context = audioContextRef.current;
    if (!context) {
      context = new AudioContext({ latencyHint: 'playback' });
      try {
        const workletUrl = new URL('./music-pcm-tap.worklet.js', import.meta.url);
        await context.audioWorklet.addModule(workletUrl);
        const pcmTap = new AudioWorkletNode(context, 'nexus-music-pcm-tap', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 2,
          channelCountMode: 'explicit',
          outputChannelCount: [2],
        });
        pcmTap.port.onmessage = event => {
          const pcm = event.data?.type === 'pcm' ? event.data.pcm : null;
          if (exclusiveActiveRef.current && pcm instanceof ArrayBuffer) {
            window.nexus.writeMusicWasapiPcm(pcm);
          }
        };
        const source = context.createMediaElementSource(audio);
        const filters = MUSIC_EQ_FREQUENCIES.map(frequency => {
          const filter = context!.createBiquadFilter();
          filter.type = 'peaking';
          filter.frequency.value = Math.min(frequency, context!.sampleRate / 2);
          filter.Q.value = 1.4;
          filter.gain.value = 0;
          return filter;
        });
        const replayGain = context.createGain();
        replayGain.gain.value = 1;
        source.connect(filters[0]);
        for (let index = 0; index < filters.length - 1; index++) filters[index].connect(filters[index + 1]);
        filters[filters.length - 1].connect(replayGain);
        replayGain.connect(pcmTap);
        pcmTap.connect(context.destination);
        audioContextRef.current = context;
        mediaSourceRef.current = source;
        eqFiltersRef.current = filters;
        replayGainNodeRef.current = replayGain;
        pcmTapRef.current = pcmTap;
      } catch (error) {
        await context.close().catch(() => undefined);
        throw error;
      }
    }
    if (context.state === 'suspended') await context.resume();
    return context;
  }, []);

  const applyOutputSink = useCallback(async () => {
    const audio = audioRef.current as (HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void>; sinkId?: string }) | null;
    if (!audio) return;
    const requestedDeviceId = outputDeviceId || 'default';
    if (exclusiveActiveRef.current) {
      onOutputStatus?.({
        state: 'active', requestedDeviceId, actualDeviceId: 'WASAPI exclusive',
        message: 'WASAPI 独占输出正在接管所选音频端点',
      });
      return;
    }
    const context = audioContextRef.current as (AudioContext & { setSinkId?: (deviceId: string) => Promise<void>; sinkId?: string }) | null;
    try {
      if (context) {
        if (typeof context.setSinkId !== 'function') {
          onOutputStatus?.({
            state: requestedDeviceId === 'default' ? 'default' : 'unsupported',
            requestedDeviceId, actualDeviceId: context.sinkId || 'default',
            message: requestedDeviceId === 'default'
              ? '均衡器使用 Web Audio 默认输出设备'
              : '均衡器已启用，但当前 Electron Chromium 不支持 AudioContext.setSinkId；此时无法将处理后的音频单独路由到指定设备',
          });
          return;
        }
        await context.setSinkId(requestedDeviceId);
        onOutputStatus?.({
          state: requestedDeviceId === 'default' ? 'default' : 'active',
          requestedDeviceId, actualDeviceId: context.sinkId || requestedDeviceId,
          message: requestedDeviceId === 'default' ? '均衡器使用系统默认输出设备' : '已将均衡后的音频路由到所选 Windows 输出设备',
        });
        return;
      }
      if (typeof audio.setSinkId !== 'function') {
        onOutputStatus?.({
          state: requestedDeviceId === 'default' ? 'default' : 'unsupported',
          requestedDeviceId, actualDeviceId: audio.sinkId || 'default',
          message: '当前 Electron 音频元素不支持 setSinkId，暂时只能使用系统默认输出设备',
        });
        return;
      }
      await audio.setSinkId(requestedDeviceId);
      onOutputStatus?.({
        state: requestedDeviceId === 'default' ? 'default' : 'active',
        requestedDeviceId, actualDeviceId: audio.sinkId || requestedDeviceId,
        message: requestedDeviceId === 'default' ? '正在使用系统默认输出设备' : '已切换到所选 Windows 音频输出设备',
      });
    } catch (error) {
      onOutputStatus?.({
        state: 'unavailable', requestedDeviceId,
        actualDeviceId: context?.sinkId || audio.sinkId || 'default',
        message: `输出设备切换失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [outputDeviceId, onOutputStatus]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const report = () => {
      const now = Date.now();
      if (now - lastReportAt.current < 850) return;
      lastReportAt.current = now;
      window.nexus.reportMusicRuntime({
        currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        playing: !audio.paused,
      });
    };
    const onEnded = () => { void window.nexus.musicCommand({ type: 'ended' }); };
    const onError = () => {
      const code = audio.error?.code;
      const errorMessage = code === 3
        ? '音频解码失败：文件可能损坏，或该编码不受当前播放器支持'
        : code === 4
          ? '当前 Electron Chromium 不支持此音频编码，或文件格式无法识别'
          : code === 2
            ? '读取音频文件失败，请检查文件是否可访问'
            : '音频播放中断，请重试或检查文件';
      window.nexus.reportMusicRuntime({ error: true, playing: false, errorMessage });
    };
    const offEngine = window.nexus.onMusicEngineCommand(command => {
      if (command.type === 'seek' && Number.isFinite(command.seconds) && audio.duration > 0) {
        audio.currentTime = Math.max(0, Math.min(audio.duration, command.seconds));
        if (command.resume) {
          const startPlayback = async () => {
            try {
              if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
              await audio.play();
            } catch (error) {
              window.nexus.reportMusicRuntime({ error: true, playing: false, errorMessage: error instanceof Error ? `播放启动失败：${error.message}` : '播放启动失败' });
            }
          };
          void startPlayback();
        }
        report();
      }
    });
    audio.addEventListener('timeupdate', report);
    audio.addEventListener('play', report);
    audio.addEventListener('pause', report);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      offEngine();
      audio.removeEventListener('timeupdate', report);
      audio.removeEventListener('play', report);
      audio.removeEventListener('pause', report);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state) return;
    audio.volume = Math.max(0, Math.min(1, state.volume));
  }, [state?.volume]);

  useEffect(() => {
    void applyOutputSink();
  }, [applyOutputSink]);

  useEffect(() => {
    const hasBoostOrCut = bands.some(value => value !== 0);
    const needsProcessing = hasBoostOrCut || hasReplayGain || exclusiveEnabled;
    // Do not create/resume an AudioContext merely because EQ / ReplayGain was saved.
    // Exclusive mode needs the PCM tap even when all effect gains are flat.
    if (!audioContextRef.current && !(state?.isPlaying && needsProcessing) && !(exclusiveEnabled && state?.currentTrackId)) return;
    let alive = true;
    const applyProcessing = async () => {
      try {
        if (!audioContextRef.current && ((state?.isPlaying && needsProcessing) || (exclusiveEnabled && state?.currentTrackId))) await ensureAudioGraph();
        if (!alive) return;
        const context = audioContextRef.current;
        if (!context) return;
        eqFiltersRef.current.forEach((filter, index) => {
          filter.gain.setTargetAtTime(bands[index] ?? 0, context.currentTime, 0.025);
        });
        const gain = Math.pow(10, replayGainAppliedDb / 20);
        replayGainNodeRef.current?.gain.setTargetAtTime(gain, context.currentTime, 0.05);
        await applyOutputSink();
      } catch (error) {
        if (alive) window.nexus.reportMusicRuntime({
          error: true, playing: false,
          errorMessage: `音频处理初始化失败：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    };
    void applyProcessing();
    return () => { alive = false; };
  }, [bandKey, bands, ensureAudioGraph, applyOutputSink, state?.isPlaying, state?.currentTrackId, hasReplayGain, replayGainAppliedDb, exclusiveEnabled]);

  useEffect(() => {
    let cancelled = false;
    const trackId = state?.currentTrackId;
    const tap = pcmTapRef.current;
    const disable = async () => {
      exclusiveActiveRef.current = false;
      tap?.port.postMessage({ type: 'exclusive', enabled: false });
      await window.nexus.closeMusicWasapi().catch(() => undefined);
      if (!cancelled) {
        onWasapiStatus?.({ state: 'off', message: 'WASAPI 独占输出已关闭', bitPerfect: false });
        await applyOutputSink();
      }
    };
    if (!exclusiveEnabled) {
      void disable();
      return () => { cancelled = true; };
    }
    if (!exclusiveDeviceId || !trackId) {
      void disable();
      onWasapiStatus?.({
        state: 'error',
        message: !exclusiveDeviceId ? '请先选择 WASAPI 输出设备' : '请先选择一首曲目',
        bitPerfect: false,
      });
      return () => { cancelled = true; };
    }
    onWasapiStatus?.({ state: 'opening', message: '正在协商 WASAPI 独占 PCM 格式…', bitPerfect: false });
    const open = async () => {
      const context = await ensureAudioGraph();
      const result = await window.nexus.openMusicWasapi(exclusiveDeviceId, trackId, context.sampleRate);
      if (cancelled) {
        await window.nexus.closeMusicWasapi().catch(() => undefined);
        return;
      }
      exclusiveActiveRef.current = true;
      pcmTapRef.current?.port.postMessage({ type: 'exclusive', enabled: true });
      if (state?.isPlaying) await window.nexus.startMusicWasapi();
      onWasapiStatus?.({
        state: 'active',
        deviceName: result.deviceName,
        format: result.format,
        sampleRate: result.sampleRate,
        bitPerfect: false,
        bitPerfectCandidate: result.bitPerfectCandidate,
        message: `已打开 WASAPI 独占输出：${result.deviceName} · ${result.format.toUpperCase()} · ${result.sampleRate} Hz。当前 Renderer PCM 传输路径不具备 bit-perfect 条件。`,
      });
      await applyOutputSink();
    };
    void open().catch(async error => {
      if (cancelled) return;
      exclusiveActiveRef.current = false;
      pcmTapRef.current?.port.postMessage({ type: 'exclusive', enabled: false });
      await window.nexus.closeMusicWasapi().catch(() => undefined);
      onWasapiStatus?.({
        state: 'error',
        message: `WASAPI 独占输出失败：${error instanceof Error ? error.message : String(error)}`,
        bitPerfect: false,
      });
      await applyOutputSink();
    });
    return () => {
      cancelled = true;
      exclusiveActiveRef.current = false;
      pcmTapRef.current?.port.postMessage({ type: 'exclusive', enabled: false });
      void window.nexus.closeMusicWasapi().catch(() => undefined);
    };
  }, [exclusiveEnabled, exclusiveDeviceId, state?.currentTrackId, ensureAudioGraph, applyOutputSink]);

  useEffect(() => {
    if (!exclusiveEnabled || !exclusiveActiveRef.current) return;
    const action = state?.isPlaying ? window.nexus.startMusicWasapi() : window.nexus.pauseMusicWasapi();
    void action.catch(error => onWasapiStatus?.({
      state: 'error', message: `WASAPI 播放状态切换失败：${error instanceof Error ? error.message : String(error)}`, bitPerfect: false,
    }));
  }, [exclusiveEnabled, state?.isPlaying, onWasapiStatus]);

  useEffect(() => {
    if (!sleepTimerEndsAt) return;
    let completed = false;
    const timer = window.setTimeout(() => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        window.nexus.reportMusicRuntime({
          currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
          duration: Number.isFinite(audio.duration) ? audio.duration : 0,
          playing: false,
        });
      }
      completed = true;
      onSleepTimerComplete?.();
    }, Math.max(0, sleepTimerEndsAt - Date.now()));
    return () => {
      if (!completed) window.clearTimeout(timer);
    };
  }, [sleepTimerEndsAt, onSleepTimerComplete]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state) return;
    const trackId = state.currentTrackId;
    if (!trackId) {
      audio.pause();
      audio.removeAttribute('src');
      delete audio.dataset.trackId;
      audio.load();
      return;
    }
    const restoreTime = state.currentTime;
    const shouldPlay = state.isPlaying;
    let cancelled = false;
    audio.pause();
    delete audio.dataset.trackId;
    void window.nexus.getMusicTrackUrl(trackId).then(url => {
      if (cancelled) return;
      if (!url) {
        window.nexus.reportMusicRuntime({ error: true, playing: false, errorMessage: '音乐文件不存在或已无法访问' });
        return;
      }
      audio.src = url;
      audio.dataset.trackId = trackId;
      audio.load();
      const restorePosition = () => {
        if (cancelled || audio.dataset.trackId !== trackId) return;
        if (Number.isFinite(restoreTime) && restoreTime > 0 && audio.duration > 0) {
          audio.currentTime = Math.min(restoreTime, Math.max(0, audio.duration - 0.1));
        }
        if (shouldPlay) {
          const startPlayback = async () => {
            try {
              if ((bands.some(value => value !== 0) || hasReplayGain || exclusiveEnabled) && !audioContextRef.current) await ensureAudioGraph();
              if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
              await audio.play();
            } catch (error) {
              window.nexus.reportMusicRuntime({ error: true, playing: false, errorMessage: error instanceof Error ? `播放启动失败：${error.message}` : '播放启动失败' });
            }
          };
          void startPlayback();
        }
      };
      audio.addEventListener('loadedmetadata', restorePosition, { once: true });
      if (audio.readyState >= 1) restorePosition();
    }).catch(() => {
      if (!cancelled) window.nexus.reportMusicRuntime({ error: true, playing: false, errorMessage: '读取音频资源失败' });
    });
    return () => { cancelled = true; };
  }, [state?.currentTrackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state?.currentTrackId || audio.dataset.trackId !== state.currentTrackId) return;
    if (state.isPlaying) {
      const startPlayback = async () => {
        try {
          if ((bands.some(value => value !== 0) || hasReplayGain || exclusiveEnabled) && !audioContextRef.current) await ensureAudioGraph();
          if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
          await audio.play();
        } catch (error) {
          window.nexus.reportMusicRuntime({ error: true, playing: false, errorMessage: error instanceof Error ? `播放启动失败：${error.message}` : '播放启动失败' });
        }
      };
      void startPlayback();
    } else {
      audio.pause();
    }
  }, [state?.isPlaying, state?.currentTrackId, bandKey, ensureAudioGraph, hasReplayGain, replayGainAppliedDb, exclusiveEnabled]);

  useEffect(() => () => {
    const context = audioContextRef.current;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }, []);

  return <audio ref={audioRef} preload="metadata" className="nm-audio-engine" aria-hidden="true"/>;
}

type MediaDevicesWithOutputPicker = MediaDevices & {
  selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
};
type SinkableAudioContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };

function MusicOutputDevicePicker({ settings, updateSettings, status }: {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  status: MusicOutputStatus | null;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedId = settings.musicOutputDeviceId || 'default';
  const selectedLabel = selectedId === 'default' ? '系统默认输出设备' : settings.musicOutputDeviceLabel || '已保存的输出设备';

  const refresh = useCallback(async () => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) {
      setMessage('当前环境无法枚举音频输出设备');
      return;
    }
    try {
      const found = await media.enumerateDevices();
      setDevices(found.filter(device => device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default'));
    } catch (error) {
      setMessage(`读取音频设备失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const media = navigator.mediaDevices;
    if (!media) return;
    media.addEventListener('devicechange', refresh);
    return () => media.removeEventListener('devicechange', refresh);
  }, [refresh]);

  const chooseFromWindows = async () => {
    const media = navigator.mediaDevices as MediaDevicesWithOutputPicker | undefined;
    if (!media?.selectAudioOutput) {
      setMessage('此 Chromium 未提供系统输出设备选择弹窗；可尝试下方已枚举设备列表');
      return;
    }
    setBusy(true);
    try {
      const device = await media.selectAudioOutput(selectedId === 'default' ? undefined : { deviceId: selectedId });
      updateSettings({ musicOutputDeviceId: device.deviceId, musicOutputDeviceLabel: device.label || '所选 Windows 音频设备' });
      setMessage('已保存输出设备，正在应用到音乐播放器');
      await refresh();
    } catch (error) {
      setMessage(`未能选择输出设备：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const playTestTone = async () => {
    setBusy(true);
    let context: SinkableAudioContext | null = null;
    try {
      context = new AudioContext({ latencyHint: 'interactive' }) as SinkableAudioContext;
      if (typeof context.setSinkId !== 'function') {
        setMessage('当前 Chromium 不支持 AudioContext.setSinkId，无法把测试音可靠路由到所选设备');
        await context.close();
        return;
      }
      await context.setSinkId(selectedId);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      await new Promise<void>(resolve => {
        oscillator.onended = () => resolve();
        oscillator.start();
        oscillator.stop(context!.currentTime + 0.35);
      });
      await context.close();
      setMessage('已向所选设备发送 440 Hz 测试音');
    } catch (error) {
      if (context && context.state !== 'closed') await context.close().catch(() => undefined);
      setMessage(`测试音失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return <section className="nm-output-device-panel">
    <div className="nm-output-device-heading">
      <div><b>音频输出设备</b><small>独立于 Windows 系统默认音频；可以把音乐单独送到五寸屏喇叭</small></div>
      <span className={`nm-output-device-state ${status?.state === 'active' || status?.state === 'default' ? 'active' : status?.state === 'unavailable' ? 'error' : ''}`}>
        {status?.state === 'active' ? '已切换' : status?.state === 'default' ? '默认设备' : status?.state === 'unsupported' ? '不支持路由' : status?.state === 'unavailable' ? '设备不可用' : '等待应用'}
      </span>
    </div>
    <div className="nm-output-device-controls">
      <label><span>当前目标</span>
        <select value={selectedId} onChange={event => {
          const deviceId = event.target.value;
          const device = devices.find(item => item.deviceId === deviceId);
          updateSettings({ musicOutputDeviceId: deviceId, musicOutputDeviceLabel: device?.label || (deviceId === 'default' ? '系统默认输出设备' : '已选择音频设备') });
        }}>
          <option value="default">系统默认输出设备</option>
          {selectedId !== 'default' && !devices.some(item => item.deviceId === selectedId) && <option value={selectedId}>{selectedLabel}（当前未枚举）</option>}
          {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `音频输出设备 ${index + 1}`}</option>)}
        </select>
      </label>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => void chooseFromWindows()}>选择 Windows 设备</button>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => void refresh()}>刷新</button>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => void playTestTone()}>测试音</button>
    </div>
    <p>{status?.message || message || `已选择：${selectedLabel}`}</p>
    {status?.state === 'unavailable' && <p className="nm-output-device-warning">当前请求设备未能应用，实际输出仍是：{status.actualDeviceId === 'default' ? '系统默认设备' : status.actualDeviceId}。不会自动更改已保存的目标设备。</p>}
  </section>;
}

function MusicEqualizer({ bands, onChange }: { bands: number[]; onChange: (bands: number[]) => void }) {
  const values = MUSIC_EQ_FREQUENCIES.map((_, index) => {
    const value = Number(bands[index] ?? 0);
    return Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0;
  });
  const active = values.some(value => value !== 0);
  const selectedPreset = Object.entries(MUSIC_EQ_PRESETS).find(([, preset]) =>
    preset.bands.every((value, index) => value === values[index]),
  )?.[0] ?? 'custom';
  const labelForFrequency = (frequency: number) => frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`;
  return <details className="nm-eq-panel">
    <summary>
      <span><b>十段均衡器</b><small>31 Hz – 16 kHz · Web Audio 参数均衡</small></span>
      <em className={active ? 'active' : ''}>{selectedPreset === 'custom' ? '自定义曲线' : MUSIC_EQ_PRESETS[selectedPreset].label}</em>
    </summary>
    <div className="nm-eq-preset-row">
      <label><span>预设曲线</span>
        <select value={selectedPreset} onChange={event => {
          const preset = MUSIC_EQ_PRESETS[event.target.value];
          if (preset) onChange([...preset.bands]);
        }}>
          <option value="custom" disabled>自定义曲线</option>
          {Object.entries(MUSIC_EQ_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}
        </select>
      </label>
    </div>
    <div className="nm-eq-grid">
      {MUSIC_EQ_FREQUENCIES.map((frequency, index) => <label key={frequency} className="nm-eq-band">
        <span>{labelForFrequency(frequency)}</span>
        <input type="range" min="-12" max="12" step="1" value={values[index]}
          aria-label={`${labelForFrequency(frequency)} 均衡`}
          onChange={event => {
            const next = [...values];
            next[index] = Number(event.target.value);
            onChange(next);
          }}/>
        <small>{values[index] > 0 ? '+' : ''}{values[index]} dB</small>
      </label>)}
    </div>
    <footer>
      <button type="button" className="btn-secondary" disabled={!active} onClick={() => onChange([...FLAT_MUSIC_EQ])}>重置为平直</button>
      <small>提升频段可能增加峰值并造成失真；这条 Web Audio 处理链不是 WASAPI 独占或 bit-perfect 输出。</small>
    </footer>
  </details>;
}

export function MusicReplayGainControls({ state, settings, updateSettings }: {
  state: MusicState | null;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const track = activeTrack(state);
  const mode = settings.musicReplayGainMode === 'album' ? 'album' : 'track';
  const gain = mode === 'album'
    ? track?.replayGainAlbumDb ?? track?.replayGainTrackDb ?? null
    : track?.replayGainTrackDb ?? track?.replayGainAlbumDb ?? null;
  const peak = mode === 'album'
    ? track?.replayGainAlbumPeak ?? track?.replayGainTrackPeak ?? null
    : track?.replayGainTrackPeak ?? track?.replayGainAlbumPeak ?? null;
  return <section className="nm-replaygain-panel">
    <div className="nm-replaygain-main">
      <label><input type="checkbox" checked={settings.musicReplayGainEnabled === true}
        onChange={event => updateSettings({ musicReplayGainEnabled: event.target.checked })}/>
        <span><b>ReplayGain 音量标准化</b><small>读取文件内的 Track / Album Gain 与 Peak 标签；不会改写原音频文件。</small></span>
      </label>
      <select aria-label="ReplayGain 模式" value={mode}
        onChange={event => updateSettings({ musicReplayGainMode: event.target.value === 'album' ? 'album' : 'track' })}
        disabled={settings.musicReplayGainEnabled !== true}>
        <option value="track">按单曲增益</option>
        <option value="album">按专辑增益</option>
      </select>
    </div>
    <div className={`nm-replaygain-info ${settings.musicReplayGainEnabled ? '' : 'muted'}`}>
      {!settings.musicReplayGainEnabled
        ? 'ReplayGain 已关闭，音频保持原始标签音量。'
        : !track
          ? '选择一首歌曲后显示其 ReplayGain 标签。'
          : gain == null
            ? '当前歌曲没有可用的 ReplayGain 增益标签；将按原始音量播放。'
            : `当前曲目标签：${mode === 'album' && track.replayGainAlbumDb != null ? 'Album' : 'Track'} ${gain > 0 ? '+' : ''}${gain.toFixed(2)} dB${peak != null ? ` · Peak ${peak.toFixed(4)}` : ' · 无 Peak 标签（正增益将被限制）'}`}
    </div>
  </section>;
}

export function MusicLyricsPanel({ state }: { state: MusicState | null }) {
  const track = activeTrack(state);
  const [lines, setLines] = useState<MusicLyricLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setLines([]);
    setLoaded(false);
    if (!track?.id) {
      setLoaded(true);
      return () => { alive = false; };
    }
    void window.nexus.getMusicLyrics(track.id).then(result => {
      if (!alive) return;
      setLines(Array.isArray(result) ? result : []);
      setLoaded(true);
    }).catch(() => {
      if (alive) { setLines([]); setLoaded(true); }
    });
    return () => { alive = false; };
  }, [track?.id, reloadKey]);
  const currentIndex = useMemo(() => {
    const time = Math.max(0, state?.currentTime ?? 0);
    let low = 0, high = lines.length - 1, found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (lines[middle].timeSeconds <= time + 0.04) {
        found = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    return found;
  }, [lines, state?.currentTime]);
  const current = currentIndex >= 0 ? lines[currentIndex] : null;
  const next = currentIndex >= 0 ? lines[currentIndex + 1] ?? null : lines[0] ?? null;
  return <section className="nm-lyrics-panel">
    <header>
      <span><b>同步歌词</b><small>{track?.title ?? '尚未选择歌曲'} · 本地 LRC</small></span>
      <button type="button" className="btn-secondary" disabled={!track} onClick={() => setReloadKey(value => value + 1)}>重新读取</button>
    </header>
    {!track
      ? <div className="nm-lyrics-empty">播放一首歌曲后显示同名 LRC 歌词。</div>
      : !loaded
        ? <div className="nm-lyrics-empty">正在读取本地歌词…</div>
        : lines.length === 0
          ? <div className="nm-lyrics-empty">未找到可用歌词。将 UTF-8 的同名 .lrc 文件放在音频文件旁即可；不会联网搜索或上传。</div>
          : <div className="nm-lyrics-current">
              <strong>{current?.text || '♪'}</strong>
              <span>{next?.text || ' '}</span>
            </div>}
    <footer>歌词仅从歌曲同目录同名 .lrc 读取；时间戳按播放进度同步。</footer>
  </section>;
}

export function MusicMiniPlayer({ state, onCommand }: { state: MusicState | null; onCommand: (command: MusicCommand) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const track = activeTrack(state);
  const progress = state && state.duration > 0 ? Math.min(100, (state.currentTime / state.duration) * 100) : 0;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const button = (label: string, icon: ReactNode, action: () => void, active = false) => (
    <button type="button" className={`nm-player-icon-button ${active ? 'active' : ''}`} title={label} aria-label={label}
      data-no-widget-drag="true" onPointerDown={stopWidgetDrag} onClick={event => { event.stopPropagation(); action(); }}>
      {icon}
    </button>
  );

  return <div ref={root} className="nm-widget-player" data-no-widget-drag="true" onPointerDown={stopWidgetDrag}>
    <div className="nm-widget-player-main">
      <button type="button" className="nm-widget-player-info" onClick={() => setOpen(value => !value)}
        aria-expanded={open} title="打开迷你播放器" data-no-widget-drag="true">
        <TrackArtwork trackId={track?.id ?? null} className="nm-player-art" fallback={<Music2 size={18}/>} />
        <span className="nm-player-copy">
          <b>{track?.title ?? '尚未选择歌曲'}</b>
          <small className={state?.errorMessage ? 'nm-player-error' : ''}>{state?.errorMessage ?? (track?.missing ? '文件已移动或删除' : track?.artist ?? '添加本地音频开始播放')}</small>
        </span>
        <ListMusic size={16} className="nm-player-list-indicator"/>
      </button>
      <div className="nm-widget-player-controls">
        {button('上一首', <SkipBack size={15}/>, () => onCommand({ type: 'previous' }))}
        {button(state?.isPlaying ? '暂停' : '播放', state?.isPlaying ? <Pause size={17}/> : <Play size={17}/>, () => onCommand({ type: 'toggle' }))}
        {button('下一首', <SkipForward size={15}/>, () => onCommand({ type: 'next' }))}
      </div>
    </div>
    <div className="nm-player-progress"><i style={{ width: `${progress}%` }}/></div>
    {open && <section className="nm-player-popover" aria-label="迷你音乐播放器" onPointerDown={stopWidgetDrag}>
      <header>
        <div><span>NOW PLAYING</span><b>{track?.title ?? '音乐播放器'}</b><small>{track?.artist ?? '尚未添加歌曲'}</small></div>
        <button type="button" title="关闭播放器卡片" onClick={() => setOpen(false)}><X size={15}/></button>
      </header>
      <div className="nm-player-popover-controls">
        {button('随机播放', <Shuffle size={16}/>, () => onCommand({ type: 'toggle-shuffle' }), state?.shuffle === true)}
        {button('上一首', <SkipBack size={18}/>, () => onCommand({ type: 'previous' }))}
        {button(state?.isPlaying ? '暂停' : '播放', state?.isPlaying ? <Pause size={20}/> : <Play size={20}/>, () => onCommand({ type: 'toggle' }), true)}
        {button('下一首', <SkipForward size={18}/>, () => onCommand({ type: 'next' }))}
        {button(repeatLabel(state?.repeat ?? 'off'), <Repeat size={16}/>, () => onCommand({ type: 'cycle-repeat' }), state?.repeat !== 'off')}
      </div>
      <div className="nm-player-seek">
        <input aria-label="播放进度" type="range" min="0" max={Math.max(1, state?.duration ?? 0)} step="0.1" value={Math.min(state?.currentTime ?? 0, state?.duration ?? 0)}
          onChange={event => onCommand({ type: 'seek', seconds: Number(event.target.value) })}/>
        <div><small>{formatTime(state?.currentTime ?? 0)}</small><small>{formatTime(state?.duration ?? 0)}</small></div>
      </div>
      <label className="nm-player-volume"><Volume2 size={15}/><input aria-label="播放器音量" type="range" min="0" max="100" value={Math.round((state?.volume ?? 0.7) * 100)}
        onChange={event => onCommand({ type: 'set-volume', volume: Number(event.target.value) / 100 })}/><span>{Math.round((state?.volume ?? 0.7) * 100)}%</span></label>
      <footer><span>{state?.tracks.length ?? 0} 首歌曲</span><button type="button" onClick={() => { setOpen(false); void window.nexus.showMusicLibrary(); }}>打开音乐库 <ListMusic size={13}/></button></footer>
    </section>}
  </div>;
}

export function MusicPlayerDock({ state, onCommand, onOpen }: {
  state: MusicState | null; onCommand: (command: MusicCommand) => void; onOpen: () => void;
}) {
  const track = activeTrack(state);
  return <div className="nm-music-dock">
    <button type="button" className="nm-dock-track" onClick={onOpen}>
      <TrackArtwork trackId={track?.id ?? null} className="nm-dock-art" fallback={<Disc3 size={20}/>} />
      <span><b>{track?.title ?? '尚未选择歌曲'}</b><small className={state?.errorMessage ? 'nm-player-error' : ''}>{state?.errorMessage ?? (track?.artist ?? '打开音乐库导入音频')}</small></span>
    </button>
    <div className="nm-dock-center">
      <div className="nm-dock-controls">
        <button type="button" title="随机播放" className={state?.shuffle ? 'active' : ''} onClick={() => onCommand({ type: 'toggle-shuffle' })}><Shuffle size={15}/></button>
        <button type="button" title="上一首" onClick={() => onCommand({ type: 'previous' })}><SkipBack size={17}/></button>
        <button type="button" className="nm-dock-play" title={state?.isPlaying ? '暂停' : '播放'} onClick={() => onCommand({ type: 'toggle' })}>{state?.isPlaying ? <Pause size={17}/> : <Play size={17}/>}</button>
        <button type="button" title="下一首" onClick={() => onCommand({ type: 'next' })}><SkipForward size={17}/></button>
        <button type="button" title={repeatLabel(state?.repeat ?? 'off')} className={state?.repeat !== 'off' ? 'active' : ''} onClick={() => onCommand({ type: 'cycle-repeat' })}><Repeat size={15}/></button>
      </div>
      <div className="nm-dock-seek"><small>{formatTime(state?.currentTime ?? 0)}</small><input aria-label="播放进度" type="range" min="0" max={Math.max(1, state?.duration ?? 0)} step="0.1" value={Math.min(state?.currentTime ?? 0, state?.duration ?? 0)}
        onChange={event => onCommand({ type: 'seek', seconds: Number(event.target.value) })}/><small>{formatTime(state?.duration ?? 0)}</small></div>
    </div>
    <div className="nm-dock-volume"><Volume2 size={16}/><input aria-label="播放器音量" type="range" min="0" max="100" value={Math.round((state?.volume ?? 0.7) * 100)}
      onChange={event => onCommand({ type: 'set-volume', volume: Number(event.target.value) / 100 })}/><span>{Math.round((state?.volume ?? 0.7) * 100)}%</span></div>
    <div className="nm-dock-count"><ListMusic size={16}/><span>{state?.tracks.length ?? 0}</span></div>
  </div>;
}

type MusicLibraryView = 'songs' | 'albums' | 'artists' | 'genres' | 'folders';
type MusicLibraryGroup = { id: string; title: string; subtitle: string; count: number; firstTrackId: string };
function getMusicLibraryGroup(track: MusicTrack, view: MusicLibraryView): Omit<MusicLibraryGroup, 'count' | 'firstTrackId'> {
  if (view === 'albums') {
    const artist = track.artist || '未知艺术家';
    const album = track.album?.trim() || '未知专辑';
    return { id: `album:${artist.toLocaleLowerCase()}:${album.toLocaleLowerCase()}`, title: album, subtitle: artist };
  }
  if (view === 'artists') {
    const artist = track.artist?.trim() || '未知艺术家';
    return { id: `artist:${artist.toLocaleLowerCase()}`, title: artist, subtitle: '艺术家' };
  }
  if (view === 'genres') {
    const genre = track.genre?.trim() || '未分类';
    return { id: `genre:${genre.toLocaleLowerCase()}`, title: genre, subtitle: '流派' };
  }
  const normalized = track.path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  parts.pop();
  const folder = parts.join('/') || '/';
  return { id: `folder:${folder.toLocaleLowerCase()}`, title: parts[parts.length - 1] || folder, subtitle: folder };
}

function MusicSleepTimer({ endsAt, onSet }: { endsAt: number | null; onSet: (minutes: number | null) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [endsAt]);
  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 60_000)) : null;
  return <section className="nm-sleep-timer">
    <div><b>睡眠定时</b><small>{remaining != null ? `将在约 ${remaining} 分钟后暂停播放` : '播放到设定时间后自动暂停；不会关闭 NexusMonitor 或副屏'}</small></div>
    <div className="nm-sleep-timer-actions">
      {[15, 30, 45, 60, 90].map(minutes => <button type="button" key={minutes} className={remaining === minutes ? 'selected' : ''} onClick={() => onSet(minutes)}>{minutes} 分钟</button>)}
      {endsAt && <button type="button" className="clear" onClick={() => onSet(null)}>取消</button>}
    </div>
  </section>;
}

export function MusicLibraryPage({ state, onCommand, notify, settings, updateSettings, outputStatus, sleepTimerEndsAt, onSetSleepTimer }: {
  state: MusicState | null;
  onCommand: (command: MusicCommand) => void;
  notify: (message: string) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  outputStatus: MusicOutputStatus | null;
  sleepTimerEndsAt: number | null;
  onSetSleepTimer: (minutes: number | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [targetPlaylist, setTargetPlaylist] = useState('');
  const [view, setView] = useState<MusicLibraryView>('songs');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const currentPlaylist = state?.playlists.find(item => item.id === state.activePlaylistId) ?? null;
  const scopedTracks = useMemo(() => {
    if (!state) return [];
    const ids = currentPlaylist ? new Set(currentPlaylist.trackIds) : null;
    return state.tracks.filter(track => !ids || ids.has(track.id));
  }, [state, currentPlaylist]);
  const groups = useMemo<MusicLibraryGroup[]>(() => {
    if (view === 'songs') return [];
    const map = new Map<string, MusicLibraryGroup>();
    for (const track of scopedTracks) {
      const identity = getMusicLibraryGroup(track, view);
      const existing = map.get(identity.id);
      if (existing) existing.count++;
      else map.set(identity.id, { ...identity, count: 1, firstTrackId: track.id });
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN', { numeric: true, sensitivity: 'base' }));
  }, [scopedTracks, view]);
  const selectedGroup = groups.find(group => group.id === selectedGroupId) ?? null;
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return groups.filter(group => !needle || `${group.title} ${group.subtitle}`.toLocaleLowerCase().includes(needle));
  }, [groups, query]);
  const visibleTracks = useMemo(() => {
    if (!state || (view !== 'songs' && !selectedGroupId)) return [];
    const needle = query.trim().toLocaleLowerCase();
    return scopedTracks.filter(track => {
      if (selectedGroupId && getMusicLibraryGroup(track, view).id !== selectedGroupId) return false;
      return !needle || `${track.title} ${track.artist} ${track.album ?? ''} ${track.genre ?? ''}`.toLocaleLowerCase().includes(needle);
    });
  }, [state, scopedTracks, view, selectedGroupId, query]);

  const chooseView = (next: MusicLibraryView) => {
    setView(next);
    setSelectedGroupId(null);
    setQuery('');
    onCommand({ type: 'select-playlist', playlistId: null });
  };
  const choosePlaylist = (playlistId: string) => {
    setView('songs');
    setSelectedGroupId(null);
    setQuery('');
    onCommand({ type: 'select-playlist', playlistId });
  };
  const importFiles = async () => {
    const result = await window.nexus.chooseMusicFiles();
    if (result.added || result.skipped) notify(`已导入 ${result.added} 个音频文件，跳过 ${result.skipped} 个文件`);
  };
  const importFolder = async () => {
    const result = await window.nexus.chooseMusicFolder();
    if (result.added || result.skipped) notify(`文件夹扫描完成：导入 ${result.added} 个音频文件，跳过 ${result.skipped} 个${result.truncated ? '（达到 5000 个文件扫描上限）' : ''}`);
  };
  const importPlaylist = async () => {
    const result = await window.nexus.importMusicPlaylist();
    if (result.ok) notify(`已导入歌单“${result.name ?? 'M3U'}”：${result.added} 首新歌曲，${result.skipped} 个跳过`);
    else if (result.message) notify(result.message);
  };
  const exportPlaylist = async () => {
    if (!currentPlaylist) return;
    const result = await window.nexus.exportMusicPlaylist(currentPlaylist.id);
    if (result.ok) notify(`歌单已导出：${result.count ?? 0} 首歌曲`);
    else if (!result.canceled && result.message) notify(`导出失败：${result.message}`);
  };
  const createPlaylist = () => {
    const name = window.prompt('请输入歌单名称');
    if (name?.trim()) onCommand({ type: 'create-playlist', name: name.trim() });
  };
  const renamePlaylist = () => {
    if (!currentPlaylist) return;
    const name = window.prompt('重命名歌单', currentPlaylist.name);
    if (name?.trim()) onCommand({ type: 'rename-playlist', playlistId: currentPlaylist.id, name: name.trim() });
  };
  const playAll = () => {
    const first = visibleTracks.find(track => !track.missing);
    if (first) onCommand({ type: 'play-track', trackId: first.id });
    else notify('当前列表没有可播放的本地音频文件');
  };
  const heading = currentPlaylist?.name ?? selectedGroup?.title ?? ({
    songs: '全部歌曲', albums: '专辑', artists: '艺术家', genres: '流派', folders: '文件夹',
  } as Record<MusicLibraryView, string>)[view];
  const viewLabel = ({ songs: 'ALL TRACKS', albums: 'ALBUMS', artists: 'ARTISTS', genres: 'GENRES', folders: 'FOLDERS' } as Record<MusicLibraryView, string>)[view];

  return <div className="nm-library-page">
    <div className="nm-library-heading">
      <div><span>MUSIC / LOCAL LIBRARY</span><h1>音乐播放器</h1><p>曲库、专辑、艺术家、流派、文件夹与歌单 · 全局共享播放</p></div>
      <div className="nm-library-actions">
        <button type="button" className="btn-secondary" onClick={() => void importPlaylist()}><ListMusic size={15}/>导入 M3U</button>
        <button type="button" className="btn-secondary" onClick={() => void importFolder()}><FolderOpen size={15}/>导入文件夹</button>
        <button type="button" className="btn-primary" onClick={() => void importFiles()}><Plus size={15}/>添加音频</button>
      </div>
    </div>
    <MusicOutputDevicePicker settings={settings} updateSettings={updateSettings} status={outputStatus}/>
    <MusicEqualizer bands={settings.musicEqBands ?? FLAT_MUSIC_EQ} onChange={bands => updateSettings({ musicEqBands: bands })}/>
    <MusicReplayGainControls state={state} settings={settings} updateSettings={updateSettings}/>
    <MusicLyricsPanel state={state}/>
    <MusicSleepTimer endsAt={sleepTimerEndsAt} onSet={onSetSleepTimer}/>
    {state?.errorMessage && <div className="nm-playback-error" role="status"><b>播放失败</b><span>{state.errorMessage}</span></div>}
    <div className="nm-library-layout">
      <aside className="nm-playlist-sidebar">
        <div className="nm-playlist-title"><b>浏览曲库</b><button type="button" title="新建歌单" onClick={createPlaylist}><Plus size={16}/></button></div>
        <button type="button" className={view === 'songs' && !currentPlaylist ? 'selected' : ''} onClick={() => chooseView('songs')}>
          <Music2 size={16}/><span>全部歌曲</span><small>{state?.tracks.length ?? 0}</small>
        </button>
        <button type="button" className={view === 'albums' ? 'selected' : ''} onClick={() => chooseView('albums')}>
          <Disc3 size={16}/><span>专辑</span><small>{state?.tracks.filter(track => track.album).reduce((set, track) => set.add(track.album!), new Set<string>()).size ?? 0}</small>
        </button>
        <button type="button" className={view === 'artists' ? 'selected' : ''} onClick={() => chooseView('artists')}>
          <Music2 size={16}/><span>艺术家</span><small>{state?.tracks.reduce((set, track) => set.add(track.artist || '未知艺术家'), new Set<string>()).size ?? 0}</small>
        </button>
        <button type="button" className={view === 'genres' ? 'selected' : ''} onClick={() => chooseView('genres')}>
          <ListMusic size={16}/><span>流派</span><small>{state?.tracks.reduce((set, track) => set.add(track.genre || '未分类'), new Set<string>()).size ?? 0}</small>
        </button>
        <button type="button" className={view === 'folders' ? 'selected' : ''} onClick={() => chooseView('folders')}>
          <Folder size={16}/><span>文件夹</span><small>{new Set((state?.tracks ?? []).map(track => getMusicLibraryGroup(track, 'folders').id)).size}</small>
        </button>
        <div className="nm-playlist-divider">我的歌单</div>
        {(state?.playlists ?? []).map(playlist => <button key={playlist.id} type="button" className={currentPlaylist?.id === playlist.id && view === 'songs' ? 'selected' : ''}
          onClick={() => choosePlaylist(playlist.id)}>
          <ListMusic size={15}/><span>{playlist.name}</span><small>{playlist.trackIds.length}</small>
        </button>)}
        {currentPlaylist && <div className="nm-playlist-management">
          <button type="button" onClick={exportPlaylist}>导出 M3U8</button>
          <button type="button" onClick={renamePlaylist}>重命名</button>
          <button type="button" onClick={() => { if (window.confirm(`删除歌单“${currentPlaylist.name}”？歌曲文件不会被删除。`)) onCommand({ type: 'delete-playlist', playlistId: currentPlaylist.id }); }}>删除歌单</button>
        </div>}
      </aside>
      <section className="nm-track-panel">
        <div className="nm-track-toolbar">
          <div><span>{currentPlaylist ? 'PLAYLIST' : selectedGroup ? viewLabel : viewLabel}</span><h2>{heading}</h2><small>{view === 'songs' || selectedGroup ? `${visibleTracks.length} 首歌曲` : `${groups.length} 个分类`}</small></div>
          <div className="nm-track-actions">
            {selectedGroup && <button type="button" className="btn-secondary" onClick={() => setSelectedGroupId(null)}>返回{view === 'albums' ? '专辑' : view === 'artists' ? '艺术家' : view === 'genres' ? '流派' : '文件夹'}</button>}
            <label className="nm-track-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={view === 'songs' || selectedGroup ? '搜索歌曲' : '搜索分类'}/></label>
            {(view === 'songs' || selectedGroup) && <button type="button" className="btn-primary" disabled={!visibleTracks.some(track => !track.missing)} onClick={playAll}><Play size={14}/>播放全部</button>}
          </div>
        </div>
        {view !== 'songs' && !selectedGroup ? <div className="nm-library-groups">
          {visibleGroups.length === 0 ? <div className="nm-library-empty"><Music2 size={28}/><b>没有可显示的分类</b><span>导入带有标签的音乐，或检查歌曲文件夹。</span></div> :
            visibleGroups.map(group => <button type="button" key={group.id} className="nm-library-group-card" onClick={() => { setSelectedGroupId(group.id); setQuery(''); }}>
              <TrackArtwork trackId={group.firstTrackId} className="nm-library-group-art" fallback={<Disc3 size={24}/>} />
              <span><b>{group.title}</b><small>{group.subtitle}</small></span><em>{group.count} 首</em>
            </button>)}
        </div> : <>
          {state?.playlists.length && !currentPlaylist && view === 'songs' ? <div className="nm-add-playlist-row"><label>将歌曲加入歌单</label><select value={targetPlaylist} onChange={event => setTargetPlaylist(event.target.value)}><option value="">选择歌单</option>{state.playlists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span>在“全部歌曲”中使用每首歌右侧的加入按钮。</span></div> : null}
          <div className="nm-track-list">
            <div className="nm-track-list-head"><span>#</span><span>歌曲</span><span>格式</span><span>操作</span></div>
            {visibleTracks.length === 0 ? <div className="nm-library-empty"><Music2 size={28}/><b>{state?.tracks.length ? '没有匹配的歌曲' : '音乐库还是空的'}</b><span>导入本地音频文件或整个音乐文件夹，即可建立自己的歌单。</span></div> :
              visibleTracks.map((track: MusicTrack, index) => <div key={track.id} className={`nm-track-row ${state?.currentTrackId === track.id ? 'playing' : ''} ${track.missing ? 'missing' : ''}`}
                onDoubleClick={() => !track.missing && onCommand({ type: 'play-track', trackId: track.id })}>
                <span className="nm-track-index">{state?.currentTrackId === track.id && state.isPlaying ? <span className="nm-playing-bars">▮▮</span> : String(index + 1).padStart(2, '0')}</span>
                <span className="nm-track-name"><b>{track.title}</b><small>{track.missing ? '文件不存在或已移动' : [track.artist, track.album].filter(Boolean).join(' · ')}</small></span>
                <span className="nm-track-format">{track.format ?? 'AUDIO'}</span>
                <span className="nm-track-row-actions">
                  <button type="button" title="播放歌曲" disabled={track.missing} onClick={() => onCommand({ type: 'play-track', trackId: track.id })}><Play size={14}/></button>
                  {targetPlaylist && !currentPlaylist && view === 'songs' && <button type="button" title="加入所选歌单" onClick={() => onCommand({ type: 'add-to-playlist', trackId: track.id, playlistId: targetPlaylist })}><ListPlus size={15}/></button>}
                  {currentPlaylist && <>
                    <button type="button" title="歌单中上移" disabled={currentPlaylist.trackIds.indexOf(track.id) <= 0} onClick={() => onCommand({ type: 'move-track', playlistId: currentPlaylist.id, trackId: track.id, direction: 'up' })}><ArrowUp size={14}/></button>
                    <button type="button" title="歌单中下移" disabled={currentPlaylist.trackIds.indexOf(track.id) >= currentPlaylist.trackIds.length - 1} onClick={() => onCommand({ type: 'move-track', playlistId: currentPlaylist.id, trackId: track.id, direction: 'down' })}><ArrowDown size={14}/></button>
                  </>}
                  <button type="button" title={currentPlaylist ? "从当前歌单移除" : "从音乐库移除"} onClick={() => {
                    const prompt = currentPlaylist ? `从歌单“${currentPlaylist.name}”移除“${track.title}”？音乐库中的原文件和歌曲记录会保留。` : `从音乐库移除“${track.title}”？不会删除原始文件。`;
                    if (window.confirm(prompt)) onCommand(currentPlaylist ? { type: 'remove-from-playlist', playlistId: currentPlaylist.id, trackId: track.id } : { type: 'remove-track', trackId: track.id });
                  }}><Trash2 size={14}/></button>
                </span>
              </div>)
            }
          </div>
        </>}
      </section>
    </div>
  </div>;
}
