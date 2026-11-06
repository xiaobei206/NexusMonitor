import type { CpuSnapshot, DiskSnapshot, GpuSnapshot, MemorySnapshot, NetworkSnapshot, WeatherSnapshot } from '../shared/types';
import { getAqiPresentation } from './aqi';

export interface TuringPalette {
  bg: string;
  fg: string;
  muted: string;
  line: string;
  track: string;
  accent: string;
}

export interface TuringDashboardData {
  cpu: CpuSnapshot | null;
  gpu: GpuSnapshot | null;
  memory: MemorySnapshot | null;
  disk: DiskSnapshot | null;
  network: NetworkSnapshot | null;
  weather: WeatherSnapshot | null;
  now: Date;
}

/** Physical-pixel layout contract for the default 480×320 landscape panel. */
export const TURING_LANDSCAPE_LAYOUT = Object.freeze({
  width: 480, height: 320,
  left: { x: 10, y: 37, width: 284 },
  weather: { x: 302, y: 37, width: 168, height: 271 },
  tracks: { x: 162, width: 126, diskWriteY: 217, diskReadY: 232, networkUploadY: 274, networkDownloadY: 290 },
  forecast: { columns: 3, rows: 2, top: 194, slotWidth: 50, cellHeight: 39, hourFontPx: 9, iconSize: 13, temperatureFontPx: 10, precipitationFontPx: 8 },
});

const COLORS = {
  cpu: '#43C8EE', memory: '#39CE9B', gpu: '#AB96F7',
  diskWrite: '#F2B44F', diskRead: '#4ABBE9',
  netUpload: '#AA91F4', netDownload: '#4DD2A0',
  good: '#45C98D', warn: '#E8AD4B', bad: '#F06A72',
};

/** Fixed reference scales for the tiny parallel throughput tracks.
 * Network snapshot rates are bytes/second, while the intended labels are Mbps.
 * Use decimal Mbps conversion (1 Mbps = 1,000,000 bits/s) for intuitive networking units.
 */
export const TURING_SPEED_SCALE = Object.freeze({
  diskBytesPerSecond: 100 * 1024 * 1024,
  networkDownloadBytesPerSecond: 500 * 1_000_000 / 8,
  networkUploadBytesPerSecond: 40 * 1_000_000 / 8,
});

function clampPercent(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
}

function formatRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.max(0, value);
  if (abs >= 1024 * 1024) return `${(abs / 1024 / 1024).toFixed(1)} MB/s`;
  if (abs >= 1024) return `${(abs / 1024).toFixed(0)} KB/s`;
  return `${abs.toFixed(0)} B/s`;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  let value = text;
  if (ctx.measureText(value).width > maxWidth) {
    while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
    value += '…';
  }
  ctx.fillText(value, x, y);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawTrack(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, value: number | null | undefined, color: string, track: string): void {
  roundedRect(ctx, x, y, width, height, height / 2, track);
  const percent = clampPercent(value);
  if (percent == null || percent <= 0) return;
  roundedRect(ctx, x, y, Math.max(height, width * percent / 100), height, height / 2, color);
}

function drawSpeedTrack(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, value: number | null | undefined, max: number, color: string, track: string): void {
  roundedRect(ctx, x, y, width, height, height / 2, track);
  if (value == null || !Number.isFinite(value) || value <= 0 || max <= 0) return;
  const fraction = Math.max(0.035, Math.min(1, value / max));
  roundedRect(ctx, x, y, Math.max(height, width * fraction), height, height / 2, color);
}

function windDirection(degrees: number | null | undefined): string {
  if (degrees == null || !Number.isFinite(degrees)) return '风向 —';
  const names = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];
  return names[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

function aqiLabel(value: number | null | undefined): { label: string; color: string } {
  const aqi = getAqiPresentation(value);
  return { label: aqi.label, color: aqi.textColor };
}

function weatherDescription(code: number | null | undefined): string {
  if (code == null) return '天气数据暂不可用';
  if (code === 0) return '晴';
  if (code === 1) return '大致晴朗';
  if (code === 2) return '多云';
  if (code === 3) return '阴';
  if (code === 45 || code === 48) return '雾';
  if (code >= 51 && code <= 57) return '毛毛雨';
  if (code >= 61 && code <= 67) return code >= 65 ? '大雨' : '小雨';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return code >= 85 ? '阵雪' : '降雪';
  if (code >= 80 && code <= 82) return '阵雨';
  if (code >= 95) return '雷雨';
  return '多变天气';
}

function drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(cx - size * 0.22, cy + size * 0.05, size * 0.22, Math.PI * 0.95, Math.PI * 1.9);
  ctx.arc(cx, cy - size * 0.11, size * 0.28, Math.PI * 1.05, Math.PI * 1.98);
  ctx.arc(cx + size * 0.27, cy + size * 0.03, size * 0.2, Math.PI * 1.18, Math.PI * 2.08);
  ctx.quadraticCurveTo(cx + size * 0.49, cy + size * 0.3, cx + size * 0.26, cy + size * 0.32);
  ctx.lineTo(cx - size * 0.27, cy + size * 0.32);
  ctx.quadraticCurveTo(cx - size * 0.53, cy + size * 0.3, cx - size * 0.22, cy + size * 0.05);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawWeatherIcon(ctx: CanvasRenderingContext2D, code: number | null | undefined, cx: number, cy: number, size: number): void {
  if (code == null) {
    ctx.strokeStyle = '#8191A1'; ctx.lineWidth = Math.max(1.4, size * 0.06);
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - size * 0.12, cy); ctx.lineTo(cx + size * 0.12, cy); ctx.stroke();
    return;
  }
  const clear = code === 0;
  const partly = code != null && (code === 1 || code === 2);
  const fog = code === 45 || code === 48;
  const snow = code != null && ((code >= 71 && code <= 77) || code === 85 || code === 86);
  const storm = code != null && code >= 95;
  const rain = code != null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82));
  const sunColor = '#F6BD4C';
  const cloudColor = '#AABBCB';

  if (clear || partly) {
    ctx.strokeStyle = sunColor;
    ctx.lineWidth = Math.max(1.6, size * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx - size * 0.12, cy - size * 0.16, size * 0.19, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.12 + Math.cos(angle) * size * 0.26, cy - size * 0.16 + Math.sin(angle) * size * 0.26);
      ctx.lineTo(cx - size * 0.12 + Math.cos(angle) * size * 0.36, cy - size * 0.16 + Math.sin(angle) * size * 0.36);
      ctx.stroke();
    }
  }

  if (clear) return;
  if (fog) {
    ctx.strokeStyle = '#9FB1C1';
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.lineCap = 'round';
    [-0.12, 0.08, 0.28].forEach(offset => {
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.42, cy + size * offset);
      ctx.lineTo(cx + size * 0.42, cy + size * offset);
      ctx.stroke();
    });
    return;
  }

  drawCloud(ctx, cx, cy, size, cloudColor);
  if (rain || storm) {
    ctx.strokeStyle = '#55B8E8';
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.lineCap = 'round';
    [-0.2, 0.12, 0.4].forEach(offset => {
      ctx.beginPath();
      ctx.moveTo(cx + size * offset, cy + size * 0.36);
      ctx.lineTo(cx + size * (offset - 0.08), cy + size * 0.56);
      ctx.stroke();
    });
  }
  if (snow) {
    ctx.fillStyle = '#E5F2FB';
    [-0.2, 0.12, 0.4].forEach(offset => {
      ctx.beginPath();
      ctx.arc(cx + size * offset, cy + size * 0.47, size * 0.055, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (storm) {
    ctx.fillStyle = '#F5C95D';
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.08, cy + size * 0.25);
    ctx.lineTo(cx - size * 0.08, cy + size * 0.52);
    ctx.lineTo(cx + size * 0.04, cy + size * 0.5);
    ctx.lineTo(cx - size * 0.03, cy + size * 0.72);
    ctx.lineTo(cx + size * 0.2, cy + size * 0.39);
    ctx.lineTo(cx + size * 0.08, cy + size * 0.4);
    ctx.closePath();
    ctx.fill();
  }
}

function roundedCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, line: string): void {
  roundedRect(ctx, x, y, w, h, 6, fill, line);
}

function drawLandscape(ctx: CanvasRenderingContext2D, data: TuringDashboardData, palette: TuringPalette, width: number, height: number, backgroundImage?: HTMLImageElement | null): void {
  const scaleX = width / 480;
  const scaleY = height / 320;
  ctx.save();
  ctx.scale(scaleX, scaleY);
  const p = palette;
  const card = p.bg === '#fbfcfd' ? '#F0F4F7' : p.bg === '#252a2e' ? '#30363B' : '#192936';
  const border = p.bg === '#fbfcfd' ? '#DCE3E9' : '#2B3E4E';
  const layout = TURING_LANDSCAPE_LAYOUT;
  const x = layout.left.x, leftW = layout.left.width, rightX = layout.weather.x, rightW = layout.weather.width;

  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, 480, 320);
  if (backgroundImage) { ctx.drawImage(backgroundImage, 0, 0, 480, 320); ctx.fillStyle = p.bg === '#fbfcfd' ? 'rgba(251,252,253,.78)' : 'rgba(16,25,35,.66)'; ctx.fillRect(0, 0, 480, 320); }
  ctx.fillStyle = p.fg; ctx.font = 'bold 12px "Microsoft YaHei UI", Arial, sans-serif';
  ctx.fillText('NEXUS / SYSTEM MONITOR', 11, 20);
  ctx.fillStyle = p.muted; ctx.font = '10px "Microsoft YaHei UI", Arial, sans-serif';
  const clock = data.now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  ctx.textAlign = 'right'; ctx.fillText(clock, 469, 20); ctx.textAlign = 'left';
  ctx.strokeStyle = p.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, 29); ctx.lineTo(470, 29); ctx.stroke();

  // CPU — the primary item: large percentage, temperature, clock and package power.
  roundedCard(ctx, x, 37, leftW, 56, card, border);
  ctx.fillStyle = p.muted; ctx.font = 'bold 10px "Microsoft YaHei UI", Arial, sans-serif'; ctx.fillText('CPU', 18, 51);
  ctx.fillStyle = COLORS.cpu; ctx.font = 'bold 27px Arial, sans-serif'; ctx.fillText(data.cpu?.load == null ? '—' : `${Math.round(data.cpu.load)}%`, 18, 79);
  ctx.fillStyle = p.fg; ctx.font = 'bold 17px Arial, sans-serif'; ctx.fillText(data.cpu?.temperature == null ? '—°C' : `${Math.round(data.cpu.temperature)}°C`, 91, 78);
  ctx.fillStyle = p.muted; ctx.font = '10px Arial, sans-serif';
  const cpuClock = data.cpu?.clockMHz == null ? '— GHz' : `${(data.cpu.clockMHz / 1000).toFixed(2)} GHz`;
  const cpuPower = data.cpu?.powerW == null ? '— W' : `${data.cpu.powerW.toFixed(0)} W`;
  ctx.fillText(`${cpuClock}  ·  ${cpuPower}`, 18, 89);
  ctx.fillText('负载', layout.tracks.x, 57);
  drawTrack(ctx, layout.tracks.x, 65, layout.tracks.width, 8, data.cpu?.load, COLORS.cpu, p.track);

  // Memory — equally prominent, but with the percentage and used/total in one line.
  roundedCard(ctx, x, 96, leftW, 49, card, border);
  ctx.fillStyle = p.muted; ctx.font = 'bold 10px "Microsoft YaHei UI", Arial, sans-serif'; ctx.fillText('MEMORY', 18, 109);
  ctx.fillStyle = COLORS.memory; ctx.font = 'bold 25px Arial, sans-serif'; ctx.fillText(data.memory?.percent == null ? '—' : `${Math.round(data.memory.percent)}%`, 18, 137);
  ctx.fillStyle = p.fg; ctx.font = '10px Arial, sans-serif';
  const memText = data.memory ? `${(data.memory.usedBytes / 1073741824).toFixed(1)} / ${(data.memory.totalBytes / 1073741824).toFixed(0)} GB` : '— / — GB';
  ctx.fillText(memText, 88, 136);
  ctx.fillStyle = p.muted; ctx.font = '10px "Microsoft YaHei UI", Arial, sans-serif'; ctx.fillText('占用', layout.tracks.x, 117);
  drawTrack(ctx, layout.tracks.x, 125, layout.tracks.width, 8, data.memory?.percent, COLORS.memory, p.track);

  // Integrated GPU is intentionally secondary to CPU and memory.
  roundedCard(ctx, x, 148, leftW, 42, card, border);
  ctx.fillStyle = p.muted; ctx.font = 'bold 10px "Microsoft YaHei UI", Arial, sans-serif'; ctx.fillText('GPU · 核显', 18, 161);
  ctx.fillStyle = COLORS.gpu; ctx.font = 'bold 20px Arial, sans-serif'; ctx.fillText(data.gpu?.load == null ? '—' : `${Math.round(data.gpu.load)}%`, 18, 183);
  ctx.fillStyle = p.fg; ctx.font = '10px Arial, sans-serif';
  const gpuTemp = data.gpu?.temperature == null ? '—°C' : `${Math.round(data.gpu.temperature)}°C`;
  const gpuClock = data.gpu?.clockMHz == null ? '— MHz' : `${Math.round(data.gpu.clockMHz)} MHz`;
  ctx.fillText(`${gpuTemp}  ${gpuClock}`, 75, 182);
  ctx.fillStyle = p.muted; ctx.font = '10px "Microsoft YaHei UI", Arial, sans-serif'; ctx.fillText('负载', layout.tracks.x, 165);
  drawTrack(ctx, layout.tracks.x, 173, layout.tracks.width, 7, data.gpu?.load, COLORS.gpu, p.track);

  // Storage — values on the left, two parallel direction-specific tracks on the right.
  roundedCard(ctx, x, 193, leftW, 54, card, border);
  ctx.fillStyle = COLORS.diskRead; ctx.font = 'bold 10px "Microsoft YaHei UI", Arial, sans-serif';
  ctx.fillText('DISK', 18, 206);
  ctx.fillStyle = p.muted; ctx.font = '9px "Microsoft YaHei UI", Arial, sans-serif';
  const diskVolumes = (data.disk?.volumeNames ?? []).map(name => name.replace(/[\\/]+$/, '').trim()).filter(Boolean);
  fitText(ctx, diskVolumes.length ? diskVolumes.join(' / ') : '物理盘', 55, 206, 70);
  ctx.fillStyle = p.muted; ctx.font = '9px Arial, sans-serif';
  ctx.fillText(`活动 ${data.disk?.load == null ? '—' : `${Math.round(data.disk.load)}%`}`, 130, 206);
  ctx.fillStyle = COLORS.diskWrite; ctx.font = '10px Arial, sans-serif'; ctx.fillText(`↑ ${formatRate(data.disk?.writeBytesPerSec)}`, 18, 224);
  ctx.fillStyle = COLORS.diskRead; ctx.fillText(`↓ ${formatRate(data.disk?.readBytesPerSec)}`, 18, 239);
  const diskRead = data.disk?.readBytesPerSec ?? 0, diskWrite = data.disk?.writeBytesPerSec ?? 0;
  // Fixed 100 MiB/s scale keeps independent read/write bars comparable over time.
  drawSpeedTrack(ctx, layout.tracks.x, layout.tracks.diskWriteY, layout.tracks.width, 7, diskWrite, TURING_SPEED_SCALE.diskBytesPerSecond, COLORS.diskWrite, p.track);
  drawSpeedTrack(ctx, layout.tracks.x, layout.tracks.diskReadY, layout.tracks.width, 7, diskRead, TURING_SPEED_SCALE.diskBytesPerSecond, COLORS.diskRead, p.track);

  // Network — one selected active NIC, with upload and download kept parallel.
  roundedCard(ctx, x, 250, leftW, 58, card, border);
  ctx.fillStyle = COLORS.netDownload; ctx.font = 'bold 10px "Microsoft YaHei UI", Arial, sans-serif'; ctx.fillText('NETWORK', 18, 263);
  ctx.fillStyle = p.muted; ctx.font = '9px "Microsoft YaHei UI", Arial, sans-serif';
  fitText(ctx, data.network?.name ?? '自动网卡未识别', 73, 263, 88);
  ctx.fillStyle = COLORS.netUpload; ctx.font = '10px Arial, sans-serif'; ctx.fillText(`↑ ${formatRate(data.network?.txBytesPerSec)}`, 18, 281);
  ctx.fillStyle = COLORS.netDownload; ctx.fillText(`↓ ${formatRate(data.network?.rxBytesPerSec)}`, 18, 297);
  const netUpload = data.network?.txBytesPerSec ?? 0, netDownload = data.network?.rxBytesPerSec ?? 0;
  // Fixed independent scales: upload 40 Mbps, download 500 Mbps. The displayed
  // rates above remain the measured values; only the bar length is normalized.
  drawSpeedTrack(ctx, layout.tracks.x, layout.tracks.networkUploadY, layout.tracks.width, 7, netUpload, TURING_SPEED_SCALE.networkUploadBytesPerSecond, COLORS.netUpload, p.track);
  drawSpeedTrack(ctx, layout.tracks.x, layout.tracks.networkDownloadY, layout.tracks.width, 7, netDownload, TURING_SPEED_SCALE.networkDownloadBytesPerSecond, COLORS.netDownload, p.track);

  // Weather — one continuous panel, no nested cards. AQI is deliberately adjacent
  // to the large current temperature, with the remaining details in compact lines.
  roundedCard(ctx, rightX, layout.weather.y, rightW, layout.weather.height, card, border);
  ctx.fillStyle = p.muted; ctx.font = 'bold 10px "Microsoft YaHei UI", Arial, sans-serif'; ctx.fillText('吴江区天气', rightX + 9, 51);
  drawWeatherIcon(ctx, data.weather?.weatherCode, rightX + 27, 78, 35);
  ctx.fillStyle = p.fg; ctx.font = 'bold 27px Arial, sans-serif';
  ctx.fillText(data.weather?.temperature == null ? '—°' : `${Math.round(data.weather.temperature)}°`, rightX + 52, 82);
  const aqi = aqiLabel(data.weather?.aqi);
  ctx.fillStyle = aqi.color; ctx.font = 'bold 21px Arial, sans-serif';
  const aqiText = data.weather?.aqi == null ? '—' : `${Math.round(data.weather.aqi)}`;
  ctx.textAlign = 'right'; ctx.fillText(aqiText, rightX + rightW - 9, 79); ctx.textAlign = 'left';
  ctx.fillStyle = aqi.color; ctx.font = '10px "Microsoft YaHei UI", Arial, sans-serif';
  ctx.textAlign = 'right'; ctx.fillText(`AQI ${aqi.label}`, rightX + rightW - 9, 91); ctx.textAlign = 'left';
  ctx.fillStyle = p.fg; ctx.font = '10px "Microsoft YaHei UI", Arial, sans-serif';
  fitText(ctx, weatherDescription(data.weather?.weatherCode), rightX + 49, 96, 80);
  ctx.fillStyle = p.muted; ctx.font = '10px Arial, sans-serif';
  ctx.fillText(`↑${data.weather?.todayMaxTemperature == null ? '—' : Math.round(data.weather.todayMaxTemperature)}°  ↓${data.weather?.todayMinTemperature == null ? '—' : Math.round(data.weather.todayMinTemperature)}°`, rightX + 9, 112);
  ctx.strokeStyle = p.line; ctx.beginPath(); ctx.moveTo(rightX + 9, 120); ctx.lineTo(rightX + rightW - 9, 120); ctx.stroke();
  ctx.fillStyle = p.fg; ctx.font = '10.5px "Microsoft YaHei UI", Arial, sans-serif';
  ctx.fillText(`体感 ${data.weather?.apparentTemperature == null ? '—' : Math.round(data.weather.apparentTemperature)}°  湿度 ${data.weather?.humidity == null ? '—' : Math.round(data.weather.humidity)}%`, rightX + 9, 136);
  ctx.fillText(`${windDirection(data.weather?.windDirection)} ${data.weather?.windSpeed == null ? '—' : data.weather.windSpeed.toFixed(0)} km/h  降水 ${data.weather?.precipitationProbability == null ? '—' : `${data.weather.precipitationProbability}%`}`, rightX + 9, 152);
  ctx.fillText(`PM2.5 ${data.weather?.pm25 == null ? '—' : Math.round(data.weather.pm25)} μg/m³`, rightX + 9, 168);
  ctx.strokeStyle = p.line; ctx.beginPath(); ctx.moveTo(rightX + 9, 177); ctx.lineTo(rightX + rightW - 9, 177); ctx.stroke();
  ctx.fillStyle = p.muted; ctx.font = 'bold 9px "Microsoft YaHei UI", Arial, sans-serif'; ctx.fillText('未来 6 小时', rightX + 9, 190);
  const hours = data.weather?.hourlyForecast ?? [];
  const slotWidth = layout.forecast.slotWidth;
  for (let i = 0; i < Math.min(hours.length, layout.forecast.columns * layout.forecast.rows); i++) {
    const hour = hours[i];
    const column = i % layout.forecast.columns;
    const row = Math.floor(i / layout.forecast.columns);
    const slotX = rightX + 9 + slotWidth * column;
    const cellY = layout.forecast.top + layout.forecast.cellHeight * row;
    const centerX = slotX + slotWidth / 2;
    // Three wider columns over two rows give each of the six forecasts enough
    // room for a 9px hour, weather glyph, temperature and precipitation value.
    ctx.save();
    ctx.beginPath(); ctx.rect(slotX + 1, cellY, slotWidth - 2, layout.forecast.cellHeight - 1); ctx.clip();
    ctx.textAlign = 'center';
    ctx.fillStyle = p.muted; ctx.font = `${layout.forecast.hourFontPx}px Arial, sans-serif`;
    const timeLabel = hour ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(new Date(hour.time)) : '—';
    ctx.fillText(timeLabel, centerX, cellY + 8);
    drawWeatherIcon(ctx, hour?.weatherCode ?? null, slotX + 15, cellY + 22, layout.forecast.iconSize);
    ctx.fillStyle = p.fg; ctx.font = `bold ${layout.forecast.temperatureFontPx}px Arial, sans-serif`;
    ctx.fillText(hour?.temperature == null ? '—°' : `${Math.round(hour.temperature)}°`, slotX + 34, cellY + 25);
    ctx.fillStyle = '#61B9EB'; ctx.font = `${layout.forecast.precipitationFontPx}px Arial, sans-serif`;
    ctx.fillText(hour?.precipitationProbability == null ? '—%' : `${hour.precipitationProbability}%`, centerX, cellY + 37);
    ctx.restore();
  }
  ctx.fillStyle = p.muted; ctx.font = '8px "Microsoft YaHei UI", Arial, sans-serif';
  const fetched = data.weather?.fetchedAt ? new Date(data.weather.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
  ctx.fillText(`更新 ${fetched} · Weather by Open-Meteo`, rightX + 9, 296);
  ctx.restore();
}

function drawPortrait(ctx: CanvasRenderingContext2D, data: TuringDashboardData, palette: TuringPalette, width: number, height: number, backgroundImage?: HTMLImageElement | null): void {
  const sx = width / 320, sy = height / 480;
  ctx.save(); ctx.scale(sx, sy);
  ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, 320, 480);
  if (backgroundImage) { ctx.drawImage(backgroundImage, 0, 0, 320, 480); ctx.fillStyle = 'rgba(15,13,19,.62)'; ctx.fillRect(0, 0, 320, 480); }
  ctx.fillStyle = palette.fg; ctx.font = 'bold 15px "Microsoft YaHei UI", Arial'; ctx.fillText('NEXUS / SYSTEM', 12, 24);
  ctx.fillStyle = palette.muted; ctx.font = '10px Arial'; ctx.textAlign = 'right'; ctx.fillText(data.now.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}), 308, 24); ctx.textAlign = 'left';
  ctx.strokeStyle = palette.line; ctx.beginPath(); ctx.moveTo(12, 34); ctx.lineTo(308, 34); ctx.stroke();
  const rows = [
    { label: 'CPU', value: data.cpu?.load, detail: `${data.cpu?.temperature == null ? '—°C' : Math.round(data.cpu.temperature)+'°C'} · ${data.cpu?.clockMHz == null ? '—' : (data.cpu.clockMHz/1000).toFixed(2)+'GHz'} · ${data.cpu?.powerW == null ? '—' : Math.round(data.cpu.powerW)+'W'}`, color: COLORS.cpu },
    { label: 'MEMORY', value: data.memory?.percent, detail: data.memory ? `${(data.memory.usedBytes/1073741824).toFixed(1)} / ${(data.memory.totalBytes/1073741824).toFixed(0)} GB` : '—', color: COLORS.memory },
    { label: 'GPU · IGPU', value: data.gpu?.load, detail: `${data.gpu?.temperature == null ? '—°C' : Math.round(data.gpu.temperature)+'°C'} · ${data.gpu?.clockMHz == null ? '—' : Math.round(data.gpu.clockMHz)+'MHz'}`, color: COLORS.gpu },
  ];
  rows.forEach((row, index) => {
    const y = 43 + index * 63;
    roundedCard(ctx, 10, y, 300, 56, palette.bg === '#fbfcfd' ? '#F0F4F7' : '#1A2935', palette.line);
    ctx.fillStyle = palette.muted; ctx.font = 'bold 11px Arial'; ctx.fillText(row.label, 19, y + 15);
    ctx.fillStyle = row.color; ctx.font = 'bold 24px Arial'; ctx.fillText(row.value == null ? '—' : `${Math.round(row.value)}%`, 19, y + 43);
    ctx.fillStyle = palette.fg; ctx.font = '12px Arial'; fitText(ctx, row.detail, 112, y + 34, 185);
    drawTrack(ctx, 112, y + 42, 185, 6, row.value, row.color, palette.track);
  });
  roundedCard(ctx, 10, 235, 300, 49, palette.bg === '#fbfcfd' ? '#F0F4F7' : '#1A2935', palette.line);
  ctx.fillStyle = palette.fg; ctx.font = 'bold 11px Arial'; ctx.fillText('DISK · C:', 18, 250);
  ctx.fillStyle = COLORS.diskWrite; ctx.font = '10px Arial'; ctx.fillText(`↑ ${formatRate(data.disk?.writeBytesPerSec)}`, 18, 270);
  ctx.fillStyle = COLORS.diskRead; ctx.fillText(`↓ ${formatRate(data.disk?.readBytesPerSec)}`, 166, 270);
  roundedCard(ctx, 10, 289, 300, 49, palette.bg === '#fbfcfd' ? '#F0F4F7' : '#1A2935', palette.line);
  ctx.fillStyle = palette.fg; ctx.font = 'bold 11px Arial'; ctx.fillText('NETWORK', 18, 304);
  ctx.fillStyle = COLORS.netUpload; ctx.font = '10px Arial'; ctx.fillText(`↑ ${formatRate(data.network?.txBytesPerSec)}`, 18, 324);
  ctx.fillStyle = COLORS.netDownload; ctx.fillText(`↓ ${formatRate(data.network?.rxBytesPerSec)}`, 166, 324);
  roundedCard(ctx, 10, 343, 300, 126, palette.bg === '#fbfcfd' ? '#F0F4F7' : '#1A2935', palette.line);
  drawWeatherIcon(ctx, data.weather?.weatherCode, 40, 374, 32);
  ctx.fillStyle = palette.fg; ctx.font = 'bold 25px Arial'; ctx.fillText(data.weather?.temperature == null ? '—°' : `${Math.round(data.weather.temperature)}°`, 66, 378);
  const aqi = aqiLabel(data.weather?.aqi); ctx.fillStyle = aqi.color; ctx.font = 'bold 19px Arial'; ctx.fillText(data.weather?.aqi == null ? '—' : `${Math.round(data.weather.aqi)}`, 225, 378);
  ctx.font = '9px Arial'; ctx.fillText(`AQI ${aqi.label}`, 225, 391);
  ctx.fillStyle = palette.muted; ctx.font = '10px "Microsoft YaHei UI", Arial';
  ctx.fillText(`高 ${data.weather?.todayMaxTemperature == null ? '—' : Math.round(data.weather.todayMaxTemperature)}° / 低 ${data.weather?.todayMinTemperature == null ? '—' : Math.round(data.weather.todayMinTemperature)}°`, 18, 397);
  ctx.fillText(`体感 ${data.weather?.apparentTemperature == null ? '—' : Math.round(data.weather.apparentTemperature)}° · 湿度 ${data.weather?.humidity == null ? '—' : Math.round(data.weather.humidity)}%`, 18, 413);
  ctx.fillText(`${windDirection(data.weather?.windDirection)} · PM2.5 ${data.weather?.pm25 == null ? '—' : Math.round(data.weather.pm25)}`, 18, 429);
  const hours = (data.weather?.hourlyForecast ?? []).slice(0, 4);
  hours.forEach((hour, index) => {
    const cx = 45 + index * 73;
    ctx.fillStyle = palette.muted; ctx.font = '9px Arial'; ctx.textAlign = 'center'; ctx.fillText(new Date(hour.time).toLocaleTimeString('zh-CN',{hour:'2-digit',hour12:false}), cx, 446);
    drawWeatherIcon(ctx, hour.weatherCode, cx, 458, 15);
    ctx.fillStyle = palette.fg; ctx.font = '9px Arial'; ctx.fillText(hour.temperature == null ? '—°' : `${Math.round(hour.temperature)}°`, cx, 469);
  });
  ctx.textAlign = 'left'; ctx.restore();
}

export function renderTuringDashboard(width: number, height: number, data: TuringDashboardData, palette: TuringPalette, backgroundImage: HTMLImageElement | null = null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前运行环境无法创建 Canvas 2D 绘图上下文');
  if (width >= height) drawLandscape(ctx, data, palette, width, height, backgroundImage);
  else drawPortrait(ctx, data, palette, width, height, backgroundImage);
  return canvas;
}

function formatWeatherTime(value: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...options }).format(date);
}

function weatherDayName(value: string): string {
  return formatWeatherTime(value, { weekday: 'short' }).replace('星期', '周');
}

/** Keep only forecast slots strictly after the current instant. Open-Meteo
 * includes the current clock hour; skipping it makes labels show real future
 * wall-clock times (e.g. 01:00, 02:00 after midnight), not elapsed-hour offsets. */
function shanghaiClockKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function forecastClockKey(value: string): string | null {
  // Open-Meteo's timezone=Asia/Shanghai hourly values are commonly local ISO
  // strings without an offset. Preserve that wall-clock value rather than
  // letting the PC's current timezone reinterpret it.
  const local = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (local) return local[1];
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? shanghaiClockKey(parsed) : null;
}

export function selectUpcomingWeatherHours(
  hours: NonNullable<WeatherSnapshot['hourlyForecast']>,
  now: Date,
  count = 6,
): NonNullable<WeatherSnapshot['hourlyForecast']> {
  const nowKey = shanghaiClockKey(now);
  return [...hours]
    .filter(hour => { const key = hour?.time ? forecastClockKey(hour.time) : null; return key !== null && key > nowKey; })
    .sort((a, b) => (forecastClockKey(a.time) ?? '').localeCompare(forecastClockKey(b.time) ?? ''))
    .slice(0, count);
}

function drawWeatherClockBackground(ctx: CanvasRenderingContext2D, width: number, height: number, image: HTMLImageElement | null): void {
  if (image?.naturalWidth && image.naturalHeight) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#244e73');
    gradient.addColorStop(0.55, '#182d48');
    gradient.addColorStop(1, '#101a2c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.fillStyle = 'rgba(5, 13, 25, .48)';
  ctx.fillRect(0, 0, width, height);
  const top = ctx.createLinearGradient(0, 0, 0, height * 0.56);
  top.addColorStop(0, 'rgba(4, 12, 24, .30)');
  top.addColorStop(1, 'rgba(4, 12, 24, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, height * 0.56);
  const bottom = ctx.createLinearGradient(0, height * 0.48, 0, height);
  bottom.addColorStop(0, 'rgba(5, 14, 28, 0)');
  bottom.addColorStop(1, 'rgba(5, 13, 27, .56)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, height * 0.48, width, height * 0.52);
}

export const WEATHER_CLOCK_FONT = Object.freeze({
  // Values are physical canvas pixels for the panel, not CSS pixels on the PC display.
  // The smallest important data label is now 14 px; date/day labels are deliberately larger.
  landscape: Object.freeze({ temperature: 56, time: 47, date: 19, weekday: 18, description: 17, detail: 15, aqiLabel: 15, aqiValue: 34, aqiQuality: 16, sectionTitle: 18, hour: 14, hourTemperature: 18, precipitation: 14, day: 18, dayMax: 18, dayMin: 16 }),
  portrait: Object.freeze({ temperature: 56, time: 37, date: 20, weekday: 19, description: 17, detail: 15, aqiLabel: 15, aqiValue: 32, aqiQuality: 16, sectionTitle: 17, hour: 14, hourTemperature: 17, precipitation: 14, day: 18, dayMax: 18, dayMin: 16 }),
});

function drawWeatherClockLandscape(ctx: CanvasRenderingContext2D, data: TuringDashboardData, image: HTMLImageElement | null): void {
  drawWeatherClockBackground(ctx, 480, 320, image);
  const w = data.weather;
  const f = WEATHER_CLOCK_FONT.landscape;
  const white = '#F5F8FC';
  const muted = '#D8E3F0';
  const aqi = aqiLabel(w?.aqi);
  ctx.textBaseline = 'alphabetic';

  // Main weather block: sized for the actual 480x320, 3.5-inch panel.
  drawWeatherIcon(ctx, w?.weatherCode, 39, 63, 52);
  ctx.textAlign = 'left';
  ctx.fillStyle = white; ctx.font = `bold ${f.description}px "Microsoft YaHei UI", Arial`;
  fitText(ctx, weatherDescription(w?.weatherCode), 10, 119, 75);
  ctx.fillStyle = white; ctx.font = `bold ${f.temperature}px "Segoe UI", Arial`;
  ctx.fillText(w?.temperature == null ? '—°' : `${Math.round(w.temperature)}°`, 91, 78);
  ctx.fillStyle = muted; ctx.font = `${f.detail}px "Microsoft YaHei UI", Arial`;
  fitText(ctx, `体感 ${w?.apparentTemperature == null ? '—' : Math.round(w.apparentTemperature)}°  湿度 ${w?.humidity == null ? '—' : Math.round(w.humidity)}%`, 94, 105, 150);

  // AQI remains between temperature and time; it is not a separate oversized card.
  ctx.textAlign = 'center';
  ctx.fillStyle = muted; ctx.font = `bold ${f.aqiLabel}px Arial`; ctx.fillText('US AQI', 273, 34);
  ctx.fillStyle = aqi.color; ctx.font = `bold ${f.aqiValue}px "Segoe UI", Arial`;
  ctx.fillText(w?.aqi == null ? '—' : `${Math.round(w.aqi)}`, 273, 72);
  ctx.fillStyle = aqi.color; ctx.font = `bold ${f.aqiQuality}px "Microsoft YaHei UI", Arial`; ctx.fillText(aqi.label, 273, 94);

  ctx.textAlign = 'right';
  ctx.fillStyle = white; ctx.font = `bold ${f.time}px "Segoe UI", Arial`;
  ctx.fillText(data.now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }), 470, 68);
  ctx.fillStyle = muted; ctx.font = `bold ${f.date}px "Microsoft YaHei UI", Arial`;
  ctx.fillText(data.now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }), 470, 94);
  ctx.font = `bold ${f.weekday}px "Microsoft YaHei UI", Arial`;
  ctx.fillText(data.now.toLocaleDateString('zh-CN', { weekday: 'long' }), 470, 117);

  ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = `${f.detail}px "Microsoft YaHei UI", Arial`;
  fitText(ctx, `${windDirection(w?.windDirection)} ${w?.windSpeed == null ? '—' : Math.round(w.windSpeed)} km/h`, 12, 140, 155);
  fitText(ctx, `降雨 ${w?.precipitationProbability == null ? '—' : `${w.precipitationProbability}%`}`, 176, 140, 110);
  fitText(ctx, `PM2.5 ${w?.pm25 == null ? '—' : Math.round(w.pm25)} μg/m³`, 300, 140, 170);
  ctx.strokeStyle = 'rgba(235,244,255,.42)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, 153); ctx.lineTo(470, 153); ctx.stroke();

  ctx.fillStyle = white; ctx.font = `bold ${f.sectionTitle}px "Microsoft YaHei UI", Arial`;
  ctx.fillText('未来 6 小时', 12, 174);
  ctx.fillText('未来 3 天', 304, 174);
  const hours = selectUpcomingWeatherHours(w?.hourlyForecast ?? [], data.now, 6);
  hours.forEach((hour, index) => {
    const column = index % 3, row = Math.floor(index / 3);
    const x = 12 + column * 94, y = 181 + row * 56;
    ctx.fillStyle = 'rgba(8, 20, 36, .34)';
    ctx.fillRect(x, y, 89, 51);
    ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = `${f.hour}px Arial`;
    ctx.fillText(formatWeatherTime(hour.time, { hour: '2-digit', hour12: false }), x + 5, y + 14);
    drawWeatherIcon(ctx, hour.weatherCode, x + 20, y + 34, 20);
    ctx.fillStyle = white; ctx.font = `bold ${f.hourTemperature}px Arial`;
    ctx.fillText(hour.temperature == null ? '—°' : `${Math.round(hour.temperature)}°`, x + 40, y + 34);
    ctx.fillStyle = '#B9E5FF'; ctx.font = `${f.precipitation}px Arial`;
    ctx.fillText(hour.precipitationProbability == null ? '雨 —' : `雨 ${hour.precipitationProbability}%`, x + 40, y + 47);
  });

  const days = (w?.dailyForecast ?? []).slice(0, 3);
  if (days.length === 0) {
    ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = `${f.day}px "Microsoft YaHei UI", Arial`;
    ctx.fillText('暂无每日预报', 306, 211);
  }
  days.forEach((day, index) => {
    const y = 184 + index * 31;
    ctx.textAlign = 'left'; ctx.fillStyle = white; ctx.font = `bold ${f.day}px "Microsoft YaHei UI", Arial`;
    ctx.fillText(weatherDayName(day.date), 305, y + 18);
    drawWeatherIcon(ctx, day.weatherCode, 365, y + 9, 21);
    ctx.textAlign = 'right'; ctx.fillStyle = white; ctx.font = `bold ${f.dayMax}px Arial`;
    ctx.fillText(day.maxTemperature == null ? '—°' : `${Math.round(day.maxTemperature)}°`, 425, y + 18);
    ctx.fillStyle = muted; ctx.font = `${f.dayMin}px Arial`;
    ctx.fillText(day.minTemperature == null ? '—°' : `${Math.round(day.minTemperature)}°`, 470, y + 18);
  });
  if (!w) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#FFE2A7'; ctx.font = `bold ${f.detail}px "Microsoft YaHei UI", Arial`;
    ctx.fillText('正在等待天气数据 / 天气服务连接', 12, 300);
  }
}

function drawWeatherClockPortrait(ctx: CanvasRenderingContext2D, data: TuringDashboardData, image: HTMLImageElement | null): void {
  drawWeatherClockBackground(ctx, 320, 480, image);
  const w = data.weather;
  const f = WEATHER_CLOCK_FONT.portrait;
  const white = '#F5F8FC';
  const muted = '#D8E3F0';
  const aqi = aqiLabel(w?.aqi);

  ctx.fillStyle = white; ctx.font = 'bold 16px "Microsoft YaHei UI", Arial';
  ctx.fillText('NEXUS WEATHER', 14, 24);
  ctx.textAlign = 'right'; ctx.font = `bold ${f.time}px "Segoe UI", Arial`;
  ctx.fillText(data.now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }), 306, 43);
  ctx.fillStyle = muted; ctx.font = `bold ${f.date}px "Microsoft YaHei UI", Arial`;
  ctx.fillText(data.now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }), 306, 67);
  ctx.font = `bold ${f.weekday}px "Microsoft YaHei UI", Arial`;
  ctx.fillText(data.now.toLocaleDateString('zh-CN', { weekday: 'long' }), 306, 90);

  ctx.textAlign = 'left';
  drawWeatherIcon(ctx, w?.weatherCode, 48, 130, 52);
  ctx.fillStyle = white; ctx.font = `bold ${f.temperature}px "Segoe UI", Arial`;
  ctx.fillText(w?.temperature == null ? '—°' : `${Math.round(w.temperature)}°`, 101, 141);
  ctx.fillStyle = white; ctx.font = `bold ${f.description}px "Microsoft YaHei UI", Arial`;
  ctx.fillText(weatherDescription(w?.weatherCode), 14, 183);
  ctx.fillStyle = muted; ctx.font = `${f.detail}px "Microsoft YaHei UI", Arial`;
  fitText(ctx, `体感 ${w?.apparentTemperature == null ? '—' : Math.round(w.apparentTemperature)}° · 湿度 ${w?.humidity == null ? '—' : Math.round(w.humidity)}%`, 14, 205, 292);

  // AQI is aligned to the current-conditions block, not given a separate full-width card.
  ctx.textAlign = 'center'; ctx.fillStyle = muted; ctx.font = `bold ${f.aqiLabel}px Arial`; ctx.fillText('US AQI', 258, 111);
  ctx.fillStyle = aqi.color; ctx.font = `bold ${f.aqiValue}px "Segoe UI", Arial`;
  ctx.fillText(w?.aqi == null ? '—' : `${Math.round(w.aqi)}`, 258, 141);
  ctx.font = `bold ${f.aqiQuality}px "Microsoft YaHei UI", Arial`; ctx.fillText(aqi.label, 258, 163);

  ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = `${f.detail}px "Microsoft YaHei UI", Arial`;
  fitText(ctx, `${windDirection(w?.windDirection)} ${w?.windSpeed == null ? '—' : Math.round(w.windSpeed)} km/h`, 14, 229, 142);
  fitText(ctx, `降雨 ${w?.precipitationProbability == null ? '—' : `${w.precipitationProbability}%`}`, 172, 229, 134);
  fitText(ctx, `PM2.5 ${w?.pm25 == null ? '—' : Math.round(w.pm25)} μg/m³`, 14, 249, 292);
  ctx.strokeStyle = 'rgba(235,244,255,.42)'; ctx.beginPath(); ctx.moveTo(12, 258); ctx.lineTo(308, 258); ctx.stroke();

  ctx.fillStyle = white; ctx.font = `bold ${f.sectionTitle}px "Microsoft YaHei UI", Arial`; ctx.fillText('未来 6 小时', 14, 280);
  const hours = selectUpcomingWeatherHours(w?.hourlyForecast ?? [], data.now, 6);
  hours.forEach((hour, index) => {
    const column = index % 3, row = Math.floor(index / 3);
    const x = 12 + column * 100, y = 286 + row * 37;
    ctx.fillStyle = 'rgba(8, 20, 36, .34)'; ctx.fillRect(x, y, 96, 34);
    ctx.fillStyle = muted; ctx.font = `${f.hour}px Arial`;
    ctx.fillText(formatWeatherTime(hour.time, { hour: '2-digit', hour12: false }), x + 5, y + 13);
    drawWeatherIcon(ctx, hour.weatherCode, x + 22, y + 26, 15);
    ctx.fillStyle = white; ctx.font = `bold ${f.hourTemperature}px Arial`;
    ctx.fillText(hour.temperature == null ? '—°' : `${Math.round(hour.temperature)}°`, x + 42, y + 27);
    ctx.fillStyle = '#B9E5FF'; ctx.font = `${f.precipitation}px Arial`;
    ctx.fillText(hour.precipitationProbability == null ? '—%' : `${hour.precipitationProbability}%`, x + 70, y + 13);
  });

  ctx.fillStyle = white; ctx.font = `bold ${f.sectionTitle}px "Microsoft YaHei UI", Arial`; ctx.fillText('未来 3 天', 14, 371);
  const days = (w?.dailyForecast ?? []).slice(0, 3);
  if (days.length === 0) {
    ctx.fillStyle = muted; ctx.font = `${f.day}px "Microsoft YaHei UI", Arial`;
    ctx.fillText('暂无每日预报', 15, 407);
  }
  days.forEach((day, index) => {
    const y = 375 + index * 32;
    ctx.fillStyle = white; ctx.font = `bold ${f.day}px "Microsoft YaHei UI", Arial`;
    ctx.fillText(weatherDayName(day.date), 15, y + 17);
    drawWeatherIcon(ctx, day.weatherCode, 116, y + 8, 20);
    ctx.textAlign = 'right'; ctx.fillStyle = white; ctx.font = `bold ${f.dayMax}px Arial`;
    ctx.fillText(day.maxTemperature == null ? '—°' : `${Math.round(day.maxTemperature)}°`, 235, y + 17);
    ctx.fillStyle = muted; ctx.font = `${f.dayMin}px Arial`;
    ctx.fillText(day.minTemperature == null ? '—°' : `${Math.round(day.minTemperature)}°`, 302, y + 17);
    ctx.textAlign = 'left';
  });
  if (!w) {
    ctx.fillStyle = '#FFE2A7'; ctx.font = `bold ${f.detail}px "Microsoft YaHei UI", Arial`;
    ctx.fillText('天气数据暂不可用，正在等待重试', 14, 474);
  }
}

/** Dedicated Turing weather-clock layout. Landscape and portrait are independently composed. */
export function renderTuringWeatherClock(width: number, height: number, data: TuringDashboardData, backgroundImage: HTMLImageElement | null = null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前运行环境无法创建 Canvas 2D 绘图上下文');
  if (width >= height) {
    ctx.save(); ctx.scale(width / 480, height / 320);
    drawWeatherClockLandscape(ctx, data, backgroundImage);
    ctx.restore();
  } else {
    ctx.save(); ctx.scale(width / 320, height / 480);
    drawWeatherClockPortrait(ctx, data, backgroundImage);
    ctx.restore();
  }
  return canvas;
}
