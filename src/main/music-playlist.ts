export interface M3uTrackEntry {
  location: string;
}

export function parseM3u(input: string): M3uTrackEntry[] {
  const lines = String(input ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const entries: M3uTrackEntry[] = [];
  for (const raw of lines) {
    const location = raw.trim();
    if (!location || location.startsWith('#') || location.length > 4096) continue;
    // Playlists are intentionally local-only. Ignore remote URLs and URI schemes.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(location) || /^file:/i.test(location)) continue;
    entries.push({ location });
    if (entries.length >= 10000) break;
  }
  return entries;
}

export function serializeM3u(tracks: Array<{ path: string; title: string; artist?: string | null; durationSeconds?: number | null }>): string {
  const lines = ['#EXTM3U'];
  for (const track of tracks) {
    const duration = Number.isFinite(track.durationSeconds) && (track.durationSeconds ?? -1) >= 0
      ? Math.floor(track.durationSeconds!)
      : -1;
    const display = [track.title, track.artist].filter(Boolean).join(' - ').replace(/[\r\n]/g, ' ').trim();
    lines.push(`#EXTINF:${duration},${display}`);
    lines.push(track.path.replace(/[\r\n]/g, ''));
  }
  return `${lines.join('\r\n')}\r\n`;
}
