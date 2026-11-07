import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  Music2, Play, Pause, SkipBack, SkipForward, ListMusic, FolderOpen, Plus,
  Trash2, Shuffle, Repeat, Volume2, Search, X, ListPlus, Disc3,
} from 'lucide-react';
import type { MusicCommand, MusicState, MusicTrack } from '../shared/types';

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
const repeatLabel = (repeat: MusicState['repeat']) => repeat === 'one' ? '单曲循环' : repeat === 'all' ? '列表循环' : '不循环';
const stopWidgetDrag = (event: ReactPointerEvent) => event.stopPropagation();

export function MusicPlaybackRuntime({ state }: { state: MusicState | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastReportAt = useRef(0);

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
    const onError = () => window.nexus.reportMusicRuntime({ error: true, playing: false });
    const offEngine = window.nexus.onMusicEngineCommand(command => {
      if (command.type === 'seek' && Number.isFinite(command.seconds) && audio.duration > 0) {
        audio.currentTime = Math.max(0, Math.min(audio.duration, command.seconds));
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
    const audio = audioRef.current;
    const trackId = state?.currentTrackId ?? null;
    if (!audio || !trackId) {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        delete audio.dataset.trackId;
        audio.load();
      }
      return;
    }
    let cancelled = false;
    audio.pause();
    delete audio.dataset.trackId;
    void window.nexus.getMusicTrackUrl(trackId).then(url => {
      if (cancelled) return;
      if (!url) {
        window.nexus.reportMusicRuntime({ error: true, playing: false });
        return;
      }
      audio.src = url;
      audio.dataset.trackId = trackId;
      audio.load();
      const restorePosition = () => {
        if (cancelled || audio.dataset.trackId !== trackId) return;
        if (Number.isFinite(state.currentTime) && state.currentTime > 0 && audio.duration > 0) {
          audio.currentTime = Math.min(state.currentTime, Math.max(0, audio.duration - 0.1));
        }
        if (state.isPlaying) void audio.play().catch(() => window.nexus.reportMusicRuntime({ error: true, playing: false }));
      };
      audio.addEventListener('loadedmetadata', restorePosition, { once: true });
      if (audio.readyState >= 1) restorePosition();
    }).catch(() => {
      if (!cancelled) window.nexus.reportMusicRuntime({ error: true, playing: false });
    });
    return () => { cancelled = true; };
  }, [state?.currentTrackId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state?.currentTrackId || audio.dataset.trackId !== state.currentTrackId) return;
    if (state.isPlaying) {
      void audio.play().catch(() => window.nexus.reportMusicRuntime({ error: true, playing: false }));
    } else {
      audio.pause();
    }
  }, [state?.isPlaying, state?.currentTrackId]);

  return <audio ref={audioRef} preload="metadata" className="nm-audio-engine" aria-hidden="true"/>;
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
        <span className="nm-player-art"><Music2 size={18}/></span>
        <span className="nm-player-copy">
          <b>{track?.title ?? '尚未选择歌曲'}</b>
          <small>{track?.missing ? '文件已移动或删除' : track?.artist ?? '添加本地 MP3 开始播放'}</small>
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
      <footer><span>{state?.tracks.length ?? 0} 首歌曲</span><button type="button" onClick={() => { setOpen(false); void window.nexus.showMain(); }}>打开音乐库 <ListMusic size={13}/></button></footer>
    </section>}
  </div>;
}

export function MusicPlayerDock({ state, onCommand, onOpen }: {
  state: MusicState | null; onCommand: (command: MusicCommand) => void; onOpen: () => void;
}) {
  const track = activeTrack(state);
  return <div className="nm-music-dock">
    <button type="button" className="nm-dock-track" onClick={onOpen}>
      <span className="nm-dock-art"><Disc3 size={20}/></span>
      <span><b>{track?.title ?? '尚未选择歌曲'}</b><small>{track?.artist ?? '打开音乐库导入 MP3'}</small></span>
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

export function MusicLibraryPage({ state, onCommand, notify }: {
  state: MusicState | null; onCommand: (command: MusicCommand) => void; notify: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [targetPlaylist, setTargetPlaylist] = useState('');
  const currentPlaylist = state?.playlists.find(item => item.id === state.activePlaylistId) ?? null;
  const visibleTracks = useMemo(() => {
    if (!state) return [];
    const ids = currentPlaylist ? new Set(currentPlaylist.trackIds) : null;
    const needle = query.trim().toLocaleLowerCase();
    return state.tracks.filter(track => (!ids || ids.has(track.id)) && (!needle || `${track.title} ${track.artist}`.toLocaleLowerCase().includes(needle)));
  }, [state, currentPlaylist, query]);

  const importFiles = async () => {
    const result = await window.nexus.chooseMusicFiles();
    if (result.added || result.skipped) notify(`已导入 ${result.added} 首 MP3，跳过 ${result.skipped} 个文件`);
  };
  const importFolder = async () => {
    const result = await window.nexus.chooseMusicFolder();
    if (result.added || result.skipped) notify(`文件夹扫描完成：导入 ${result.added} 首，跳过 ${result.skipped} 首${result.truncated ? '（达到 5000 首扫描上限）' : ''}`);
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
    else notify('当前列表没有可播放的 MP3 文件');
  };

  return <div className="nm-library-page">
    <div className="nm-library-heading">
      <div><span>MUSIC / LOCAL LIBRARY</span><h1>音乐播放器</h1><p>本地 MP3 · 歌单管理 · 全局共享播放队列</p></div>
      <div className="nm-library-actions">
        <button type="button" className="btn-secondary" onClick={() => void importFolder()}><FolderOpen size={15}/>导入文件夹</button>
        <button type="button" className="btn-primary" onClick={() => void importFiles()}><Plus size={15}/>添加 MP3</button>
      </div>
    </div>
    <div className="nm-library-layout">
      <aside className="nm-playlist-sidebar">
        <div className="nm-playlist-title"><b>音乐库</b><button type="button" title="新建歌单" onClick={createPlaylist}><Plus size={16}/></button></div>
        <button type="button" className={!state?.activePlaylistId ? 'selected' : ''} onClick={() => onCommand({ type: 'select-playlist', playlistId: null })}>
          <Music2 size={16}/><span>全部歌曲</span><small>{state?.tracks.length ?? 0}</small>
        </button>
        <div className="nm-playlist-divider">我的歌单</div>
        {(state?.playlists ?? []).map(playlist => <button key={playlist.id} type="button" className={state?.activePlaylistId === playlist.id ? 'selected' : ''}
          onClick={() => onCommand({ type: 'select-playlist', playlistId: playlist.id })}>
          <ListMusic size={15}/><span>{playlist.name}</span><small>{playlist.trackIds.length}</small>
        </button>)}
        {currentPlaylist && <div className="nm-playlist-management">
          <button type="button" onClick={renamePlaylist}>重命名</button>
          <button type="button" onClick={() => { if (window.confirm(`删除歌单“${currentPlaylist.name}”？歌曲文件不会被删除。`)) onCommand({ type: 'delete-playlist', playlistId: currentPlaylist.id }); }}>删除歌单</button>
        </div>}
      </aside>
      <section className="nm-track-panel">
        <div className="nm-track-toolbar">
          <div><span>{currentPlaylist ? 'PLAYLIST' : 'ALL TRACKS'}</span><h2>{currentPlaylist?.name ?? '全部歌曲'}</h2><small>{visibleTracks.length} 首歌曲</small></div>
          <div className="nm-track-actions">
            <label className="nm-track-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索歌曲"/></label>
            <button type="button" className="btn-primary" disabled={!visibleTracks.some(track => !track.missing)} onClick={playAll}><Play size={14}/>播放全部</button>
          </div>
        </div>
        {state?.playlists.length ? <div className="nm-add-playlist-row"><label>将歌曲加入歌单</label><select value={targetPlaylist} onChange={event => setTargetPlaylist(event.target.value)}><option value="">选择歌单</option>{state.playlists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span>在“全部歌曲”中使用每首歌右侧的加入按钮。</span></div> : null}
        <div className="nm-track-list">
          <div className="nm-track-list-head"><span>#</span><span>歌曲</span><span>格式</span><span>操作</span></div>
          {visibleTracks.length === 0 ? <div className="nm-library-empty"><Music2 size={28}/><b>{state?.tracks.length ? '没有匹配的歌曲' : '音乐库还是空的'}</b><span>导入本地 MP3 文件或整个音乐文件夹，即可建立自己的歌单。</span></div> :
            visibleTracks.map((track: MusicTrack, index) => <div key={track.id} className={`nm-track-row ${state?.currentTrackId === track.id ? 'playing' : ''} ${track.missing ? 'missing' : ''}`}
              onDoubleClick={() => !track.missing && onCommand({ type: 'play-track', trackId: track.id })}>
              <span className="nm-track-index">{state?.currentTrackId === track.id && state.isPlaying ? <span className="nm-playing-bars">▮▮</span> : String(index + 1).padStart(2, '0')}</span>
              <span className="nm-track-name"><b>{track.title}</b><small>{track.missing ? '文件不存在或已移动' : track.artist}</small></span>
              <span className="nm-track-format">MP3</span>
              <span className="nm-track-row-actions">
                <button type="button" title="播放歌曲" disabled={track.missing} onClick={() => onCommand({ type: 'play-track', trackId: track.id })}><Play size={14}/></button>
                {targetPlaylist && !currentPlaylist && <button type="button" title="加入所选歌单" onClick={() => onCommand({ type: 'add-to-playlist', trackId: track.id, playlistId: targetPlaylist })}><ListPlus size={15}/></button>}
                <button type="button" title="从音乐库移除" onClick={() => { if (window.confirm(`从音乐库移除“${track.title}”？不会删除原始文件。`)) onCommand({ type: 'remove-track', trackId: track.id }); }}><Trash2 size={14}/></button>
              </span>
            </div>)
          }
        </div>
      </section>
    </div>
  </div>;
}
