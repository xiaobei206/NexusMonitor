import { contextBridge, ipcRenderer } from 'electron';
import type { MusicCommand, ServiceStatus } from '../shared/types';

const api = {
  getSettings: () => ipcRenderer.invoke('app:get-settings'),
  getMusicState: () => ipcRenderer.invoke('music:get-state'),
  showMusicLibrary: () => ipcRenderer.invoke('music:open-library'),
  onOpenMusicLibrary: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('music:open-library', listener); return () => ipcRenderer.removeListener('music:open-library', listener);
  },
  chooseMusicFiles: () => ipcRenderer.invoke('music:choose-files'),
  chooseMusicFolder: () => ipcRenderer.invoke('music:choose-folder'),
  getMusicTrackUrl: (trackId: string) => ipcRenderer.invoke('music:track-url', trackId),
  getMusicArtworkUrl: (trackId: string) => ipcRenderer.invoke('music:artwork-url', trackId),
  musicCommand: (command: MusicCommand) => ipcRenderer.invoke('music:command', command),
  reportMusicRuntime: (payload: { currentTime?: number; duration?: number; playing?: boolean; error?: boolean }) => ipcRenderer.send('music:runtime', payload),
  onMusicState: (callback: (state: import('../shared/types').MusicState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: import('../shared/types').MusicState) => callback(state);
    ipcRenderer.on('music:state', listener); return () => ipcRenderer.removeListener('music:state', listener);
  },
  onMusicEngineCommand: (callback: (command: { type: 'seek'; seconds: number; resume?: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: { type: 'seek'; seconds: number }) => callback(command);
    ipcRenderer.on('music:engine-command', listener); return () => ipcRenderer.removeListener('music:engine-command', listener);
  },
  getWeatherKeyStatus: (source: string) => ipcRenderer.invoke('app:weather-key-status', source),
  saveWeatherApiKey: (source: string, key: string) => ipcRenderer.invoke('app:save-weather-api-key', { source, key }),
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('app:save-settings', settings),
  onSettingsUpdated: (callback: (settings: Record<string, unknown>) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: Record<string, unknown>) => callback(settings);
    ipcRenderer.on('app:settings-updated', listener); return () => ipcRenderer.removeListener('app:settings-updated', listener);
  },
  setStartup: (value: boolean) => ipcRenderer.invoke('app:set-startup', value),
  getSnapshot: () => ipcRenderer.invoke('app:get-snapshot'),
  getSnapshotResult: () => ipcRenderer.invoke('app:get-snapshot-result'),
  getDevices: () => ipcRenderer.invoke('app:get-devices'),
  getWeather: () => ipcRenderer.invoke('app:get-weather'),
  chooseBackground: () => ipcRenderer.invoke('app:choose-background'),
  openPath: (path: string) => ipcRenderer.invoke('app:open-path', path),
  openUrl: (url: string) => ipcRenderer.invoke('app:open-url', url),
  showMain: () => ipcRenderer.invoke('window:show-main'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:set-always-on-top', value),
  toggleWidget: () => ipcRenderer.invoke('widget:toggle'),
  showWidget: () => ipcRenderer.invoke('widget:show'),
  setWidgetExpanded: (expanded: boolean) => ipcRenderer.invoke('widget:set-expanded', expanded),
  notifyWidgetDetailRendererReady: () => ipcRenderer.send('widget:detail-renderer-ready'),
  notifyMainRendererReady: () => ipcRenderer.send('window:main-renderer-ready'),
  notifyWidgetDetailPointer: (inside: boolean) => ipcRenderer.invoke('widget:detail-pointer', inside),
  openWidgetCalendar: () => ipcRenderer.invoke('widget:open-calendar'),
  closeWidgetCalendar: () => ipcRenderer.invoke('widget:close-calendar'),
  moveWidgetTo: (position: { x: number; y: number }) => ipcRenderer.invoke('widget:move-to', position),
  snapWidgetToEdge: () => ipcRenderer.invoke('widget:snap-edge'),
  hideWidgetToEdge: () => ipcRenderer.invoke('widget:hide-edge'),
  revealWidgetFromEdge: () => ipcRenderer.invoke('widget:reveal-edge'),
  setWidgetAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('widget:set-always-on-top', value),
  onWidgetEdgeState: (callback: (state: {edge: 'left'|'right'|'top'|'bottom'|null; hidden: boolean}) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: {edge: 'left'|'right'|'top'|'bottom'|null; hidden: boolean}) => callback(state);
    ipcRenderer.on('widget:edge-state', listener); return () => ipcRenderer.removeListener('widget:edge-state', listener);
  },
  onWidgetDetailState: (callback: (visible: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
    ipcRenderer.on('widget:detail-state', listener); return () => ipcRenderer.removeListener('widget:detail-state', listener);
  },
  onWidgetDetailFadeOut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('widget:detail-fade-out', listener); return () => ipcRenderer.removeListener('widget:detail-fade-out', listener);
  },
  onWidgetDetailFadeCancel: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('widget:detail-fade-cancel', listener); return () => ipcRenderer.removeListener('widget:detail-fade-cancel', listener);
  },
  listPlugins: () => ipcRenderer.invoke('plugin:list'),
  importPlugin: () => ipcRenderer.invoke('plugin:import'),
  setPluginEnabled: (payload: {id:string;enabled:boolean}) => ipcRenderer.invoke('plugin:set-enabled', payload),
  getTuringDevices: () => ipcRenderer.invoke('turing:devices'),
  chooseTuringWallpaperFile: () => ipcRenderer.invoke('turing:choose-wallpaper-file'),
  chooseTuringWallpaperDirectory: () => ipcRenderer.invoke('turing:choose-wallpaper-directory'),
  listTuringWallpaperFiles: (directory: string) => ipcRenderer.invoke('turing:list-wallpaper-files', directory),
  readTuringWallpaper: (path: string) => ipcRenderer.invoke('turing:read-wallpaper', path),
  connectTuring: (payload: { port?: string; orientation?: number }) => ipcRenderer.invoke('turing:connect', payload),
  disconnectTuring: () => ipcRenderer.invoke('turing:disconnect'),
  setTuringOrientation: (orientation: number) => ipcRenderer.invoke('turing:orientation', orientation),
  setTuringBrightness: (brightness: number) => ipcRenderer.invoke('turing:brightness', brightness),
  setTuringScreenPower: (on: boolean) => ipcRenderer.invoke('turing:screen-power', on),
  setTuringVisualVerified: (verified: boolean) => ipcRenderer.invoke('turing:visual-verified', verified),
  getDesktopDisplays: () => ipcRenderer.invoke('desktop-displays:list'),
  getUsbDisplayStatus: () => ipcRenderer.invoke('desktop-displays:usb-status'),
  openUsbDisplay: (displayId: string) => ipcRenderer.invoke('desktop-displays:usb-open', displayId),
  closeUsbDisplay: () => ipcRenderer.invoke('desktop-displays:usb-close'),
  chooseUsbDisplayMedia: (kind: 'image' | 'video' | 'audio') => ipcRenderer.invoke('desktop-displays:usb-choose-media', kind),
  readUsbDisplayImage: (path: string) => ipcRenderer.invoke('desktop-displays:usb-read-image', path),
  getUsbDisplayVideoUrl: (path: string) => ipcRenderer.invoke('desktop-displays:usb-video-url', path),
  getUsbDisplayAudioUrl: (path: string) => ipcRenderer.invoke('desktop-displays:usb-audio-url', path),
  onDesktopDisplaysChanged: (callback: (displays: Array<{id:string;index:number;primary:boolean;width:number;height:number;x:number;y:number;scaleFactor:number;label:string}>) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, displays: Array<{id:string;index:number;primary:boolean;width:number;height:number;x:number;y:number;scaleFactor:number;label:string}>) => callback(displays);
    ipcRenderer.on('desktop-displays:changed', listener); return () => ipcRenderer.removeListener('desktop-displays:changed', listener);
  },
  onUsbDisplayStatusChanged: (callback: (status: {open:boolean;targetDisplayId:string|null}) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: {open:boolean;targetDisplayId:string|null}) => callback(status);
    ipcRenderer.on('usb-display:status', listener); return () => ipcRenderer.removeListener('usb-display:status', listener);
  },
  pushTuringPatches: (payload: { patches: Array<{x:number;y:number;width:number;height:number;dataBase64:string}> }) => ipcRenderer.invoke('turing:patches', payload),
  onTelemetry: (callback: (data: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('telemetry:update', listener); return () => ipcRenderer.removeListener('telemetry:update', listener);
  },
  onWeather: (callback: (data: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('weather:update', listener); return () => ipcRenderer.removeListener('weather:update', listener);
  },
  onServiceState: (callback: (state: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: string) => callback(state);
    ipcRenderer.on('service:state', listener); return () => ipcRenderer.removeListener('service:state', listener);
  },
  onServiceStatus: (callback: (status: ServiceStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ServiceStatus) => callback(status);
    ipcRenderer.on('service:status', listener); return () => ipcRenderer.removeListener('service:status', listener);
  },
};

contextBridge.exposeInMainWorld('nexus', api);
