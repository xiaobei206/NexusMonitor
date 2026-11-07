export type ThemeId = 'obsidian' | 'paper' | 'titanium' | 'portrait';
export type AppPage = 'overview' | 'devices' | 'turing' | 'usb-display' | 'themes' | 'music' | 'shortcuts' | 'plugins' | 'settings';

export interface SensorValue { hardware: string; name: string; value: number | null; unit: string; kind: string; id?: string | null; }
export interface FanSnapshot { hardware: string; name: string; rpm: number | null; }
export interface CpuSnapshot {
  name: string; load: number | null; temperature: number | null; clockMHz: number | null;
  powerW: number | null; clockSource?: 'LibreHardwareMonitor' | 'WindowsPerformanceEstimate' | string | null;
  cores: Array<{ name: string; load: number | null; temperature: number | null; clockMHz: number | null }>;
}
export interface GpuSnapshot { name: string; hardwareType?: string; load: number | null; temperature: number | null; clockMHz: number | null; memoryUsedMB: number | null; memoryTotalMB: number | null; powerW: number | null; temperatureSource?: string | null; clockSensorName?: string | null; }
export interface MemorySnapshot { totalBytes: number; usedBytes: number; availableBytes: number; percent: number; temperature?: number | null; }
export interface NetworkSnapshot { id: string; name: string; description: string; type: string; ipv4: string | null; mac: string; status: string; rxBytes: number; txBytes: number; rxBytesPerSec: number; txBytesPerSec: number; speedMbps: number | null; isPhysical?: boolean; hasGateway?: boolean; isDefaultRoute?: boolean; }
export interface DiskSnapshot { id: string; model: string; sizeBytes: number | null; interfaceType: string; mediaType: string; isOptane: boolean; temperature: number | null; load: number | null; readBytesPerSec: number | null; writeBytesPerSec: number | null; aliases?: string[]; pnpDeviceId?: string | null; serialNumber?: string | null; volumeNames?: string[]; diskPerformanceAvailable?: boolean; }
export interface VolumeSnapshot { name: string; label: string; totalBytes: number; availableBytes: number; usedBytes: number; percent: number; diskIds?: string[]; }
export interface StorageStatus {
  wmiAvailable: boolean; lastError: string | null; lastAttemptAt: string | null; diskCount: number; volumeCount: number;
  storageHardwareCount?: number; diskPerformanceAvailable?: boolean; diskPerformanceError?: string | null;
  diskPerformanceInstanceCount?: number; diskPerformanceMatchedDiskCount?: number;
}
export interface SystemSnapshot {
  timestamp: string; uptimeSeconds: number; cpu: CpuSnapshot; gpus: GpuSnapshot[]; memory: MemorySnapshot;
  networks: NetworkSnapshot[]; disks: DiskSnapshot[]; volumes: VolumeSnapshot[]; fans: FanSnapshot[]; sensors: SensorValue[]; service: { status: 'online' | 'degraded'; version: string; elevated: boolean; pawnIoInstalled?: boolean | null; pawnIoRunning?: boolean | null; gpuTemperatureProbeStatus?: string | null }; storage?: StorageStatus;
}
export interface WeatherHourSnapshot { time: string; temperature: number | null; precipitationProbability: number | null; weatherCode: number | null; }
export interface WeatherDaySnapshot { date: string; maxTemperature: number | null; minTemperature: number | null; weatherCode: number | null; precipitationProbability: number | null; windSpeedMax: number | null; }
export type WeatherSourceId = 'open-meteo' | 'qweather' | 'weatherapi' | 'openweather';
export interface WeatherSnapshot {
  location: string; fetchedAt: string; temperature: number | null; apparentTemperature: number | null;
  humidity: number | null; windSpeed: number | null; windDirection: number | null; precipitation: number | null;
  weatherCode: number | null; aqi: number | null; pm25: number | null; pm10: number | null;
  ozone: number | null; no2: number | null; source: string;
  todayMaxTemperature?: number | null; todayMinTemperature?: number | null;
  precipitationProbability?: number | null; hourlyForecast?: WeatherHourSnapshot[] | null; dailyForecast?: WeatherDaySnapshot[] | null;
  sunrise?: string | null; sunset?: string | null;
}
export interface ShortcutItem { id: string; title: string; target: string; kind: 'url' | 'file' | 'folder' | 'app'; icon?: string; }
export interface AppSettings {
  theme: ThemeId; accent: string; orientation: 'horizontal' | 'vertical'; alwaysOnTop: boolean;
  opacity: number; refreshMs: number; selectedNetworks: string[]; selectedDisks: string[];
  visibleMetrics: string[]; metricOrder: string[]; backgroundDataUrl: string | null;
  turingEnabled: boolean; turingPort: string; turingOrientation: 100 | 101 | 102 | 103; turingOrientationVersion?: number; turingBrightness: number; turingTheme: ThemeId;
  weatherLocation: 'suzhou' | 'wujiang'; weatherSource?: WeatherSourceId; weatherApiKeyConfigured?: Record<string, boolean>; turingDiskId?: string; turingNetworkId?: string;
  turingDisplayMode?: 'monitor' | 'wallpaper' | 'weather-clock'; turingWallpaperMode?: 'single' | 'slideshow';
  turingAutoBrightnessEnabled?: boolean; turingDayBrightness?: number; turingNightBrightness?: number; turingDayStart?: string; turingNightStart?: string;
  musicOutputDeviceId?: string; musicOutputDeviceLabel?: string; musicEqBands?: number[]; musicReplayGainEnabled?: boolean; musicReplayGainMode?: 'track' | 'album'; musicWasapiEnabled?: boolean; musicWasapiDeviceId?: string; musicWasapiDeviceLabel?: string;
  usbDisplayDisplayId?: string; usbDisplayMode?: 'monitor' | 'static' | 'gif' | 'weather-clock' | 'video' | 'music-only'; usbDisplayImagePath?: string; usbDisplayVideoPath?: string; usbDisplayMediaFit?: 'contain' | 'cover'; usbDisplayMediaOrientation?: 'landscape' | 'portrait';
  turingWallpaperFile?: string; turingWallpaperDirectory?: string;
  turingWallpaperFit?: 'contain' | 'cover' | 'stretch'; turingWallpaperIntervalSeconds?: 30 | 60 | 90 | 120;
  shortcuts: ShortcutItem[]; compactMode: boolean;
  widgetVisibleMetrics?: string[]; widgetSensorIds?: string[]; widgetAlwaysOnTop?: boolean; widgetPinned?: boolean; widgetAutoHide?: boolean; widgetSmartFullscreen?: boolean; widgetLastDisplayId?: number; widgetDisplayPositions?: Record<string, { x: number; y: number; dockEdge: 'left' | 'right' | 'top' | 'bottom' | null }>;  thresholds: { loadWarning: number; loadCritical: number; tempWarning: number; tempCritical: number }; launchAtLogin?: boolean; minimizeToTray?: boolean;
}
export interface TuringStatus {
  connected: boolean; port: string | null; deviceFound: boolean; message: string; orientation: number; brightness: number;
  identity?: string | null; subRevision?: string | null; helloResponseHex?: string | null;
  communicationInitialized?: boolean; visualVerified?: boolean;
  brightnessPercent?: number | null; brightnessWireValue?: number | null; screenOn?: boolean | null; lastCommandHex?: string | null;
}

export type ServicePhase = 'starting' | 'online' | 'degraded' | 'offline' | 'restarting' | 'failed';
export type ServiceReason = 'starting' | 'ok' | 'timeout' | 'unreachable' | 'http' | 'parse' | 'exited' | 'spawn-failed' | 'port-occupied' | 'no-binary' | 'restarting' | 'stopped';
export interface ServiceStatus {
  phase: ServicePhase;
  reason: ServiceReason;
  message: string;
  at: string;
  pid?: number | null;
  retryInMs?: number | null;
}
export type SnapshotErrorKind = 'timeout' | 'unreachable' | 'http' | 'parse' | 'unknown';
export interface SnapshotError { kind: SnapshotErrorKind; message: string; status?: number; }
export interface SnapshotResult {
  snapshot: SystemSnapshot | null;
  error: SnapshotError | null;
  stale: boolean;
  ageMs: number;
  status: ServiceStatus;
}


export interface MusicLyricLine { timeSeconds: number; text: string; }
export interface MusicLyricsResult { lines: MusicLyricLine[]; synced: boolean; source: 'local' | 'online' | 'none'; }
export type MusicRepeatMode = 'off' | 'all' | 'one';
export interface MusicTrack {
  id: string;
  path: string;
  title: string;
  artist: string;
  album?: string | null;
  genre?: string | null;
  year?: number | null;
  trackNumber?: number | null;
  durationSeconds?: number | null;
  sampleRateHz?: number | null;
  bitDepth?: number | null;
  channels?: number | null;
  replayGainTrackDb?: number | null;
  replayGainAlbumDb?: number | null;
  replayGainTrackPeak?: number | null;
  replayGainAlbumPeak?: number | null;
  format?: string;
  artworkPath?: string | null;
  hasArtwork?: boolean;
  addedAt: string;
  missing?: boolean;
}
export interface MusicPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
}
export interface MusicState {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
  activePlaylistId: string | null;
  currentTrackId: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isPlaying: boolean;
  errorMessage?: string | null;
  shuffle: boolean;
  repeat: MusicRepeatMode;
}
export type MusicCommand =
  | { type: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'ended' | 'toggle-shuffle' | 'cycle-repeat' }
  | { type: 'seek'; seconds: number }
  | { type: 'set-volume'; volume: number }
  | { type: 'play-track'; trackId: string }
  | { type: 'select-playlist'; playlistId: string | null }
  | { type: 'create-playlist'; name: string }
  | { type: 'rename-playlist'; playlistId: string; name: string }
  | { type: 'delete-playlist'; playlistId: string }
  | { type: 'add-to-playlist'; trackId: string; playlistId: string }
  | { type: 'remove-track'; trackId: string }
  | { type: 'remove-from-playlist'; trackId: string; playlistId: string }
  | { type: 'move-track'; trackId: string; playlistId: string; direction: 'up' | 'down' };
