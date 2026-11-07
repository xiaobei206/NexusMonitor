import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  Activity, AirVent, ArrowDown, ArrowUp, ArrowDownUp, AudioWaveform, BatteryCharging,
  Bell, ChevronDown, ChevronRight, CircleGauge, Cpu, Disc3, Download, ExternalLink,
  Fan, Folder, Gauge, HardDrive, ImagePlus, LayoutDashboard, Link2, LockKeyhole,
  Maximize2, Minimize2, MemoryStick, Minus, Monitor, MonitorCog, MoreHorizontal, Move, Network,
  Palette, Power, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  Square, Thermometer, Upload, Wifi, X, Zap, Clock3, CloudSun, Check, Plus, Search,
  Laptop, GripVertical, Database, GaugeCircle, Sun, Moon, Cable, RotateCcw, Puzzle, CalendarDays,
  Image as ImageIcon, FolderOpen, Play, Pause, SkipBack, SkipForward, Film, MonitorPlay, Tv, Music2,
} from 'lucide-react';
import type { AppPage, AppSettings, CpuSnapshot, DiskSnapshot, GpuSnapshot, MusicCommand, MusicState, NetworkSnapshot, ServiceStatus, SnapshotResult, SystemSnapshot, ThemeId, WeatherSnapshot, SensorValue } from '../shared/types';
import { MusicLibraryPage, MusicMiniPlayer, MusicPlaybackRuntime, MusicPlayerDock, useMusicState } from './music-player';
import type { MusicOutputStatus } from './music-player';
import type { MusicWasapiStatus } from './music-player';
import { renderTuringDashboard, renderTuringWeatherClock } from './turing-dashboard';
import { getWeatherSceneAsset } from './weather-scene';
import { selectTuringDisk, selectTuringGpu, selectTuringNetwork, selectNetworkInterfaces } from './turing-selection';
import { resolvePowerSummary } from './power-summary';
import { getAqiPresentation } from './aqi';
import { getDiskVolumeUsage, getSystemVolume } from './storage-view';
import { findTuringAutoConnectPort } from './turing-autoconnect';
import { getScheduledTuringBrightness } from './turing-auto-brightness';

type Nullable<T> = T | null;
const defaultSettings: AppSettings = {
  theme: 'obsidian', accent: '#70e1f5', orientation: 'horizontal', alwaysOnTop: true, opacity: 94,
  refreshMs: 1000, selectedNetworks: [], selectedDisks: [],
  visibleMetrics: ['cpu','gpu','memory','network','storage','weather','uptime'],
  metricOrder: ['cpu','gpu','memory','network','storage','weather','uptime'], backgroundDataUrl: null,
  turingEnabled: false, turingPort: 'COM3', turingOrientation: 103, turingOrientationVersion: 3, turingBrightness: 70, turingTheme: 'paper',
  weatherLocation: 'wujiang', weatherSource: 'open-meteo', turingDiskId: 'auto', turingNetworkId: 'auto',
  turingDisplayMode: 'monitor', turingWallpaperMode: 'single', turingWallpaperFile: '', turingWallpaperDirectory: '',
  turingWallpaperFit: 'contain', turingWallpaperIntervalSeconds: 30,
  turingAutoBrightnessEnabled: false, turingDayBrightness: 70, turingNightBrightness: 25, turingDayStart: '08:00', turingNightStart: '20:00',
  musicOutputDeviceId: 'default', musicOutputDeviceLabel: '系统默认输出设备',
  musicEqBands: [0,0,0,0,0,0,0,0,0,0],
  musicReplayGainEnabled: false, musicReplayGainMode: 'track',
  musicWasapiEnabled: false, musicWasapiDeviceId: '', musicWasapiDeviceLabel: '',
  usbDisplayDisplayId: '', usbDisplayMode: 'monitor', usbDisplayImagePath: '', usbDisplayVideoPath: '', usbDisplayMediaFit: 'cover', shortcuts: [], compactMode: false,
  widgetVisibleMetrics: ['cpu','gpu','memory','storage','network','power','weather','sensors'], widgetSensorIds: [],
  widgetAlwaysOnTop: true, widgetPinned: false, widgetAutoHide: false, widgetSmartFullscreen: true,
  thresholds: { loadWarning: 80, loadCritical: 95, tempWarning: 80, tempCritical: 95 },
};
const legacyTuringOrientation: Record<number, 100 | 101 | 102 | 103> = { 100: 100, 101: 102, 102: 101, 103: 103 };
function normalizeLoadedSettings(raw: Record<string, unknown>): { settings: AppSettings; migrate: boolean } {
  const rawMusicEqBands: unknown[] = Array.isArray(raw.musicEqBands) ? raw.musicEqBands : [];
  const version = Number(raw.turingOrientationVersion ?? 1);
  const rawOrientation = Number(raw.turingOrientation);
  const protocolOrientation = [100, 101, 102, 103].includes(rawOrientation) ? rawOrientation as 100 | 101 | 102 | 103 : 103;
  let orientation = version >= 2 ? protocolOrientation : legacyTuringOrientation[protocolOrientation] ?? 103;
  if (version < 3 && orientation === 102) orientation = 103;
  const rawBrightness = Number(raw.turingBrightness);
  const brightnessValid = Number.isFinite(rawBrightness) && rawBrightness >= 0 && rawBrightness <= 100;
  const brightness = brightnessValid ? rawBrightness : 70;
  return {
    settings: {
      ...defaultSettings,
      ...raw,
      musicEqBands: Array.from({ length: 10 }, (_, index) => { const value = Number(rawMusicEqBands[index] ?? 0); return Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0; }),
      musicReplayGainEnabled: raw.musicReplayGainEnabled === true,
      musicReplayGainMode: raw.musicReplayGainMode === 'album' ? 'album' : 'track',
      musicWasapiEnabled: raw.musicWasapiEnabled === true,
      musicWasapiDeviceId: typeof raw.musicWasapiDeviceId === 'string' ? raw.musicWasapiDeviceId : '',
      musicWasapiDeviceLabel: typeof raw.musicWasapiDeviceLabel === 'string' ? raw.musicWasapiDeviceLabel : '',
      // Settings files survive upgrades. Treat malformed or old values as absent
      // instead of letting one null array crash the entire React root on startup.
      selectedNetworks: Array.isArray(raw.selectedNetworks) ? raw.selectedNetworks.filter((id): id is string => typeof id === 'string') : [...defaultSettings.selectedNetworks],
      selectedDisks: Array.isArray(raw.selectedDisks) ? raw.selectedDisks.filter((id): id is string => typeof id === 'string') : [...defaultSettings.selectedDisks],
      visibleMetrics: Array.isArray(raw.visibleMetrics) ? raw.visibleMetrics.filter((id): id is string => typeof id === 'string') : [...defaultSettings.visibleMetrics],
      metricOrder: Array.isArray(raw.metricOrder) ? raw.metricOrder.filter((id): id is string => typeof id === 'string') : [...defaultSettings.metricOrder],
      shortcuts: Array.isArray(raw.shortcuts) ? raw.shortcuts : [...defaultSettings.shortcuts],
      widgetAlwaysOnTop: typeof raw.widgetAlwaysOnTop === 'boolean' ? raw.widgetAlwaysOnTop : raw.alwaysOnTop !== false,
      widgetPinned: raw.widgetPinned === true,
      widgetAutoHide: raw.widgetAutoHide === true,
      widgetSmartFullscreen: raw.widgetSmartFullscreen !== false,
      widgetVisibleMetrics: Array.isArray(raw.widgetVisibleMetrics) ? raw.widgetVisibleMetrics.filter((id): id is string => typeof id === 'string') : [...(defaultSettings.widgetVisibleMetrics ?? [])],
      widgetSensorIds: Array.isArray(raw.widgetSensorIds) ? raw.widgetSensorIds.filter((id): id is string => typeof id === 'string') : [],
      turingOrientation: orientation, turingOrientationVersion: 3, turingBrightness: brightness,
    } as AppSettings,
    migrate: version < 3 || !brightnessValid,
  };
}
const initialServiceStatus: ServiceStatus = {
  phase: 'starting', reason: 'starting', message: '正在连接本机硬件服务…', at: new Date().toISOString(), pid: null, retryInMs: null,
};
const PuzzleIcon = Puzzle;
const navItems: Array<{ id: AppPage; label: string; icon: any; group: string }> = [
  { id: 'overview', label: '总览面板', icon: LayoutDashboard, group: '监控中心' },
  { id: 'devices', label: '硬件与网络', icon: Cpu, group: '监控中心' },
  { id: 'turing', label: '图灵副屏', icon: Monitor, group: '设备输出' },
  { id: 'usb-display', label: 'USB 5 寸副屏', icon: MonitorPlay, group: '设备输出' },
  { id: 'themes', label: '主题工作室', icon: Palette, group: '个性化' },
  { id: 'music', label: '音乐播放器', icon: Music2, group: '个性化' },
  { id: 'shortcuts', label: '快捷入口', icon: Link2, group: '个性化' },
  { id: 'plugins', label: '插件管理', icon: PuzzleIcon, group: '扩展管理' },
  { id: 'settings', label: '系统设置', icon: Settings2, group: '管理' },
];
const metricLabels: Record<string, string> = { cpu: '处理器', gpu: '显卡', memory: '内存', network: '网络', storage: '存储', weather: '天气与空气', uptime: '系统运行时间' };
const fmt = (n: number | null | undefined, digits = 1) => n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits);
const bytes = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const u = ['B','KB','MB','GB','TB']; let v = n, i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i >= 2 ? 1 : 0)} ${u[i]}`;
};
const rate = (n: number | null | undefined) => n == null ? '—' : `${bytes(n)}/s`;
const toMbps = (bytesPerSecond: number | null | undefined) => bytesPerSecond == null || !Number.isFinite(bytesPerSecond) ? null : Math.max(0, bytesPerSecond) * 8 / 1_000_000;
const fmtMbps = (bytesPerSecond: number | null | undefined) => { const value = toMbps(bytesPerSecond); return value == null ? '—' : `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} Mbps`; };
const uptime = (seconds: number | undefined) => {
  if (!seconds || seconds < 0) return '—'; const d = Math.floor(seconds/86400), h = Math.floor(seconds%86400/3600), m = Math.floor(seconds%3600/60);
  return `${d}天 ${h}小时 ${m}分`;
};
const weatherText = (code: number | null | undefined) => {
  const map: Record<number,string> = {0:'晴',1:'大致晴朗',2:'局部多云',3:'阴',45:'雾',48:'雾凇',51:'毛毛雨',53:'毛毛雨',55:'强毛毛雨',61:'小雨',63:'中雨',65:'大雨',71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'较强阵雨',82:'暴雨',95:'雷暴'};
  return code == null ? '天气数据不可用' : map[code] ?? '多变天气';
};
const weatherGlyph = (code: number | null | undefined) => {
  if (code == null) return '🌡️';
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌥️';
};
const sensorSelectionId = (sensor: SensorValue) => sensor.id || `${sensor.hardware}/${sensor.kind}/${sensor.name}`;
const thresholdColor = (value: number | null | undefined, warning: number, critical: number, normal: string) => value == null ? normal : value >= critical ? '#ff646e' : value >= warning ? '#f2b45f' : normal;
const isDiskSelected = (disk: Pick<DiskSnapshot, 'id' | 'aliases'>, selected: string[]) =>
  selected.length === 0 || selected.includes(disk.id) || (disk.aliases ?? []).some(alias => selected.includes(alias));

function Sparkline({ values, color, height = 42, fill = false, maxValue = 100 }: { values: number[]; color: string; height?: number; fill?: boolean; maxValue?: number }) {
  if (values.length < 2) return <div className="spark-empty" style={{height}}><span>等待采样数据</span></div>;
  const min = Math.min(...values, 0), max = Math.max(...values, maxValue), span = max - min || 1;
  const points = values.map((v,i) => `${(i/(values.length-1))*100},${height - 4 - ((v-min)/span)*(height-9)}`).join(' ');
  return <svg className="sparkline" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{height}}>
    {fill && <polygon points={`0,${height} ${points} 100,${height}`} fill={color} opacity=".12"/>}
    <polyline points={points} fill="none" stroke={color} strokeWidth="2.1" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function MiniAreaChart({values, color, max=100, height=86}: {values:number[]; color:string; max?:number; height?:number}) {
  if(values.length < 2) return <div className="usb-chart-empty" style={{height}}>等待采样…</div>;
  const safeMax=Math.max(max, ...values, 1);
  const pts=values.map((v,i)=>`${(i/(values.length-1))*100},${height-8-(Math.max(0,Math.min(safeMax,v))/safeMax)*(height-16)}`).join(' ');
  return <svg className="usb-mini-chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
    {[0,25,50,75,100].map(y=><line key={y} x1="0" x2="100" y1={height-8-(y/100)*(height-16)} y2={height-8-(y/100)*(height-16)} className="usb-chart-grid"/>)}
    <polyline points={`0,${height} ${pts} 100,${height}`} fill={color} opacity=".08"/>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function BigRing({value, color, label, unit='%', size=126}: {value:number|null; color:string; label:string; unit?:string; size?:number}) {
  const pct=value==null?0:Math.max(0,Math.min(100,value)); const r=42, c=2*Math.PI*r;
  return <div className="usb-big-ring" style={{width:size,height:size}}><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={r} className="usb-ring-bg"/><circle cx="50" cy="50" r={r} className="usb-ring-value" stroke={color} strokeDasharray={`${c*pct/100} ${c}`} transform="rotate(-90 50 50)"/></svg><div><strong>{value==null?'—':Math.round(value)}<em>{unit}</em></strong><span>{label}</span></div></div>;
}
function Progress({ value, color, thin = false }: { value: number | null; color: string; thin?: boolean }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return <div className={`progress-track ${thin ? 'thin' : ''}`}><div className="progress-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 14px ${color}55` }}/></div>;
}
function Ring({ value, color, label, size = 116 }: { value: number | null; color: string; label: string; size?: number }) {
  const p = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 42, c = 2 * Math.PI * r;
  return <div className="ring-wrap" style={{width:size,height:size}}>
    <svg viewBox="0 0 100 100" className="ring-svg"><circle cx="50" cy="50" r={r} className="ring-bg"/><circle cx="50" cy="50" r={r} stroke={color} strokeDasharray={`${c*p/100} ${c}`} className="ring-value" transform="rotate(-90 50 50)"/></svg>
    <div className="ring-center"><strong>{value == null ? '—' : `${Math.round(value)}%`}</strong><span>{label}</span></div>
  </div>;
}
function MetricCard({ title, eyebrow, value, unit, detail, color, icon: Icon, history, footer, className = '' }: any) {
  return <article className={`metric-card ${className}`} style={{'--metric-accent':color} as any}>
    <div className="metric-top"><div className="metric-icon"><Icon size={17}/></div><div className="metric-heading"><span>{eyebrow}</span><strong>{title}</strong></div><button className="icon-quiet"><MoreHorizontal size={17}/></button></div>
    <div className="metric-value-row"><div className="metric-reading"><strong>{value}</strong><span>{unit}</span></div><div className="metric-detail">{detail}</div></div>
    <Progress value={typeof value === 'number' ? value : null} color={color} thin/>
    <div className="metric-spark"><Sparkline values={history ?? []} color={color} height={46} fill/></div>
    <div className="metric-bottom">{footer}</div>
  </article>;
}
function WindowControls() {
  return <div className="window-controls"><button title="最小化" onClick={() => window.nexus.minimize()}><Minus size={15}/></button><button title="最大化" onClick={() => window.nexus.toggleMaximize()}><Square size={12}/></button><button className="close" title="关闭" onClick={() => window.nexus.close()}><X size={16}/></button></div>;
}
type WidgetHistory = {
  cpu: number[];
  gpu: number[];
  memory: number[];
  diskRead: number[];
  diskWrite: number[];
  networkRx: number[];
  networkTx: number[];
  network: number[];
};
type WidgetDragState = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  startWindowX: number;
  startWindowY: number;
  moved: boolean;
} | null;

function WidgetView({ snapshot, settings, history, weather, detailOnly = false, musicState, musicCommand }: { snapshot: Nullable<SystemSnapshot>; settings: AppSettings; history: WidgetHistory; weather: Nullable<WeatherSnapshot>; detailOnly?: boolean; musicState: MusicState | null; musicCommand: (command: MusicCommand) => void }) {
  const [expanded, setExpanded] = useState(detailOnly);
  const [fadingOut, setFadingOut] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dockState, setDockState] = useState<{edge: 'left'|'right'|'top'|'bottom'|null; hidden: boolean}>({ edge: null, hidden: false });
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelTransition = useRef(0);
  const drag = useRef<WidgetDragState>(null);
  const detailHoverInside = useRef(false);
  const cpu = snapshot?.cpu ?? null;
  const gpu = snapshot?.gpus?.[0] ?? null;
  const visibleWidgetMetrics = new Set(settings.widgetVisibleMetrics ?? defaultSettings.widgetVisibleMetrics ?? []);
  const showWidgetMetric = (id: string) => visibleWidgetMetrics.has(id);
  const selectedSensors = (snapshot?.sensors ?? []).filter(sensor => (settings.widgetSensorIds ?? []).includes(sensorSelectionId(sensor)));
  const powerSummary = resolvePowerSummary(snapshot);

  const memory = snapshot?.memory ?? null;
  const disks = snapshot?.disks ?? [];
  const disk = selectTuringDisk(snapshot);
  const systemVolume = getSystemVolume(snapshot);
  const aqiPresentation = getAqiPresentation(weather?.aqi);
  const networks = selectNetworkInterfaces(snapshot, settings.selectedNetworks);
  const rx = networks.length ? networks.reduce((total, network) => total + network.rxBytesPerSec, 0) : null;
  const tx = networks.length ? networks.reduce((total, network) => total + network.txBytesPerSec, 0) : null;
  const networkName = networks.length === 1 ? networks[0].name : networks.length > 1 ? `${networks.length} 张网卡` : '未连接网卡';
  const cpuClock = cpu?.clockMHz == null ? '—' : `${cpu.clockSource === 'WindowsPerformanceEstimate' ? '~' : ''}${(cpu.clockMHz / 1000).toFixed(2)} GHz`;
  const cpuClockTitle = cpu?.clockSource === 'WindowsPerformanceEstimate' ? 'Windows 性能计数器估算值，并非直接读取的硬件时钟' : 'LibreHardwareMonitor 硬件时钟传感器';
  const gpuClock = gpu?.clockMHz == null ? '—' : `${Math.round(gpu.clockMHz)} MHz`;
  const localNow = new Date();
  const timeText = localNow.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateText = localNow.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  const weekdayText = localNow.toLocaleDateString('zh-CN', { weekday: 'long' });

  const clearHideTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (edgeHideTimer.current) clearTimeout(edgeHideTimer.current);
    hideTimer.current = null;
    fadeTimer.current = null;
    edgeHideTimer.current = null;
    setFadingOut(false);
  };
  const openPanel = () => {
    clearHideTimer();
    if (expanded) return;
    const transition = ++panelTransition.current;
    // The native compact HUD never changes bounds; this opens a separate detail window.
    void window.nexus.setWidgetExpanded(true).then(ok => {
      if (transition === panelTransition.current && ok) setExpanded(true);
    }).catch(() => undefined);
  };
  const closePanel = () => {
    clearHideTimer();
    const transition = ++panelTransition.current;
    if (detailOnly) {
      setFadingOut(true);
      fadeTimer.current = setTimeout(() => {
        fadeTimer.current = null;
        void window.nexus.setWidgetExpanded(false).then(ok => {
          if (transition === panelTransition.current && ok) { setExpanded(false); setFadingOut(false); }
        }).catch(() => { if (transition === panelTransition.current) setFadingOut(false); });
      }, 180);
      return;
    }
    void window.nexus.setWidgetExpanded(false).then(ok => {
      if (transition === panelTransition.current && ok) setExpanded(false);
    }).catch(() => undefined);
  };
  const notifyDetailHover = (inside: boolean) => {
    if (detailHoverInside.current === inside) return;
    detailHoverInside.current = inside;
    void window.nexus.notifyWidgetDetailPointer(inside).catch(() => undefined);
  };
  const onShellEnter = () => {
    clearHideTimer();
    notifyDetailHover(true);
    if (!detailOnly) void window.nexus.revealWidgetFromEdge();
  };
  const onShellLeave = () => {
    if (drag.current) return;
    notifyDetailHover(false);
    if (detailOnly || expanded) return;
    if (!settings.widgetAutoHide || !dockState.edge) return;
    if (edgeHideTimer.current) clearTimeout(edgeHideTimer.current);
    edgeHideTimer.current = setTimeout(() => { edgeHideTimer.current = null; void window.nexus.hideWidgetToEdge(); }, 2000);
  };
  const onBarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button,[data-no-widget-drag="true"]')) return;
    drag.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startWindowX: window.screenX,
      startWindowY: window.screenY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onBarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.screenX - active.startScreenX;
    const dy = event.screenY - active.startScreenY;
    if (!active.moved && Math.hypot(dx, dy) >= 5) active.moved = true;
    if (active.moved) void window.nexus.moveWidgetTo({ x: Math.round(active.startWindowX + dx), y: Math.round(active.startWindowY + dy) });
  };
  const onBarPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
    if (!active.moved) {
      openPanel();
    } else if (active.moved) {
      void window.nexus.snapWidgetToEdge().then(edge => { if (edge) setDockState(current => ({ ...current, edge })); });
    }
  };
  const onBarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPanel();
    }
  };
  useEffect(() => window.nexus.onWidgetEdgeState(state => setDockState(state)), []);
  useEffect(() => window.nexus.onWidgetDetailState(visible => {
    setExpanded(visible);
    if (visible) setFadingOut(false);
  }), []);
  useEffect(() => {
    if (!detailOnly) return;
    const unFade = window.nexus.onWidgetDetailFadeOut(() => setFadingOut(true));
    const unCancel = window.nexus.onWidgetDetailFadeCancel(() => setFadingOut(false));
    return () => { unFade(); unCancel(); };
  }, [detailOnly]);
  useEffect(() => {
    if (!detailOnly) return;
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    // React 19 may commit the detached window after Electron's native
    // ready-to-show event. Two animation frames ensure the detail DOM has
    // reached layout/paint before the main process is allowed to show it.
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!cancelled) window.nexus.notifyWidgetDetailRendererReady();
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [detailOnly]);
  const lastOrientation = useRef(settings.orientation);
  useEffect(() => {
    if (lastOrientation.current === settings.orientation) return;
    lastOrientation.current = settings.orientation;
    panelTransition.current += 1;
    clearHideTimer();
    setExpanded(false);
    setFadingOut(false);
  }, [settings.orientation]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); if (fadeTimer.current) clearTimeout(fadeTimer.current); if (edgeHideTimer.current) clearTimeout(edgeHideTimer.current); }, []);

  return <div
    className={`widget-shell ${settings.theme} ${settings.orientation === 'vertical' ? 'vertical' : ''} ${detailOnly && expanded ? 'expanded detail-only' : ''} ${fadingOut ? 'fading-out' : ''} ${settings.orientation === 'vertical' ? 'open-left' : dockState.edge === 'top' ? 'open-down' : ''} ${!detailOnly && dockState.hidden ? 'edge-hidden' : ''} ${settings.widgetPinned ? 'pinned' : ''}`}
    style={{'--accent':settings.accent,'--opacity':settings.opacity/100,...(settings.theme==='portrait'&&settings.backgroundDataUrl?{backgroundImage:`linear-gradient(90deg,rgba(23,18,27,.96),rgba(23,18,27,.52)),url(${settings.backgroundDataUrl})`,backgroundSize:'cover',backgroundPosition:'center'}:{})} as any}
    onMouseEnter={onShellEnter}
    onMouseLeave={onShellLeave}
    onPointerEnter={onShellEnter}
    onPointerLeave={onShellLeave}
  >
    {!detailOnly && <div
      className="widget-bar"
      role="group"
      tabIndex={0}
      aria-label="单击展开系统监控详情；按住并拖动可移动悬浮条"
      onPointerDown={onBarPointerDown}
      onPointerMove={onBarPointerMove}
      onPointerUp={onBarPointerUp}
      onPointerCancel={() => {
        // Pointer cancellation ends the drag; detached detail-window auto-hide is handled via IPC.
        drag.current = null;
      }}
      onKeyDown={onBarKeyDown}
    >
      {settings.orientation === 'vertical' ? <>
        <div className="widget-vertical-brand"><span className="brand-mark">N</span><span>NEXUS MONITOR</span><small>实时系统状态</small></div>
        {showWidgetMetric('cpu') && <div className="widget-vertical-row cpu-row">
          <span className="widget-vertical-icon"><Cpu size={19}/></span><div className="widget-vertical-body">
            <div className="widget-vertical-heading"><b>CPU 处理器</b><strong>{fmt(cpu?.load,0)}%</strong></div>
            <div className="widget-vertical-meta">温度 {fmt(cpu?.temperature,0)}°C · {cpuClock} · {cpu?.powerW == null ? '功耗 —' : `${fmt(cpu.powerW,0)} W`}</div>
            <Progress value={cpu?.load ?? null} color="#67d6f2" thin/>
          </div>
        </div>}
        {showWidgetMetric('gpu') && <div className="widget-vertical-row gpu-row">
          <span className="widget-vertical-icon"><Cpu size={19}/></span><div className="widget-vertical-body">
            <div className="widget-vertical-heading"><b>GPU 显卡</b><strong>{fmt(gpu?.load,0)}%</strong></div>
            <div className="widget-vertical-meta">温度 {fmt(gpu?.temperature,0)}°C · {gpuClock} · {gpu?.powerW == null ? '功耗 —' : `${fmt(gpu.powerW,0)} W`}</div>
            <Progress value={gpu?.load ?? null} color="#55d6a2" thin/>
          </div>
        </div>}
        {showWidgetMetric('memory') && <div className="widget-vertical-row memory-row">
          <span className="widget-vertical-icon"><MemoryStick size={19}/></span><div className="widget-vertical-body">
            <div className="widget-vertical-heading"><b>内存</b><strong>{fmt(memory?.percent,0)}%</strong></div>
            <div className="widget-vertical-meta">{bytes(memory?.usedBytes)} / {bytes(memory?.totalBytes)}</div>
            <Progress value={memory?.percent ?? null} color="#a78bfa" thin/>
          </div>
        </div>}
        {showWidgetMetric('storage') && <div className="widget-vertical-row disk-row">
          <span className="widget-vertical-icon"><HardDrive size={19}/></span><div className="widget-vertical-body">
            <div className="widget-vertical-heading"><b>硬盘 · {disk?.volumeNames?.includes('C:\\') ? 'C:' : disk ? '物理盘' : '—'}</b><strong>{disk?.load == null ? '—' : `${fmt(disk.load,0)}%`}</strong></div>
            <div className="widget-vertical-meta">↓ {rate(disk?.readBytesPerSec)}　↑ {rate(disk?.writeBytesPerSec)}</div>
            {systemVolume && <div className="widget-vertical-storage">
              <div><span>容量占用 · C:</span><strong>{fmt(systemVolume.percent,0)}%</strong></div>
              <Progress value={systemVolume.percent} color="#42bfd4" thin/>
              <small>{bytes(systemVolume.usedBytes)} / {bytes(systemVolume.totalBytes)}</small>
            </div>}
          </div>
        </div>}
        {showWidgetMetric('network') && <div className="widget-vertical-row network-row">
          <span className="widget-vertical-icon"><Network size={22}/></span><div className="widget-vertical-body">
            <div className="widget-vertical-heading"><b>网络</b><small>{networkName}</small></div>
            <div className="widget-network-bars widget-vertical-network-bars">
              <div className="widget-network-bar"><span className="download-rate">↓ {fmtMbps(rx)}</span><div className="network-scale-track" title="下载参考上限 600 Mbps"><i className="network-scale-fill download-fill" style={{width:`${Math.min(100,(toMbps(rx) ?? 0)/600*100)}%`}}/>{(toMbps(rx) ?? 0)>600 && <em/>}</div></div>
              <div className="widget-network-bar"><span className="upload-rate">↑ {fmtMbps(tx)}</span><div className="network-scale-track" title="上传参考上限 40 Mbps"><i className="network-scale-fill upload-fill" style={{width:`${Math.min(100,(toMbps(tx) ?? 0)/40*100)}%`}}/>{(toMbps(tx) ?? 0)>40 && <em/>}</div></div>
            </div>
          </div>
        </div>}
        {showWidgetMetric('power') && <div className="widget-vertical-row power-row">
          <span className="widget-vertical-icon"><Zap size={19}/></span><div className="widget-vertical-body">
            <div className="widget-vertical-heading"><b>功耗</b><strong>{powerSummary.valueW == null ? '—' : `${fmt(powerSummary.valueW,1)} W`}</strong></div>
            <div className="widget-vertical-meta">{powerSummary.label}</div>
          </div>
        </div>}
        {!detailOnly && <MusicMiniPlayer state={musicState} onCommand={musicCommand}/>}
        {showWidgetMetric('weather') && <div className="widget-vertical-weather">
          <div className="widget-vertical-weather-head"><CloudSun size={22}/><b>天气 · {weather?.location ?? '苏州'}</b><span className="widget-weather-glyph">{weatherGlyph(weather?.weatherCode)}</span><strong>{fmt(weather?.temperature,0)}°C</strong></div>
          <div className="widget-vertical-weather-meta">{weatherText(weather?.weatherCode)} · 体感 {fmt(weather?.apparentTemperature,0)}°C · 湿度 {fmt(weather?.humidity,0)}%</div>
          <div className="widget-vertical-weather-range"><span>↑ 最高 {fmt(weather?.todayMaxTemperature,0)}°</span><span>↓ 最低 {fmt(weather?.todayMinTemperature,0)}°</span></div>
          <div className="widget-vertical-weather-meta widget-vertical-airline"><span style={{color:aqiPresentation.textColor,fontWeight:750}}>AQI {weather?.aqi == null ? '—' : Math.round(weather.aqi)} · {aqiPresentation.label}</span><span>PM2.5 {fmt(weather?.pm25,0)} μg/m³</span><span>PM10 {fmt(weather?.pm10,0)} μg/m³</span><span>风速 {fmt(weather?.windSpeed,0)} km/h</span></div>
          {(weather?.hourlyForecast ?? []).slice(0,3).length > 0 && <div className="widget-vertical-forecast-block">
            <b className="widget-vertical-forecast-title">未来 3 小时</b>
            <div className="widget-vertical-hourly">{(weather?.hourlyForecast ?? []).slice(0,3).map((hour,index)=><span key={`${hour.time}-${index}`}><small>{new Date(hour.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</small><i>{weatherGlyph(hour.weatherCode)}</i><strong>{fmt(hour.temperature,0)}°</strong></span>)}</div>
          </div>}
          {(weather?.dailyForecast ?? []).slice(0,3).length > 0 && <div className="widget-vertical-forecast-block">
            <b className="widget-vertical-forecast-title">未来 3 天</b>
            <div className="widget-vertical-daily">{(weather?.dailyForecast ?? []).slice(0,3).map((day,index)=><div key={`${day.date}-${index}`}><span>{new Date(day.date).toLocaleDateString('zh-CN',{weekday:'short'})}</span><i>{weatherGlyph(day.weatherCode)}</i><small>{fmt(day.minTemperature,0)}° / {fmt(day.maxTemperature,0)}°</small><em>降水 {fmt(day.precipitationProbability,0)}%</em></div>)}</div>
          </div>}
        </div>}
        <div className="widget-vertical-clock"><b>{timeText}</b><button type="button" className="widget-vertical-calendar-trigger" data-no-widget-drag="true" onClick={() => void window.nexus.openWidgetCalendar()} title="打开中国日历"><span>{dateText}</span><small>{weekdayText}</small><CalendarDays size={16}/></button></div>
      </> : <>
      <div className="widget-brand"><span className="brand-mark">N</span><span>NEXUS</span></div>
      {showWidgetMetric('cpu') && <div className="widget-stat cpu-stat">
        <div className="widget-stat-heading"><span>CPU</span><b>{fmt(cpu?.load,0)}<small>%</small></b></div>
        <div className="widget-stat-meta" title={cpuClockTitle}>{fmt(cpu?.temperature,0)}°C · {cpuClock} · {cpu?.powerW == null ? '功耗 —' : `${fmt(cpu.powerW,0)} W`}</div>
        <Progress value={cpu?.load ?? null} color="#67d6f2" thin/>
      </div>}
      {showWidgetMetric('gpu') && <div className="widget-stat gpu-stat">
        <div className="widget-stat-heading"><span>GPU</span><b>{fmt(gpu?.load,0)}<small>%</small></b></div>
        <div className="widget-stat-meta" title={gpu?.temperatureSource === 'MCHBAR GT' ? 'Intel GT THERM_STATUS_GT 只读寄存器温度' : 'GPU 温度由当前可用硬件传感器提供'}>{fmt(gpu?.temperature,0)}°C · {gpuClock} · {gpu?.powerW == null ? '功耗 —' : `${fmt(gpu.powerW,0)} W`}</div>
        <Progress value={gpu?.load ?? null} color="#55d6a2" thin/>
      </div>}
      {showWidgetMetric('memory') && <div className="widget-stat memory-stat">
        <div className="widget-stat-heading"><span>内存</span><b>{fmt(memory?.percent,0)}<small>%</small></b></div>
        <div className="widget-stat-meta">{bytes(memory?.usedBytes)} / {bytes(memory?.totalBytes)}</div>
        <Progress value={memory?.percent ?? null} color="#a78bfa" thin/>
      </div>}
      {showWidgetMetric('storage') && <div className="widget-stat disk-stat">
        <div className="widget-stat-heading"><span>硬盘 · {disk?.volumeNames?.includes('C:\\') ? 'C:' : disk ? '物理盘' : '—'}</span><b>{disk?.load == null ? '—' : `${fmt(disk.load,0)}%`}</b></div>
        <div className="widget-rate-line"><span>↓ {rate(disk?.readBytesPerSec)}</span><span>↑ {rate(disk?.writeBytesPerSec)}</span></div>
        {systemVolume && <div className="widget-storage-usage"><div><span>容量占用 · C:</span><b>{fmt(systemVolume.percent,0)}%</b></div><Progress value={systemVolume.percent} color="#42bfd4" thin/><small>{bytes(systemVolume.usedBytes)} / {bytes(systemVolume.totalBytes)}</small></div>}
      </div>}
      {showWidgetMetric('network') && <div className="widget-stat network-stat">
        <div className="widget-stat-heading"><span>网络</span><small>{networkName}</small></div>
        <div className="widget-network-bars">
          <div className="widget-network-bar"><span className="download-rate">↓ {fmtMbps(rx)}</span><div className="network-scale-track" title="下载参考上限 600 Mbps"><i className="network-scale-fill download-fill" style={{width:`${Math.min(100,(toMbps(rx) ?? 0)/600*100)}%`}}/>{(toMbps(rx) ?? 0)>600 && <em/>}</div></div>
          <div className="widget-network-bar"><span className="upload-rate">↑ {fmtMbps(tx)}</span><div className="network-scale-track" title="上传参考上限 40 Mbps"><i className="network-scale-fill upload-fill" style={{width:`${Math.min(100,(toMbps(tx) ?? 0)/40*100)}%`}}/>{(toMbps(tx) ?? 0)>40 && <em/>}</div></div>
        </div>
      </div>}
      {showWidgetMetric('weather') && <div className="widget-stat weather-stat">
        <div className="widget-weather-top"><span className="widget-weather-glyph" aria-hidden="true">{weatherGlyph(weather?.weatherCode)}</span><b>{fmt(weather?.temperature,0)}°C</b><small>{weatherText(weather?.weatherCode)}</small></div>
        <div className="widget-weather-meta"><span className="aqi-inline" style={{color:aqiPresentation.textColor}}><b>AQI</b> {weather?.aqi == null ? '—' : Math.round(weather.aqi)}</span><span>湿度 {fmt(weather?.humidity,0)}%</span></div>
      </div>}
      {showWidgetMetric('power') && <div className="widget-stat power-stat">
        <div className="widget-stat-heading"><span>功耗</span><b>{powerSummary.valueW == null ? '—' : `${powerSummary.valueW > 0 ? '+' : ''}${fmt(powerSummary.valueW,1)}`}<small>W</small></b></div>
        <div className="widget-stat-meta">{powerSummary.label}</div>
      </div>}
      <div className="widget-clock"><b>{timeText}</b><small>{dateText}</small></div>
      </>}
      <button className="widget-open" title={expanded ? '收起监控详情' : '展开监控详情'} aria-label={expanded ? '收起监控详情' : '展开监控详情'} onClick={() => expanded ? closePanel() : openPanel()}>{expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
    </div>}

    {detailOnly && expanded && <section className="widget-panel" aria-label="系统硬件详细监控">
      <div className="widget-panel-head">
        <div><span className="widget-panel-eyebrow">NEXUS / LIVE TELEMETRY</span><h2>系统性能监控</h2></div>
        <div className="widget-panel-actions">
          <span className={`widget-service-state ${snapshot?.service?.status === 'online' ? 'online' : ''}`}><i/>{snapshot?.service?.status === 'online' ? '本机服务在线' : '等待硬件数据'}</span>
          <button className="widget-main-action" onClick={() => void window.nexus.showMain()} title="打开完整 NexusMonitor 主界面">打开主界面 <ExternalLink size={13}/></button>
          <button className="widget-close" onClick={closePanel} title="立即收起详情面板" aria-label="立即收起详情面板"><X size={17}/></button>
        </div>
      </div>
      <div className="widget-detail-grid">
        {showWidgetMetric('cpu') && <article className="widget-detail-card widget-cpu-detail">
          <div className="widget-detail-title"><div><span>01 / PROCESSOR</span><b>处理器 · {cpu?.name ?? '等待检测'}</b></div><strong>{fmt(cpu?.load,0)}%</strong></div>
          <div className="widget-detail-values">
            <div><small>温度</small><b>{fmt(cpu?.temperature,0)}<i>°C</i></b></div>
            <div title={cpuClockTitle}><small>频率{cpu?.clockSource === 'WindowsPerformanceEstimate' ? ' · 估算' : ''}</small><b>{cpuClock}</b></div>
            <div><small>功耗</small><b>{cpu?.powerW == null ? '—' : `${fmt(cpu.powerW,0)} W`}</b></div>
          </div>
          <div className="widget-chart-label"><span>CPU LOAD</span><small>最近 60 次采样</small></div>
          <Sparkline values={history.cpu} color="#67d6f2" height={72} fill/>
          <div className="widget-core-grid">{(cpu?.cores ?? []).map(core => <div className="widget-core-item" key={core.name}><span>{core.name.replace('Core ', 'C')}</span><b>{fmt(core.load, 0)}%</b><small>{core.temperature == null ? '—°C' : `${fmt(core.temperature, 0)}°C`} · {core.clockMHz == null ? '—' : `${fmt(core.clockMHz / 1000, 2)} GHz`}</small></div>)}</div>
          <div className="widget-detail-foot">{cpu?.cores?.length ?? 0} 个可读取核心分组；不可用传感器保持 —</div>
        </article>}
        {showWidgetMetric('gpu') && <article className="widget-detail-card widget-gpu-detail">
          <div className="widget-detail-title"><div><span>02 / GRAPHICS</span><b>图形处理器 · {gpu?.name ?? '等待检测'}</b></div><strong>{fmt(gpu?.load,0)}%</strong></div>
          <div className="widget-detail-values">
            <div><small title={gpu?.temperatureSource === 'MCHBAR GT' ? 'Intel GT THERM_STATUS_GT 只读寄存器' : gpu?.temperatureSource === 'LibreHardwareMonitor' ? 'LibreHardwareMonitor 温度传感器' : '当前没有可用的 GPU 温度传感器'}>温度{gpu?.temperatureSource === 'MCHBAR GT' ? ' · GT' : ''}</small><b>{fmt(gpu?.temperature,0)}<i>°C</i></b></div>
            <div><small>频率</small><b>{gpuClock}</b></div>
            <div><small>功耗</small><b>{gpu?.powerW == null ? '—' : `${fmt(gpu.powerW,0)} W`}</b></div>
          </div>
          <div className="widget-chart-label"><span>GPU LOAD</span><small>{gpu?.memoryUsedMB == null ? '共享显存 —' : `共享显存 ${bytes(gpu.memoryUsedMB * 1048576)}`}</small></div>
          <Sparkline values={history.gpu} color="#a78bfa" height={72} fill/>
          <div className="widget-detail-foot">{gpu?.memoryTotalMB == null ? '显存总量由驱动决定' : `可见显存总量 ${bytes(gpu.memoryTotalMB * 1048576)}`}</div>
        </article>}
        {showWidgetMetric('memory') && <article className="widget-detail-card">
          <div className="widget-detail-title"><div><span>03 / MEMORY</span><b>物理内存</b></div><strong>{fmt(memory?.percent,0)}%</strong></div>
          <div className="widget-memory-reading"><b>{bytes(memory?.usedBytes)}</b><span>已用 / {bytes(memory?.totalBytes)}</span></div>
          <Progress value={memory?.percent ?? null} color="#39ce9b"/>
          <div className="widget-chart-label"><span>MEMORY USAGE</span><small>可用 {bytes(memory?.availableBytes)}</small></div>
          <Sparkline values={history.memory} color="#39ce9b" height={60} fill/>
          <div className="widget-detail-foot">内存温度 {memory?.temperature == null ? '—' : `${fmt(memory.temperature,0)}°C`}</div>
        </article>}
        {showWidgetMetric('storage') && <article className="widget-detail-card widget-disk-detail">
          <div className="widget-detail-title"><div><span>04 / STORAGE</span><b>物理磁盘读写</b></div><strong>{disks.length} 块</strong></div>
          {disks.length === 0 ? <div className="widget-empty">尚未读取到物理磁盘</div> : disks.map(item => {const usage=getDiskVolumeUsage(snapshot,item);return <div className="widget-disk-row" key={item.id}>
            <div className="widget-disk-name"><b>{item.model}</b><small>{(item.volumeNames ?? []).join(' · ') || '未分配卷'} · {item.sizeBytes == null ? '物理容量 —' : bytes(item.sizeBytes)}{item.isOptane ? ' · OPTANE' : ''}</small></div>
            <div className="widget-disk-metrics"><span>读 {rate(item.readBytesPerSec)}</span><span>写 {rate(item.writeBytesPerSec)}</span><span>活动 {item.load == null ? '—' : `${fmt(item.load,0)}%`}</span><span>温度 {item.temperature == null ? '—' : `${fmt(item.temperature,0)}°C`}</span></div>
            {usage&&<div className="widget-storage-usage"><div><span>{usage.names.join(' + ')} 空间占用</span><b>{fmt(usage.percent,0)}%</b></div><Progress value={usage.percent} color="#42bfd4" thin/><small>{bytes(usage.usedBytes)} / {bytes(usage.totalBytes)}</small></div>}
          </div>})}
          <div className="widget-chart-label"><span>READ / WRITE THROUGHPUT</span><small>Bytes / sec</small></div>
          <div className="widget-dual-chart"><div><small>READ</small><Sparkline values={history.diskRead} color="#4abbe9" height={48} maxValue={0}/></div><div><small>WRITE</small><Sparkline values={history.diskWrite} color="#f2b44f" height={48} maxValue={0}/></div></div>
          <div className="widget-detail-foot">Windows PhysicalDisk 已匹配 {snapshot?.storage?.diskPerformanceMatchedDiskCount ?? 0} / {snapshot?.storage?.diskCount ?? disks.length} 块；性能实例 {snapshot?.storage?.diskPerformanceInstanceCount ?? 0}；LHM 存储硬件 {snapshot?.storage?.storageHardwareCount ?? 0}</div>
        </article>}
        {showWidgetMetric('network') && <article className="widget-detail-card widget-network-detail">
          <div className="widget-detail-title"><div><span>05 / NETWORK</span><b>网络实时流量</b></div><strong>{networks.filter(item => item.status === 'Up').length} 张在线</strong></div>
          <div className="widget-network-metrics"><div><small className="download-rate">下载 · 600 Mbps 参考</small><b className="download-rate">{fmtMbps(rx)}</b><div className="network-scale-track" title="下载参考上限 600 Mbps"><i className="network-scale-fill download-fill" style={{width:`${Math.min(100,(toMbps(rx) ?? 0)/600*100)}%`}}/>{(toMbps(rx) ?? 0)>600 && <em/>}</div></div><div><small className="upload-rate">上传 · 40 Mbps 参考</small><b className="upload-rate">{fmtMbps(tx)}</b><div className="network-scale-track" title="上传参考上限 40 Mbps"><i className="network-scale-fill upload-fill" style={{width:`${Math.min(100,(toMbps(tx) ?? 0)/40*100)}%`}}/>{(toMbps(tx) ?? 0)>40 && <em/>}</div></div></div>
          <div className="widget-chart-label"><span>NETWORK THROUGHPUT</span><small>{networkName}</small></div>
          <div className="widget-dual-chart"><div><small>DOWNLOAD</small><Sparkline values={history.networkRx} color="#4dd2a0" height={58} maxValue={0}/></div><div><small>UPLOAD</small><Sparkline values={history.networkTx} color="#aa91f4" height={58} maxValue={0}/></div></div>
          <div className="widget-detail-foot">网卡速度为所选接口累计；可在主界面设置中固定网卡。</div>
        </article>}
        {showWidgetMetric('power') && <article className="widget-detail-card widget-power-detail">
          <div className="widget-detail-title"><div><span>06 / POWER TELEMETRY</span><b>智能功耗摘要 · {powerSummary.label}</b></div><strong>{powerSummary.valueW == null ? '—' : `${powerSummary.valueW > 0 ? '+' : ''}${fmt(powerSummary.valueW,1)} W`}</strong></div>
          <div className="widget-power-values">
            <div><small>CPU Package</small><b>{powerSummary.cpuPowerW == null ? '—' : `${fmt(powerSummary.cpuPowerW,1)} W`}</b></div>
            <div><small>GPU 合计</small><b>{powerSummary.gpuPowerW == null ? '—' : `${fmt(powerSummary.gpuPowerW,1)} W`}</b></div>
            <div><small>平台功耗</small><b>{powerSummary.platformPowerW == null ? '—' : `${fmt(powerSummary.platformPowerW,1)} W`}</b></div>
            <div><small>电池电量</small><b>{powerSummary.batteryLevelPercent == null ? '—' : `${fmt(powerSummary.batteryLevelPercent,0)}%`}</b></div>
            <div><small>电池电压</small><b>{powerSummary.batteryVoltageV == null ? '—' : `${fmt(powerSummary.batteryVoltageV,2)} V`}</b></div>
            <div><small>电池电流</small><b>{powerSummary.batteryCurrentA == null ? '—' : `${fmt(powerSummary.batteryCurrentA,2)} A`}</b></div>
            <div><small>剩余容量</small><b>{powerSummary.batteryCapacityMWh == null ? '—' : `${fmt(powerSummary.batteryCapacityMWh / 1000,1)} Wh`}</b></div>
            <div><small>剩余时间</small><b>{powerSummary.batteryRemainingSeconds == null ? '—' : `${Math.floor(powerSummary.batteryRemainingSeconds / 3600)}h ${Math.floor((powerSummary.batteryRemainingSeconds % 3600) / 60)}m`}</b></div>
            <div><small>电池充电功率</small><b>{powerSummary.batteryChargeW == null ? '—' : `${fmt(powerSummary.batteryChargeW,1)} W`}</b></div>
          </div>
          <div className="widget-detail-foot">{powerSummary.mode === 'cpu-gpu' ? `仅合计 ${powerSummary.componentCount} 个有效 CPU/GPU 功耗传感器，不代表整机插座功耗。` : powerSummary.mode === 'battery-discharge' ? '电池放电时优先显示放电功率，按负数表示；其它电池容量、电压、电流与剩余时间独立列出。' : '等待有效 CPU Package、GPU 或电池放电功率传感器；0 W 不作为有效遥测。平台功率单独显示，不冒充 CPU/GPU 合计。'}</div>
        </article>}
        {showWidgetMetric('weather') && <article className={`widget-detail-card widget-weather-detail ${settings.orientation === 'vertical' ? 'widget-weather-detail-vertical' : ''}`}>
          <div className="widget-detail-title"><div><span>07 / LOCAL WEATHER</span><b>天气与空气质量 · {weather?.location ?? '苏州'}</b></div><span className="widget-weather-large" aria-hidden="true">{weatherGlyph(weather?.weatherCode)}</span></div>
          <div className="widget-weather-reading"><strong>{fmt(weather?.temperature,0)}°C</strong><span>{weatherText(weather?.weatherCode)} · 体感 {fmt(weather?.apparentTemperature,0)}°</span></div>
          {settings.orientation === 'vertical' && <div className="widget-weather-today-range"><span>今日最高 <b>{fmt(weather?.todayMaxTemperature,0)}°</b></span><span>今日最低 <b>{fmt(weather?.todayMinTemperature,0)}°</b></span></div>}
          <div className={`widget-weather-metrics ${settings.orientation === 'vertical' ? 'widget-weather-metrics-vertical' : ''}`}><div><small style={{color:aqiPresentation.textColor}}>AQI</small><b className="aqi-inline" style={{color:aqiPresentation.textColor}}>{weather?.aqi == null ? '—' : Math.round(weather.aqi)}</b></div><div><small>湿度</small><b>{fmt(weather?.humidity,0)}%</b></div><div><small>风速</small><b>{fmt(weather?.windSpeed,0)} km/h</b></div><div><small>PM2.5</small><b>{fmt(weather?.pm25,0)} μg/m³</b></div>{settings.orientation === 'vertical' && <div><small>PM10</small><b>{fmt(weather?.pm10,0)} μg/m³</b></div>}</div>
          {settings.orientation === 'vertical' ? <>
            <div className="widget-weather-forecast-heading">未来 6 小时</div>
            {(weather?.hourlyForecast ?? []).slice(0,6).length > 0 ? <div className="widget-vertical-detail-hours">{(weather?.hourlyForecast ?? []).slice(0,6).map((hour,index)=><div key={`${hour.time}-${index}`}><small>{new Date(hour.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</small><b>{weatherGlyph(hour.weatherCode)} {fmt(hour.temperature,0)}°</b><span>降水 {fmt(hour.precipitationProbability,0)}%</span></div>)}</div> : <div className="widget-empty">暂无逐小时预报</div>}
            <div className="widget-weather-forecast-heading">未来逐日预报（最多 6 天）</div>
            {(weather?.dailyForecast ?? []).slice(0,6).length > 0 ? <div className="widget-vertical-detail-days">{(weather?.dailyForecast ?? []).slice(0,6).map((day,index)=><div key={`${day.date}-${index}`}><span>{new Date(day.date).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit',weekday:'short'})}</span><b>{weatherGlyph(day.weatherCode)} {fmt(day.minTemperature,0)}° / {fmt(day.maxTemperature,0)}°</b><small>降水 {fmt(day.precipitationProbability,0)}% · 风速 {fmt(day.windSpeedMax,0)} km/h</small></div>)}</div> : <div className="widget-empty">暂无逐日预报</div>}
          </> : <>
            {(weather?.hourlyForecast ?? []).slice(0,3).length > 0 && <div className="widget-weather-forecast">{(weather?.hourlyForecast ?? []).slice(0,3).map((hour,index)=><div key={`${hour.time}-${index}`}><small>{new Date(hour.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small><b>{weatherGlyph(hour.weatherCode)} {fmt(hour.temperature,0)}°</b><span>降水 {fmt(hour.precipitationProbability,0)}%</span></div>)}</div>}
          </>}
          <div className="widget-detail-foot">天气来源：{weather?.source ?? settings.weatherSource ?? 'Open-Meteo'}。</div>
        </article>}
        {showWidgetMetric('sensors') && selectedSensors.length > 0 && <article className="widget-detail-card widget-custom-sensors">
          <div className="widget-detail-title"><div><span>08 / CUSTOM SENSORS</span><b>自选硬件传感器</b></div><strong>{selectedSensors.length}</strong></div>
          <div className="widget-custom-sensor-list">{selectedSensors.map(sensor=><div className="widget-custom-sensor-row" key={sensorSelectionId(sensor)}><span><b>{sensor.name}</b><small>{sensor.hardware} · {sensor.kind}</small></span><strong>{sensor.value == null ? '—' : fmt(sensor.value,1)} <small>{sensor.unit}</small></strong></div>)}</div>
          <div className="widget-detail-foot">可在“硬件与网络 → 全部硬件传感器”中勾选要显示的项目；空值显示为 —，不会用 0 伪造。</div>
        </article>}
        <article className="widget-detail-card widget-runtime-detail">
          <div className="widget-detail-title"><div><span>09 / SYSTEM</span><b>系统运行信息</b></div><Clock3 size={19}/></div>
          <div className="widget-runtime-value">{uptime(snapshot?.uptimeSeconds)}</div>
          <div className="widget-runtime-meta">采样时间 {snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}</div>
          <div className="widget-detail-foot">硬件服务 {snapshot?.service?.status ?? 'starting'} · {snapshot?.service?.elevated ? '管理员权限' : '普通权限'} · PawnIO {snapshot?.service?.pawnIoInstalled == null ? '状态未知' : snapshot.service.pawnIoInstalled ? (snapshot.service.pawnIoRunning ? '已运行' : '已安装但未运行') : '未安装'}</div>
        </article>
      </div>
    </section>}
  </div>;
}
function MainApp() {
  const [page,setPage] = useState<AppPage>('overview');
  const [settings,setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsLoaded,setSettingsLoaded] = useState(false);
  const [snapshot,setSnapshot] = useState<Nullable<SystemSnapshot>>(null);
  const [weather,setWeather] = useState<Nullable<WeatherSnapshot>>(null);
  const [serviceStatus,setServiceStatus] = useState<ServiceStatus>(initialServiceStatus);
  const [history,setHistory] = useState<WidgetHistory>({cpu:[],gpu:[],memory:[],diskRead:[],diskWrite:[],networkRx:[],networkTx:[],network:[]});
  const [clock,setClock] = useState(new Date());
  const [toast,setToast] = useState('');
  const widgetQuery = new URLSearchParams(window.location.search);
  const isWidget = widgetQuery.get('widget') === '1';
  const isWidgetDetail = widgetQuery.get('widget-detail') === '1';
  const music = useMusicState();
  const [musicOutputStatus, setMusicOutputStatus] = useState<MusicOutputStatus | null>(null);
  const [musicWasapiStatus, setMusicWasapiStatus] = useState<MusicWasapiStatus | null>(null);
  const [musicSleepTimerEndsAt, setMusicSleepTimerEndsAt] = useState<number | null>(null);
  const setMusicSleepTimer = useCallback((minutes: number | null) => {
    setMusicSleepTimerEndsAt(minutes && Number.isFinite(minutes) && minutes > 0 ? Date.now() + Math.min(24 * 60, minutes) * 60_000 : null);
  }, []);
  const clearMusicSleepTimer = useCallback(() => setMusicSleepTimerEndsAt(null), []);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  const settingsPromise = useRef<Promise<AppSettings | null> | null>(null);
  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = {...prev,...patch};
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => void window.nexus.saveSettings(next as any), 350);
      return next;
    });
  },[]);
  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(()=>setToast(''),2600); },[]);
  const applySnapshotResult = useCallback((result: SnapshotResult | null) => {
    if (!result) return;
    if (result.snapshot) setSnapshot(result.snapshot);
    if (result.status) setServiceStatus(result.status);
  },[]);
  const refreshSnapshot = useCallback(async () => {
    try { applySnapshotResult(await window.nexus.getSnapshotResult()); }
    catch { /* the pushed service status will describe the failure */ }
  }, [applySnapshotResult]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let alive = true;
    if (!settingsPromise.current) {
      settingsPromise.current = window.nexus.getSettings()
        .then(s => {
          if (!s || !Object.keys(s).length) return null;
          const normalized = normalizeLoadedSettings(s);
          if (normalized.migrate) {
            void window.nexus.saveSettings({
              turingOrientation: normalized.settings.turingOrientation,
              turingOrientationVersion: 3,
              turingBrightness: normalized.settings.turingBrightness,
            });
          }
          return normalized.settings;
        })
        .catch(() => null);
    }
    void settingsPromise.current.then(s => {
      if (!alive) return;
      if (s) setSettings(s);
      setSettingsLoaded(true);
    });
    void window.nexus.getSnapshotResult().then(r => { if (alive) applySnapshotResult(r); }).catch(() => undefined);
    void window.nexus.getWeather().then(w => { if (alive && w) setWeather(w); }).catch(() => undefined);
    return () => { alive = false; };
  }, [applySnapshotResult]);

  useEffect(() => window.nexus.onOpenMusicLibrary(() => setPage('music')), []);

  useEffect(() => {
    return window.nexus.onSettingsUpdated(raw => {
      if (!raw || typeof raw !== 'object') return;
      setSettings(normalizeLoadedSettings(raw).settings);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const unTelemetry = window.nexus.onTelemetry((data: SystemSnapshot | null) => {
      if (!alive || !data) return;
      setSnapshot(data);
      const append = (previous: number[], next: number | null | undefined) =>
        next == null || !Number.isFinite(next) ? previous : [...previous.slice(-59), next];
      const activeSettings = settingsRef.current;
      const historyNetworks = selectNetworkInterfaces(data, activeSettings.selectedNetworks);
      const networkRx = historyNetworks.length ? historyNetworks.reduce((sum, nic) => sum + nic.rxBytesPerSec, 0) : null;
      const networkTx = historyNetworks.length ? historyNetworks.reduce((sum, nic) => sum + nic.txBytesPerSec, 0) : null;
      const systemDisk = data.disks?.find(disk => (disk.volumeNames ?? []).some(name => name.replace(/[\\/]+$/, '').toUpperCase() === 'C:')) ?? data.disks?.[0];
      setHistory(old => ({
        cpu: append(old.cpu, data.cpu?.load),
        gpu: append(old.gpu, data.gpus?.[0]?.load),
        memory: append(old.memory, data.memory?.percent),
        diskRead: append(old.diskRead, systemDisk?.readBytesPerSec),
        diskWrite: append(old.diskWrite, systemDisk?.writeBytesPerSec),
        networkRx: append(old.networkRx, networkRx),
        networkTx: append(old.networkTx, networkTx),
        network: append(old.network, networkRx == null || networkTx == null ? null : Math.min(100, (networkRx + networkTx) / 1048576 / 10 * 100)),
      }));
    });
    const unWeather = window.nexus.onWeather((w: WeatherSnapshot | null) => { if (alive && w) setWeather(w); });
    const unServiceStatus = window.nexus.onServiceStatus(status => { if (alive) setServiceStatus(status); });
    const tick = setInterval(()=>setClock(new Date()),1000);
    return () => {
      alive = false;
      unTelemetry();
      unWeather();
      unServiceStatus();
      clearInterval(tick);
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  const serviceState = serviceStatus.phase === 'online' ? 'online' : 'offline';
  const serviceBannerTitle = serviceStatus.phase === 'degraded' ? '硬件服务响应超时'
    : serviceStatus.phase === 'restarting' ? '硬件服务正在重启'
      : serviceStatus.phase === 'starting' ? '硬件服务正在启动'
        : serviceStatus.phase === 'failed' ? '硬件服务启动失败'
          : '硬件服务尚未连接';
  const themeClass = settings.theme;
  const selectedNetworks = useMemo(() => selectNetworkInterfaces(snapshot, settings.selectedNetworks), [snapshot,settings.selectedNetworks]);
  const selectedDisks = useMemo(() => snapshot?.disks?.filter(d => isDiskSelected(d, settings.selectedDisks)) ?? [], [snapshot,settings.selectedDisks]);
  const storageError = snapshot?.storage?.wmiAvailable === false
    ? `物理磁盘不可用：${snapshot.storage.lastError ?? 'WMI 查询失败'}`
    : null;

  if (isWidget) return <WidgetView snapshot={snapshot} settings={settings} history={history} weather={weather} detailOnly={isWidgetDetail} musicState={music.state} musicCommand={music.command}/>;

  const cpu = snapshot?.cpu;
  const gpu = snapshot?.gpus?.[0];
  const thresholds = settings.thresholds ?? defaultSettings.thresholds;
  const cpuLoadColor = thresholdColor(cpu?.load, thresholds.loadWarning, thresholds.loadCritical, '#66ddf2');
  const cpuTempColor = thresholdColor(cpu?.temperature, thresholds.tempWarning, thresholds.tempCritical, '#66ddf2');
  const gpuLoadColor = thresholdColor(gpu?.load, thresholds.loadWarning, thresholds.loadCritical, '#a58bff');
  const gpuTempColor = thresholdColor(gpu?.temperature, thresholds.tempWarning, thresholds.tempCritical, '#a58bff');
  const visible = (id: string) => settings.visibleMetrics.includes(id);
  const aqiPresentation = getAqiPresentation(weather?.aqi);
  const renderHeroMetric = (id: string): ReactNode => {
    if (!visible(id)) return null;
    if (id === 'cpu') return <article key={id} className="hero-card cpu-hero"><div className="hero-card-top"><div><span className="card-kicker">01 / PROCESSOR</span><h2>中央处理器</h2><p>{cpu?.name || 'CPU SENSOR · WAITING'}</p></div><div className="hero-chip"><Cpu size={15}/> INTEL CORE</div></div><div className="hero-core"><Ring value={cpu?.load ?? null} color={cpuLoadColor} label="CPU LOAD" size={138}/><div className="hero-stats"><div><span>温度</span><b style={{color:cpuTempColor}}>{fmt(cpu?.temperature)}<small>°C</small></b></div><div><span>频率{cpu?.clockSource==='WindowsPerformanceEstimate'?' · 估算':''}</span><b title={cpu?.clockSource==='WindowsPerformanceEstimate'?'根据 Windows 活跃逻辑处理器性能计数器估算，不是直接硬件测量':''}>{cpu?.clockMHz==null?'—':`${cpu.clockSource==='WindowsPerformanceEstimate'?'~':''}${(cpu.clockMHz/1000).toFixed(2)}`}<small>GHz</small></b></div><div><span>功耗</span><b>{fmt(cpu?.powerW)}<small>W</small></b></div></div></div><div className="hero-chart"><div className="chart-label"><span>PROCESSOR LOAD HISTORY</span><b>60 S</b></div><Sparkline values={history.cpu} color="#66ddf2" height={64} fill/></div><div className="hero-bottom"><span><i className="legend-dot cyan"/> CPU PACKAGE</span><span>{cpu?.cores?.length ?? '—'} LOGICAL SENSORS</span></div></article>;
    if (id === 'gpu') return <article key={id} className="hero-card gpu-hero"><div className="hero-card-top"><div><span className="card-kicker">02 / GRAPHICS</span><h2>图形处理器</h2><p>{gpu?.name || 'GPU SENSOR · WAITING'}</p></div><div className="gpu-glyph"><Activity size={21}/></div></div><div className="gpu-core"><Ring value={gpu?.load ?? null} color={gpuLoadColor} label="GPU LOAD" size={118}/><div className="gpu-numbers"><div title={gpu?.temperatureSource === 'MCHBAR GT' ? 'Intel GT THERM_STATUS_GT 只读寄存器' : gpu?.temperatureSource === 'LibreHardwareMonitor' ? 'LibreHardwareMonitor 温度传感器' : '当前没有可用的 GPU 温度传感器'}><span>核心温度{gpu?.temperatureSource === 'MCHBAR GT' ? ' · GT' : ''}</span><b style={{color:gpuTempColor}}>{fmt(gpu?.temperature)}<small>°C</small></b></div><div><span>核心频率</span><b title={gpu?.clockSensorName ? `LHM 传感器：${gpu.clockSensorName}` : '当前没有可用的 GPU 核心频率传感器'}>{gpu?.clockMHz==null?'—':Math.round(gpu.clockMHz)}<small>MHz</small></b></div><div><span>显存占用</span><b>{gpu?.memoryUsedMB==null?'—':bytes(gpu.memoryUsedMB*1048576)}<small></small></b></div><div><span>功耗</span><b>{fmt(gpu?.powerW,1)}<small>W</small></b></div></div></div><div className="chart-label"><span>GPU LOAD HISTORY</span><b>60 S</b></div><Sparkline values={history.gpu} color="#a58bff" height={50} fill/><div className="hero-bottom"><span><i className="legend-dot purple"/> GRAPHICS ENGINE</span><span>{snapshot?.gpus?.length ?? 0} ADAPTER(S)</span></div></article>;
    return null;
  };
  const renderMetric = (id: string): ReactNode => {
    if (!visible(id)) return null;
    if (id === 'memory') return <MetricCard key={id} title="物理内存" eyebrow="MEMORY / RAM" value={snapshot?.memory.percent ?? null} unit="%" detail={`${bytes(snapshot?.memory.usedBytes)} / ${bytes(snapshot?.memory.totalBytes)}`} color="#a58bff" icon={MemoryStick} history={history.memory} footer={<><span>可用 {bytes(snapshot?.memory.availableBytes)}</span><span>物理内存</span></>}/>;
    if (id === 'network') return <MetricCard key={id} title="网络吞吐" eyebrow="NETWORK / I/O" value={null} unit="" detail="双向实时流量" color="#5bd6aa" icon={Network} history={history.network} footer={<><span>↓ {rate(selectedNetworks.reduce((a,n)=>a+n.rxBytesPerSec,0))}</span><span>↑ {rate(selectedNetworks.reduce((a,n)=>a+n.txBytesPerSec,0))}</span></>}/>;
    if (id === 'weather') return <article key={id} className="metric-card weather-card" style={{'--metric-accent':'#80b8ff'} as any}><div className="metric-top"><div className="metric-icon"><CloudSun size={17}/></div><div className="metric-heading"><span>SUZHOU / LOCAL WEATHER</span><strong>苏州 · {settings.weatherLocation==='wujiang'?'吴江':'市区'}</strong></div><button className="icon-quiet" onClick={()=>notify('天气每 15 分钟自动更新')}><MoreHorizontal size={17}/></button></div><div className="weather-main"><div><strong>{fmt(weather?.temperature,0)}<small>°C</small></strong><span>{weatherText(weather?.weatherCode)}</span></div><div className="weather-icon weather-glyph-main" aria-hidden="true">{weatherGlyph(weather?.weatherCode)}</div></div><div className="weather-details"><span><Thermometer size={13}/>体感 {fmt(weather?.apparentTemperature,0)}°</span><span><Activity size={13}/>湿度 {fmt(weather?.humidity,0)}%</span><span><WindIcon/>风速 {fmt(weather?.windSpeed,0)} km/h</span></div><div className="aqi-line"><span>US AIR QUALITY INDEX</span><b className="aqi-reading" style={{color:aqiPresentation.textColor}}><span style={{color:aqiPresentation.textColor}}>AQI</span> {weather?.aqi == null ? '—' : Math.round(weather.aqi)} <small style={{color:aqiPresentation.textColor}}>{aqiPresentation.label}</small></b><span>PM2.5 {fmt(weather?.pm25,0)} μg/m³</span></div></article>;
    return null;
  };

  const currentMusicTrack = music.state?.tracks.find(track => track.id === music.state?.currentTrackId) ?? null;
  const replayGainMode = settings.musicReplayGainMode === 'album' ? 'album' : 'track';
  const replayGainDb = settings.musicReplayGainEnabled
    ? (replayGainMode === 'album'
      ? currentMusicTrack?.replayGainAlbumDb ?? currentMusicTrack?.replayGainTrackDb
      : currentMusicTrack?.replayGainTrackDb ?? currentMusicTrack?.replayGainAlbumDb) ?? null
    : null;
  const replayGainPeak = replayGainMode === 'album'
    ? currentMusicTrack?.replayGainAlbumPeak ?? currentMusicTrack?.replayGainTrackPeak ?? null
    : currentMusicTrack?.replayGainTrackPeak ?? currentMusicTrack?.replayGainAlbumPeak ?? null;

  return <div className={`app-shell theme-${themeClass}`} style={{'--accent':settings.accent,'--opacity':settings.opacity/100,...(settings.theme==='portrait'&&settings.backgroundDataUrl?{backgroundImage:`linear-gradient(90deg,rgba(8,13,20,.94),rgba(8,13,20,.79)),url(${settings.backgroundDataUrl})`,backgroundSize:'cover',backgroundPosition:'center'}:{})} as any}>
    <MusicPlaybackRuntime state={music.state} outputDeviceId={settings.musicOutputDeviceId ?? 'default'} eqBands={settings.musicEqBands ?? [0,0,0,0,0,0,0,0,0,0]} replayGainDb={replayGainDb} replayGainPeak={replayGainPeak} sleepTimerEndsAt={musicSleepTimerEndsAt} exclusiveEnabled={settings.musicWasapiEnabled === true} exclusiveDeviceId={settings.musicWasapiDeviceId ?? ''} onSleepTimerComplete={clearMusicSleepTimer} onOutputStatus={setMusicOutputStatus} onWasapiStatus={setMusicWasapiStatus}/>
    <aside className="sidebar">
      <div className="app-brand"><div className="brand-emblem"><span>N</span><i/></div><div><strong>NEXUS<span>MONITOR</span></strong><small>HARDWARE INTELLIGENCE</small></div></div>
      <div className="sidebar-divider"/>
      {['监控中心','设备输出','个性化','扩展管理','管理'].map(group => <div className="nav-group" key={group}><div className="nav-group-title">{group}</div>{navItems.filter(n=>n.group===group).map(item=>{
        const Icon=item.icon; return <button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}><Icon size={17}/><span>{item.label}</span>{page===item.id&&<i/>}</button>;
      })}</div>)}
      <div className="sidebar-bottom"><div className={`service-chip ${serviceState==='online'?'online':'offline'}`}><span className="pulse-dot"/><div><b>{serviceStatus.phase==='degraded'?'服务响应超时':serviceState==='online'?'本机服务在线':'等待硬件服务'}</b><small>{serviceState==='online'?'LOCAL TELEMETRY':serviceStatus.phase==='restarting'?'RESTARTING':'LOCALHOST :18765'}</small></div></div><div className="sidebar-footer"><span>NEXUS MONITOR</span><span>2.2.1</span></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>工作台</span><ChevronRight size={13}/><strong>{navItems.find(n=>n.id===page)?.label}</strong></div><div className="topbar-right"><div className="top-clock"><span>{clock.toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'})}</span><b>{clock.toLocaleTimeString('zh-CN',{hour12:false})}</b></div><div className="top-divider"/><button className="top-icon" title="打开悬浮导航" onClick={()=>window.nexus.toggleWidget()}><MonitorCog size={17}/></button><button className="top-icon" title="刷新数据" onClick={()=>void refreshSnapshot()}><RefreshCw size={16}/></button><div className="user-orb">NM</div><WindowControls/></div></header>

      <div className="page-content">
        {page==='overview' && <>
          <div className="page-heading"><div><div className="eyebrow-line"><span className="live-pulse"/> LIVE SYSTEM TELEMETRY <span className="eyebrow-rule"/></div><h1>系统性能<span>总览</span></h1><p>全局硬件状态、实时负载与运行环境，一屏掌握。</p></div><div className="heading-actions"><span className="last-update"><span className="pulse-dot"/> {snapshot ? `更新于 ${new Date(snapshot.timestamp).toLocaleTimeString('zh-CN',{hour12:false})}` : '等待数据源'}</span><button className="btn-secondary" onClick={()=>setPage('devices')}><SlidersHorizontal size={15}/> 配置监控项</button></div></div>
          {serviceState!=='online' && <div className="connection-banner"><div className="banner-symbol"><Cable size={18}/></div><div><b>{serviceBannerTitle}</b><span>{serviceStatus.message || '界面已启动，但尚未取得真实传感器数据。请确认 .NET 10 硬件服务已成功启动；数值不会用模拟数据填充。'}</span></div><button onClick={()=>void refreshSnapshot()}><RefreshCw size={14}/> 重试</button></div>}
          <section className="hero-grid">{settings.metricOrder.filter(id=>id==='cpu'||id==='gpu').map(renderHeroMetric)}</section>
          <section className="metric-grid">{settings.metricOrder.filter(id=>['memory','network','weather'].includes(id)).map(renderMetric)}</section>

          <section className="lower-grid">{settings.metricOrder.filter(id=>id==='storage'||id==='uptime').map(id=>{
            if(id==='storage'&&visible('storage')) return <article key={id} className="panel disk-panel"><div className="panel-heading"><div><span className="card-kicker">03 / STORAGE DEVICES</span><h3>存储设备</h3><p>{snapshot?.storage?.diskPerformanceAvailable ? `Windows PhysicalDisk：匹配 ${snapshot.storage.diskPerformanceMatchedDiskCount ?? 0}/${snapshot.storage.diskCount} 块` : (snapshot?.storage?.diskPerformanceError ?? '等待 Windows 磁盘性能数据')}</p></div><button className="text-action" onClick={()=>setPage('devices')}>设备详情 <ChevronRight size={14}/></button></div>{selectedDisks.length===0?<div className="empty-state">{storageError ?? '尚未取得物理磁盘信息'}</div>:selectedDisks.map(d=>{const usage=getDiskVolumeUsage(snapshot,d);return <div className="disk-row" key={d.id}><div className="disk-icon"><HardDrive size={18}/></div><div className="disk-info"><b>{d.model}</b><span>{d.isOptane?'INTEL OPTANE CACHE':d.interfaceType || 'PHYSICAL DISK'} · 物理容量 {d.sizeBytes?bytes(d.sizeBytes):'未知'} · R {rate(d.readBytesPerSec)} / W {rate(d.writeBytesPerSec)}</span>{usage?<div className="disk-capacity"><div className="disk-capacity-meta"><span>{usage.names.join(' + ')} 卷空间占用</span><b>{bytes(usage.usedBytes)} / {bytes(usage.totalBytes)} · {fmt(usage.percent,0)}%</b></div><Progress value={usage.percent} color={usage.percent>=90?'#f17d79':'#42bfd4'} thin/></div>:<small className="disk-capacity-unavailable">卷与该物理盘的映射暂不可用</small>}</div><div className="disk-reading"><b>{fmt(d.temperature,0)}<small>°C</small></b><span>温度</span></div><div className="disk-reading"><b>{d.load==null?'—':`${fmt(d.load,0)}%`}</b><span>活动</span></div></div>})}</article>;
            if(id==='uptime'&&visible('uptime')) return <article key={id} className="panel runtime-panel"><div className="panel-heading"><div><span className="card-kicker">04 / SYSTEM RUNTIME</span><h3>系统状态</h3></div><div className="runtime-icon"><Power size={17}/></div></div><div className="runtime-number">{uptime(snapshot?.uptimeSeconds)}</div><span className="runtime-caption">连续运行时间</span><div className="runtime-meta"><div><span>硬件服务</span><b className={serviceState==='online'?'text-green':'text-muted'}>{serviceState==='online'?'在线':serviceStatus.phase==='degraded'?'超时':'离线'}</b></div><div><span>采样周期</span><b>{settings.refreshMs} ms</b></div><div><span>运行模式</span><b>LOCAL / PRIVATE</b></div></div></article>;
            return null;
          })}</section>
        </>}

        {page==='devices'&&<DevicesPage snapshot={snapshot} settings={settings} updateSettings={updateSettings} notify={notify} refreshSnapshot={refreshSnapshot}/>}
        {page==='usb-display'&&<UsbDisplayPage settings={settings} updateSettings={updateSettings} notify={notify}/>}
        {page==='music'&&<MusicLibraryPage state={music.state} onCommand={music.command} notify={notify} settings={settings} updateSettings={updateSettings} outputStatus={musicOutputStatus} wasapiStatus={musicWasapiStatus} sleepTimerEndsAt={musicSleepTimerEndsAt} onSetSleepTimer={setMusicSleepTimer}/> }
        <div className={`turing-background-host ${page === 'turing' ? 'active' : 'inactive'}`} aria-hidden={page !== 'turing'}><TuringPage settings={settings} updateSettings={updateSettings} snapshot={snapshot} weather={weather} notify={notify} active={page === 'turing'} settingsLoaded={settingsLoaded} serviceReady={serviceStatus.phase === 'online' || serviceStatus.phase === 'degraded'}/></div>
        {page==='themes'&&<ThemePage settings={settings} updateSettings={updateSettings} notify={notify}/>}
        {page==='shortcuts'&&<ShortcutsPage settings={settings} updateSettings={updateSettings} notify={notify}/>}
        {page==='plugins'&&<PluginsPage notify={notify}/>}
        {page==='settings'&&<SettingsPage settings={settings} updateSettings={updateSettings} notify={notify}/>}
        <footer className="content-footer"><span>© 2026 NEXUSMONITOR · DESKTOP TELEMETRY</span><span>LOCAL-FIRST · NO ACCOUNT · NO CLOUD SYNC</span></footer>
      </div>
      <MusicPlayerDock state={music.state} onCommand={music.command} onOpen={() => setPage('music')}/>
    </main>
    {toast&&<div className="toast"><Check size={15}/>{toast}</div>}
  </div>;
}
function WindIcon(){return <span className="wind-glyph">≋</span>}

function PageTitle({ kicker,title,subtitle,action }: {kicker:string;title:string;subtitle:string;action?:ReactNode}) {
  return <div className="page-heading"><div><div className="eyebrow-line">{kicker}<span className="eyebrow-rule"/></div><h1>{title}</h1><p>{subtitle}</p></div>{action&&<div className="heading-actions">{action}</div>}</div>;
}

function DevicesPage({snapshot,settings,updateSettings,notify,refreshSnapshot}:any){
  const allNetworks:NetworkSnapshot[] = snapshot?.networks ?? [];
  const networks = allNetworks.filter(n => n.isPhysical === true && n.status === 'Up');
  const primaryNetwork = selectTuringNetwork(snapshot);
  const selectedNetworkIds = settings.selectedNetworks.includes('__none__') ? [] : settings.selectedNetworks.length ? settings.selectedNetworks : (primaryNetwork ? [primaryNetwork.id] : []);
  const disks:DiskSnapshot[] = snapshot?.disks ?? [];
  const storageError = snapshot?.storage?.wmiAvailable === false
    ? `物理磁盘不可用：${snapshot.storage.lastError ?? 'WMI 查询失败'}`
    : null;
  const cores = snapshot?.cpu?.cores ?? [];
  const fans = snapshot?.fans ?? [];
  const sensors = snapshot?.sensors ?? [];
  const [sensorQuery,setSensorQuery] = useState('');
  const toggle = (list:string[],id:string) => list.includes(id)?list.filter(x=>x!==id):[...list,id];
  const filteredSensors = sensors.filter((sensor:any)=>`${sensor.hardware} ${sensor.name} ${sensor.kind}`.toLowerCase().includes(sensorQuery.trim().toLowerCase()));
  return <>
    <PageTitle kicker="HARDWARE INVENTORY / 02" title="硬件与网络" subtitle="选择要显示的网卡与物理磁盘；下方提供 CPU 核心、风扇和底层传感器明细。" action={<button className="btn-secondary" onClick={()=>void refreshSnapshot().then(()=>notify('设备清单已刷新'))}><RefreshCw size={15}/> 刷新设备</button>}/>
    <div className="devices-columns">
      <section className="panel device-list">
        <div className="panel-heading"><div><span className="card-kicker">NETWORK ADAPTERS</span><h3>网络接口</h3></div><span className="count-pill">{networks.length} PHYSICAL</span></div>
        <p className="panel-note">这里只显示已连接的实体网卡。默认只统计 Windows 主路由网卡；VPN、Tailscale、虚拟网卡和回环接口不参与自动测速，避免同一流量被重复累计。只有手动多选实体网卡时才会聚合。</p>
        {networks.length===0?<div className="empty-state">等待本机网络接口数据</div>:networks.map(n=><label className="device-select-row" key={n.id}>
          <input type="checkbox" checked={selectedNetworkIds.includes(n.id)} onChange={()=>{const next=toggle(selectedNetworkIds,n.id);const stored=next.length===0?['__none__']:next.length===1&&next[0]===primaryNetwork?.id?[]:next;updateSettings({selectedNetworks:stored});}}/>
          <span className="device-select-icon"><Wifi size={17}/></span><span className="device-select-main"><b>{n.name}</b><small>{n.description} · {n.ipv4??'未分配 IP'}</small></span>
          <span className={`status-label ${n.isDefaultRoute?'good':''}`}>{n.isDefaultRoute?'主路由':'已连接'}</span><span className="device-traffic"><b>↓ {rate(n.rxBytesPerSec)}</b><small>↑ {rate(n.txBytesPerSec)}</small></span>
        </label>)}
      </section>
      <section className="panel device-list">
        <div className="panel-heading"><div><span className="card-kicker">PHYSICAL STORAGE</span><h3>物理磁盘</h3></div><span className="count-pill">{disks.length} DISKS</span></div>
        <p className="panel-note">自动识别物理磁盘，SSD 与 Optane 分别显示。RST 缓存模式可能隐藏部分底层信息；读写吞吐优先使用 Windows PhysicalDisk 性能计数器；温度及其他硬件传感器来自 LibreHardwareMonitor。</p>
        {snapshot?.storage?.diskPerformanceAvailable===false&&<p className="panel-note">Windows 磁盘性能计数器当前不可用：{snapshot.storage.diskPerformanceError??'未返回实例'}。磁盘温度仍取决于硬件是否暴露传感器。</p>}{disks.length===0?<div className="empty-state">{storageError ?? '等待物理磁盘信息'}</div>:disks.map(d=><label className="device-select-row" key={d.id}>
          <input type="checkbox" checked={isDiskSelected(d, settings.selectedDisks)} onChange={()=>{const base=settings.selectedDisks.length===0?disks.map((x:DiskSnapshot)=>x.id):disks.filter((x:DiskSnapshot)=>isDiskSelected(x, settings.selectedDisks)).map((x:DiskSnapshot)=>x.id);const next=toggle(base,d.id);updateSettings({selectedDisks:next.length===disks.length?[]:next.length===0?['__none__']:next});}}/>
          <span className="device-select-icon"><HardDrive size={17}/></span><span className="device-select-main"><b>{d.model}</b><small>{d.interfaceType} · {d.mediaType} {d.isOptane?'· INTEL OPTANE':''} · R {rate(d.readBytesPerSec)} / W {rate(d.writeBytesPerSec)}</small></span>
          <span className="disk-capacity">{d.sizeBytes?bytes(d.sizeBytes):'—'}</span><span className="device-traffic"><b>{fmt(d.temperature,0)}°C</b><small>{d.load==null?'负载 —':`活动 ${fmt(d.load,0)}%`}</small></span>
        </label>)}
      </section>
    </div>
    <section className="panel core-panel">
      <div className="panel-heading"><div><span className="card-kicker">PROCESSOR DETAIL</span><h3>CPU 核心状态</h3></div><span className="count-pill">{cores.length} CORE GROUPS</span></div>
      {snapshot?.service?.pawnIoInstalled === false && <p className="panel-note">未检测到 PawnIO 驱动。LibreHardwareMonitor 的部分 Intel CPU 底层温度、频率和功耗传感器可能因此不可用；NexusMonitor 不会自动安装内核驱动。请先核对官方 PawnIO 安装状态。</p>}
      {snapshot?.service?.pawnIoInstalled === true && snapshot.service.pawnIoRunning === false && <p className="panel-note">检测到 PawnIO 驱动但当前未运行。CPU 低层传感器可能不可用。</p>}
      {snapshot?.service?.gpuTemperatureProbeStatus && snapshot.service.gpuTemperatureProbeStatus !== 'not-needed-lhm-temperature-available' && <p className="panel-note">Intel 核显 GT 温度探测：{snapshot.service.gpuTemperatureProbeStatus}。探测仅针对 Alder Lake CPUID 白名单，读取 THERM_STATUS_GT；未通过有效位与温度范围校验时显示 —。</p>}
      {cores.length===0?<div className="empty-state">当前硬件服务没有返回逐核心传感器；请尝试以管理员身份运行。</div>:<div className="core-grid">{cores.map((core:any,index:number)=><div className="core-card" key={`${core.name}-${index}`}><div className="core-card-head"><b>{core.name}</b><span>{core.clockMHz==null?'—':`${(core.clockMHz/1000).toFixed(2)} GHz`}</span></div><Progress value={core.load} color="#62cfe7"/><div className="core-card-foot"><span>LOAD {core.load==null?'—':`${fmt(core.load,0)}%`}</span><span>TEMP {core.temperature==null?'—':`${fmt(core.temperature,0)}°C`}</span></div></div>)}</div>}
    </section>
    <div className="devices-columns detail-columns">
      <section className="panel device-list">
        <div className="panel-heading"><div><span className="card-kicker">FAN TELEMETRY</span><h3>风扇转速</h3></div><span className="count-pill">{fans.length} SENSORS</span></div>
        {fans.length===0?<div className="empty-state">主板或控制器当前没有暴露风扇转速传感器。</div>:fans.map((fan:any,index:number)=><div className="sensor-row" key={`${fan.hardware}-${fan.name}-${index}`}><span><b>{fan.name}</b><small>{fan.hardware}</small></span><strong>{fan.rpm==null?'—':`${Math.round(fan.rpm)} RPM`}</strong></div>)}
      </section>
      <section className="panel device-list">
        <div className="panel-heading"><div><span className="card-kicker">RAW SENSOR INVENTORY</span><h3>全部硬件传感器</h3></div><span className="count-pill">{sensors.length} READINGS · {(settings.widgetSensorIds ?? []).length} 已选入 HUD</span></div>
        <p className="panel-note">参考 TrafficMonitor HardwareMonitor / PowerMon：包含 CPU、GPU、主板、风扇、电压、电流、功率、能量、电池及受支持的 PSU 传感器。传感器可独立加入悬浮窗；尚无读数的项目仍可先收藏。</p>
        <input className="text-input sensor-search" value={sensorQuery} onChange={e=>setSensorQuery(e.target.value)} placeholder="搜索硬件、指标名称或类型…"/>
        {filteredSensors.length===0?<div className="empty-state">没有匹配的传感器；也可能尚未取得传感器数据。</div>:<div className="sensor-table-wrap"><table className="sensor-table"><thead><tr><th>HUD</th><th>硬件</th><th>传感器</th><th>类型</th><th>当前值</th></tr></thead><tbody>{filteredSensors.map((sensor:any,index:number)=>{const id=sensorSelectionId(sensor);const selected=(settings.widgetSensorIds ?? []).includes(id);return <tr key={id || `${sensor.hardware}-${sensor.name}-${sensor.kind}-${index}`}><td><input className="sensor-select-input" type="checkbox" aria-label={`在悬浮窗显示 ${sensor.hardware} ${sensor.name}`} checked={selected} onChange={()=>{const ids=settings.widgetSensorIds ?? [];updateSettings({widgetSensorIds:ids.includes(id)?ids.filter((item:string)=>item!==id):[...ids,id]});}}/></td><td>{sensor.hardware}</td><td>{sensor.name}</td><td>{sensor.kind}</td><td className="sensor-value">{sensor.value==null?'—':fmt(sensor.value,1)} {sensor.unit}</td></tr>;})}</tbody></table></div>}
      </section>
    </div>
    <section className="panel volume-panel"><div className="panel-heading"><div><span className="card-kicker">MOUNTED VOLUMES</span><h3>逻辑卷与容量</h3></div></div>{(snapshot?.volumes??[]).map((v:any)=><div className="volume-row" key={v.name}><div className="volume-name"><b>{v.name}</b><span>{v.label}</span></div><div className="volume-progress"><Progress value={v.percent} color={v.percent>90?'#f17d79':'#68d9e8'}/></div><div className="volume-size">{bytes(v.usedBytes)} / {bytes(v.totalBytes)}</div><strong>{fmt(v.percent,0)}%</strong></div>)}</section>
  </>;
}

function TuringPage({settings,updateSettings,snapshot,weather,notify,active,settingsLoaded,serviceReady}:any){
  const [status,setStatus]=useState<any>({connected:false,port:'COM3',deviceFound:false,message:'尚未连接'});
  const [ports,setPorts]=useState<any[]>([]); const [busy,setBusy]=useState(false);
  const [wallpaperFiles,setWallpaperFiles]=useState<Array<{path:string;name:string}>>([]);
  const [wallpaperIndex,setWallpaperIndex]=useState(0);
  const [wallpaperPaused,setWallpaperPaused]=useState(false);
  const [wallpaperRevision,setWallpaperRevision]=useState(0);
  const [wallpaperLoading,setWallpaperLoading]=useState(false);
  const frameBusy = useRef(false);
  const pendingFrame = useRef(false);
  const previousFrame = useRef<Uint8Array | null>(null);
  const frameGeneration = useRef(0);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundImage = useRef<HTMLImageElement | null>(null);
  const wallpaperImage = useRef<HTMLImageElement | null>(null);
  const [backgroundRevision,setBackgroundRevision] = useState(0);
  const [frameRetry,setFrameRetry] = useState(0);
  const weatherClockImage = useRef<HTMLImageElement | null>(null);
  const [weatherClockBackgroundRevision, setWeatherClockBackgroundRevision] = useState(0);
  const [weatherClockLoading, setWeatherClockLoading] = useState(false);
  const [weatherClockNow, setWeatherClockNow] = useState(() => new Date());
  useEffect(()=>{
    if(!settings.backgroundDataUrl){backgroundImage.current=null;setBackgroundRevision(v=>v+1);return;}
    const image = new Image();
    image.onload=()=>{backgroundImage.current=image;setBackgroundRevision(v=>v+1);};
    image.onerror=()=>{backgroundImage.current=null;setBackgroundRevision(v=>v+1);};
    image.src=settings.backgroundDataUrl;
  },[settings.backgroundDataUrl]);
  const frameWidth = settings.turingOrientation===100 || settings.turingOrientation===101 ? 320 : 480;
  const frameHeight = settings.turingOrientation===100 || settings.turingOrientation===101 ? 480 : 320;
  const displayMode = settings.turingDisplayMode ?? 'monitor';
  const wallpaperMode = settings.turingWallpaperMode ?? 'single';
  const wallpaperFit = settings.turingWallpaperFit ?? 'contain';
  const weatherClockScene = getWeatherSceneAsset(weather, weatherClockNow);
  useEffect(() => {
    if (displayMode !== 'weather-clock') { weatherClockImage.current = null; setWeatherClockLoading(false); return; }
    let alive = true;
    setWeatherClockLoading(true);
    const image = new Image();
    image.onload = () => { if (alive) { weatherClockImage.current = image; setWeatherClockBackgroundRevision(v => v + 1); setWeatherClockLoading(false); } };
    image.onerror = () => { if (alive) { weatherClockImage.current = null; setWeatherClockBackgroundRevision(v => v + 1); setWeatherClockLoading(false); } };
    image.src = weatherClockScene;
    return () => { alive = false; };
  }, [displayMode, weatherClockScene]);
  useEffect(() => {
    if (displayMode !== 'weather-clock') return;
    const timer = window.setInterval(() => setWeatherClockNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [displayMode]);
  const selectedWallpaper = wallpaperMode==='single'
    ? (settings.turingWallpaperFile ? {path:settings.turingWallpaperFile,name:settings.turingWallpaperFile.split(/[\\/]/).pop()} : null)
    : wallpaperFiles[wallpaperIndex] ?? null;
  useEffect(()=>{
    if(!active)return;
    let alive=true;
    void window.nexus.getTuringDevices().then(r=>{if(alive&&r){setPorts(r.devices??[]);setStatus((s:any)=>({...s,...r.status}));}});
    return()=>{alive=false;};
  },[active]);
  useEffect(()=>{
    if(!settingsLoaded || !serviceReady)return;
    let alive=true;
    const delay=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
    const autoConnect=async()=>{
      for(let attempt=0;attempt<3;attempt++){
        let result:any=null;
        try{result=await window.nexus.getTuringDevices();}catch(error){console.warn('Turing startup device scan failed',error);}
        if(!alive)return;
        if(result){
          const devices=Array.isArray(result.devices)?result.devices:[];
          setPorts(devices);
          if(result.status?.connected){setStatus((current:any)=>({...current,...result.status}));return;}
          const port=findTuringAutoConnectPort(devices,settings.turingPort??'COM3');
          if(port){
            setBusy(true);
            let connection:any=null;
            try{connection=await window.nexus.connectTuring({port,orientation:settings.turingOrientation});}
            catch(error){console.warn('Turing startup connection failed',error);}
            if(!alive)return;
            setBusy(false);
            if(connection){
              setStatus(connection);
              if(connection.connected){
                if(port!==settings.turingPort)updateSettings({turingPort:port});
                return;
              }
            }
          }
        }
        if(attempt<2)await delay(900);
      }
      if(alive)setStatus((current:any)=>current.connected?current:{...current,message:'启动时未检测到可用的图灵副屏；可在设备页手动重试'});
      if(alive)setBusy(false);
    };
    void autoConnect();
    return()=>{alive=false;};
  },[settingsLoaded,serviceReady,settings.turingPort,settings.turingOrientation,updateSettings]);
  const autoBrightnessLastSent = useRef<number | null>(null);
  useEffect(() => {
    if (settings.turingAutoBrightnessEnabled !== true) { autoBrightnessLastSent.current = null; return; }
    if (!status.connected) return;
    let alive = true;
    let applying = false;
    const apply = async () => {
      if (applying || !alive) return;
      const target = getScheduledTuringBrightness(
        new Date(), settings.turingDayStart ?? '08:00', settings.turingNightStart ?? '20:00',
        Number(settings.turingDayBrightness ?? 70), Number(settings.turingNightBrightness ?? 25),
      );
      if (autoBrightnessLastSent.current === target) return;
      applying = true;
      try {
        const result = await window.nexus.setTuringBrightness(target);
        if (!alive || !result) return;
        setStatus(result);
        if (result.connected) {
          autoBrightnessLastSent.current = target;
          updateSettings({ turingBrightness: target });
          notify(`图灵副屏自动亮度已调整为 ${target}%`);
        }
      } catch (error) { console.warn('Turing scheduled brightness failed', error); }
      finally { applying = false; }
    };
    void apply();
    const timer = window.setInterval(() => void apply(), 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [settings.turingAutoBrightnessEnabled, settings.turingDayStart, settings.turingNightStart, settings.turingDayBrightness, settings.turingNightBrightness, status.connected, updateSettings, notify]);
  useEffect(()=>{
    if(displayMode!=='wallpaper' || wallpaperMode!=='slideshow' || !settings.turingWallpaperDirectory)return;
    let alive=true;
    void window.nexus.listTuringWallpaperFiles(settings.turingWallpaperDirectory).then(result=>{
      if(!alive)return;
      setWallpaperFiles(result?.files??[]);
      setWallpaperIndex(0);
      if(!result?.files?.length)notify(result?.message??'目录中没有可播放的图片');
    }).catch(error=>{if(alive)notify(`读取图片目录失败：${String(error)}`);});
    return()=>{alive=false;};
  },[displayMode,wallpaperMode,settings.turingWallpaperDirectory]);
  useEffect(()=>{
    let alive=true;
    const path=displayMode==='wallpaper'
      ? (wallpaperMode==='single' ? settings.turingWallpaperFile : wallpaperFiles[wallpaperIndex]?.path)
      : '';
    frameGeneration.current+=1;wallpaperImage.current=null;previousFrame.current=null;
    if(!path){setWallpaperLoading(false);setWallpaperRevision(v=>v+1);return()=>{alive=false;};}
    setWallpaperLoading(true);
    void window.nexus.readTuringWallpaper(path).then(result=>{
      if(!alive)return;
      if(!result?.ok || !result.dataUrl){wallpaperImage.current=null;setWallpaperLoading(false);notify(`壁纸读取失败：${result?.message??'未知错误'}`);setWallpaperRevision(v=>v+1);return;}
      const image=new Image();
      image.onload=()=>{if(!alive)return;wallpaperImage.current=image;setWallpaperLoading(false);previousFrame.current=null;setWallpaperRevision(v=>v+1);};
      image.onerror=()=>{if(!alive)return;wallpaperImage.current=null;setWallpaperLoading(false);notify(`图片解码失败：${result.name??path}`);setWallpaperRevision(v=>v+1);};
      image.src=result.dataUrl;
    }).catch(error=>{if(alive){wallpaperImage.current=null;setWallpaperLoading(false);notify(`壁纸读取失败：${String(error)}`);setWallpaperRevision(v=>v+1);}});
    return()=>{alive=false;};
  },[displayMode,wallpaperMode,settings.turingWallpaperFile,wallpaperFiles,wallpaperIndex]);
  useEffect(()=>{
    if(displayMode!=='wallpaper' || wallpaperMode!=='slideshow' || wallpaperPaused || wallpaperFiles.length<2)return;
    const seconds=Math.max(30,Math.min(120,Number(settings.turingWallpaperIntervalSeconds??30)));
    const timer=window.setInterval(()=>setWallpaperIndex(index=>(index+1)%wallpaperFiles.length),seconds*1000);
    return()=>window.clearInterval(timer);
  },[displayMode,wallpaperMode,wallpaperPaused,wallpaperFiles.length,settings.turingWallpaperIntervalSeconds]);
  const connect=async()=>{setBusy(true);const r=await window.nexus.connectTuring({port:settings.turingPort,orientation:settings.turingOrientation});setBusy(false);if(r){setStatus(r);if(r.connected)notify(r.visualVerified?'图灵屏已连接':'通信已初始化，视觉输出未验证');else notify('连接失败：'+(r.message??''));}else notify('本机硬件服务不可用');};
  const setScreenPower=async(on:boolean)=>{const r=await window.nexus.setTuringScreenPower(on);if(r){setStatus(r);notify(r.message??(on?'屏幕打开命令已发送':'屏幕关闭命令已发送'));}else notify('本机硬件服务不可用');};
  const cpu=snapshot?.cpu ?? null, gpu=selectTuringGpu(snapshot), mem=snapshot?.memory ?? null;
  const selectedDisk = selectTuringDisk(snapshot, settings.turingDiskId ?? 'auto');
  const selectedNetwork = selectTuringNetwork(snapshot, settings.turingNetworkId ?? 'auto');
  const turingTheme:ThemeId = settings.turingTheme ?? 'paper';
  const palette = turingTheme==='paper'
    ? {bg:'#fbfcfd',fg:'#182231',muted:'#657185',line:'#d7dde5',track:'#e4eaf0',accent:'#259fba'}
    : turingTheme==='titanium'
      ? {bg:'#252a2e',fg:'#f0f1ef',muted:'#b6bdc5',line:'#535b62',track:'#40474d',accent:'#d4aa68'}
      : turingTheme==='portrait'
        ? {bg:'#251c25',fg:'#fff6fa',muted:'#ead8df',line:'#9a7786',track:'#5d4652',accent:'#f1a9c2'}
        : {bg:'#101923',fg:'#e9f2fb',muted:'#a9b9c9',line:'#34495a',track:'#263848',accent:'#6bdcf0'};
  const renderWallpaper=()=>{
    const canvas=document.createElement('canvas');canvas.width=frameWidth;canvas.height=frameHeight;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前运行环境无法创建 Canvas 2D 绘图上下文');
    ctx.fillStyle='#000000';ctx.fillRect(0,0,frameWidth,frameHeight);
    const image=wallpaperImage.current;
    if(!image || !image.naturalWidth || !image.naturalHeight)return canvas;
    if(wallpaperFit==='stretch'){ctx.drawImage(image,0,0,frameWidth,frameHeight);return canvas;}
    const scale=wallpaperFit==='cover'
      ? Math.max(frameWidth/image.naturalWidth,frameHeight/image.naturalHeight)
      : Math.min(frameWidth/image.naturalWidth,frameHeight/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    ctx.drawImage(image,(frameWidth-width)/2,(frameHeight-height)/2,width,height);
    return canvas;
  };
  const renderPreview=()=>displayMode==='wallpaper'
    ? renderWallpaper()
    : displayMode==='weather-clock'
      ? renderTuringWeatherClock(frameWidth,frameHeight,{cpu,gpu,memory:mem,disk:selectedDisk,network:selectedNetwork,weather,now:weatherClockNow},weatherClockImage.current)
      : renderTuringDashboard(frameWidth,frameHeight,{cpu,gpu,memory:mem,disk:selectedDisk,network:selectedNetwork,weather,now:new Date()},palette,turingTheme==='portrait'?backgroundImage.current:null);
  const canvasTo565=()=>{const canvas=renderPreview(),ctx=canvas.getContext('2d')!,img=ctx.getImageData(0,0,frameWidth,frameHeight);const rgb=new Uint8Array(frameWidth*frameHeight*2);for(let i=0,j=0;i<img.data.length;i+=4){const v=((img.data[i]&0xf8)<<8)|((img.data[i+1]&0xfc)<<3)|(img.data[i+2]>>3);rgb[j++]=v&255;rgb[j++]=v>>8;}return rgb;};
  const base64=(data:Uint8Array)=>{let binary='';for(let i=0;i<data.length;i+=0x8000)binary+=String.fromCharCode(...data.subarray(i,Math.min(i+0x8000,data.length)));return btoa(binary);};
  const chooseWallpaperFile=async()=>{
    const file=await window.nexus.chooseTuringWallpaperFile();if(!file)return;
    setWallpaperPaused(false);updateSettings({turingDisplayMode:'wallpaper',turingWallpaperMode:'single',turingWallpaperFile:file.path});
    notify(`已选择壁纸：${file.name}`);
  };
  const chooseWallpaperDirectory=async()=>{
    const result=await window.nexus.chooseTuringWallpaperDirectory();if(!result)return;
    if(!result.files?.length){notify(result.message??'所选目录中没有支持的图片');return;}
    setWallpaperFiles(result.files);setWallpaperIndex(0);setWallpaperPaused(false);
    updateSettings({turingDisplayMode:'wallpaper',turingWallpaperMode:'slideshow',turingWallpaperDirectory:result.path,turingWallpaperFile:''});
    notify(`已载入 ${result.files.length} 张图片，默认每 30 秒轮播`);
  };
  const changeWallpaperIndex=(step:number)=>{
    if(wallpaperFiles.length<1)return;
    setWallpaperIndex(index=>(index+step+wallpaperFiles.length)%wallpaperFiles.length);
  };
  useEffect(()=>{
    if(!active)return;
    const target=previewCanvasRef.current;if(!target)return;
    try{const frame=renderPreview();const ctx=target.getContext('2d');if(ctx){ctx.clearRect(0,0,frameWidth,frameHeight);ctx.drawImage(frame,0,0);}}
    catch(error){console.warn('Turing preview render failed',error);}
  },[active,snapshot,weather,settings.turingOrientation,settings.turingTheme,settings.turingDiskId,settings.turingNetworkId,backgroundRevision,displayMode,wallpaperRevision,wallpaperFit,weatherClockBackgroundRevision,weatherClockNow,weatherClockScene]);
  const sendFrame=async()=>{
    if(!status.connected){notify('请先连接图灵屏');return;}
    if(displayMode==='weather-clock'&&weatherClockLoading){notify('天气背景仍在载入，请稍后发送');return;}
    if(displayMode==='wallpaper'&&(wallpaperLoading||!wallpaperImage.current)){notify('请先选择并载入一张有效壁纸');return;}
    if(frameBusy.current)return;setBusy(true);frameBusy.current=true;
    const generation=frameGeneration.current;
    try{const rgb=canvasTo565();const r=await window.nexus.pushTuringPatches({patches:[{x:0,y:0,width:frameWidth,height:frameHeight,dataBase64:base64(rgb)}]});if(r?.ok){if(generation===frameGeneration.current)previousFrame.current=rgb;notify(displayMode==='wallpaper'?'静态壁纸已发送':displayMode==='weather-clock'?'天气时钟已发送':'整屏画面已发送');}else notify('发送失败：'+(r?.message??'未知错误'));}
    catch(e){notify(`渲染失败：${String(e)}`);}finally{frameBusy.current=false;setBusy(false);if(pendingFrame.current){pendingFrame.current=false;setFrameRetry(v=>v+1);}}
  };
  useEffect(()=>{frameGeneration.current+=1;previousFrame.current=null;},[settings.turingOrientation,displayMode,wallpaperRevision,wallpaperFit]);
  useEffect(()=>{if(displayMode==='weather-clock'){frameGeneration.current+=1;previousFrame.current=null;}},[displayMode,weatherClockScene]);
  useEffect(()=>{
    if(!status.connected){previousFrame.current=null;return;}
    if(displayMode==='wallpaper'&&(wallpaperLoading||!wallpaperImage.current))return;
    if(displayMode==='weather-clock'&&weatherClockLoading)return;
    const timer=window.setTimeout(async()=>{
      if(frameBusy.current){pendingFrame.current=true;return;}
      frameBusy.current=true;
      try{
        const generation=frameGeneration.current;const current=canvasTo565();const previous=previousFrame.current;const patches:Array<{x:number;y:number;width:number;height:number;dataBase64:string}>=[];
        if(!previous||previous.length!==current.length){patches.push({x:0,y:0,width:frameWidth,height:frameHeight,dataBase64:base64(current)});}
        else{
          const tw=16,th=8;
          for(let y=0;y<frameHeight;y+=th)for(let x=0;x<frameWidth;x+=tw){const tileW=Math.min(tw,frameWidth-x),tileH=Math.min(th,frameHeight-y);let changed=false;const tile=new Uint8Array(tileW*tileH*2);let k=0;
            for(let yy=0;yy<tileH;yy++){const start=((y+yy)*frameWidth+x)*2;for(let xx=0;xx<tileW*2;xx++){const value=current[start+xx];tile[k++]=value;if(value!==previous[start+xx])changed=true;}}
            if(changed)patches.push({x,y,width:tileW,height:tileH,dataBase64:base64(tile)});
          }
        }
        if(patches.length){const result=await window.nexus.pushTuringPatches({patches});if(result?.ok&&generation===frameGeneration.current)previousFrame.current=current;else if(!result?.ok)console.warn('Turing display frame rejected',result?.message);}
      }catch(e){console.warn('Turing display refresh failed',e);}finally{frameBusy.current=false;if(pendingFrame.current){pendingFrame.current=false;setFrameRetry(v=>v+1);}}
    },250);
    return()=>window.clearTimeout(timer);
  },[status.connected,snapshot,weather,settings.turingOrientation,settings.turingTheme,settings.turingDiskId,settings.turingNetworkId,backgroundRevision,displayMode,wallpaperRevision,wallpaperFit,weatherClockBackgroundRevision,weatherClockNow,weatherClockScene,weatherClockLoading,frameRetry]);
  const diskOptions=snapshot?.disks??[];
  const networkOptions=(snapshot?.networks??[]).filter((n:any)=>n.status==='Up'&&n.isPhysical===true);
  return <><PageTitle kicker="USB DISPLAY / 03" title="图灵 3.5 英寸副屏" subtitle="硬件监控、静态壁纸与天气时钟；电脑端预览与实际 RGB565 输出使用同一画面。" action={<span className={`status-label ${status.connected?'good':''}`}>{status.visualVerified?'已连接':status.connected?'通信已初始化':'未连接'}</span>}/>
    <div className="turing-layout"><section className="panel turing-preview-panel"><div className="panel-heading"><div><span className="card-kicker">{frameWidth} × {frameHeight} / {frameWidth>frameHeight?'LANDSCAPE':'PORTRAIT'}</span><h3>实际屏幕画面预览</h3></div><span className="count-pill">{displayMode==='wallpaper'?'WALLPAPER':displayMode==='weather-clock'?'WEATHER CLOCK':'HARDWARE MONITOR'}</span></div><div className={`turing-device ${frameWidth<frameHeight?'portrait':''}`}><div className={`turing-screen turing-${turingTheme}`}><canvas ref={previewCanvasRef} width={frameWidth} height={frameHeight} className="turing-canvas-preview"/></div><div className="turing-bezel"><div className="turing-usb left"/><div className="turing-usb right"/><span>TURING SMART DISPLAY</span></div></div><div className="preview-caption">预览与副屏发送同一份绘制结果；横屏 480 × 320，竖屏 320 × 480。{displayMode==='wallpaper'?'壁纸按所选适配方式处理，不会默认拉伸。':displayMode==='weather-clock'?'天气背景按天气、当地日出日落时刻自动选择；横竖屏分别排版。':''}</div></section>
    <section className="panel turing-settings"><div className="panel-heading"><div><span className="card-kicker">DEVICE CONFIGURATION</span><h3>连接与显示</h3></div><Monitor size={18}/></div>
      <label className="field-label">副屏内容模式</label><div className="segmented"><button className={displayMode==='monitor'?'selected':''} onClick={()=>{updateSettings({turingDisplayMode:'monitor'});notify('已切换到硬件监控模式');}}>硬件监控</button><button className={displayMode==='wallpaper'?'selected':''} onClick={()=>{updateSettings({turingDisplayMode:'wallpaper'});notify('已切换到静态壁纸模式');}}>静态壁纸</button><button className={displayMode==='weather-clock'?'selected':''} onClick={()=>{updateSettings({turingDisplayMode:'weather-clock'});notify('已切换到天气时钟模式');}}>天气时钟</button></div>
      {displayMode==='weather-clock'&&<div className="turing-wallpaper-panel"><div className="setting-note"><CloudSun size={15}/><span>自动场景：晴天与晨昏图片按真实日出日落时刻匹配，雨雪雾等场景独立分类；当前背景 {weatherClockScene.split('/').pop()}。</span></div><p className="panel-note">天气时钟显示当前天气、体感、湿度、AQI、风速、未来 6 小时和未来 3 天。背景按当地天气与时段变化，串口仍使用原有单写入器和 16×8 差分刷新。</p></div>}
      {displayMode==='wallpaper'&&<div className="turing-wallpaper-panel">
        <label className="field-label">图片播放方式</label><div className="segmented"><button className={wallpaperMode==='single'?'selected':''} onClick={()=>updateSettings({turingWallpaperMode:'single'})}>单张静态</button><button className={wallpaperMode==='slideshow'?'selected':''} onClick={()=>updateSettings({turingWallpaperMode:'slideshow'})}>目录轮播</button></div>
        <div className="turing-wallpaper-actions"><button className="btn-secondary" onClick={()=>void chooseWallpaperFile()}><ImageIcon size={15}/> 选择一张图片</button><button className="btn-secondary" onClick={()=>void chooseWallpaperDirectory()}><FolderOpen size={15}/> 选择照片目录</button></div>
        <div className="turing-wallpaper-current"><ImageIcon size={16}/><span>{wallpaperMode==='single'?(selectedWallpaper?.name??'尚未选择图片'):(settings.turingWallpaperDirectory||'尚未选择目录')}</span><small>{wallpaperLoading?'读取中…':wallpaperMode==='single'?(wallpaperImage.current?'单张静态显示':'未载入'):`${wallpaperFiles.length} 张图片 · ${selectedWallpaper?.name??'等待图片'}`}</small></div>
        {wallpaperMode==='slideshow'&&<><label className="field-label">切换间隔</label><select className="select-input" value={settings.turingWallpaperIntervalSeconds??30} onChange={e=>updateSettings({turingWallpaperIntervalSeconds:Number(e.target.value)})}><option value={30}>每 30 秒</option><option value={60}>每 60 秒</option><option value={90}>每 90 秒</option><option value={120}>每 120 秒</option></select><div className="turing-wallpaper-actions"><button className="btn-secondary" onClick={()=>changeWallpaperIndex(-1)} disabled={wallpaperFiles.length<2}><SkipBack size={14}/> 上一张</button><button className="btn-secondary" onClick={()=>setWallpaperPaused(v=>!v)} disabled={wallpaperFiles.length<2}>{wallpaperPaused?<Play size={14}/>:<Pause size={14}/>} {wallpaperPaused?'继续轮播':'暂停轮播'}</button><button className="btn-secondary" onClick={()=>changeWallpaperIndex(1)} disabled={wallpaperFiles.length<2}><SkipForward size={14}/> 下一张</button><button className="icon-button" title="重新扫描目录" onClick={()=>{if(settings.turingWallpaperDirectory)void window.nexus.listTuringWallpaperFiles(settings.turingWallpaperDirectory).then(r=>{setWallpaperFiles(r.files??[]);setWallpaperIndex(0);notify(`已重新扫描：${r.files?.length??0} 张图片`);});}}><RefreshCw size={14}/></button></div></>}
        <label className="field-label">图片尺寸适配</label><div className="segmented turing-wallpaper-fit"><button className={wallpaperFit==='contain'?'selected':''} onClick={()=>updateSettings({turingWallpaperFit:'contain'})}>完整显示</button><button className={wallpaperFit==='cover'?'selected':''} onClick={()=>updateSettings({turingWallpaperFit:'cover'})}>铺满裁切</button><button className={wallpaperFit==='stretch'?'selected':''} onClick={()=>updateSettings({turingWallpaperFit:'stretch'})}>强制拉伸</button></div>
        <p className="panel-note">默认完整显示并保持原始比例，空白处填充黑色；铺满裁切同样不变形。只有主动选择“强制拉伸”才会改变照片比例。支持 JPG、PNG、WEBP、BMP，单张图片最大 40 MB。</p>
      </div>}
      <label className="field-label">串口设备</label><div className="field-row"><select value={settings.turingPort} onChange={e=>updateSettings({turingPort:e.target.value})}><option value="COM3">COM3 · USB Serial Device</option>{ports.map((p:any)=><option key={p.port} value={p.port}>{p.port} · {p.name}</option>)}</select><button className="icon-button" onClick={()=>void window.nexus.getTuringDevices().then(r=>{setPorts(r?.devices??[]);notify('设备列表已刷新')})}><RefreshCw size={15}/></button></div>
      {displayMode==='monitor'&&<><label className="field-label">副屏显示硬盘</label><select className="select-input" value={settings.turingDiskId??'auto'} onChange={e=>updateSettings({turingDiskId:e.target.value})}><option value="auto">自动：C 盘所在物理硬盘</option>{diskOptions.map((d:any)=><option key={d.id} value={d.id}>{d.model} · {d.sizeBytes?bytes(d.sizeBytes):'容量未知'}</option>)}</select>
      <label className="field-label">副屏显示网卡</label><select className="select-input" value={settings.turingNetworkId??'auto'} onChange={e=>updateSettings({turingNetworkId:e.target.value})}><option value="auto">自动：Windows 主路由实体网卡</option>{networkOptions.map((n:any)=><option key={n.id} value={n.id}>{n.name} · {n.description}</option>)}</select>
      <div className="setting-note"><HardDrive size={14}/><span>当前副屏硬盘：{selectedDisk?.model??(diskOptions.length>1?'尚未确认 C 盘对应磁盘':'等待磁盘数据')}</span></div><div className="setting-note"><Network size={14}/><span>当前副屏网卡：{selectedNetwork?.name??'暂未发现已连接网卡'}</span></div>
      <label className="field-label">副屏独立主题</label><div className="segmented turing-theme-selector"><button className={turingTheme==='paper'?'selected':''} onClick={()=>updateSettings({turingTheme:'paper'})}>白底工程</button><button className={turingTheme==='obsidian'?'selected':''} onClick={()=>updateSettings({turingTheme:'obsidian'})}>曜石科技</button><button className={turingTheme==='titanium'?'selected':''} onClick={()=>updateSettings({turingTheme:'titanium'})}>钛金属</button><button className={turingTheme==='portrait'?'selected':''} onClick={()=>updateSettings({turingTheme:'portrait'})}>写真背景</button></div></>}
      <label className="field-label">屏幕方向</label><div className="segmented"><button className={settings.turingOrientation===103?'selected':''} onClick={()=>{updateSettings({turingOrientation:103});void window.nexus.setTuringOrientation(103)}}>横屏</button><button className={settings.turingOrientation===100?'selected':''} onClick={()=>{updateSettings({turingOrientation:100});void window.nexus.setTuringOrientation(100)}}>竖屏</button><button className={settings.turingOrientation===102?'selected':''} onClick={()=>{updateSettings({turingOrientation:102});void window.nexus.setTuringOrientation(102)}}>横屏倒置</button><button className={settings.turingOrientation===101?'selected':''} onClick={()=>{updateSettings({turingOrientation:101});void window.nexus.setTuringOrientation(101)}}>竖屏倒置</button></div>
      <label className="field-label">手动背光亮度 <b>{settings.turingBrightness}%</b></label><input className="range" type="range" min="0" max="100" value={settings.turingBrightness} disabled={settings.turingAutoBrightnessEnabled===true} onChange={e=>{const v=Number(e.target.value);updateSettings({turingBrightness:v});void window.nexus.setTuringBrightness(v).then(r=>{if(r)setStatus(r);})}}/>
      <div className="turing-auto-brightness">
        <div className="setting-row"><div><b>昼夜自动亮度</b><small>按本机时间切换图灵屏真实背光；仅在已连接时执行</small></div><label className="switch"><input type="checkbox" checked={settings.turingAutoBrightnessEnabled===true} onChange={e=>{autoBrightnessLastSent.current=null;updateSettings({turingAutoBrightnessEnabled:e.target.checked});}}/><i/></label></div>
        <div className="turing-brightness-schedule">
          <label><span>白天开始</span><input type="time" value={settings.turingDayStart??'08:00'} onChange={e=>{autoBrightnessLastSent.current=null;updateSettings({turingDayStart:e.target.value});}}/></label>
          <label><span>白天亮度 <b>{settings.turingDayBrightness??70}%</b></span><input className="range" type="range" min="0" max="100" value={settings.turingDayBrightness??70} onChange={e=>{autoBrightnessLastSent.current=null;updateSettings({turingDayBrightness:Number(e.target.value)});}}/></label>
          <label><span>夜间开始</span><input type="time" value={settings.turingNightStart??'20:00'} onChange={e=>{autoBrightnessLastSent.current=null;updateSettings({turingNightStart:e.target.value});}}/></label>
          <label><span>夜间亮度 <b>{settings.turingNightBrightness??25}%</b></span><input className="range" type="range" min="0" max="100" value={settings.turingNightBrightness??25} onChange={e=>{autoBrightnessLastSent.current=null;updateSettings({turingNightBrightness:Number(e.target.value)});}}/></label>
        </div>
        <p className="panel-note">关闭自动亮度后可使用上方手动滑块。自动模式会在连接成功、设置改变及每 30 秒检查一次；不会创建第二个串口写入者。</p>
      </div>
      <div className="turing-actions"><button className="btn-primary" onClick={connect} disabled={busy}>{busy?'处理中…':status.connected?'重新连接':'连接副屏'}</button><button className="btn-secondary" onClick={()=>void window.nexus.disconnectTuring().then(()=>{setStatus({connected:false,message:'已断开'});previousFrame.current=null;})}>断开</button><button className="btn-secondary" onClick={()=>void setScreenPower(false)} disabled={!status.connected}>关闭屏幕</button><button className="btn-secondary" onClick={()=>void setScreenPower(true)} disabled={!status.connected}>打开屏幕</button></div>
      <button className="btn-secondary full" onClick={sendFrame} disabled={!status.connected||busy}><MonitorCog size={15}/>{busy?'发送中…':displayMode==='wallpaper'?'发送当前壁纸':displayMode==='weather-clock'?'发送天气时钟':'发送当前页面测试画面'}</button><div className="protocol-note"><ShieldCheck size={15}/><span>VID/PID 1A86:5722 · Revision A · 115200 baud · RGB565；监控画面保留 16×8 像素块差分刷新。静态壁纸只在图片变化时发送。</span></div>
    </section></div>
  </>;
}

type UsbDisplayInfo = { id: string; index: number; primary: boolean; width: number; height: number; x: number; y: number; scaleFactor: number; label: string };
type UsbDisplayStatus = { open: boolean; targetDisplayId: string | null };

function UsbDisplayPage({settings,updateSettings,notify}:any){
  const [displays,setDisplays]=useState<UsbDisplayInfo[]>([]);
  const [displayStatus,setDisplayStatus]=useState<UsbDisplayStatus>({open:false,targetDisplayId:null});
  const [busy,setBusy]=useState(false);
  const mode=settings.usbDisplayMode??'monitor';
  const persistedDisplay=displays.find(display=>display.id===String(settings.usbDisplayDisplayId??''))??null;
  const selectedDisplay=persistedDisplay;
  const activeDisplay=displayStatus.open?displays.find(display=>display.id===displayStatus.targetDisplayId)??selectedDisplay:selectedDisplay;
  const refresh=useCallback(async()=>{
    try{
      const [found,status]=await Promise.all([window.nexus.getDesktopDisplays(),window.nexus.getUsbDisplayStatus()]);
      setDisplays(Array.isArray(found)?found:[]);setDisplayStatus(status??{open:false,targetDisplayId:null});
    }catch(error){console.warn('USB display discovery failed',error);}
  },[settings.usbDisplayDisplayId,updateSettings]);
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),5000);const off=window.nexus.onDesktopDisplaysChanged(()=>void refresh());const statusOff=window.nexus.onUsbDisplayStatusChanged(value=>setDisplayStatus(value));return()=>{window.clearInterval(timer);off();statusOff();};},[refresh]);
  const chooseFile=async(kind:'image'|'video')=>{
    const result=await window.nexus.chooseUsbDisplayMedia(kind);if(!result)return;
    if(kind==='video')updateSettings({usbDisplayVideoPath:result.path});
    else updateSettings({usbDisplayImagePath:result.path});
    notify(`已选择${kind==='video'?'视频':'图片'}：${result.name}`);
  };
  const start=async()=>{
    if(mode==='music-only'){
      setBusy(true);try{await window.nexus.closeUsbDisplay();setDisplayStatus({open:false,targetDisplayId:null});notify('已启用桌面壁纸 + 后台音乐模式；Windows 壁纸不受覆盖');}catch(error){notify(`切换桌面壁纸音乐模式失败：${String(error)}`);}finally{setBusy(false);}
      return;
    }
    if(displays.length<2){notify('尚未检测到第二块显示器；请确认 5 寸屏已在 Windows 中启用“扩展这些显示器”');return;}
    if(!selectedDisplay){notify('请先选择 5 寸屏幕对应的显示器');return;}
    setBusy(true);try{const result=await window.nexus.openUsbDisplay(selectedDisplay.id);if(result?.ok){setDisplayStatus({open:true,targetDisplayId:selectedDisplay.id});notify(`副屏已启动：${selectedDisplay.label}`);}else notify(result?.message??'启动副屏失败');}catch(error){notify(`启动副屏失败：${String(error)}`);}finally{setBusy(false);}
  };
  const close=async()=>{setBusy(true);try{await window.nexus.closeUsbDisplay();setDisplayStatus({open:false,targetDisplayId:null});notify('USB 5 寸副屏已关闭');}catch(error){notify(`关闭副屏失败：${String(error)}`);}finally{setBusy(false);}};
  return <>
    <PageTitle kicker="USB DISPLAY / 960 × 540" title="USB 5 寸副屏" subtitle="五种可视输出模式，以及不占用副屏窗口的桌面壁纸音乐模式。" action={<span className={`status-label ${displayStatus.open||mode==='music-only'?'good':''}`}>{displayStatus.open?'副屏运行中':mode==='music-only'?'桌面壁纸音乐模式':displays.length>1?'已检测到扩展显示器':'等待扩展显示器'}</span>}/>
    <div className="usb-display-layout usb-display-layout-v2">
      <section className="panel usb-display-device-panel">
        <div className="panel-heading"><div><span className="card-kicker">DISPLAY TARGET</span><h3>显示器与运行状态</h3></div><MonitorPlay size={19}/></div>
        <div className="usb-display-status-card usb-display-status-card-v2"><div className={`usb-display-status-icon ${displayStatus.open||mode==='music-only'?'active':''}`}><Monitor size={25}/></div><div><b>{mode==='music-only'?'NexusMonitor 输出窗口已隐藏':displayStatus.open?'5 寸副屏窗口正在显示':'5 寸副屏尚未启动'}</b><span>{mode==='music-only'?'Windows 桌面壁纸保持原样；后台音乐服务仍可播放':activeDisplay?`${activeDisplay.label} · ${activeDisplay.width} × ${activeDisplay.height} · ${activeDisplay.primary?'主显示器':'扩展显示器'}`:'请选择已连接的扩展显示器'}</span></div><span className={`status-dot ${displayStatus.open||mode==='music-only'?'online':''}`}/></div>
        <label className="field-label">目标显示器</label>
        <select className="select-input" value={persistedDisplay?String(settings.usbDisplayDisplayId??''):''} onChange={e=>updateSettings({usbDisplayDisplayId:e.target.value})}>
          <option value="">请选择五寸屏对应的显示器</option>
          {displays.map(display=><option key={display.id} value={display.id}>{display.label} · {display.width}×{display.height}{display.primary?' · 主屏':''}</option>)}
        </select>
        {settings.usbDisplayDisplayId&&!persistedDisplay&&<p className="panel-note">上次保存的显示器目前未检测到。为避免误把其他外接屏当成五寸屏，请重新选择目标显示器；程序不会自动切换到其他屏幕。</p>}
        <div className="usb-display-actions"><button className="btn-primary" disabled={busy||(displayStatus.open&&mode!=='music-only')} onClick={()=>void start()}><Play size={15}/>{busy?'处理中…':mode==='music-only'?'应用桌面壁纸音乐模式':'启动副屏'}</button><button className="btn-secondary" disabled={busy||!displayStatus.open} onClick={()=>void close()}><Power size={15}/>关闭副屏</button><button className="icon-button" title="刷新显示器" onClick={()=>void refresh()}><RefreshCw size={15}/></button></div>
        <p className="panel-note">副屏输出只控制 NexusMonitor 的独立窗口，不改变 Windows 的扩展桌面模式。关闭输出窗口后，Windows 仍保持扩展显示。</p>
        {displays.length>0&&<div className="usb-display-list">{displays.map(display=><div key={display.id}><span className="display-number">{display.index}</span><span><b>{display.label}{display.primary?'（主屏）':''}</b><small>{display.width} × {display.height} · 坐标 {display.x}, {display.y} · 缩放 {Math.round(display.scaleFactor*100)}%</small></span><span className={`display-tag ${display.id===String(settings.usbDisplayDisplayId??'')?'selected':''}`}>{display.id===String(settings.usbDisplayDisplayId??'')?'当前目标':display.primary?'主屏':'可选'}</span></div>)}</div>}
      </section>
      <section className="panel usb-display-mode-panel">
        <div className="panel-heading"><div><span className="card-kicker">OUTPUT CONTENT</span><h3>副屏模式</h3></div><Tv size={19}/></div>
        <div className="usb-display-mode-grid usb-display-mode-grid-v2">
          {([['monitor','硬件监控','大字仪表盘 · 彩色状态条 · 实时曲线',Monitor],['static','静态壁纸','本地图片 · 共享音乐服务',ImageIcon],['gif','GIF 壁纸','动态循环 · 共享音乐服务',Film],['weather-clock','天气时钟','大时间 · 温度 · AQI · 天气信息',CloudSun],['video','视频播放','原生浏览器格式 · 循环播放',Play],['music-only','桌面壁纸 + 音乐','不占用副屏窗口 · Windows 壁纸照常显示',AudioWaveform]] as const).map(([id,title,desc,Icon])=><button type="button" key={id} className={`usb-display-mode-option ${mode===id?'selected':''}`} onClick={()=>updateSettings({usbDisplayMode:id})}><span className="usb-display-mode-icon"><Icon size={20}/></span><span><b>{title}</b><small>{desc}</small></span><i>{mode===id?'当前':''}</i></button>)}
        </div>
        {(mode==='static'||mode==='gif')&&<>
          <div className="usb-display-media-picker usb-media-picker-v2"><div><b>{mode==='gif'?'GIF 壁纸':'静态壁纸'}</b><small>{settings.usbDisplayImagePath?settings.usbDisplayImagePath.split(/[\\/]/).pop():'尚未选择文件'}</small></div><button className="btn-secondary" onClick={()=>void chooseFile('image')}><FolderOpen size={15}/>选择图片</button>
            <label className="field-label">图片适配</label><div className="segmented"><button className={(settings.usbDisplayMediaFit??'cover')==='cover'?'selected':''} onClick={()=>updateSettings({usbDisplayMediaFit:'cover'})}>铺满裁切</button><button className={settings.usbDisplayMediaFit==='contain'?'selected':''} onClick={()=>updateSettings({usbDisplayMediaFit:'contain'})}>完整显示</button></div>
            <label className="field-label">画面方向</label><div className="segmented"><button className={(settings.usbDisplayMediaOrientation??'landscape')==='landscape'?'selected':''} onClick={()=>updateSettings({usbDisplayMediaOrientation:'landscape'})}>横屏显示</button><button className={settings.usbDisplayMediaOrientation==='portrait'?'selected':''} onClick={()=>updateSettings({usbDisplayMediaOrientation:'portrait'})}>竖屏画面（居中）</button></div>
            <div className="usb-shared-music-note"><b>背景音乐由统一音乐服务接管</b><small>在主界面曲库选择歌曲；音乐可继续从独立选择的五寸屏喇叭或其他 Windows 输出设备播放。静态壁纸与 GIF 不再启动第二套播放器。</small></div>
          </div>
        </>}
        {mode==='video'&&<div className="usb-display-media-picker usb-media-picker-v2"><div><b>视频文件</b><small>{settings.usbDisplayVideoPath?settings.usbDisplayVideoPath.split(/[\\/]/).pop():'尚未选择视频'}</small></div><button className="btn-secondary" onClick={()=>void chooseFile('video')}><FolderOpen size={15}/>选择视频</button><label className="field-label">画面方向</label><div className="segmented"><button className={(settings.usbDisplayMediaOrientation??'landscape')==='landscape'?'selected':''} onClick={()=>updateSettings({usbDisplayMediaOrientation:'landscape'})}>横屏显示</button><button className={settings.usbDisplayMediaOrientation==='portrait'?'selected':''} onClick={()=>updateSettings({usbDisplayMediaOrientation:'portrait'})}>竖屏画面（居中）</button></div><p className="panel-note">支持 MP4 / M4V / WebM；MOV 取决于实际视频编码是否被 Chromium 支持。不会主动转码。竖屏模式会保留纵向画面比例并居中显示。</p></div>}
        {mode==='weather-clock'&&<div className="usb-display-media-picker usb-media-picker-v2"><div><b>天气时钟</b><small>共享当前天气源与位置；AQI / PM2.5 / PM10 有数据就显示。</small></div><div className="weather-mode-preview-note">建议直接使用横屏 960 × 540。主时间 44–56px，温度 42px，AQI 单独高亮。</div></div>}
        {mode==='monitor'&&<div className="usb-display-media-picker usb-media-picker-v2"><div><b>硬件监控</b><small>专门为 960 × 540 重新设计，不复用 3.5 寸 Turing 的小字号布局。</small></div><div className="monitor-mode-preview-note">CPU / GPU 大仪表 · 内存 / 网络 / 存储状态 · 网格曲线 · 温度 / 功耗醒目显示</div></div>}
        <div className="usb-display-brightness-note"><Sun size={17}/><span><b>5 寸屏硬件亮度</b><small>暂时保留为后续硬件能力：你这块屏边缘的拨动键已证明可逐级调整背光，但当前还没有确认 USB 亮度指令，因此不假装用软件黑层替代真正背光。</small></span></div>
      </section>
    </div>
  </>;
}

function UsbDisplayOutput(){
  const [settings,setSettings]=useState<any>({usbDisplayMode:'monitor',usbDisplayMediaFit:'cover'});
  const music = useMusicState();
  const [snapshot,setSnapshot]=useState<any>(null);
  const [weather,setWeather]=useState<any>(null);
  const [now,setNow]=useState(new Date());
  const [mediaSource,setMediaSource]=useState('');
  const [samples,setSamples]=useState<Array<{cpu:number;gpu:number;mem:number;rx:number;tx:number}>>([]);
  const mode=settings.usbDisplayMode??'monitor';
  useEffect(()=>{
    let alive=true;
    void window.nexus.getSettings().then(value=>{if(alive&&value)setSettings(value);});
    void window.nexus.getSnapshotResult().then(value=>{if(alive&&value?.snapshot)setSnapshot(value.snapshot);});
    void window.nexus.getWeather().then(value=>{if(alive&&value)setWeather(value);});
    const offSettings=window.nexus.onSettingsUpdated(value=>{if(alive&&value)setSettings(value);});
    const offTelemetry=window.nexus.onTelemetry(value=>{if(alive&&value)setSnapshot(value);});
    const offWeather=window.nexus.onWeather(value=>{if(alive&&value)setWeather(value);});
    const tick=window.setInterval(()=>setNow(new Date()),1000);
    return()=>{alive=false;offSettings();offTelemetry();offWeather();window.clearInterval(tick);};
  },[]);
  useEffect(()=>{
    if(!snapshot)return;
    const networks=snapshot.networks??[]; const rx=networks.filter((item:any)=>item.status==='Up'&&item.isPhysical).reduce((sum:number,item:any)=>sum+(item.rxBytesPerSec??0),0); const tx=networks.filter((item:any)=>item.status==='Up'&&item.isPhysical).reduce((sum:number,item:any)=>sum+(item.txBytesPerSec??0),0);
    setSamples(prev=>[...prev.slice(-59),{cpu:Number(snapshot.cpu?.load)||0,gpu:Number(snapshot.gpus?.[0]?.load)||0,mem:Number(snapshot.memory?.percent)||0,rx:Math.min(100,rx/125000000*100),tx:Math.min(100,tx/125000000*100)}]);
  },[snapshot]);
  useEffect(()=>{
    let alive=true;setMediaSource('');
    if(mode==='static'||mode==='gif'){
      const path=settings.usbDisplayImagePath;
      if(path)void window.nexus.readUsbDisplayImage(path).then(result=>{if(alive&&result?.ok)setMediaSource(result.dataUrl??'');});
    }else if(mode==='video'){
      const path=settings.usbDisplayVideoPath;
      if(path)void window.nexus.getUsbDisplayVideoUrl(path).then(result=>{if(alive&&result?.ok)setMediaSource(result.url??'');});
    }
    return()=>{alive=false;};
  },[mode,settings.usbDisplayImagePath,settings.usbDisplayVideoPath]);
  const networks=snapshot?.networks??[];
  const rx=networks.filter((item:any)=>item.status==='Up'&&item.isPhysical).reduce((sum:number,item:any)=>sum+(item.rxBytesPerSec??0),0);
  const tx=networks.filter((item:any)=>item.status==='Up'&&item.isPhysical).reduce((sum:number,item:any)=>sum+(item.txBytesPerSec??0),0);
  const cpu=snapshot?.cpu??{};const gpu=snapshot?.gpus?.[0]??{};const memory=snapshot?.memory??{};const disk=snapshot?.disks?.[0]??{};
  const number=(value:any,digits=0)=>value==null||!Number.isFinite(Number(value))?'—':Number(value).toFixed(digits);
  const prettyBytes=(value:number)=>{if(!Number.isFinite(value))return'—';const unit=['B','KB','MB','GB','TB'];let i=0,n=value;while(n>=1024&&i<4){n/=1024;i++;}return `${n.toFixed(i>=2?1:0)} ${unit[i]}`;};
  const pctColor=(v:any)=>Number(v)>=90?'#ff5f6d':Number(v)>=75?'#ffbf5b':'#50e3a4';
  const aqi=getAqiPresentation(weather?.aqi);
  const monitor=<div className="usb-output-monitor usb-output-monitor-v2"><div className="usb-monitor-grid"/><header><div><strong>NEXUS<span>MONITOR</span></strong><small>USB SECONDARY DISPLAY · 960 × 540</small></div><div className="usb-monitor-clock">{now.toLocaleTimeString('zh-CN',{hour12:false})}</div></header><section className="usb-monitor-top"><article className="usb-main-metric cpu"><div className="usb-metric-title"><span>CPU</span><i>PROCESSOR</i></div><div className="usb-metric-core"><BigRing value={cpu.load} color={pctColor(cpu.load)} label="LOAD"/></div><div className="usb-metric-readings"><b>{number(cpu.temperature)}<small>°C</small></b><b>{number(cpu.powerW)}<small> W</small></b><span>{cpu.name||'CPU'}</span></div><MiniAreaChart values={samples.map(v=>v.cpu)} color="#52d5a2"/></article><article className="usb-main-metric gpu"><div className="usb-metric-title"><span>GPU</span><i>GRAPHICS</i></div><div className="usb-metric-core"><BigRing value={gpu.load} color={pctColor(gpu.load)} label="LOAD"/></div><div className="usb-metric-readings"><b>{number(gpu.temperature)}<small>°C</small></b><b>{number(gpu.powerW)}<small> W</small></b><span>{gpu.name||'GPU'}</span></div><MiniAreaChart values={samples.map(v=>v.gpu)} color="#62a8ff"/></article></section><section className="usb-monitor-bottom"><article><div className="usb-stat-head"><span>MEMORY</span><b>{number(memory.percent)}%</b></div><div className="usb-bar"><i style={{width:`${Math.max(0,Math.min(100,Number(memory.percent)||0))}%`,background:pctColor(memory.percent)}}/></div><div className="usb-stat-foot"><span>{prettyBytes(memory.usedBytes)}</span><span>{prettyBytes(memory.totalBytes)}</span></div></article><article><div className="usb-stat-head"><span>NETWORK</span><b>↓ {prettyBytes(rx)}/s</b></div><MiniAreaChart values={samples.map(v=>v.rx)} color="#e5b65b" height={42}/><div className="usb-stat-foot"><span>UPLOAD ↑ {prettyBytes(tx)}/s</span><span>{snapshot?.networks?.find((n:any)=>n.isDefaultRoute&&n.status==='Up')?.name||'AUTO'}</span></div></article><article><div className="usb-stat-head"><span>STORAGE</span><b>{number(disk.temperature)}°C</b></div><div className="usb-bar"><i style={{width:`${Math.max(6,Math.min(100,Number(disk.load)||0))}%`,background:'#b26eff'}}/></div><div className="usb-stat-foot"><span>{disk.model||'Primary disk'}</span><span>{number(disk.load)}% ACTIVE</span></div></article></section><footer><span>{cpu.name||'CPU'} · {gpu.name||'GPU'}</span><span>更新 {snapshot?.timestamp?new Date(snapshot.timestamp).toLocaleTimeString('zh-CN',{hour12:false}):'—'}</span></footer></div>;
  const weatherView=<div className="usb-output-weather usb-output-weather-v2"><div className="usb-weather-grid"/><header><div><span>{weather?.location??'LOCAL WEATHER'}</span><small>WEATHER / AIR QUALITY</small></div><div className="usb-weather-time">{now.toLocaleTimeString('zh-CN',{hour12:false})}</div></header><section className="usb-weather-main"><div className="usb-weather-temp">{number(weather?.temperature)}<em>°C</em></div><div className="usb-weather-summary"><strong>{weatherText(weather?.weatherCode)}</strong><span>体感 {number(weather?.apparentTemperature)}° · 湿度 {number(weather?.humidity)}% · 风速 {number(weather?.windSpeed)} km/h</span></div><div className="usb-aqi-badge" style={{borderColor:aqi.color,boxShadow:`0 0 24px ${aqi.color}22`}}><small>US AQI</small><strong style={{color:aqi.textColor}}>{aqi.label==='—'?'—':number(weather?.aqi)}</strong><span style={{color:aqi.textColor}}>{aqi.level}</span></div></section><section className="usb-weather-details"><article><b>{number(weather?.pm25)}</b><span>PM2.5 µg/m³</span></article><article><b>{number(weather?.pm10)}</b><span>PM10 µg/m³</span></article><article><b>{number(weather?.todayMaxTemperature)}° / {number(weather?.todayMinTemperature)}°</b><span>今日最高 / 最低</span></article><article><b>{number(weather?.precipitationProbability)}%</b><span>降水概率</span></article></section><footer><span>{now.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</span><span>数据源 {weather?.source||'—'}</span></footer></div>;
  const portraitMedia=settings.usbDisplayMediaOrientation==='portrait';
  return <main className="usb-output-root">{mode==='monitor'?monitor:null}{(mode==='static'||mode==='gif')&&(mediaSource?<img className={`usb-output-media ${settings.usbDisplayMediaFit==='contain'?'contain':'cover'} ${portraitMedia?'portrait':''}`} src={mediaSource}/>:<div className="usb-output-empty">{mode==='gif'?'请选择 GIF 壁纸':'请选择静态壁纸'}</div>)}{mode==='video'&&(mediaSource?<video className={`usb-output-video ${portraitMedia?'portrait':''}`} src={mediaSource} autoPlay loop muted controls/>:<div className="usb-output-empty">请选择本地视频</div>)}{mode==='weather-clock'?weatherView:null}{mode!=='video'&&<div className="usb-output-music"><MusicMiniPlayer state={music.state} onCommand={music.command}/></div>}</main>;
}

export default function App(){
  const isUsbDisplay=new URLSearchParams(window.location.search).get('usb-display')==='1';
  return isUsbDisplay?<UsbDisplayOutput/>:<MainApp/>;
}

function ThemePage({settings,updateSettings,notify}:any){
  const thresholds = settings.thresholds ?? defaultSettings.thresholds;
  const themeOptions:[ThemeId,string,string,string][]=[['obsidian','曜石科技','Obsidian','深色玻璃、青蓝光效'],['paper','白纸工程','Paper / Engineering','纯白背景、密集技术文字'],['titanium','钛金属','Titanium','石墨灰、银色与克制金属质感'],['portrait','私人写真','Portrait / Personal','导入自己的写真作为主题背景']];
  const [dragId,setDragId]=useState<string|null>(null);
  const moveMetric=(id:string,target:string)=>{const region=(value:string)=>['cpu','gpu'].includes(value)?'primary':['memory','network','weather'].includes(value)?'secondary':'lower';if(region(id)!==region(target))return;const arr=[...settings.metricOrder];const a=arr.indexOf(id),b=arr.indexOf(target);if(a<0||b<0)return;arr.splice(a,1);arr.splice(b,0,id);updateSettings({metricOrder:arr});};
  const bg=async()=>{const data=await window.nexus.chooseBackground();if(data){updateSettings({backgroundDataUrl:data,theme:'portrait'});notify('背景图片已载入，可调整透明效果');}};
  return <><PageTitle kicker="PERSONALIZATION / 04" title="主题工作室" subtitle="主题与布局分离。颜色、数据模块、顺序和背景可以独立定制。" action={<button className="btn-primary" onClick={()=>void window.nexus.saveSettings(settings).then(()=>notify('主题配置已保存'))}><Check size={15}/> 保存主题</button>}/>
    <section className="theme-grid">{themeOptions.map(([id,name,en,desc])=><button key={id} className={`theme-option ${settings.theme===id?'chosen':''} theme-swatch-${id}`} onClick={()=>updateSettings({theme:id})}><div className="theme-swatch"><div className="swatch-bar"/><div className="swatch-cards"><i/><i/><i/></div><div className="swatch-line"/></div><div className="theme-option-copy"><div><b>{name}</b><span>{en}</span></div><small>{desc}</small></div>{settings.theme===id&&<span className="theme-check"><Check size={15}/></span>}</button>)}</section>
    <div className="theme-editor-grid"><section className="panel editor-panel"><div className="panel-heading"><div><span className="card-kicker">APPEARANCE CONTROLS</span><h3>外观参数</h3></div><Palette size={18}/></div><label className="field-label">强调色</label><div className="accent-row"><input type="color" value={settings.accent} onChange={e=>updateSettings({accent:e.target.value})}/><code>{settings.accent.toUpperCase()}</code><div className="accent-presets">{['#70e1f5','#8d7cff','#69d5a9','#d4a46b','#f17b92','#d9e1ed'].map(c=><button key={c} style={{background:c}} onClick={()=>updateSettings({accent:c})}/>)}</div></div><label className="field-label">窗口透明度 <b>{settings.opacity}%</b></label><input className="range" type="range" min="65" max="100" value={settings.opacity} onChange={e=>updateSettings({opacity:Number(e.target.value)})}/><label className="field-label">信息密度</label><div className="segmented"><button className={!settings.compactMode?'selected':''} onClick={()=>updateSettings({compactMode:false})}>舒展</button><button className={settings.compactMode?'selected':''} onClick={()=>updateSettings({compactMode:true})}>高密度</button></div><div className="field-spacer"/><button className="btn-secondary full" onClick={bg}><ImagePlus size={15}/> 导入本地背景照片</button>{settings.backgroundDataUrl&&<button className="btn-quiet full" onClick={()=>updateSettings({backgroundDataUrl:null})}><X size={14}/> 移除自定义背景</button>}<p className="panel-note">写真背景仅保存在本机设置中，不上传云端。为保证文字可读，背景会叠加半透明信息层。</p></section>
      <section className="panel layout-editor"><div className="panel-heading"><div><span className="card-kicker">DASHBOARD COMPOSITION</span><h3>监控模块与排序</h3></div><GripVertical size={18}/></div><p className="panel-note">拖动模块调整同一区域内的显示顺序，勾选控制总览页可见性。CPU/GPU 位于主监控区，其余指标位于辅助区。</p>{settings.metricOrder.map((id:string,index:number)=><div className="layout-row" key={id} draggable onDragStart={()=>setDragId(id)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragId)moveMetric(dragId,id);setDragId(null)}} onDragEnd={()=>setDragId(null)}><GripVertical size={15}/><span className="layout-index">0{index+1}</span><b>{metricLabels[id]??id}</b><span className="layout-type">{id.toUpperCase()}</span><label className="switch"><input type="checkbox" checked={settings.visibleMetrics.includes(id)} onChange={e=>updateSettings({visibleMetrics:e.target.checked?[...settings.visibleMetrics,id]:settings.visibleMetrics.filter((x:string)=>x!==id)})}/><i/></label></div>)}</section></div>
    <section className="panel threshold-panel"><div className="panel-heading"><div><span className="card-kicker">ALERT THRESHOLDS</span><h3>负载与温度预警阈值</h3></div><Activity size={18}/></div><p className="panel-note">总览页的 CPU/GPU 环形仪表和温度数值会按阈值自动变色：正常色 → 橙色 → 红色。</p><div className="threshold-grid">{([['loadWarning','负载警告','%'],['loadCritical','负载严重','%'],['tempWarning','温度警告','°C'],['tempCritical','温度严重','°C']] as const).map(([key,label,unit])=><label className="threshold-field" key={key}><span>{label}</span><div><input className="text-input" type="number" min="0" max="120" value={thresholds[key]} onChange={e=>updateSettings({thresholds:{...thresholds,[key]:Math.max(0,Math.min(120,Number(e.target.value)))}})}/><small>{unit}</small></div></label>)}</div></section>
    <section className="panel theme-preview-panel"><div className="panel-heading"><div><span className="card-kicker">LIVE PREVIEW</span><h3>主题效果预览</h3></div><Sparkles size={18}/></div><div className={`theme-live-preview preview-${settings.theme}`} style={settings.backgroundDataUrl&&settings.theme==='portrait'?{backgroundImage:`linear-gradient(90deg,rgba(9,15,24,.92),rgba(9,15,24,.50)),url(${settings.backgroundDataUrl})`}:undefined}><div className="preview-copy"><small>NEXUS / HARDWARE TELEMETRY</small><strong>System performance</strong><span>CPU · GPU · MEMORY · STORAGE · NETWORK</span></div><div className="preview-badges"><b>CPU —</b><b>MEM —</b><b>GPU —</b></div></div></section>
  </>;
}

function ShortcutsPage({settings,updateSettings,notify}:any){
  const [title,setTitle]=useState('');const [target,setTarget]=useState('');const [kind,setKind]=useState<'url'|'file'|'folder'|'app'>('url');
  const add=()=>{if(!title.trim()||!target.trim()){notify('请填写名称和目标路径');return;}const item={id:crypto.randomUUID(),title:title.trim(),target:target.trim(),kind};updateSettings({shortcuts:[...settings.shortcuts,item]});setTitle('');setTarget('');notify('快捷入口已添加');};
  const open=(item:any)=>item.kind==='url'?void window.nexus.openUrl(item.target):void window.nexus.openPath(item.target);
  return <><PageTitle kicker="QUICK ACCESS / 05" title="快捷入口" subtitle="把常用网站、文件夹、工具和程序放在监控面板里。"/><div className="shortcut-layout"><section className="panel shortcut-add"><div className="panel-heading"><div><span className="card-kicker">CREATE SHORTCUT</span><h3>添加快捷方式</h3></div><Plus size={18}/></div><label className="field-label">显示名称</label><input className="text-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：路由器后台、下载目录"/><label className="field-label">类型</label><select className="select-input" value={kind} onChange={e=>setKind(e.target.value as any)}><option value="url">网站 URL</option><option value="folder">文件夹路径</option><option value="file">文件路径</option><option value="app">程序路径</option></select><label className="field-label">网址或本地路径</label><input className="text-input" value={target} onChange={e=>setTarget(e.target.value)} placeholder={kind==='url'?'https://example.com':'D:\\Tools\\App.exe'}/><button className="btn-primary full" onClick={add}><Plus size={15}/> 添加入口</button></section><section className="panel shortcut-list"><div className="panel-heading"><div><span className="card-kicker">YOUR SHORTCUTS</span><h3>已保存的入口</h3></div><span className="count-pill">{settings.shortcuts.length} ITEMS</span></div>{settings.shortcuts.length===0?<div className="empty-state"><Link2 size={26}/><b>还没有快捷入口</b><span>添加网站、程序、文件或文件夹后，可从这里一键打开。</span></div>:settings.shortcuts.map((item:any)=><div className="shortcut-row" key={item.id}><div className="shortcut-icon">{item.kind==='url'?<ExternalLink size={17}/>:item.kind==='folder'?<Folder size={17}/>:<Laptop size={17}/>}</div><div className="shortcut-meta"><b>{item.title}</b><span>{item.target}</span></div><button className="icon-button" onClick={()=>open(item)}><ExternalLink size={15}/></button><button className="icon-button danger-quiet" onClick={()=>updateSettings({shortcuts:settings.shortcuts.filter((x:any)=>x.id!==item.id)})}><X size={15}/></button></div>)}</section></div></>;
}

function PluginsPage({notify}:any){
  const [plugins,setPlugins]=useState<any[]>([]);const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{setPlugins(await window.nexus.listPlugins()??[])},[]);
  useEffect(()=>{void refresh()},[refresh]);
  const importOne=async()=>{setBusy(true);const result=await window.nexus.importPlugin();setBusy(false);if(result?.ok){setPlugins(result.plugins??[]);notify('插件清单已导入');}else if(result?.message)notify('导入失败：'+result.message);};
  const toggle=async(p:any)=>setPlugins(await window.nexus.setPluginEnabled({id:p.id,enabled:!p.enabled})??[]);
  return <><PageTitle kicker="EXTENSIONS / 07" title="插件管理" subtitle="通过独立插件清单登记扩展。插件运行权限与主界面隔离，避免第三方脚本直接访问系统。" action={<button className="btn-primary" onClick={importOne} disabled={busy}><Plus size={15}/>{busy?'导入中…':'导入插件清单'}</button>}/>
    <div className="plugin-intro panel"><div className="plugin-intro-icon"><Puzzle size={22}/></div><div><b>Manifest-based Extension Host</b><span>插件目录位于用户配置目录下的 plugins。当前版本实现清单导入、识别和启停状态管理；可执行插件沙箱与第三方硬件 Provider SDK 作为下一阶段扩展，不会静默执行任意脚本。</span></div></div>
    <section className="panel plugin-list"><div className="panel-heading"><div><span className="card-kicker">LOCAL EXTENSIONS</span><h3>已安装插件</h3></div><span className="count-pill">{plugins.length} MANIFESTS</span></div>{plugins.length===0?<div className="empty-state"><Puzzle size={25}/><b>尚未安装扩展</b><span>选择一个符合 NexusMonitor 插件清单格式的 plugin.json 文件导入。</span></div>:plugins.map((p:any)=><div className="plugin-row" key={p.id}><div className="plugin-icon"><Puzzle size={18}/></div><div className="plugin-copy"><b>{p.name} <small>v{p.version}</small></b><span>{p.description??p.id}</span><code>{p.id} · {p.author??'Unknown author'}</code></div><label className="switch"><input type="checkbox" checked={p.enabled} onChange={()=>void toggle(p)}/><i/></label></div>)}</section>
    <section className="panel"><div className="panel-heading"><div><span className="card-kicker">PLUGIN CONTRACT</span><h3>扩展接口约定</h3></div><ShieldCheck size={18}/></div><div className="plugin-contract"><div><b>Sensor Provider</b><span>向硬件服务提交受控的 JSON 传感器数据。</span></div><div><b>Dashboard Widget</b><span>注册只读指标卡片与显示元数据。</span></div><div><b>Theme Pack</b><span>提供 CSS token、背景与预设布局。</span></div><div><b>Output Adapter</b><span>向图灵屏及其他显示设备输出页面数据。</span></div></div></section>
  </>;
}

function SettingsPage({settings,updateSettings,notify}:any){
  const weatherSource = settings.weatherSource ?? 'open-meteo';
  const weatherSourceNote = weatherSource === 'open-meteo'
    ? 'Open-Meteo 无需密钥；天气预报与 AQI 独立获取。'
    : weatherSource === 'qweather'
      ? '当前适配的是 QWeather 旧版 V7：天气预报暂时可用，但 V7 空气质量接口已于 2026-06-01 停止；天气 V7 计划于 2027-06-01 停止。当前不会显示该源的 AQI。'
      : weatherSource === 'weatherapi'
        ? '需要支持至少 4 天预报的套餐，才能显示“今天以外的未来 3 天”。可显示 PM2.5 等污染物，但不把其 1–6 级空气质量类别冒充数值 AQI。'
        : '需要开通 OpenWeather One Call 3.0。空气污染接口提供污染物浓度；其 AQI 是 1–5 级别，不作为 0–500 数值 AQI 显示。';
  const [weatherApiKey,setWeatherApiKey] = useState('');
  const [weatherKeyConfigured,setWeatherKeyConfigured] = useState(Boolean(settings.weatherApiKeyConfigured?.[weatherSource]));
  useEffect(() => {
    setWeatherApiKey('');
    void window.nexus.getWeatherKeyStatus(weatherSource).then(result => setWeatherKeyConfigured(Boolean(result?.configured))).catch(() => setWeatherKeyConfigured(false));
  }, [weatherSource]);
  const saveWeatherKey = async () => {
    const result = await window.nexus.saveWeatherApiKey(weatherSource, weatherApiKey);
    if (result?.ok) { setWeatherKeyConfigured(Boolean(result.configured)); setWeatherApiKey(''); notify(result.configured ? '天气 API Key 已加密保存' : '天气 API Key 已清除'); }
    else notify('保存密钥失败：' + (result?.message ?? '未知错误'));
  };
  const widgetOptions = [
    ['cpu','CPU 处理器'],['gpu','GPU 显卡'],['memory','物理内存'],
    ['storage','磁盘读写'],['network','网络上下行'],['power','智能功耗'],['weather','天气摘要'],['sensors','自选传感器'],
  ];
  const widgetVisible: string[] = settings.widgetVisibleMetrics ?? defaultSettings.widgetVisibleMetrics ?? [];
  const toggleWidgetMetric = (id: string) => updateSettings({widgetVisibleMetrics: widgetVisible.includes(id) ? widgetVisible.filter((item: string) => item !== id) : [...widgetVisible, id]});
  return <>
    <PageTitle kicker="PREFERENCES / 06" title="系统设置" subtitle="刷新、窗口行为与本机数据源设置。"/>
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="panel-heading"><div><span className="card-kicker">WINDOW BEHAVIOR</span><h3>窗口行为</h3></div><MonitorCog size={18}/></div>
        <div className="setting-row"><div><b>悬浮窗始终置顶</b><small>独立控制 HUD；不影响主界面窗口层级</small></div><label className="switch"><input type="checkbox" checked={settings.widgetAlwaysOnTop !== false} onChange={e=>{updateSettings({widgetAlwaysOnTop:e.target.checked});void window.nexus.setWidgetAlwaysOnTop(e.target.checked)}}/><i/></label></div>
        <div className="setting-row"><div><b>固定悬浮窗位置</b><small>开启后禁止拖动，展开、收起与菜单仍可使用</small></div><label className="switch"><input type="checkbox" checked={Boolean(settings.widgetPinned)} onChange={e=>updateSettings({widgetPinned:e.target.checked})}/><i/></label></div>
        <div className="setting-row"><div><b>靠边自动隐藏</b><small>仅在吸附到屏幕边缘后生效，保留 10px 感应条</small></div><label className="switch"><input type="checkbox" checked={Boolean(settings.widgetAutoHide)} onChange={e=>updateSettings({widgetAutoHide:e.target.checked})}/><i/></label></div>
        <div className="setting-row"><div><b>全屏时智能让位</b><small>检测 HUD 所在显示器的全屏窗口，退出后恢复置顶</small></div><label className="switch"><input type="checkbox" checked={settings.widgetSmartFullscreen !== false} onChange={e=>updateSettings({widgetSmartFullscreen:e.target.checked})}/><i/></label></div>
        <div className="setting-row"><div><b>横向 / 纵向导航</b><small>桌面悬浮条的排列方向</small></div><div className="segmented compact"><button className={settings.orientation==='horizontal'?'selected':''} onClick={()=>updateSettings({orientation:'horizontal'})}>横向</button><button className={settings.orientation==='vertical'?'selected':''} onClick={()=>updateSettings({orientation:'vertical'})}>纵向</button></div></div>
        <div className="setting-row"><div><b>启动后最小化到托盘</b><small>关闭主窗口时保持后台监控</small></div><label className="switch"><input type="checkbox" checked={Boolean((settings as any).minimizeToTray)} onChange={e=>updateSettings({minimizeToTray:e.target.checked} as any)}/><i/></label></div>
        <div className="setting-row"><div><b>Windows 登录时启动</b><small>随 Windows 登录启动 NexusMonitor</small></div><label className="switch"><input type="checkbox" checked={Boolean((settings as any).launchAtLogin)} onChange={e=>{updateSettings({launchAtLogin:e.target.checked} as any);void window.nexus.setStartup(e.target.checked)}}/><i/></label></div>
      </section>
      <section className="panel settings-card">
        <div className="panel-heading"><div><span className="card-kicker">DATA COLLECTION</span><h3>采样策略</h3></div><Activity size={18}/></div>
        <label className="field-label">硬件刷新周期 <b>{settings.refreshMs} ms</b></label><div className="segmented"><button className={settings.refreshMs===750?'selected':''} onClick={()=>updateSettings({refreshMs:750})}>750 ms</button><button className={settings.refreshMs===1000?'selected':''} onClick={()=>updateSettings({refreshMs:1000})}>1 秒</button><button className={settings.refreshMs===2000?'selected':''} onClick={()=>updateSettings({refreshMs:2000})}>2 秒</button><button className={settings.refreshMs===3000?'selected':''} onClick={()=>updateSettings({refreshMs:3000})}>3 秒</button></div>
        <label className="field-label">天气区域</label><div className="segmented"><button className={settings.weatherLocation==='suzhou'?'selected':''} onClick={()=>updateSettings({weatherLocation:'suzhou'})}>苏州市区</button><button className={settings.weatherLocation==='wujiang'?'selected':''} onClick={()=>updateSettings({weatherLocation:'wujiang'})}>吴江区</button></div>
        <label className="field-label">天气数据来源</label>
        <select className="select-input" value={weatherSource} onChange={e=>updateSettings({weatherSource:e.target.value as AppSettings['weatherSource']})}>
          <option value="open-meteo">Open-Meteo（无需 API Key）</option>
          <option value="qweather">QWeather（旧版 V7，需 API Key）</option>
          <option value="weatherapi">WeatherAPI（需 API Key / 4 天预报套餐）</option>
          <option value="openweather">OpenWeather（需 One Call 3.0 权限）</option>
        </select>
        {weatherSource !== 'open-meteo' && <div className="weather-api-key-panel">
          <div className="weather-key-status"><span>{weatherKeyConfigured ? '已保存加密密钥' : '尚未配置 API Key'}</span><small>仅保存在本机 Windows 安全存储中</small></div>
          <input className="text-input" type="password" autoComplete="off" value={weatherApiKey} onChange={e=>setWeatherApiKey(e.target.value)} placeholder={weatherKeyConfigured ? '输入新 Key 可替换；留空不修改' : '粘贴该服务提供的 API Key'} />
          <div className="setting-actions"><button className="btn-secondary" disabled={!weatherApiKey.trim()} onClick={()=>void saveWeatherKey()}>保存 API Key</button>{weatherKeyConfigured&&<button className="btn-quiet" onClick={()=>{setWeatherApiKey('');void window.nexus.saveWeatherApiKey(weatherSource,'').then(result=>{setWeatherKeyConfigured(false);notify(result?.ok?'API Key 已清除':'清除失败')})}}>清除密钥</button>}</div>
        </div>}
        <div className="setting-note"><CloudSun size={15}/><span>{weatherSourceNote} {weatherSource !== 'open-meteo' && '密钥使用 Electron safeStorage 加密保存，不会写入明文设置文件。'}天气约每 15 分钟更新。</span></div>
      </section>
    </div>
    <section className="panel widget-visibility-panel">
      <div className="panel-heading"><div><span className="card-kicker">FLOATING HUD / CONTENT</span><h3>悬浮窗显示项目</h3></div><SlidersHorizontal size={18}/></div>
      <p className="panel-note">每项独立开关。这里控制悬浮窗窄条及展开卡片中的模块；主界面总览的显示项目保持独立设置。单个底层传感器可在“硬件与网络”页面收藏。</p>
      <div className="widget-visibility-grid">{widgetOptions.map(([id,label])=><label className="widget-visibility-option" key={id}><input type="checkbox" checked={widgetVisible.includes(id)} onChange={()=>toggleWidgetMetric(id)}/><span>{label}</span></label>)}</div>
    </section>
    <section className="panel about-panel"><div className="about-emblem">N</div><div><b>NexusMonitor 2.2.1</b><span>Electron + React UI · .NET 10 Hardware Service</span><small>本机优先，不需要账户；硬件数据通过 127.0.0.1 本地接口传递。</small></div><span className="count-pill">DEVELOPMENT BUILD</span></section>
  </>;
}
