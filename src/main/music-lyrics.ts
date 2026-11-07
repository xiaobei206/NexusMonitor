export interface MusicLyricLine {
  timeSeconds: number;
  text: string;
}

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
