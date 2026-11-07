import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, shell, screen, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connect } from 'node:net';
import { createInterface } from 'node:readline';
import type { MusicCommand, MusicPlaylist, MusicRepeatMode, MusicState, MusicTrack, ServiceStatus, SnapshotError, SnapshotResult, SystemSnapshot } from '../shared/types';
import { classifyFetchError } from './api-error';
import { RotatingLogger } from './logger';
import { restartDelayMs } from './service-backoff';
import { SnapshotCoordinator } from './snapshot-coordinator';
import { fitWindowToWorkArea } from './window-layout';
import { clampWidgetBounds, dockWidgetBounds, hideWidgetBounds, resolveDockEdge, resizeWidgetForOrientation } from './widget-docking';
import type { DockEdge } from './widget-docking';
import { calculateWidgetDetailLayout } from './widget-detail-window';
import { isFullscreenOnWidgetDisplay } from './fullscreen-detection';
import { resolveUsbDisplayWindowBounds } from './usb-display-window';
import { musicFormatLabel, readMusicMetadata } from './music-metadata';
import { parseLrc } from './music-lyrics';
import { parseM3u, serializeM3u } from './music-playlist';

// Music controls may arrive from a separate HUD/USB BrowserWindow after an explicit
// user click there. The shared, hidden main-renderer audio element must be allowed to
// start in response to that trusted IPC command; playback state is always restored paused.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const SERVICE_PORT = 18765;
const SERVICE_URL = `http://127.0.0.1:${SERVICE_PORT}`;
const SNAPSHOT_TIMEOUT_MS = 6_000;
const SNAPSHOT_CACHE_MS = 500;
const SERVICE_STABLE_MS = 60_000;
const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let mainWindowNativeReady = false;
let mainWindowRendererReady = false;
let widgetWindow: BrowserWindow | null = null;
let widgetDetailWindow: BrowserWindow | null = null;
let widgetDetailReady = false;
let widgetDetailNativeReady = false;
let widgetDetailRendererReady = false;
let widgetDetailRequestedVisible = false;
let widgetDetailHideTimer: NodeJS.Timeout | null = null;
let widgetDetailFadeTimer: NodeJS.Timeout | null = null;
let widgetCalendarWindow: BrowserWindow | null = null;
let usbDisplayWindow: BrowserWindow | null = null;
let usbDisplayTargetId: string | null = null;
let usbDisplayRestorePending = false;
let widgetDockEdge: DockEdge | null = null;
let widgetRestoreBounds: { x: number; y: number; width: number; height: number } | null = null;
let widgetRestoreMinSize: [number, number] | null = null;
let widgetEdgeHidden = false;
let widgetFullscreenMonitor: ChildProcess | null = null;
let widgetFullscreenActive = false;
let tray: Tray | null = null;
let serviceProcess: ChildProcess | null = null;
let serviceOwned = false;
let serviceStartedAt = 0;
let restartAttempt = 0;
let restartTimer: NodeJS.Timeout | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let weatherTimer: NodeJS.Timeout | null = null;
let weatherRetryTimer: NodeJS.Timeout | null = null;
let lastWeather: unknown = null;
let currentSettings: Record<string, unknown> = {};
let musicState: MusicState = {
  tracks: [], playlists: [], activePlaylistId: null, currentTrackId: null,
  currentTime: 0, duration: 0, volume: 0.7, isPlaying: false, errorMessage: null, shuffle: false, repeat: 'off',
};
let musicLastPersistAt = 0;
const MUSIC_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.m4b', '.aac']);
const MUSIC_AUDIO_FILTER_EXTENSIONS = [...MUSIC_AUDIO_EXTENSIONS].map(extension => extension.slice(1));
const MUSIC_FOLDER_SCAN_LIMIT = 5000;
let quitting = false;
let appLogger: RotatingLogger | null = null;
let lastServiceStatus: ServiceStatus = {
  phase: 'starting',
  reason: 'starting',
  message: '正在启动本机硬件服务…',
  at: new Date().toISOString(),
  pid: null,
  retryInMs: null,
};
const snapshots = new SnapshotCoordinator<SystemSnapshot>(() => Date.now(), SNAPSHOT_CACHE_MS);

const TURING_WALLPAPER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const TURING_WALLPAPER_MAX_BYTES = 40 * 1024 * 1024;
const USB_DISPLAY_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);
const USB_DISPLAY_VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.mov']);
const USB_DISPLAY_IMAGE_MAX_BYTES = 80 * 1024 * 1024;
function listDesktopDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id), index: index + 1, primary: display.id === primaryId,
    width: display.bounds.width, height: display.bounds.height, x: display.bounds.x, y: display.bounds.y,
    scaleFactor: display.scaleFactor, label: `显示器 ${index + 1}`,
  }));
}
function getUsbDisplayStatus() {
  return { open: Boolean(usbDisplayWindow && !usbDisplayWindow.isDestroyed()), targetDisplayId: usbDisplayWindow && !usbDisplayWindow.isDestroyed() ? usbDisplayTargetId : null };
}
function publishUsbDisplayStatus() {
  const status = getUsbDisplayStatus();
  for (const win of [mainWindow, widgetWindow, widgetDetailWindow, usbDisplayWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('usb-display:status', status);
  }
}
function applyUsbDisplayWindowBounds(output: BrowserWindow, target: Electron.Display) {
  if (output.isDestroyed()) return null;
  const bounds = resolveUsbDisplayWindowBounds(target.bounds);
  // Keep the output as a borderless, normal window. Native fullscreen can
  // re-home/re-size a window on Windows when the target display has a
  // negative desktop origin or a different per-monitor DPI scale.
  output.setBounds(bounds, false);
  const actual = output.getBounds();
  log(`USB display bounds target=${target.id} requested=${JSON.stringify(bounds)} actual=${JSON.stringify(actual)}`);
  return bounds;
}
function closeUsbDisplayWindow() {
  const current = usbDisplayWindow;
  if (!current || current.isDestroyed()) { usbDisplayWindow = null; usbDisplayTargetId = null; publishUsbDisplayStatus(); return false; }
  current.close();
  return true;
}
function openUsbDisplayWindow(displayId: string) {
  const target = screen.getAllDisplays().find(display => String(display.id) === String(displayId));
  if (!target) return { ok: false, message: '所选显示器已不存在，请刷新显示器列表' };
  if (usbDisplayWindow && !usbDisplayWindow.isDestroyed()) {
    if (usbDisplayTargetId === String(target.id)) {
      applyUsbDisplayWindowBounds(usbDisplayWindow, target);
      usbDisplayWindow.showInactive();
      return { ok: true, status: getUsbDisplayStatus() };
    }
    usbDisplayWindow.close();
  }
  const bounds = resolveUsbDisplayWindowBounds(target.bounds);
  const output = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    frame: false, show: false, hasShadow: false, backgroundColor: '#070b12', title: 'NexusMonitor USB 副屏',
    autoHideMenuBar: true, skipTaskbar: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreen: false, fullscreenable: false, alwaysOnTop: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  usbDisplayWindow = output; usbDisplayTargetId = String(target.id);
  if (isDev) void output.loadURL('http://127.0.0.1:5173/?usb-display=1');
  else void output.loadFile(join(app.getAppPath(), 'dist', 'index.html'), { query: { 'usb-display': '1' } });
  output.once('ready-to-show', () => {
    if (output.isDestroyed()) return;
    const currentTarget = screen.getAllDisplays().find(display => String(display.id) === usbDisplayTargetId);
    if (currentTarget) applyUsbDisplayWindowBounds(output, currentTarget);
    output.showInactive();
    log(`USB display output opened on display ${usbDisplayTargetId} without native fullscreen`);
    publishUsbDisplayStatus();
  });
  output.on('closed', () => {
    if (usbDisplayWindow === output) { usbDisplayWindow = null; usbDisplayTargetId = null; publishUsbDisplayStatus(); }
    log('USB display output closed');
  });
  output.webContents.on('did-fail-load', (_event, code, description) => log(`USB display renderer load failed: ${code} ${description}`));
  return { ok: true, status: getUsbDisplayStatus() };
}
function restoreConfiguredUsbDisplay() {
  if (!usbDisplayRestorePending) return false;
  // Never guess which external monitor is the 5-inch panel; only restore the saved ID.
  const displayId = String(currentSettings.usbDisplayDisplayId ?? '').trim();
  if (!displayId) { usbDisplayRestorePending = false; return false; }
  if (String(currentSettings.usbDisplayMode ?? 'monitor') === 'music-only') {
    usbDisplayRestorePending = false;
    closeUsbDisplayWindow();
    log('USB display output remains hidden in desktop wallpaper + music mode');
    return true;
  }
  const result = openUsbDisplayWindow(displayId);
  if (result.ok) {
    usbDisplayRestorePending = false;
    log(`Restored USB display ${displayId} with saved mode ${String(currentSettings.usbDisplayMode ?? 'monitor')}`);
    return true;
  }
  log(`Saved USB display ${displayId} is not ready yet: ${result.message ?? 'unknown error'}`);
  return false;
}
function chooseUsbDisplayMedia(kind: 'image' | 'video') {
  const filters = kind === 'video'
    ? [{ name: 'Video', extensions: ['mp4', 'm4v', 'webm', 'mov'] }]
    : [{ name: 'Images and GIF', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }];
  return dialog.showOpenDialog({ properties: ['openFile'], filters }).then(result => {
    if (result.canceled || !result.filePaths[0]) return null;
    const target = resolve(result.filePaths[0]); const extension = extname(target).toLowerCase();
    const allowed = kind === 'video' ? USB_DISPLAY_VIDEO_EXTENSIONS : USB_DISPLAY_IMAGE_EXTENSIONS;
    if (!allowed.has(extension)) return null;
    return { path: target, name: basename(target) };
  });
}
function readUsbDisplayImage(path: string) {
  const target = resolve(String(path ?? '')); const extension = extname(target).toLowerCase();
  if (!USB_DISPLAY_IMAGE_EXTENSIONS.has(extension)) throw new Error('不支持的图片格式');
  const info = statSync(target); if (!info.isFile() || info.size <= 0 || info.size > USB_DISPLAY_IMAGE_MAX_BYTES) throw new Error('图片为空或超过 80 MB 限制');
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : extension === '.bmp' ? 'image/bmp' : extension === '.gif' ? 'image/gif' : 'image/png';
  return { ok: true, name: basename(target), dataUrl: `data:${mime};base64,${readFileSync(target).toString('base64')}` };
}
function getUsbDisplayVideoUrl(path: string) {
  const target = resolve(String(path ?? '')); const extension = extname(target).toLowerCase();
  if (!USB_DISPLAY_VIDEO_EXTENSIONS.has(extension)) throw new Error('不支持的视频格式');
  const info = statSync(target); if (!info.isFile() || info.size <= 0) throw new Error('视频文件为空或不存在');
  return { ok: true, name: basename(target), url: pathToFileURL(target).href };
}
function wallpaperMime(path: string): string {
  const extension = extname(path).toLowerCase();
  return extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
    : extension === '.webp' ? 'image/webp'
      : extension === '.bmp' ? 'image/bmp' : 'image/png';
}
function listTuringWallpaperFiles(directory: string) {
  const root = resolve(directory);
  const entries = readdirSync(root, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && TURING_WALLPAPER_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map(entry => ({ path: join(root, entry.name), name: entry.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
}
function readTuringWallpaper(path: string) {
  const target = resolve(path);
  if (!TURING_WALLPAPER_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error('不支持的图片格式');
  const info = statSync(target);
  if (!info.isFile()) throw new Error('所选路径不是图片文件');
  if (info.size <= 0 || info.size > TURING_WALLPAPER_MAX_BYTES) throw new Error('图片为空或超过 40 MB 限制');
  const data = readFileSync(target);
  return { path: target, name: basename(target), mime: wallpaperMime(target), dataUrl: `data:${wallpaperMime(target)};base64,${data.toString('base64')}` };
}
function getSettingsPath() { return join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  try { currentSettings = JSON.parse(readFileSync(getSettingsPath(), 'utf8')); }
  catch { currentSettings = {}; }
  return currentSettings;
}
function musicLibraryPath() { return join(app.getPath('userData'), 'music-library.json'); }
function persistMusicState() {
  const persisted = {
    tracks: musicState.tracks, playlists: musicState.playlists,
    activePlaylistId: musicState.activePlaylistId, currentTrackId: musicState.currentTrackId,
    currentTime: musicState.currentTime, volume: musicState.volume,
    shuffle: musicState.shuffle, repeat: musicState.repeat,
  };
  const file = musicLibraryPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(persisted, null, 2), 'utf8');
  musicLastPersistAt = Date.now();
}
function loadMusicLibrary() {
  try {
    const raw = JSON.parse(readFileSync(musicLibraryPath(), 'utf8')) as Record<string, unknown>;
    const tracks = Array.isArray(raw.tracks) ? raw.tracks.flatMap((item: any) => {
      if (!item || typeof item.path !== 'string' || !MUSIC_AUDIO_EXTENSIONS.has(extname(item.path).toLowerCase())) return [];
      const target = resolve(item.path);
      return [{
        id: typeof item.id === 'string' ? item.id : randomUUID(),
        path: target,
        title: typeof item.title === 'string' ? item.title : basename(target, extname(target)),
        artist: typeof item.artist === 'string' ? item.artist : '未知艺术家',
        album: typeof item.album === 'string' ? item.album : null,
        genre: typeof item.genre === 'string' ? item.genre : null,
        year: typeof item.year === 'number' && Number.isFinite(item.year) ? item.year : null,
        trackNumber: typeof item.trackNumber === 'number' && Number.isFinite(item.trackNumber) ? item.trackNumber : null,
        durationSeconds: typeof item.durationSeconds === 'number' && Number.isFinite(item.durationSeconds) ? item.durationSeconds : null,
        sampleRateHz: typeof item.sampleRateHz === 'number' && Number.isFinite(item.sampleRateHz) ? item.sampleRateHz : null,
        bitDepth: typeof item.bitDepth === 'number' && Number.isFinite(item.bitDepth) ? item.bitDepth : null,
        replayGainTrackDb: typeof item.replayGainTrackDb === 'number' && Number.isFinite(item.replayGainTrackDb) ? item.replayGainTrackDb : null,
        replayGainAlbumDb: typeof item.replayGainAlbumDb === 'number' && Number.isFinite(item.replayGainAlbumDb) ? item.replayGainAlbumDb : null,
        replayGainTrackPeak: typeof item.replayGainTrackPeak === 'number' && Number.isFinite(item.replayGainTrackPeak) && item.replayGainTrackPeak > 0 ? item.replayGainTrackPeak : null,
        replayGainAlbumPeak: typeof item.replayGainAlbumPeak === 'number' && Number.isFinite(item.replayGainAlbumPeak) && item.replayGainAlbumPeak > 0 ? item.replayGainAlbumPeak : null,
        format: typeof item.format === 'string' ? item.format : musicFormatLabel(target),
        artworkPath: typeof item.artworkPath === 'string' && existsSync(item.artworkPath) ? item.artworkPath : null,
        addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date().toISOString(),
      } satisfies MusicTrack];
    }) : [];
    const trackIds = new Set(tracks.map(track => track.id));
    const playlists = Array.isArray(raw.playlists) ? raw.playlists.flatMap((item: any) => {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') return [];
      return [{
        id: item.id, name: item.name.slice(0, 80),
        trackIds: Array.isArray(item.trackIds) ? item.trackIds.filter((id: unknown): id is string => typeof id === 'string' && trackIds.has(id)) : [],
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      } satisfies MusicPlaylist];
    }) : [];
    const playlistId = typeof raw.activePlaylistId === 'string' && playlists.some(item => item.id === raw.activePlaylistId)
      ? raw.activePlaylistId : null;
    const currentTrackId = typeof raw.currentTrackId === 'string' && trackIds.has(raw.currentTrackId) ? raw.currentTrackId : null;
    const rawVolume = Number(raw.volume);
    const repeat: MusicRepeatMode = raw.repeat === 'all' || raw.repeat === 'one' ? raw.repeat : 'off';
    musicState = {
      tracks, playlists, activePlaylistId: playlistId, currentTrackId,
      currentTime: Number.isFinite(Number(raw.currentTime)) ? Math.max(0, Number(raw.currentTime)) : 0,
      duration: 0, volume: Number.isFinite(rawVolume) ? Math.max(0, Math.min(1, rawVolume)) : 0.7,
      isPlaying: false, errorMessage: null, shuffle: raw.shuffle === true, repeat,
    };
    musicLastPersistAt = Date.now();
  } catch {
    musicState = { tracks: [], playlists: [], activePlaylistId: null, currentTrackId: null, currentTime: 0, duration: 0, volume: 0.7, isPlaying: false, errorMessage: null, shuffle: false, repeat: 'off' };
  }
}
function readMusicLyrics(trackId: string) {
  const track = musicState.tracks.find(item => item.id === String(trackId));
  if (!track || !existsSync(track.path)) return [];
  const sidecar = join(dirname(track.path), `${basename(track.path, extname(track.path))}.lrc`);
  try {
    const info = statSync(sidecar);
    if (!info.isFile() || info.size <= 0 || info.size > 1024 * 1024) return [];
    return parseLrc(readFileSync(sidecar, 'utf8'));
  } catch {
    return [];
  }
}
function publicMusicState(): MusicState {
  return {
    ...musicState,
    tracks: musicState.tracks.map(({ artworkPath, ...track }) => ({ ...track, hasArtwork: Boolean(artworkPath && existsSync(artworkPath)), missing: !existsSync(track.path) })),
    playlists: musicState.playlists.map(playlist => ({ ...playlist, trackIds: [...playlist.trackIds] })),
  };
}
function publishMusicState() { sendToWindows('music:state', publicMusicState()); }
function persistAndPublishMusicState() { persistMusicState(); publishMusicState(); }
function musicQueueIds() {
  const active = musicState.activePlaylistId ? musicState.playlists.find(item => item.id === musicState.activePlaylistId) : null;
  const ids = active ? active.trackIds : musicState.tracks.map(track => track.id);
  return ids.filter(id => musicState.tracks.some(track => track.id === id));
}
function importMusicPaths(paths: string[], addToActivePlaylist = true) {
  const existing = new Set(musicState.tracks.map(track => resolve(track.path).toLowerCase()));
  let added = 0, skipped = 0;
  for (const rawPath of paths) {
    try {
      const target = resolve(String(rawPath));
      if (!MUSIC_AUDIO_EXTENSIONS.has(extname(target).toLowerCase()) || !existsSync(target) || existing.has(target.toLowerCase())) { skipped++; continue; }
      const fileInfo = statSync(target);
      if (!fileInfo.isFile() || fileInfo.size <= 0) { skipped++; continue; }
      const metadata = readMusicMetadata(target);
      const id = randomUUID();
      let artworkPath: string | null = null;
      if (metadata.artwork) {
        try {
          const extension = metadata.artwork.mimeType.toLowerCase() === 'image/png' ? 'png' : metadata.artwork.mimeType.toLowerCase() === 'image/webp' ? 'webp' : metadata.artwork.mimeType.toLowerCase() === 'image/gif' ? 'gif' : 'jpg';
          const directory = join(app.getPath('userData'), 'music-artwork');
          mkdirSync(directory, { recursive: true });
          artworkPath = join(directory, `${id}.${extension}`);
          writeFileSync(artworkPath, metadata.artwork.data);
        } catch { artworkPath = null; }
      }
      const track: MusicTrack = {
        id, path: target, title: metadata.title ?? basename(target, extname(target)),
        artist: metadata.artist ?? '未知艺术家', album: metadata.album ?? null,
        genre: metadata.genre ?? null, year: metadata.year ?? null, trackNumber: metadata.trackNumber ?? null,
        durationSeconds: metadata.durationSeconds ?? null, sampleRateHz: metadata.sampleRateHz ?? null,
        bitDepth: metadata.bitDepth ?? null,
        replayGainTrackDb: metadata.replayGainTrackDb ?? null, replayGainAlbumDb: metadata.replayGainAlbumDb ?? null,
        replayGainTrackPeak: metadata.replayGainTrackPeak ?? null, replayGainAlbumPeak: metadata.replayGainAlbumPeak ?? null,
        format: musicFormatLabel(target), artworkPath,
        addedAt: new Date().toISOString(),
      };
      musicState.tracks.push(track);
      if (addToActivePlaylist && musicState.activePlaylistId) {
        const playlist = musicState.playlists.find(item => item.id === musicState.activePlaylistId);
        if (playlist) playlist.trackIds.push(track.id);
      }
      existing.add(target.toLowerCase()); added++;
    } catch { skipped++; }
  }
  if (added) persistAndPublishMusicState();
  return { added, skipped };
}
function importMusicPlaylist(filePath: string) {
  try {
    const info = statSync(filePath);
    if (!info.isFile() || info.size <= 0 || info.size > 8 * 1024 * 1024) {
      return { ok: false, added: 0, skipped: 0, message: 'M3U 文件为空或超过 8 MiB 限制' };
    }
    const entries = parseM3u(readFileSync(filePath, 'utf8'));
    const candidatePaths = entries.map(entry => isAbsolute(entry.location)
      ? resolve(entry.location)
      : resolve(dirname(filePath), entry.location));
    const imported = importMusicPaths(candidatePaths, false);
    const seen = new Set<string>();
    const trackIds: string[] = [];
    for (const candidate of candidatePaths) {
      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      const track = musicState.tracks.find(item => resolve(item.path).toLowerCase() === key);
      if (track) { seen.add(key); trackIds.push(track.id); }
    }
    if (!trackIds.length) {
      return { ok: false, added: imported.added, skipped: imported.skipped, message: 'M3U 中没有找到可用的本地音乐文件' };
    }
    const playlist: MusicPlaylist = {
      id: randomUUID(),
      name: basename(filePath, extname(filePath)).slice(0, 80) || '导入歌单',
      trackIds,
      createdAt: new Date().toISOString(),
    };
    musicState = { ...musicState, playlists: [...musicState.playlists, playlist], activePlaylistId: playlist.id };
    persistAndPublishMusicState();
    return { ok: true, added: imported.added, skipped: imported.skipped, playlistId: playlist.id, name: playlist.name };
  } catch (error) {
    return { ok: false, added: 0, skipped: 0, message: error instanceof Error ? error.message : String(error) };
  }
}
function scanMusicFolder(rootPath: string) {
  const pending = [resolve(rootPath)];
  const files: string[] = [];
  while (pending.length && files.length < MUSIC_FOLDER_SCAN_LIMIT) {
    const directory = pending.pop()!;
    let entries: import('node:fs').Dirent[];
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const target = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile() && MUSIC_AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(target);
        if (files.length >= MUSIC_FOLDER_SCAN_LIMIT) break;
      }
    }
  }
  return files;
}
function currentMusicTrackExists() {
  const track = musicState.tracks.find(item => item.id === musicState.currentTrackId);
  return Boolean(track && existsSync(track.path));
}
function advanceMusicTrack(ended: boolean) {
  const ids = musicQueueIds();
  if (!ids.length) { musicState = { ...musicState, currentTrackId: null, currentTime: 0, duration: 0, isPlaying: false }; return; }
  if (ended && musicState.repeat === 'one' && musicState.currentTrackId) {
    musicState = { ...musicState, currentTime: 0, isPlaying: true };
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('music:engine-command', { type: 'seek', seconds: 0, resume: true });
    return;
  }
  const currentIndex = ids.indexOf(musicState.currentTrackId ?? '');
  let nextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
  if (musicState.shuffle && ids.length > 1) {
    const candidates = ids.filter(id => id !== musicState.currentTrackId);
    musicState = { ...musicState, currentTrackId: candidates[Math.floor(Math.random() * candidates.length)] ?? ids[0], currentTime: 0, duration: 0, isPlaying: true };
    return;
  }
  if (nextIndex >= ids.length) {
    if (musicState.repeat === 'all') nextIndex = 0;
    else {
      musicState = { ...musicState, isPlaying: false, currentTime: 0 };
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('music:engine-command', { type: 'seek', seconds: 0 });
      return;
    }
  }
  const nextTrackId = ids[nextIndex];
  musicState = { ...musicState, currentTrackId: nextTrackId, currentTime: 0, duration: 0, isPlaying: true };
  if (nextTrackId === ids[currentIndex] && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('music:engine-command', { type: 'seek', seconds: 0, resume: true });
}
function handleMusicCommand(command: MusicCommand) {
  if (['play', 'toggle', 'next', 'previous', 'play-track', 'seek'].includes(command.type)) {
    musicState = { ...musicState, errorMessage: null };
  }
  switch (command.type) {
    case 'play': case 'toggle':
      if (musicState.isPlaying && command.type === 'toggle') musicState = { ...musicState, isPlaying: false };
      else {
        if (!musicState.currentTrackId) musicState = { ...musicState, currentTrackId: musicQueueIds()[0] ?? null, currentTime: 0 };
        musicState = { ...musicState, isPlaying: currentMusicTrackExists() };
      }
      break;
    case 'pause':
      musicState = { ...musicState, isPlaying: false };
      break;
    case 'next':
      advanceMusicTrack(false);
      break;
    case 'ended':
      advanceMusicTrack(true);
      break;
    case 'previous': {
      if (musicState.currentTime > 3 && currentMusicTrackExists()) {
        musicState = { ...musicState, currentTime: 0 };
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('music:engine-command', { type: 'seek', seconds: 0 });
        break;
      }
      const ids = musicQueueIds();
      const index = ids.indexOf(musicState.currentTrackId ?? '');
      const previousIndex = index > 0 ? index - 1 : musicState.repeat === 'all' && ids.length ? ids.length - 1 : index;
      const previousTrackId = ids[previousIndex] ?? musicState.currentTrackId;
      musicState = { ...musicState, currentTrackId: previousTrackId, currentTime: 0, duration: 0 };
      if (previousTrackId === musicState.currentTrackId && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('music:engine-command', { type: 'seek', seconds: 0 });
      break;
    }
    case 'seek': {
      const seconds = Number.isFinite(command.seconds) ? Math.max(0, Math.min(musicState.duration || command.seconds, command.seconds)) : 0;
      musicState = { ...musicState, currentTime: seconds };
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('music:engine-command', { type: 'seek', seconds });
      break;
    }
    case 'set-volume':
      musicState = { ...musicState, volume: Math.max(0, Math.min(1, Number.isFinite(command.volume) ? command.volume : musicState.volume)) };
      break;
    case 'toggle-shuffle':
      musicState = { ...musicState, shuffle: !musicState.shuffle };
      break;
    case 'cycle-repeat':
      musicState = { ...musicState, repeat: musicState.repeat === 'off' ? 'all' : musicState.repeat === 'all' ? 'one' : 'off' };
      break;
    case 'play-track':
      if (musicState.tracks.some(track => track.id === command.trackId && existsSync(track.path))) {
        const alreadySelected = musicState.currentTrackId === command.trackId;
        musicState = { ...musicState, currentTrackId: command.trackId, currentTime: 0, duration: 0, isPlaying: true };
        if (alreadySelected && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('music:engine-command', { type: 'seek', seconds: 0, resume: true });
      }
      break;
    case 'select-playlist': {
      const id = command.playlistId && musicState.playlists.some(item => item.id === command.playlistId) ? command.playlistId : null;
      const ids = id ? musicState.playlists.find(item => item.id === id)?.trackIds ?? [] : musicState.tracks.map(track => track.id);
      const currentTrackId = ids.includes(musicState.currentTrackId ?? '') ? musicState.currentTrackId : ids[0] ?? null;
      const alreadySelected = currentTrackId === musicState.currentTrackId;
      musicState = { ...musicState, activePlaylistId: id, currentTrackId, currentTime: 0, duration: 0, isPlaying: false };
      if (alreadySelected && currentTrackId && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('music:engine-command', { type: 'seek', seconds: 0 });
      break;
    }
    case 'create-playlist': {
      const name = command.name.trim().slice(0, 80);
      if (name) {
        const playlist: MusicPlaylist = { id: randomUUID(), name, trackIds: [], createdAt: new Date().toISOString() };
        musicState = { ...musicState, playlists: [...musicState.playlists, playlist], activePlaylistId: playlist.id, currentTrackId: null, currentTime: 0, duration: 0, isPlaying: false };
      }
      break;
    }
    case 'rename-playlist': {
      const name = command.name.trim().slice(0, 80);
      if (name) musicState = { ...musicState, playlists: musicState.playlists.map(item => item.id === command.playlistId ? { ...item, name } : item) };
      break;
    }
    case 'delete-playlist': {
      const playlists = musicState.playlists.filter(item => item.id !== command.playlistId);
      musicState = { ...musicState, playlists, activePlaylistId: musicState.activePlaylistId === command.playlistId ? null : musicState.activePlaylistId };
      break;
    }
    case 'add-to-playlist': {
      const playlist = musicState.playlists.find(item => item.id === command.playlistId);
      if (playlist && musicState.tracks.some(track => track.id === command.trackId) && !playlist.trackIds.includes(command.trackId)) {
        musicState = { ...musicState, playlists: musicState.playlists.map(item => item.id === command.playlistId ? { ...item, trackIds: [...item.trackIds, command.trackId] } : item) };
      }
      break;
    }
    case 'remove-track': {
      const tracks = musicState.tracks.filter(item => item.id !== command.trackId);
      const playlists = musicState.playlists.map(item => ({ ...item, trackIds: item.trackIds.filter(id => id !== command.trackId) }));
      musicState = { ...musicState, tracks, playlists, currentTrackId: musicState.currentTrackId === command.trackId ? null : musicState.currentTrackId, currentTime: musicState.currentTrackId === command.trackId ? 0 : musicState.currentTime, isPlaying: musicState.currentTrackId === command.trackId ? false : musicState.isPlaying };
      break;
    }
    case 'remove-from-playlist': {
      const playlist = musicState.playlists.find(item => item.id === command.playlistId);
      if (playlist) {
        const trackIds = playlist.trackIds.filter(id => id !== command.trackId);
        const removedCurrent = musicState.activePlaylistId === command.playlistId && musicState.currentTrackId === command.trackId;
        musicState = {
          ...musicState,
          playlists: musicState.playlists.map(item => item.id === command.playlistId ? { ...item, trackIds } : item),
          currentTrackId: removedCurrent ? trackIds[0] ?? null : musicState.currentTrackId,
          currentTime: removedCurrent ? 0 : musicState.currentTime,
          duration: removedCurrent ? 0 : musicState.duration,
          isPlaying: removedCurrent ? false : musicState.isPlaying,
        };
      }
      break;
    }
    case 'move-track': {
      const playlist = musicState.playlists.find(item => item.id === command.playlistId);
      if (playlist) {
        const index = playlist.trackIds.indexOf(command.trackId);
        const target = index + (command.direction === 'up' ? -1 : 1);
        if (index >= 0 && target >= 0 && target < playlist.trackIds.length) {
          const trackIds = [...playlist.trackIds];
          [trackIds[index], trackIds[target]] = [trackIds[target], trackIds[index]];
          musicState = { ...musicState, playlists: musicState.playlists.map(item => item.id === command.playlistId ? { ...item, trackIds } : item) };
        }
      }
      break;
    }
  }
  persistAndPublishMusicState();
  return publicMusicState();
}
function nativeWindowHandle(win: BrowserWindow | null): string | null {
  if (!win || win.isDestroyed()) return null;
  try {
    const handle = win.getNativeWindowHandle();
    return handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : handle.readUInt32LE(0).toString();
  } catch { return null; }
}

function applyWidgetZOrder() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.setAlwaysOnTop(!widgetFullscreenActive && widgetAlwaysOnTopEnabled());
  if (widgetDetailWindow && !widgetDetailWindow.isDestroyed()) widgetDetailWindow.setAlwaysOnTop(!widgetFullscreenActive && widgetAlwaysOnTopEnabled());
}

function stopWidgetFullscreenMonitor() {
  const child = widgetFullscreenMonitor;
  widgetFullscreenMonitor = null;
  if (child && !child.killed) { try { child.kill(); } catch { /* process already exited */ } }
  if (widgetFullscreenActive) { widgetFullscreenActive = false; applyWidgetZOrder(); }
}

function startWidgetFullscreenMonitor() {
  stopWidgetFullscreenMonitor();
  if (process.platform !== 'win32' || currentSettings.widgetSmartFullscreen === false || !widgetWindow || widgetWindow.isDestroyed()) {
    applyWidgetZOrder();
    return;
  }
  const handle = nativeWindowHandle(widgetWindow);
  if (!handle) { log('Widget fullscreen monitor skipped: native window handle unavailable'); return; }
  const scriptPath = app.isPackaged
    ? join(process.resourcesPath, 'widget-window-monitor.ps1')
    : join(app.getAppPath(), 'build', 'widget-window-monitor.ps1');
  if (!existsSync(scriptPath)) { log(`Widget fullscreen monitor script missing: ${scriptPath}`); return; }
  try {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-WidgetHandle', handle], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    widgetFullscreenMonitor = child;
    if (child.stdout) createInterface({ input: child.stdout }).on('line', line => {
      if (child !== widgetFullscreenMonitor || currentSettings.widgetSmartFullscreen === false || !widgetWindow || widgetWindow.isDestroyed()) return;
      try {
        const raw = JSON.parse(line) as Record<string, unknown>;
        const n = (key: string) => Number(raw[key]);
        const sample = {
          handle: String(raw.handle ?? ''),
          rect: { left: n('left'), top: n('top'), right: n('right'), bottom: n('bottom') },
          monitor: { left: n('monitorLeft'), top: n('monitorTop'), right: n('monitorRight'), bottom: n('monitorBottom') },
          widgetMonitor: { left: n('widgetMonitorLeft'), top: n('widgetMonitorTop'), right: n('widgetMonitorRight'), bottom: n('widgetMonitorBottom') },
        };
        if (Object.values(sample.rect).some(value => !Number.isFinite(value)) || Object.values(sample.monitor).some(value => !Number.isFinite(value)) || Object.values(sample.widgetMonitor).some(value => !Number.isFinite(value))) return;
        const ownHandles = [nativeWindowHandle(widgetWindow), nativeWindowHandle(mainWindow)].filter((value): value is string => Boolean(value));
        const active = isFullscreenOnWidgetDisplay(sample, ownHandles);
        if (active !== widgetFullscreenActive) {
          widgetFullscreenActive = active;
          applyWidgetZOrder();
          log(`Widget smart-fullscreen ${active ? 'yielded topmost to fullscreen window' : 'restored configured z-order'}`);
        }
      } catch { /* ignore partial/non-JSON diagnostics */ }
    });
    if (child.stderr) createInterface({ input: child.stderr }).on('line', line => { if (line.trim()) log(`Widget fullscreen monitor: ${line.trim()}`); });
    child.on('error', error => { if (child === widgetFullscreenMonitor) { widgetFullscreenMonitor = null; widgetFullscreenActive = false; applyWidgetZOrder(); } log(`Widget fullscreen monitor failed: ${error.message}`); });
    child.on('exit', code => { if (child === widgetFullscreenMonitor) { widgetFullscreenMonitor = null; widgetFullscreenActive = false; applyWidgetZOrder(); } log(`Widget fullscreen monitor exited (${code ?? 'signal'})`); });
  } catch (error) {
    widgetFullscreenMonitor = null;
    widgetFullscreenActive = false;
    applyWidgetZOrder();
    log(`Could not start widget fullscreen monitor: ${String(error)}`);
  }
}

function widgetAlwaysOnTopEnabled() {
  return currentSettings.widgetAlwaysOnTop !== undefined
    ? currentSettings.widgetAlwaysOnTop !== false
    : currentSettings.alwaysOnTop !== false;
}
function publishWidgetEdgeState() {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.webContents.send('widget:edge-state', { edge: widgetDockEdge, hidden: widgetEdgeHidden });
}
const WEATHER_SOURCES = new Set(['open-meteo', 'qweather', 'weatherapi', 'openweather']);
function weatherKeyMap(): Record<string, string> {
  const raw = currentSettings.weatherApiKeysEncrypted;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string> : {};
}
function readWeatherApiKey(source: string): string | null {
  if (!WEATHER_SOURCES.has(source) || source === 'open-meteo' || !safeStorage.isEncryptionAvailable()) return null;
  const encrypted = weatherKeyMap()[source];
  if (typeof encrypted !== 'string' || !encrypted) return null;
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')); } catch { return null; }
}
function saveWeatherApiKey(source: string, key: string) {
  if (!WEATHER_SOURCES.has(source) || source === 'open-meteo') return { ok: false, message: '天气来源不需要或不支持单独设置密钥' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: 'Windows 安全存储不可用，未保存密钥' };
  const keys = { ...weatherKeyMap() };
  if (key.trim()) keys[source] = safeStorage.encryptString(key.trim()).toString('base64');
  else delete keys[source];
  saveSettings({ weatherApiKeysEncrypted: keys });
  void refreshWeather();
  return { ok: true, configured: Boolean(keys[source]) };
}
function getPublicSettings() {
  const visible = { ...currentSettings };
  delete visible.weatherApiKeysEncrypted;
  const keys = weatherKeyMap();
  return { ...visible, weatherApiKeyConfigured: Object.fromEntries([...WEATHER_SOURCES].map(source => [source, source === 'open-meteo' || typeof keys[source] === 'string'])) };
}

function saveSettings(next: Record<string, unknown>) {
  const previous = { ...currentSettings };
  currentSettings = { ...currentSettings, ...next };
  if (previous.usbDisplayMode !== currentSettings.usbDisplayMode && currentSettings.usbDisplayMode === 'music-only') {
    usbDisplayRestorePending = false;
    closeUsbDisplayWindow();
    log('USB display output hidden; shared Music Service remains active');
  }
  const file = getSettingsPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(currentSettings, null, 2), 'utf8');
  if (previous.refreshMs !== currentSettings.refreshMs && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => void pollSnapshot(), Math.max(750, Number(currentSettings.refreshMs ?? 1000)));
  }
  if (previous.alwaysOnTop !== currentSettings.alwaysOnTop) {
    mainWindow?.setAlwaysOnTop(currentSettings.alwaysOnTop !== false);
  }
  if (previous.widgetAlwaysOnTop !== currentSettings.widgetAlwaysOnTop || previous.alwaysOnTop !== currentSettings.alwaysOnTop) {
    applyWidgetZOrder();
  }
  if (previous.widgetSmartFullscreen !== currentSettings.widgetSmartFullscreen) {
    if (currentSettings.widgetSmartFullscreen === false) stopWidgetFullscreenMonitor(); else startWidgetFullscreenMonitor();
  }
  if (previous.widgetAutoHide === true && currentSettings.widgetAutoHide === false && widgetEdgeHidden) revealWidgetFromEdge();
  if (previous.weatherLocation !== currentSettings.weatherLocation || previous.weatherSource !== currentSettings.weatherSource) {
    lastWeather = null;
    sendToWindows('weather:update', null);
    void refreshWeather();
  }
  if (previous.orientation !== currentSettings.orientation && widgetWindow && !widgetWindow.isDestroyed()) {
    // The compact HUD has its own fixed native bounds. Hide the detached details
    // surface before changing orientation, then resize only the compact window.
    hideWidgetDetail();
    if (widgetEdgeHidden) revealWidgetFromEdge();
    const currentBounds = widgetWindow.getBounds();
    const display = screen.getDisplayMatching(currentBounds);
    const layout = resizeWidgetForOrientation(
      currentBounds,
      display.workArea,
      currentSettings.orientation === 'vertical' ? 'vertical' : 'horizontal',
      widgetDockEdge,
    );
    widgetRestoreBounds = null;
    widgetRestoreMinSize = null;
    widgetEdgeHidden = false;
    widgetWindow.setMinimumSize(layout.minWidth, layout.minHeight);
    widgetWindow.setBounds(layout.bounds, false);
    if (currentSettings.orientation !== 'vertical' && widgetCalendarWindow && !widgetCalendarWindow.isDestroyed()) {
      widgetCalendarWindow.close();
    }
    publishWidgetEdgeState();
  }
  // Settings changed from either the main page or a native HUD window.
  // Keep all renderer copies in sync without coupling the compact bar geometry to the details card.
  const publicSettings = getPublicSettings();
  for (const win of [mainWindow, widgetWindow, widgetDetailWindow, usbDisplayWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('app:settings-updated', publicSettings);
  }
  return currentSettings;
}
function log(message: string) {
  try {
    appLogger ??= new RotatingLogger(join(app.getPath('userData'), 'logs'));
    appLogger.log(message);
  } catch { /* startup logging must never crash the app */ }
}
function logThrottled(key: string, message: string, intervalMs = 5_000) {
  try {
    appLogger ??= new RotatingLogger(join(app.getPath('userData'), 'logs'));
    appLogger.log(message, key, intervalMs);
  } catch { /* startup logging must never crash the app */ }
}
function sendToWindows(channel: string, payload: unknown) {
  for (const win of [mainWindow, widgetWindow, widgetDetailWindow, usbDisplayWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}
function setServiceStatus(
  phase: ServiceStatus['phase'],
  reason: ServiceStatus['reason'],
  message: string,
  extra: { pid?: number | null; retryInMs?: number | null } = {},
) {
  const next: ServiceStatus = {
    phase,
    reason,
    message,
    at: new Date().toISOString(),
    pid: extra.pid ?? serviceProcess?.pid ?? null,
    retryInMs: extra.retryInMs ?? null,
  };
  const previous = lastServiceStatus;
  lastServiceStatus = next;
  if (
    previous.phase === next.phase &&
    previous.reason === next.reason &&
    previous.message === next.message &&
    previous.pid === next.pid &&
    previous.retryInMs === next.retryInMs
  ) return;

  try {
    appLogger ??= new RotatingLogger(join(app.getPath('userData'), 'logs'));
    appLogger.logTransition('service-state', `Service state ${phase}/${reason}: ${message}`);
  } catch { /* logging must never crash the app */ }
  sendToWindows('service:status', next);
  sendToWindows('service:state', phase === 'online' ? 'online' : 'offline');
}
function serviceExecutable() { return join(process.resourcesPath, 'hardware-service', 'HardwareService.exe'); }
function isPortListening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}
function stopService(reason: string) {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  const child = serviceProcess;
  serviceProcess = null;
  serviceOwned = false;
  if (!child) return;

  log(`Stopping owned hardware service (${reason}), pid=${child.pid ?? 'unknown'}`);
  if (process.platform === 'win32' && child.pid) {
    try {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', () => { try { child.kill(); } catch { /* already gone */ } });
    } catch {
      try { child.kill(); } catch { /* already gone */ }
    }
  } else {
    try { child.kill(); } catch { /* already gone */ }
  }
}
function scheduleServiceRestart(reason: string) {
  if (quitting) return;
  if (restartTimer) return;

  const delay = restartDelayMs(restartAttempt);
  if (delay === null) {
    setServiceStatus('failed', 'exited', `硬件服务多次启动失败（${reason}），请检查日志后重启应用`);
    return;
  }

  restartAttempt += 1;
  setServiceStatus('restarting', 'restarting', `硬件服务${reason}，${Math.round(delay / 1000)} 秒后尝试重启（第 ${restartAttempt} 次）`, { retryInMs: delay });
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!quitting) void startService();
  }, delay);
}
function attachServiceOutput(child: ChildProcess) {
  if (child.stdout) {
    createInterface({ input: child.stdout }).on('line', line => {
      if (line.trim()) log(`SERVICE: ${line}`);
    });
  }
  if (child.stderr) {
    createInterface({ input: child.stderr }).on('line', line => {
      if (line.trim()) log(`SERVICE ERROR: ${line}`);
    });
  }
}
async function startService(): Promise<void> {
  if (serviceProcess) return;

  setServiceStatus('starting', 'starting', '正在启动本机硬件服务…');
  const health = await apiResult<{ ok: boolean }>('/api/health', 1_200);
  if (health.ok && health.data?.ok) {
    serviceOwned = false;
    restartAttempt = 0;
    setServiceStatus('online', 'ok', '已连接到正在运行的硬件服务', { pid: null });
    return;
  }

  if (await isPortListening(SERVICE_PORT)) {
    log(`Port ${SERVICE_PORT} is open but /api/health failed; not spawning a second service`);
    setServiceStatus('offline', 'port-occupied', `端口 ${SERVICE_PORT} 已被占用，但健康检查失败；请关闭残留的 HardwareService 后重试`);
    scheduleServiceRestart('端口被占用');
    return;
  }

  const env = { ...process.env, ASPNETCORE_URLS: SERVICE_URL, ASPNETCORE_ENVIRONMENT: 'Production' };
  const exe = serviceExecutable();
  let child: ChildProcess;

  try {
    if (app.isPackaged && existsSync(exe)) {
      child = spawn(exe, ['--urls', SERVICE_URL], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
      log(`Starting hardware service executable: ${exe} (pid=${child.pid ?? 'unknown'})`);
    } else if (isDev) {
      const project = join(app.getAppPath(), 'HardwareService', 'HardwareService.csproj');
      child = spawn('dotnet', ['run', '--project', project, '--no-launch-profile', '--', '--urls', SERVICE_URL], { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
      log(`Starting hardware service through dotnet: ${project} (pid=${child.pid ?? 'unknown'})`);
    } else {
      setServiceStatus('failed', 'no-binary', `未找到硬件服务程序：${exe}`);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Hardware service spawn failed: ${message}`);
    setServiceStatus('offline', 'spawn-failed', `硬件服务启动失败：${message}`);
    scheduleServiceRestart('启动失败');
    return;
  }

  serviceProcess = child;
  serviceOwned = true;
  serviceStartedAt = Date.now();
  setServiceStatus('starting', 'starting', '硬件服务启动中…', { pid: child.pid ?? null });
  attachServiceOutput(child);

  child.once('exit', (code, signal) => {
    if (serviceProcess !== child) return;
    const uptime = serviceStartedAt ? `${Date.now() - serviceStartedAt}ms` : 'unknown';
    serviceProcess = null;
    serviceOwned = false;
    snapshots.invalidate();
    log(`Hardware service exited: code=${code ?? 'null'} signal=${signal ?? 'null'} uptime=${uptime}`);
    if (quitting) {
      setServiceStatus('offline', 'stopped', '硬件服务已停止');
      return;
    }
    setServiceStatus('offline', 'exited', `硬件服务已退出（code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）`);
    scheduleServiceRestart('意外退出');
  });

  child.once('error', error => {
    if (serviceProcess === child) {
      serviceProcess = null;
      serviceOwned = false;
    }
    snapshots.invalidate();
    log(`Hardware service spawn error: ${error.message}`);
    if (quitting) return;
    setServiceStatus('offline', 'spawn-failed', `硬件服务启动失败：${error.message}`);
    scheduleServiceRestart('启动失败');
  });
}
function apiTimeoutMs(path: string): number {
  if (path.includes('/api/turing/patches')) return 60_000;
  if (path.startsWith('/api/weather')) return 25_000;
  if (path.includes('/api/turing/devices') || path.includes('/api/devices')) return 12_000;
  if (path === '/api/snapshot') return SNAPSHOT_TIMEOUT_MS;
  return 4_500;
}
async function apiResult<T>(path: string, timeoutMs = apiTimeoutMs(path), init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: SnapshotError }> {
  try {
    const response = await fetch(`${SERVICE_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      const error: SnapshotError = { kind: 'http', message: `硬件服务返回 HTTP ${response.status}`, status: response.status };
      logThrottled(`api:${path}:http:${response.status}`, `API ${path}: ${error.message}`);
      return { ok: false, error };
    }
    return { ok: true, data: await response.json() as T };
  } catch (error) {
    const classified = classifyFetchError(error);
    logThrottled(`api:${path}:${classified.kind}`, `API ${path}: ${classified.message}`);
    return { ok: false, error: classified };
  }
}
async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  const result = await apiResult<T>(path, apiTimeoutMs(path), init);
  return result.ok ? result.data : null;
}
async function waitForService(): Promise<boolean> {
  for (let i = 0; i < 24; i++) {
    if (quitting) return false;
    const result = await apiResult<{ ok: boolean }>('/api/health', 1_200);
    if (result.ok && result.data?.ok) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}
function statusForSnapshotError(error: SnapshotError): Pick<ServiceStatus, 'phase' | 'reason' | 'message'> {
  if (error.kind === 'timeout') {
    return { phase: 'degraded', reason: 'timeout', message: '硬件服务仍在运行，但快照请求超过 6 秒未返回' };
  }
  if (error.kind === 'http') {
    return { phase: 'degraded', reason: 'http', message: `硬件服务返回错误：HTTP ${error.status ?? '未知'}` };
  }
  if (error.kind === 'parse') {
    return { phase: 'degraded', reason: 'parse', message: '硬件服务返回了无法解析的数据' };
  }
  if (error.kind === 'unreachable') {
    return { phase: 'offline', reason: 'unreachable', message: '无法连接 127.0.0.1:18765，服务可能未启动或已退出' };
  }
  return { phase: 'degraded', reason: 'http', message: error.message };
}
async function getSnapshotResult(options: { force?: boolean; maxAgeMs?: number } = {}): Promise<SnapshotResult> {
  const result = await snapshots.get(async () => {
    const response = await apiResult<SystemSnapshot>('/api/snapshot', SNAPSHOT_TIMEOUT_MS);
    return response.ok ? response : { ok: false as const, error: response.error };
  }, options);

  if (result.error) {
    const inProgress = lastServiceStatus.phase === 'starting' || lastServiceStatus.phase === 'restarting';
    if (!inProgress) {
      const status = statusForSnapshotError(result.error);
      setServiceStatus(status.phase, status.reason, status.message);
    }
  } else {
    const stable = !serviceProcess || serviceStartedAt === 0 || Date.now() - serviceStartedAt >= SERVICE_STABLE_MS;
    if (stable) restartAttempt = 0;
    setServiceStatus('online', 'ok', '硬件服务在线');
  }

  return {
    snapshot: result.data,
    error: result.error,
    stale: result.stale,
    ageMs: result.ageMs,
    status: lastServiceStatus,
  };
}
async function pollSnapshot() {
  const result = await getSnapshotResult();
  if (result.snapshot && !result.error) sendToWindows('telemetry:update', result.snapshot);
}
async function refreshWeather() {
  const district = currentSettings.weatherLocation === 'wujiang' ? 'wujiang' : 'suzhou';
  const source = typeof currentSettings.weatherSource === 'string' && WEATHER_SOURCES.has(currentSettings.weatherSource)
    ? currentSettings.weatherSource : 'open-meteo';
  const apiKey = readWeatherApiKey(source);
  if (source !== 'open-meteo' && !apiKey) {
    lastWeather = null;
    logThrottled('weather:key-missing', `Weather source ${source} requires an API key; configure it in Settings`, 60_000);
    sendToWindows('weather:update', null);
    return;
  }
  const result = await api('/api/weather', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: district, source, apiKey }),
  });
  if (result) {
    lastWeather = result;
    if (weatherRetryTimer) { clearTimeout(weatherRetryTimer); weatherRetryTimer = null; }
    logThrottled('weather:success', `Weather updated for ${district} using ${source}`, 15 * 60 * 1000);
  } else {
    logThrottled('weather:unavailable', `Weather API returned no data for ${district} using ${source}; retaining last valid data and retrying`, 30_000);
    if (!lastWeather && !weatherRetryTimer && !quitting) {
      weatherRetryTimer = setTimeout(() => { weatherRetryTimer = null; void refreshWeather(); }, 45_000);
    }
  }
  sendToWindows('weather:update', lastWeather);
}

function pluginDirectory() {
  const dir = join(app.getPath('userData'), 'plugins'); mkdirSync(dir, { recursive: true }); return dir;
}
function listPlugins() {
  const dir = pluginDirectory(); const enabled = Array.isArray(currentSettings.enabledPlugins) ? currentSettings.enabledPlugins as string[] : [];
  return readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    try {
      const manifestPath = join(dir, entry.name, 'plugin.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (!/^[a-z0-9][a-z0-9.-]{1,63}$/i.test(manifest.id) || typeof manifest.name !== 'string') return [];
      return [{ ...manifest, enabled: enabled.includes(manifest.id) }];
    } catch { return []; }
  });
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}
function createTray() {
  if (tray) return;
  const iconPath = join(app.getAppPath(), 'build', 'tray.png');
  const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('NexusMonitor');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主面板', click: () => revealMainWindow() },
    { label: '显示悬浮导航', click: () => toggleWidget(true) },
    { type: 'separator' },
    { label: '退出 NexusMonitor', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => revealMainWindow());
}
function showMainWindowAfterFirstPaint() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindowNativeReady || !mainWindowRendererReady) return;
  if (!app.getLoginItemSettings().wasOpenedAtLogin) { mainWindow.setSkipTaskbar(false); mainWindow.show(); }
}
function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.setSkipTaskbar(false); mainWindow.show(); return; }
  mainWindowNativeReady = false;
  mainWindowRendererReady = false;
  const area = screen.getPrimaryDisplay().workArea;
  const layout = fitWindowToWorkArea(area, {
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    margin: 24,
    horizontalAnchor: 'center',
    verticalAnchor: 'center',
  });
  mainWindow = new BrowserWindow({
    ...layout,
    frame: false, show: false, backgroundColor: '#0a1018', title: 'NexusMonitor',
    autoHideMenuBar: true, alwaysOnTop: currentSettings.alwaysOnTop !== false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  if (isDev) void mainWindow.loadURL('http://127.0.0.1:5173');
  else void mainWindow.loadFile(join(app.getAppPath(), 'dist', 'index.html'));
  const thisMainWindow = mainWindow;
  mainWindow.once('ready-to-show', () => {
    if (mainWindow !== thisMainWindow || thisMainWindow.isDestroyed()) return;
    mainWindowNativeReady = true;
    log('Main renderer native first frame ready');
    showMainWindowAfterFirstPaint();
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => log(`Main renderer load failed: ${code} ${description}`));
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => log(`Renderer console level=${level} ${message} (${sourceId}:${line})`));
  mainWindow.webContents.on('render-process-gone', (_event, details) => log(`Main renderer exited: ${JSON.stringify(details)}`));
  mainWindow.on('close', (event) => {
    // Turing frame rendering is owned by this long-lived renderer. If the HUD
    // remains on screen, closing the visible dashboard must hide (not destroy)
    // this renderer so USB frames and weather-clock time continue to refresh.
    if (!quitting) {
      event.preventDefault();
      // Hide rather than destroy: the tray, HUD and single shared audio engine
      // remain alive. Electron removes a hidden window from the taskbar; the
      // explicit flag also covers Windows taskbar recreation after display changes.
      mainWindow?.setSkipTaskbar(true);
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; mainWindowNativeReady = false; mainWindowRendererReady = false; });
}
function clearWidgetDetailTimers() {
  if (widgetDetailHideTimer) clearTimeout(widgetDetailHideTimer);
  if (widgetDetailFadeTimer) clearTimeout(widgetDetailFadeTimer);
  widgetDetailHideTimer = null;
  widgetDetailFadeTimer = null;
}

function publishWidgetDetailState(visible: boolean) {
  for (const win of [widgetWindow, widgetDetailWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('widget:detail-state', visible);
  }
}

function cancelWidgetDetailAutoHide() {
  clearWidgetDetailTimers();
  if (widgetDetailWindow && !widgetDetailWindow.isDestroyed()) {
    widgetDetailWindow.webContents.send('widget:detail-fade-cancel');
  }
}

function cursorInsideWindow(win: BrowserWindow | null, point: { x: number; y: number }) {
  if (!win || win.isDestroyed() || !win.isVisible()) return false;
  const b = win.getBounds();
  return point.x >= b.x && point.x < b.x + b.width && point.y >= b.y && point.y < b.y + b.height;
}

function scheduleWidgetDetailAutoHide() {
  if (!widgetDetailRequestedVisible) return;
  clearWidgetDetailTimers();
  widgetDetailHideTimer = setTimeout(() => {
    widgetDetailHideTimer = null;
    if (!widgetDetailRequestedVisible) return;
    const point = screen.getCursorScreenPoint();
    // Native enter/leave events can arrive in either order while moving between
    // adjacent windows; the screen-space check prevents hiding under the pointer.
    if (cursorInsideWindow(widgetWindow, point) || cursorInsideWindow(widgetDetailWindow, point)) {
      scheduleWidgetDetailAutoHide();
      return;
    }
    widgetDetailWindow?.webContents.send('widget:detail-fade-out');
    widgetDetailFadeTimer = setTimeout(() => {
      widgetDetailFadeTimer = null;
      hideWidgetDetail();
    }, 180);
  }, 2000);
}

function detailWindowBounds() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return null;
  const compact = widgetWindow.getBounds();
  const area = screen.getDisplayMatching(compact).workArea;
  return calculateWidgetDetailLayout(
    compact,
    area,
    currentSettings.orientation === 'vertical' ? 'vertical' : 'horizontal',
  ).bounds;
}

function showReadyWidgetDetail() {
  if (!widgetDetailRequestedVisible || !widgetDetailWindow || widgetDetailWindow.isDestroyed() || !widgetDetailReady) return;
  const bounds = detailWindowBounds();
  if (bounds) widgetDetailWindow.setBounds(bounds, false);
  widgetDetailWindow.showInactive();
  // The detail window is adjacent, never underneath the compact bar.
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.moveTop();
  publishWidgetDetailState(true);
}

function updateWidgetDetailReadiness(detail: BrowserWindow) {
  if (widgetDetailWindow !== detail || detail.isDestroyed() || widgetDetailReady) return;
  if (!widgetDetailNativeReady || !widgetDetailRendererReady) return;
  widgetDetailReady = true;
  log('Widget detail renderer committed and painted its first UI frame');
  // The renderer handshake proves DOM paint; allow one short compositor turn
  // before exposing the transparent native window to avoid a blank first show.
  setTimeout(() => {
    if (widgetDetailWindow !== detail || detail.isDestroyed() || !widgetDetailReady) return;
    showReadyWidgetDetail();
  }, 80);
}

function createWidgetDetailWindow() {
  const bounds = detailWindowBounds();
  if (!bounds) return false;
  const detail = new BrowserWindow({
    ...bounds,
    frame: false, transparent: true, backgroundColor: '#00000000', show: false,
    resizable: false, movable: false, hasShadow: false, skipTaskbar: true,
    alwaysOnTop: widgetAlwaysOnTopEnabled(),
    // BrowserWindowConstructorOptions (not WebPreferences): keep the hidden
    // renderer painting so Electron can emit ready-to-show after its first frame.
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,
    },
  });
  widgetDetailWindow = detail;
  widgetDetailReady = false;
  widgetDetailNativeReady = false;
  widgetDetailRendererReady = false;

  // Electron's ready-to-show only confirms a native Chromium frame. It can
  // precede React's concurrent root commit, leaving this transparent window
  // visually empty. Also require an explicit post-commit/post-paint handshake
  // from WidgetView before exposing the detached detail surface.
  detail.once('ready-to-show', () => {
    if (widgetDetailWindow !== detail || detail.isDestroyed()) return;
    widgetDetailNativeReady = true;
    log('Widget detail native first frame ready');
    updateWidgetDetailReadiness(detail);
  });
  detail.webContents.on('did-fail-load', (_event, code, description) => log(`Widget detail renderer load failed: ${code} ${description}`));
  detail.webContents.on('did-finish-load', () => log('Widget detail document load finished'));
  detail.webContents.on('render-process-gone', (_event, details) => {
    if (widgetDetailWindow === detail) {
      widgetDetailReady = false;
      widgetDetailNativeReady = false;
      widgetDetailRendererReady = false;
    }
    log(`Widget detail renderer exited: ${JSON.stringify(details)}`);
  });
  detail.on('closed', () => {
    if (widgetDetailWindow !== detail) return;
    widgetDetailWindow = null;
    widgetDetailReady = false;
    widgetDetailNativeReady = false;
    widgetDetailRendererReady = false;
    widgetDetailRequestedVisible = false;
    clearWidgetDetailTimers();
    publishWidgetDetailState(false);
  });
  detail.webContents.on('context-menu', event => event.preventDefault());

  // Register readiness/failure listeners before starting navigation so the
  // initial render event cannot race with listener installation.
  if (isDev) void detail.loadURL('http://127.0.0.1:5173/?widget=1&widget-detail=1');
  else void detail.loadFile(join(app.getAppPath(), 'dist', 'index.html'), { query: { widget: '1', 'widget-detail': '1' } });
  return true;
}

function repositionWidgetDetailWindow() {
  if (!widgetDetailRequestedVisible || !widgetDetailWindow || widgetDetailWindow.isDestroyed()) return;
  const bounds = detailWindowBounds();
  if (bounds) widgetDetailWindow.setBounds(bounds, false);
}

function hideWidgetDetail() {
  clearWidgetDetailTimers();
  widgetDetailRequestedVisible = false;
  if (widgetDetailWindow && !widgetDetailWindow.isDestroyed()) widgetDetailWindow.hide();
  publishWidgetDetailState(false);
  return true;
}

function setWidgetExpanded(expanded: boolean) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return false;
  if (!expanded) return hideWidgetDetail();
  if (widgetEdgeHidden) revealWidgetFromEdge();
  const bounds = detailWindowBounds();
  if (!bounds) return false;
  widgetDetailRequestedVisible = true;
  cancelWidgetDetailAutoHide();
  if (!widgetDetailWindow || widgetDetailWindow.isDestroyed()) {
    if (!createWidgetDetailWindow()) return false;
  } else {
    widgetDetailWindow.setBounds(bounds, false);
    showReadyWidgetDetail();
  }
  publishWidgetDetailState(true);
  return true;
}

function openWidgetCalendar() {
  if (currentSettings.orientation !== 'vertical' || !widgetWindow || widgetWindow.isDestroyed()) return false;
  if (widgetEdgeHidden) revealWidgetFromEdge();
  if (widgetCalendarWindow && !widgetCalendarWindow.isDestroyed()) {
    if (widgetCalendarWindow.isMinimized()) widgetCalendarWindow.restore();
    widgetCalendarWindow.show();
    widgetCalendarWindow.focus();
    return true;
  }

  const parentWidget = widgetWindow;
  const widgetBounds = parentWidget.getBounds();
  const display = screen.getDisplayMatching(widgetBounds);
  const area = display.workArea;
  const layout = fitWindowToWorkArea(area, {
    width: 440, height: 670, minWidth: 390, minHeight: 540,
    margin: 12, horizontalAnchor: 'right', verticalAnchor: 'center',
  });
  const leftX = widgetBounds.x - layout.width - 12;
  const rightX = widgetBounds.x + widgetBounds.width + 12;
  const x = leftX >= area.x + 6
    ? leftX
    : Math.max(area.x + 6, Math.min(rightX, area.x + area.width - layout.width - 6));
  const preferredY = widgetBounds.y + widgetBounds.height - layout.height - 12;
  const y = Math.max(area.y + 6, Math.min(preferredY, area.y + area.height - layout.height - 6));

  widgetCalendarWindow = new BrowserWindow({
    ...layout, x, y,
    frame: false, transparent: true, backgroundColor: '#00000000', show: false,
    resizable: true, movable: true, hasShadow: true, skipTaskbar: true,
    alwaysOnTop: widgetAlwaysOnTopEnabled(), parent: parentWidget,
    title: 'NexusMonitor 中国日历',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const thisCalendar = widgetCalendarWindow;
  if (isDev) void thisCalendar.loadURL('http://127.0.0.1:5173/?widget-calendar=1');
  else void thisCalendar.loadFile(join(app.getAppPath(), 'dist', 'index.html'), { query: { 'widget-calendar': '1' } });
  thisCalendar.once('ready-to-show', () => { if (!thisCalendar.isDestroyed()) { thisCalendar.show(); thisCalendar.focus(); } });
  thisCalendar.webContents.on('context-menu', event => event.preventDefault());
  thisCalendar.on('closed', () => { if (widgetCalendarWindow === thisCalendar) widgetCalendarWindow = null; });
  return true;
}

function closeWidgetCalendar() {
  if (!widgetCalendarWindow || widgetCalendarWindow.isDestroyed()) return false;
  widgetCalendarWindow.close();
  return true;
}

function moveWidgetTo(position: { x: number; y: number }) {
  if (!widgetWindow || widgetWindow.isDestroyed() || currentSettings.widgetPinned === true) return false;
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return false;
  const bounds = widgetWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: Math.round(position.x), y: Math.round(position.y) });
  const area = display.workArea;
  const x = Math.max(area.x, Math.min(Math.round(position.x), area.x + area.width - bounds.width));
  const y = Math.max(area.y, Math.min(Math.round(position.y), area.y + area.height - bounds.height));
  widgetWindow.setPosition(x, y, false);
  repositionWidgetDetailWindow();
  widgetDockEdge = null;
  widgetEdgeHidden = false;
  widgetRestoreBounds = null;
  widgetRestoreMinSize = null;
  publishWidgetEdgeState();
  return true;
}

function snapWidgetToEdge() {
  if (!widgetWindow || widgetWindow.isDestroyed() || currentSettings.widgetPinned === true) return null;
  if (widgetEdgeHidden) revealWidgetFromEdge();
  const bounds = widgetWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const edge = resolveDockEdge(bounds, display.workArea, 42);
  widgetDockEdge = edge;
  widgetRestoreBounds = null;
  const docked = edge ? dockWidgetBounds(bounds, display.workArea, edge) : bounds;
  widgetWindow.setPosition(docked.x, docked.y, false);
  repositionWidgetDetailWindow();
  const savedPositions = currentSettings.widgetDisplayPositions && typeof currentSettings.widgetDisplayPositions === 'object'
    ? currentSettings.widgetDisplayPositions : {};
  saveSettings({
    widgetLastDisplayId: display.id,
    widgetDisplayPositions: {
      ...savedPositions,
      [String(display.id)]: { x: docked.x, y: docked.y, dockEdge: edge },
    },
  });
  publishWidgetEdgeState();
  return edge;
}

function hideWidgetToEdge() {
  if (!widgetWindow || widgetWindow.isDestroyed() || !widgetWindow.isVisible() || currentSettings.widgetAutoHide !== true || !widgetDockEdge) return false;
  if (widgetEdgeHidden) return true;
  const bounds = widgetWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  widgetRestoreBounds = bounds;
  // Electron's declaration returns number[], while our restore state is a tuple.
  // Destructure the documented width/height pair to preserve the tuple contract.
  const [minimumWidth, minimumHeight] = widgetWindow.getMinimumSize();
  widgetRestoreMinSize = [minimumWidth, minimumHeight];
  const hiddenBounds = hideWidgetBounds(bounds, area, widgetDockEdge, 10);
  widgetWindow.setMinimumSize(hiddenBounds.width, hiddenBounds.height);
  widgetWindow.setBounds(hiddenBounds, false);
  widgetEdgeHidden = true;
  publishWidgetEdgeState();
  return true;
}

function revealWidgetFromEdge() {
  if (!widgetWindow || widgetWindow.isDestroyed() || !widgetEdgeHidden || !widgetRestoreBounds) return false;
  if (widgetRestoreMinSize) widgetWindow.setMinimumSize(widgetRestoreMinSize[0], widgetRestoreMinSize[1]);
  widgetWindow.setBounds(widgetRestoreBounds, false);
  widgetRestoreBounds = null;
  widgetRestoreMinSize = null;
  widgetEdgeHidden = false;
  publishWidgetEdgeState();
  return true;
}

function buildWidgetContextMenu() {
  const menu = Menu.buildFromTemplate([
    { label: '固定位置', type: 'checkbox', checked: currentSettings.widgetPinned === true, click: item => { saveSettings({ widgetPinned: item.checked }); } },
    { label: '始终置顶', type: 'checkbox', checked: widgetAlwaysOnTopEnabled(), click: item => { saveSettings({ widgetAlwaysOnTop: item.checked }); } },
    { label: '靠边自动隐藏', type: 'checkbox', checked: currentSettings.widgetAutoHide === true, click: item => { saveSettings({ widgetAutoHide: item.checked }); } },
    { label: '全屏时自动让位', type: 'checkbox', checked: currentSettings.widgetSmartFullscreen !== false, click: item => { saveSettings({ widgetSmartFullscreen: item.checked }); } },
    { type: 'separator' },
    { label: '打开主界面', click: () => { if (!mainWindow || mainWindow.isDestroyed()) createMainWindow(); mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: '退出 NexusMonitor', click: () => { quitting = true; app.quit(); } },
  ]);
  menu.popup({ window: widgetWindow ?? undefined });
}

function toggleWidget(force?: boolean) {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    if (force === true) { revealWidgetFromEdge(); widgetWindow.show(); repositionWidgetDetailWindow(); if (widgetDetailRequestedVisible) showReadyWidgetDetail(); }
    else if (widgetWindow.isVisible()) { hideWidgetDetail(); widgetWindow.hide(); }
    else { revealWidgetFromEdge(); widgetWindow.show(); repositionWidgetDetailWindow(); if (widgetDetailRequestedVisible) showReadyWidgetDetail(); }
    return;
  }
  const rememberedDisplayId = currentSettings.widgetLastDisplayId;
  const display = screen.getAllDisplays().find(item => item.id === rememberedDisplayId) ?? screen.getPrimaryDisplay();
  const area = display.workArea;
  const vertical = currentSettings.orientation === 'vertical';
  // The previous 112px vertical HUD left only ~88px for content and forced
  // ordinary labels to wrap aggressively. Use a wider, readable default and
  // clamp both orientations to the actual monitor work area.
  const layout = fitWindowToWorkArea(area, vertical
    ? { width: 340, height: 900, minWidth: 340, minHeight: 700, margin: 18, horizontalAnchor: 'right', verticalAnchor: 'top' }
    : { width: 980, height: 112, minWidth: 760, minHeight: 96, margin: 18, horizontalAnchor: 'right', verticalAnchor: 'top' });
  // Settings are loaded from JSON and intentionally kept as unknown-valued data
  // in the main process. Validate the persisted display entry before using it.
  const rawDisplayPositions = currentSettings.widgetDisplayPositions;
  const displayPositions = rawDisplayPositions && typeof rawDisplayPositions === 'object' && !Array.isArray(rawDisplayPositions)
    ? rawDisplayPositions as Record<string, unknown>
    : {};
  const rawSavedPosition = displayPositions[String(display.id)];
  const savedPositionRecord = rawSavedPosition && typeof rawSavedPosition === 'object' && !Array.isArray(rawSavedPosition)
    ? rawSavedPosition as Record<string, unknown>
    : null;
  const savedPosition = savedPositionRecord
    && typeof savedPositionRecord.x === 'number' && Number.isFinite(savedPositionRecord.x)
    && typeof savedPositionRecord.y === 'number' && Number.isFinite(savedPositionRecord.y)
    ? {
        x: savedPositionRecord.x,
        y: savedPositionRecord.y,
        dockEdge: (['left', 'right', 'top', 'bottom'] as const).includes(savedPositionRecord.dockEdge as DockEdge)
          ? savedPositionRecord.dockEdge as DockEdge
          : null,
      }
    : null;
  widgetDockEdge = savedPosition?.dockEdge ?? null;
  if (savedPosition) {
    const restored = widgetDockEdge
      ? dockWidgetBounds(layout, area, widgetDockEdge)
      : { ...layout, x: Math.max(area.x, Math.min(savedPosition.x, area.x + area.width - layout.width)), y: Math.max(area.y, Math.min(savedPosition.y, area.y + area.height - layout.height)) };
    layout.x = restored.x; layout.y = restored.y;
  }
  widgetWindow = new BrowserWindow({
    ...layout,
    frame: false, transparent: true, backgroundColor: '#00000000', resizable: true,
    alwaysOnTop: widgetAlwaysOnTopEnabled(), skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: ['--nexus-widget'] },
  });
  if (isDev) void widgetWindow.loadURL('http://127.0.0.1:5173/?widget=1');
  else void widgetWindow.loadFile(join(app.getAppPath(), 'dist', 'index.html'), { query: { widget: '1' } });
  const thisWidget = widgetWindow;
  widgetWindow.on('move', repositionWidgetDetailWindow);
  widgetWindow.on('resize', repositionWidgetDetailWindow);
  widgetWindow.on('closed', () => {
    if (widgetWindow === thisWidget) {
      widgetWindow = null;
      hideWidgetDetail();
      if (widgetCalendarWindow && !widgetCalendarWindow.isDestroyed()) widgetCalendarWindow.close();
      stopWidgetFullscreenMonitor();
    }
  });
  widgetWindow.webContents.on('did-fail-load', (_event, code, description) => log(`Widget renderer load failed: ${code} ${description}`));
  widgetWindow.webContents.on('context-menu', event => { event.preventDefault(); buildWidgetContextMenu(); });
  widgetWindow.webContents.once('did-finish-load', publishWidgetEdgeState);
  startWidgetFullscreenMonitor();
  widgetWindow.webContents.on('render-process-gone', (_event, details) => log(`Widget renderer exited: ${JSON.stringify(details)}`));
}

app.setName('NexusMonitor');
if (process.platform === 'win32') app.setAppUserModelId('com.nexusmonitor.desktop');
process.on('uncaughtException', error => { log(`UNCAUGHT: ${error.stack ?? error.message}`); });
process.on('unhandledRejection', reason => { log(`UNHANDLED REJECTION: ${String(reason)}`); });

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => revealMainWindow());

  app.whenReady().then(async () => {
    loadSettings();
    loadMusicLibrary();
    usbDisplayRestorePending = Boolean(String(currentSettings.usbDisplayDisplayId ?? '').trim());
    const notifyDisplayTopologyChanged = () => {
      const displays = listDesktopDisplays();
      if (usbDisplayWindow && usbDisplayTargetId && !displays.some(display => display.id === usbDisplayTargetId)) {
        log(`USB display target ${usbDisplayTargetId} was removed; waiting to restore it when reconnected`);
        usbDisplayRestorePending = Boolean(String(currentSettings.usbDisplayDisplayId ?? '').trim());
        closeUsbDisplayWindow();
      } else if (usbDisplayWindow && usbDisplayTargetId) {
        const target = screen.getAllDisplays().find(display => String(display.id) === usbDisplayTargetId);
        if (target && !usbDisplayWindow.isDestroyed()) applyUsbDisplayWindowBounds(usbDisplayWindow, target);
      }
      if (usbDisplayRestorePending) restoreConfiguredUsbDisplay();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop-displays:changed', displays);
      publishUsbDisplayStatus();
    };
    screen.on('display-added', notifyDisplayTopologyChanged);
    screen.on('display-removed', notifyDisplayTopologyChanged);
    screen.on('display-metrics-changed', notifyDisplayTopologyChanged);
    createMainWindow();
    createTray();
    // The floating HUD is a first-class part of the desktop app: show it on
    // every application launch, independently of the main dashboard window.
    toggleWidget(true);
    // Restore only the display explicitly saved by the user. Never guess which
    // external monitor is the 5-inch panel, and do not wait for hardware service.
    restoreConfiguredUsbDisplay();
    publishMusicState();
    await startService();
    const ready = await waitForService();
    if (!ready && lastServiceStatus.phase === 'starting') {
      setServiceStatus('offline', 'unreachable', '硬件服务启动后 12 秒内仍未通过健康检查');
    }
    log(ready ? 'Hardware service online' : 'Hardware service is not ready; UI will show offline state');
    await pollSnapshot();
    await refreshWeather();
    pollTimer = setInterval(() => void pollSnapshot(), Math.max(750, Number(currentSettings.refreshMs ?? 1000)));
    weatherTimer = setInterval(() => void refreshWeather(), 15 * 60 * 1000);
    app.on('activate', () => revealMainWindow());
  });
}

app.on('before-quit', () => {
  quitting = true;
  if (usbDisplayWindow && !usbDisplayWindow.isDestroyed()) usbDisplayWindow.destroy();
  usbDisplayWindow = null; usbDisplayTargetId = null;
  clearWidgetDetailTimers();
  if (pollTimer) clearInterval(pollTimer);
  if (weatherTimer) clearInterval(weatherTimer);
  if (weatherRetryTimer) clearTimeout(weatherRetryTimer);
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  stopService('app-quit');
});
app.on('window-all-closed', () => { /* The system tray owns application lifetime; exit is explicit in its menu. */ });

ipcMain.handle('app:get-settings', () => getPublicSettings());
ipcMain.handle('music:get-state', () => publicMusicState());
ipcMain.handle('music:open-library', () => {
  revealMainWindow();
  const target = mainWindow;
  if (!target || target.isDestroyed()) return false;
  const showLibrary = () => { if (!target.isDestroyed()) target.webContents.send('music:open-library'); };
  if (target.webContents.isLoading()) target.webContents.once('did-finish-load', showLibrary);
  else showLibrary();
  return true;
});
ipcMain.handle('music:track-url', (_event, trackId: string) => {
  const track = musicState.tracks.find(item => item.id === String(trackId));
  return track && existsSync(track.path) ? pathToFileURL(track.path).href : null;
});
ipcMain.handle('music:artwork-url', (_event, trackId: string) => {
  const track = musicState.tracks.find(item => item.id === String(trackId));
  return track?.artworkPath && existsSync(track.artworkPath) ? pathToFileURL(track.artworkPath).href : null;
});
ipcMain.handle('music:get-lyrics', (_event, trackId: string) => readMusicLyrics(String(trackId ?? '')));
ipcMain.handle('music:choose-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '常见音频文件', extensions: MUSIC_AUDIO_FILTER_EXTENSIONS }],
  });
  return result.canceled ? { added: 0, skipped: 0 } : importMusicPaths(result.filePaths);
});
ipcMain.handle('music:choose-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { added: 0, skipped: 0 };
  const paths = scanMusicFolder(result.filePaths[0]);
  const resultCount = importMusicPaths(paths);
  return { ...resultCount, truncated: paths.length >= MUSIC_FOLDER_SCAN_LIMIT };
});
ipcMain.handle('music:import-playlist', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'M3U 播放列表', extensions: ['m3u', 'm3u8'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, added: 0, skipped: 0 };
  return importMusicPlaylist(result.filePaths[0]);
});
ipcMain.handle('music:export-playlist', async (_event, playlistId: string) => {
  const playlist = musicState.playlists.find(item => item.id === String(playlistId));
  if (!playlist) return { ok: false, message: '歌单不存在' };
  const tracks = playlist.trackIds.flatMap(id => {
    const track = musicState.tracks.find(item => item.id === id);
    return track && existsSync(track.path) ? [track] : [];
  });
  const result = await dialog.showSaveDialog({
    defaultPath: `${playlist.name}.m3u8`,
    filters: [{ name: 'M3U8 播放列表', extensions: ['m3u8'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    writeFileSync(result.filePath, serializeM3u(tracks), 'utf8');
    return { ok: true, count: tracks.length, path: result.filePath };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle('music:command', (_event, command: MusicCommand) => handleMusicCommand(command));
ipcMain.on('music:runtime', (event, payload: { currentTime?: number; duration?: number; playing?: boolean; error?: boolean; errorMessage?: string }) => {
  // Only the hidden-capable main renderer owns the single HTMLAudioElement.
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  if (payload?.error === true) {
    musicState = { ...musicState, isPlaying: false, errorMessage: payload.errorMessage?.trim() || '音频播放失败，请检查文件格式或文件是否完整' };
    log(`Music playback failed: ${musicState.errorMessage}`);
    publishMusicState();
    return;
  }
  const currentTime = Number(payload?.currentTime);
  const duration = Number(payload?.duration);
  if (Number.isFinite(currentTime)) musicState.currentTime = Math.max(0, currentTime);
  if (Number.isFinite(duration) && duration >= 0) musicState.duration = duration;
  if (typeof payload?.playing === 'boolean') musicState.isPlaying = payload.playing;
  if (Date.now() - musicLastPersistAt >= 10_000) persistMusicState();
  publishMusicState();
});
ipcMain.handle('desktop-displays:list', () => listDesktopDisplays());
ipcMain.handle('desktop-displays:usb-status', () => getUsbDisplayStatus());
ipcMain.handle('desktop-displays:usb-open', (_event, displayId: string) => openUsbDisplayWindow(String(displayId ?? '')));
ipcMain.handle('desktop-displays:usb-close', () => { usbDisplayRestorePending = false; closeUsbDisplayWindow(); return getUsbDisplayStatus(); });
ipcMain.handle('desktop-displays:usb-choose-media', (_event, kind: 'image' | 'video') => chooseUsbDisplayMedia(kind === 'video' ? 'video' : 'image'));
ipcMain.handle('desktop-displays:usb-read-image', (_event, path: string) => { try { return readUsbDisplayImage(path); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } });
ipcMain.handle('desktop-displays:usb-video-url', (_event, path: string) => { try { return getUsbDisplayVideoUrl(path); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; } });
ipcMain.handle('app:weather-key-status', (_event, source: string) => ({ configured: source === 'open-meteo' || Boolean(readWeatherApiKey(source)) }));
ipcMain.handle('app:save-weather-api-key', (_event, payload: { source: string; key: string }) => saveWeatherApiKey(String(payload?.source ?? ''), String(payload?.key ?? '')));
ipcMain.handle('app:save-settings', (_event, settings: Record<string, unknown>) => saveSettings(settings));
ipcMain.handle('app:get-snapshot', async () => (await getSnapshotResult()).snapshot);
ipcMain.handle('app:get-snapshot-result', () => getSnapshotResult());
ipcMain.handle('app:get-devices', () => api('/api/devices'));
ipcMain.handle('app:get-weather', () => lastWeather);
ipcMain.handle('app:choose-background', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  const data = readFileSync(result.filePaths[0]);
  const ext = result.filePaths[0].split('.').pop()?.toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'bmp' ? 'image/bmp' : 'image/png';
  return `data:${mime};base64,${data.toString('base64')}`;
});
ipcMain.handle('app:open-path', async (_event, target: string) => shell.openPath(target));
ipcMain.handle('app:open-url', async (_event, url: string) => { if (/^https?:\/\//i.test(url)) await shell.openExternal(url); });
ipcMain.handle('window:show-main', () => revealMainWindow());
ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.handle('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender); if (!win) return false;
  if (win.isMaximized()) win.unmaximize(); else win.maximize(); return win.isMaximized();
});
ipcMain.handle('window:set-always-on-top', (event, value: boolean) => { const win = BrowserWindow.fromWebContents(event.sender); win?.setAlwaysOnTop(value); saveSettings({ alwaysOnTop: value }); return value; });
ipcMain.handle('widget:set-always-on-top', (_event, value: boolean) => { saveSettings({ widgetAlwaysOnTop: value === true }); applyWidgetZOrder(); return value === true; });
ipcMain.handle('app:set-startup', (_event, value: boolean) => {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: value });
  saveSettings({ launchAtLogin: value }); return app.isPackaged ? value : false;
});
ipcMain.handle('widget:toggle', () => toggleWidget());
ipcMain.handle('widget:show', () => toggleWidget(true));
ipcMain.handle('widget:set-expanded', (_event, expanded: boolean) => setWidgetExpanded(expanded === true));
ipcMain.on('window:main-renderer-ready', event => {
  const main = mainWindow;
  if (!main || main.isDestroyed() || event.sender !== main.webContents) return;
  mainWindowRendererReady = true;
  log('Main React renderer committed and painted its first UI frame');
  showMainWindowAfterFirstPaint();
});
ipcMain.on('widget:detail-renderer-ready', event => {
  const detail = widgetDetailWindow;
  if (!detail || detail.isDestroyed() || event.sender !== detail.webContents) return;
  widgetDetailRendererReady = true;
  log('Widget detail React renderer readiness handshake received');
  updateWidgetDetailReadiness(detail);
});
ipcMain.handle('widget:detail-pointer', (_event, inside: boolean) => {
  if (inside === true) cancelWidgetDetailAutoHide();
  else scheduleWidgetDetailAutoHide();
  return true;
});
ipcMain.handle('widget:open-calendar', () => openWidgetCalendar());
ipcMain.handle('widget:close-calendar', () => closeWidgetCalendar());
ipcMain.handle('widget:move-to', (_event, position: { x: number; y: number }) => moveWidgetTo(position));
ipcMain.handle('widget:snap-edge', () => snapWidgetToEdge());
ipcMain.handle('widget:hide-edge', () => hideWidgetToEdge());
ipcMain.handle('widget:reveal-edge', () => revealWidgetFromEdge());

ipcMain.handle('plugin:list', () => listPlugins());
ipcMain.handle('plugin:import', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Plugin manifest', extensions: ['json'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  try {
    const manifest = JSON.parse(readFileSync(result.filePaths[0], 'utf8'));
    if (!/^[a-z0-9][a-z0-9.-]{1,63}$/i.test(manifest.id) || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') throw new Error('Manifest requires id, name and version.');
    const destination = join(pluginDirectory(), manifest.id); mkdirSync(destination, { recursive: true });
    copyFileSync(result.filePaths[0], join(destination, 'plugin.json'));
    return { ok: true, plugins: listPlugins() };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
});
ipcMain.handle('plugin:set-enabled', (_event, payload: { id: string; enabled: boolean }) => {
  const enabled = new Set(Array.isArray(currentSettings.enabledPlugins) ? currentSettings.enabledPlugins as string[] : []);
  if (payload.enabled) enabled.add(payload.id); else enabled.delete(payload.id);
  saveSettings({ enabledPlugins: [...enabled] }); return listPlugins();
});

ipcMain.handle('turing:choose-wallpaper-file', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  const path = resolve(result.filePaths[0]);
  return { path, name: basename(path) };
});
ipcMain.handle('turing:choose-wallpaper-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'dontAddToRecent'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const path = resolve(result.filePaths[0]);
  const files = listTuringWallpaperFiles(path);
  return { path, files, message: files.length ? null : '该目录中没有支持的图片文件' };
});
ipcMain.handle('turing:list-wallpaper-files', (_event, directory: string) => {
  try { return { files: listTuringWallpaperFiles(directory), message: null }; }
  catch (error) { return { files: [], message: error instanceof Error ? error.message : String(error) }; }
});
ipcMain.handle('turing:read-wallpaper', (_event, path: string) => {
  try { return { ok: true, ...readTuringWallpaper(path) }; }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
});
ipcMain.handle('turing:devices', () => api('/api/turing/devices'));
ipcMain.handle('turing:connect', (_event, payload) => api('/api/turing/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
ipcMain.handle('turing:disconnect', () => api('/api/turing/disconnect', { method: 'POST' }));
ipcMain.handle('turing:orientation', (_event, orientation: number) => api('/api/turing/orientation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orientation }) }));
ipcMain.handle('turing:brightness', (_event, brightness: number) => api('/api/turing/brightness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brightness }) }));
ipcMain.handle('turing:screen-power', (_event, on: boolean) => api('/api/turing/screen-power', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }));
ipcMain.handle('turing:visual-verified', (_event, verified: boolean) => api('/api/turing/visual-verified', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verified }) }));
ipcMain.handle('turing:patches', (_event, payload) => api('/api/turing/patches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
