import type { MusicLyricLine, MusicLyricsResult, MusicTrack } from '../shared/types';
export type { MusicLyricLine, MusicLyricsResult } from '../shared/types';

const TIMESTAMP = /\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;

function fractionToSeconds(value: string | undefined): number {
  if (!value) return 0;
  const fraction = Number.parseInt(value, 10);
  if (!Number.isFinite(fraction)) return 0;
  return fraction / (value.length === 1 ? 10 : value.length === 2 ? 100 : 1000);
}

export function parseLrc(input: string): MusicLyricLine[] {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  const offsetMatch = text.match(/^\s*\[offset:([+-]?\d+)\]\s*$/im);
  const offsetSeconds = offsetMatch ? Number.parseInt(offsetMatch[1], 10) / 1000 : 0;
  const lines: MusicLyricLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(TIMESTAMP)];
    if (!matches.length) continue;
    const lyric = rawLine.replace(TIMESTAMP, '').trim();
    for (const match of matches) {
      const minutes = Number.parseInt(match[1], 10);
      const seconds = Number.parseInt(match[2], 10);
      const fraction = fractionToSeconds(match[3]);
      const timeSeconds = Math.max(0, minutes * 60 + seconds + fraction + offsetSeconds);
      lines.push({ timeSeconds, text: lyric });
      if (lines.length >= 10000) break;
    }
    if (lines.length >= 10000) break;
  }
  return lines.sort((a, b) => a.timeSeconds - b.timeSeconds);
}


const EMPTY_LYRICS: MusicLyricsResult = { lines: [], synced: false, source: 'none' };
const LRCLIB_BASE = 'https://lrclib.net/api';
const LRCLIB_USER_AGENT = 'NexusMonitor/2.2.3 (https://github.com/xiaobei206/NexusMonitor)';
type RemoteLyricsRecord = {
  trackName?: string | null; artistName?: string | null; albumName?: string | null;
  duration?: number | null; instrumental?: boolean; syncedLyrics?: string | null; plainLyrics?: string | null;
};
type LyricsFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function normalizeLyricsMatch(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function usableArtist(value: unknown): string {
  const artist = String(value ?? '').trim();
  return /^(?:本地音乐|未知艺术家|unknown artist|various artists|)$/i.test(artist) ? '' : artist;
}
function resultFromRemote(record: RemoteLyricsRecord): MusicLyricsResult {
  if (record.instrumental) return EMPTY_LYRICS;
  const syncedText = typeof record.syncedLyrics === 'string' ? record.syncedLyrics.trim() : '';
  const syncedLines = syncedText ? parseLrc(syncedText) : [];
  if (syncedLines.length) return { lines: syncedLines, synced: true, source: 'online' };
  const plainText = typeof record.plainLyrics === 'string' ? record.plainLyrics.trim() : '';
  const plainLines = plainText.split(/\r?\n/).map(text => text.trim()).filter(Boolean).slice(0, 10000);
  if (plainLines.length) return { lines: plainLines.map((text, index) => ({ timeSeconds: index, text })), synced: false, source: 'online' };
  return EMPTY_LYRICS;
}
async function requestLyricsJson(url: URL, fetcher: LyricsFetch): Promise<{ data: unknown; rateLimited: boolean }> {
  try {
    const response = await fetcher(url, { headers: { 'User-Agent': LRCLIB_USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (response.status === 429) return { data: null, rateLimited: true };
    if (!response.ok) return { data: null, rateLimited: false };
    return { data: await response.json(), rateLimited: false };
  } catch { return { data: null, rateLimited: false }; }
}

/** Looks up lyrics by metadata only; audio files and local paths are never sent. */
export async function fetchOnlineLyrics(
  track: Pick<MusicTrack, 'title' | 'artist' | 'album' | 'durationSeconds'>,
  fetcher: LyricsFetch = fetch,
): Promise<MusicLyricsResult> {
  const title = String(track.title ?? '').trim();
  const artist = usableArtist(track.artist);
  const album = String(track.album ?? '').trim();
  const duration = Number(track.durationSeconds);
  if (!title) return EMPTY_LYRICS;

  if (artist) {
    const signature = new URL(LRCLIB_BASE + '/get');
    signature.searchParams.set('track_name', title);
    signature.searchParams.set('artist_name', artist);
    if (album) signature.searchParams.set('album_name', album);
    if (Number.isFinite(duration) && duration >= 1 && duration <= 3600) signature.searchParams.set('duration', String(Math.round(duration)));
    const response = await requestLyricsJson(signature, fetcher);
    if (response.rateLimited) return EMPTY_LYRICS;
    if (response.data && !Array.isArray(response.data) && typeof response.data === 'object') {
      const found = resultFromRemote(response.data as RemoteLyricsRecord);
      if (found.lines.length) return found;
    }
  }

  const search = new URL(LRCLIB_BASE + '/search');
  search.searchParams.set('track_name', title);
  if (artist) search.searchParams.set('artist_name', artist);
  if (album) search.searchParams.set('album_name', album);
  const response = await requestLyricsJson(search, fetcher);
  if (response.rateLimited || !Array.isArray(response.data)) return EMPTY_LYRICS;
  const wantedTitle = normalizeLyricsMatch(title);
  const wantedArtist = normalizeLyricsMatch(artist);
  const wantedAlbum = normalizeLyricsMatch(album);
  const candidates = (response.data as RemoteLyricsRecord[]).filter(record => {
    if (normalizeLyricsMatch(record.trackName) !== wantedTitle) return false;
    if (wantedArtist && normalizeLyricsMatch(record.artistName) !== wantedArtist) return false;
    const candidateDuration = Number(record.duration);
    if (Number.isFinite(duration) && duration > 0 && Number.isFinite(candidateDuration) && candidateDuration > 0
      && Math.abs(candidateDuration - duration) > 10) return false;
    return true;
  }).sort((a, b) => {
    const albumScore = Number(normalizeLyricsMatch(b.albumName) === wantedAlbum) - Number(normalizeLyricsMatch(a.albumName) === wantedAlbum);
    if (albumScore) return albumScore;
    const aDuration = Number(a.duration), bDuration = Number(b.duration);
    const aDelta = Number.isFinite(duration) && Number.isFinite(aDuration) ? Math.abs(aDuration - duration) : 9999;
    const bDelta = Number.isFinite(duration) && Number.isFinite(bDuration) ? Math.abs(bDuration - duration) : 9999;
    return aDelta - bDelta;
  });
  for (const candidate of candidates) {
    const result = resultFromRemote(candidate);
    if (result.lines.length) return result;
  }
  return EMPTY_LYRICS;
}
